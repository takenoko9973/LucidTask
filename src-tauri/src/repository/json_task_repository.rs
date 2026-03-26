use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use crate::model::task::Task;

use super::error::RepositoryError;

const TASKS_FILE_NAME: &str = "tasks.json";
const TEMP_FILE_SUFFIX: &str = ".tmp";

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

        let tasks = serde_json::from_str::<Vec<Task>>(&json)?;
        Ok(tasks)
    }

    pub fn save_tasks(&self, tasks: &[Task]) -> Result<(), RepositoryError> {
        // 完了済みタスクは仕様上JSON保存対象外のため除外して書き込む。
        let incomplete_tasks: Vec<Task> = tasks
            .iter()
            .filter(|task| task.completed_at.is_none())
            .cloned()
            .collect();

        self.write_tasks_atomically(&incomplete_tasks)
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

        let json = serde_json::to_string_pretty(tasks)?;
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
