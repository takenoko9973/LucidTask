use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Local, NaiveDate, Timelike};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::model::task::{Task, TaskCompletion, TaskType};

use super::error::RepositoryError;

const TASKS_FILE_NAME: &str = "tasks.json";
const TEMP_FILE_SUFFIX: &str = ".tmp";
const TASKS_SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TasksFileV2 {
    schema_version: u32,
    tasks: Vec<Task>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyTask {
    id: String,
    title: String,
    task_type: TaskType,
    is_pinned: bool,
    #[serde(default)]
    completed_at: Option<DateTime<Local>>,
}

impl LegacyTask {
    fn into_task(self) -> Task {
        let completion = self.completed_at.map(|completed_at| match &self.task_type {
            TaskType::Deadline { .. } => TaskCompletion::Deadline { completed_at },
            TaskType::Daily => TaskCompletion::Daily {
                completed_at,
                business_day: business_day_at(completed_at),
            },
        });

        Task {
            id: self.id,
            title: self.title,
            task_type: self.task_type,
            is_pinned: self.is_pinned,
            completion,
        }
    }
}

#[derive(Debug, Clone)]
pub struct JsonTaskRepository {
    tasks_file_path: PathBuf,
}

impl JsonTaskRepository {
    pub fn from_app_data_dir(app_data_dir: impl AsRef<Path>) -> Self {
        Self {
            tasks_file_path: app_data_dir.as_ref().join(TASKS_FILE_NAME),
        }
    }

    #[cfg(test)]
    #[allow(dead_code)]
    pub fn from_tasks_file_path(tasks_file_path: impl Into<PathBuf>) -> Self {
        Self {
            tasks_file_path: tasks_file_path.into(),
        }
    }

    #[cfg(test)]
    #[allow(dead_code)]
    pub fn tasks_file_path(&self) -> &Path {
        &self.tasks_file_path
    }

    pub fn load_tasks(&self) -> Result<Vec<Task>, RepositoryError> {
        if !self.tasks_file_path.exists() {
            return Ok(Vec::new());
        }

        let json = fs::read_to_string(&self.tasks_file_path)?;
        if json.trim().is_empty() {
            return Ok(Vec::new());
        }

        let value = serde_json::from_str::<Value>(&json)?;
        parse_tasks_payload(value)
    }

    pub fn save_tasks(&self, tasks: &[Task]) -> Result<(), RepositoryError> {
        self.write_tasks_atomically(tasks)
    }

    fn write_tasks_atomically(&self, tasks: &[Task]) -> Result<(), RepositoryError> {
        let parent = self
            .tasks_file_path
            .parent()
            .ok_or_else(|| RepositoryError::InvalidData("Missing parent directory".to_string()))?;

        fs::create_dir_all(parent)?;

        let file_name = self
            .tasks_file_path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| RepositoryError::InvalidData("Invalid tasks file name".to_string()))?;

        let tmp_file_path = self
            .tasks_file_path
            .with_file_name(format!("{file_name}{TEMP_FILE_SUFFIX}"));

        let json = serde_json::to_string_pretty(&TasksFileV2 {
            schema_version: TASKS_SCHEMA_VERSION,
            tasks: tasks.to_vec(),
        })?;
        fs::write(&tmp_file_path, json)?;

        match fs::rename(&tmp_file_path, &self.tasks_file_path) {
            Ok(()) => Ok(()),
            Err(rename_err)
                if matches!(
                    rename_err.kind(),
                    ErrorKind::AlreadyExists | ErrorKind::PermissionDenied
                ) && self.tasks_file_path.exists() =>
            {
                // Windows環境では置換renameが失敗するケースがあるため明示置換にフォールバックする。
                fs::remove_file(&self.tasks_file_path)?;
                fs::rename(&tmp_file_path, &self.tasks_file_path)?;
                Ok(())
            }
            Err(rename_err) => Err(RepositoryError::Io(rename_err)),
        }
    }
}

fn parse_tasks_payload(value: Value) -> Result<Vec<Task>, RepositoryError> {
    match value {
        Value::Array(_) => {
            let legacy_tasks = serde_json::from_value::<Vec<LegacyTask>>(value)?;
            Ok(legacy_tasks.into_iter().map(LegacyTask::into_task).collect())
        }
        Value::Object(object) => {
            let Some(schema_version) = object.get("schemaVersion") else {
                return Err(RepositoryError::InvalidData(
                    "Missing schemaVersion in tasks payload object".to_string(),
                ));
            };
            let Some(schema_version) = schema_version.as_u64() else {
                return Err(RepositoryError::InvalidData(
                    "schemaVersion must be an unsigned integer".to_string(),
                ));
            };
            if schema_version != u64::from(TASKS_SCHEMA_VERSION) {
                return Err(RepositoryError::InvalidData(format!(
                    "Unsupported schemaVersion: {schema_version}"
                )));
            }

            let file = serde_json::from_value::<TasksFileV2>(Value::Object(object))?;
            Ok(file.tasks)
        }
        _ => Err(RepositoryError::InvalidData(
            "tasks payload must be an array or object".to_string(),
        )),
    }
}

fn business_day_at(value: DateTime<Local>) -> NaiveDate {
    let date = value.date_naive();
    if value.hour() < 5 {
        return date.pred_opt().unwrap_or(date);
    }

    date
}
