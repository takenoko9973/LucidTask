#[path = "../src/model/mod.rs"]
mod model;
#[path = "../src/repository/mod.rs"]
mod repository;

use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::{Duration, Local, LocalResult, TimeZone};
use serde_json::{json, Value};

use model::task::{Task, TaskCompletion, TaskType};
use repository::{JsonTaskRepository, RepositoryError};

fn make_task(id: &str, title: &str, is_pinned: bool) -> Task {
    Task {
        id: id.to_string(),
        title: title.to_string(),
        task_type: TaskType::Deadline {
            deadline_at: Local::now() + Duration::days(1),
        },
        is_pinned,
        completion: None,
    }
}

fn dt(year: i32, month: u32, day: u32, hour: u32, minute: u32) -> chrono::DateTime<Local> {
    match Local.with_ymd_and_hms(year, month, day, hour, minute, 0) {
        LocalResult::Single(value) => value,
        LocalResult::Ambiguous(early, _) => early,
        LocalResult::None => panic!("invalid local datetime"),
    }
}

struct TestDir {
    path: PathBuf,
}

impl TestDir {
    fn new(test_name: &str) -> Self {
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before UNIX_EPOCH")
            .as_millis();

        let path = env::temp_dir().join(format!(
            "lucid-task-repository-{test_name}-{}-{millis}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("failed to create temp directory");

        Self { path }
    }

    fn path(&self) -> &PathBuf {
        &self.path
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        if self.path.exists() {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}

#[test]
fn load_tasks_returns_empty_when_file_does_not_exist() {
    // 仕様: 永続ファイル未作成時は空配列を返す。
    let temp_dir = TestDir::new("load-empty");
    let repository = JsonTaskRepository::from_app_data_dir(temp_dir.path());

    let loaded = repository.load_tasks().expect("load should succeed");

    assert!(loaded.is_empty());
}

#[test]
fn save_tasks_persists_and_load_returns_same_tasks() {
    // 仕様: save 後の load で同一内容を再取得できる。
    let temp_dir = TestDir::new("create-load");
    let repository = JsonTaskRepository::from_app_data_dir(temp_dir.path());
    let task = make_task("task-1", "first", false);

    repository
        .save_tasks(std::slice::from_ref(&task))
        .expect("save should succeed");
    let loaded = repository.load_tasks().expect("load should succeed");

    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].id, "task-1");
}

#[test]
fn save_tasks_overwrites_existing_entries() {
    // 仕様: 同じ id を再保存した場合は最新内容で上書きされる。
    let temp_dir = TestDir::new("update");
    let repository = JsonTaskRepository::from_app_data_dir(temp_dir.path());
    let original = make_task("task-1", "original", false);
    repository
        .save_tasks(&[original])
        .expect("seed save should succeed");

    let updated = Task {
        id: "task-1".to_string(),
        title: "updated".to_string(),
        task_type: TaskType::Daily,
        is_pinned: true,
        completion: None,
    };

    repository
        .save_tasks(&[updated])
        .expect("second save should succeed");

    let loaded = repository.load_tasks().expect("load should succeed");

    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].title, "updated");
    assert!(loaded[0].is_pinned);
    assert_eq!(loaded[0].task_type, TaskType::Daily);
}

#[test]
fn save_tasks_removes_entries_omitted_from_next_write() {
    // 仕様: 次回 save に含まれないタスクは永続データから削除される。
    let temp_dir = TestDir::new("delete");
    let repository = JsonTaskRepository::from_app_data_dir(temp_dir.path());
    let first = make_task("task-1", "first", false);
    let second = make_task("task-2", "second", false);

    repository
        .save_tasks(&[first, second.clone()])
        .expect("seed save should succeed");
    repository
        .save_tasks(&[second.clone()])
        .expect("second save should succeed");

    let loaded = repository.load_tasks().expect("load should succeed");
    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].id, second.id);
}

#[test]
fn save_tasks_persists_completed_tasks() {
    // 仕様: completion を持つ完了タスクも通常タスクと同様に保存・復元される。
    let temp_dir = TestDir::new("persist-completed");
    let repository = JsonTaskRepository::from_app_data_dir(temp_dir.path());

    let mut completed_task = make_task("task-1", "completed", false);
    completed_task.completion = Some(TaskCompletion::Deadline {
        completed_at: Local::now(),
    });

    let active_task = make_task("task-2", "active", true);
    repository
        .save_tasks(&[completed_task, active_task.clone()])
        .expect("save should succeed");

    let loaded = repository.load_tasks().expect("load should succeed");

    assert_eq!(loaded.len(), 2);
    assert!(loaded.iter().any(|task| task.id == active_task.id));
    assert!(loaded
        .iter()
        .any(|task| task.id == "task-1" && task.completion.is_some()));
}

#[test]
fn load_tasks_returns_error_when_json_is_broken() {
    // 仕様: 破損JSONは Serde エラーとして返す。
    let temp_dir = TestDir::new("broken-json");
    let repository = JsonTaskRepository::from_app_data_dir(temp_dir.path());

    fs::write(repository.tasks_file_path(), "{ this is not valid json }")
        .expect("failed to write invalid json");

    let result = repository.load_tasks();

    assert!(matches!(result, Err(RepositoryError::Serde(_))));
}

#[test]
fn load_tasks_accepts_legacy_array_and_save_migrates_to_v2_schema() {
    // 仕様: 旧completedAt配列JSONを読めて、次回saveでschemaVersion=2へ移行する。
    let temp_dir = TestDir::new("legacy-migrate");
    let repository = JsonTaskRepository::from_app_data_dir(temp_dir.path());
    let legacy_daily_completed_at = dt(2026, 3, 26, 4, 30).to_rfc3339();
    let legacy_deadline_completed_at = dt(2026, 3, 26, 12, 0).to_rfc3339();
    let deadline_at = dt(2026, 3, 30, 9, 0).to_rfc3339();

    let legacy_payload = json!([
        {
            "id": "daily-1",
            "title": "daily",
            "taskType": { "kind": "daily" },
            "isPinned": false,
            "completedAt": legacy_daily_completed_at
        },
        {
            "id": "deadline-1",
            "title": "deadline",
            "taskType": { "kind": "deadline", "deadlineAt": deadline_at },
            "isPinned": false,
            "completedAt": legacy_deadline_completed_at
        }
    ]);
    fs::write(
        repository.tasks_file_path(),
        serde_json::to_string_pretty(&legacy_payload).expect("legacy payload should serialize"),
    )
    .expect("failed to write legacy payload");

    let loaded = repository.load_tasks().expect("legacy load should succeed");
    assert_eq!(loaded.len(), 2);

    let daily = loaded
        .iter()
        .find(|task| task.id == "daily-1")
        .expect("daily task should exist");
    assert!(matches!(
        daily.completion,
        Some(TaskCompletion::Daily { .. })
    ));

    let deadline = loaded
        .iter()
        .find(|task| task.id == "deadline-1")
        .expect("deadline task should exist");
    assert!(matches!(
        deadline.completion,
        Some(TaskCompletion::Deadline { .. })
    ));

    repository
        .save_tasks(&loaded)
        .expect("save after legacy load should succeed");
    let saved_raw =
        fs::read_to_string(repository.tasks_file_path()).expect("should read saved tasks file");
    let saved_json: Value = serde_json::from_str(&saved_raw).expect("saved payload should be json");

    assert_eq!(saved_json["schemaVersion"], json!(2));
    assert!(saved_json["tasks"].is_array());
}

#[test]
fn load_tasks_rejects_unknown_schema_version() {
    // 仕様: schemaVersionが未知の場合は安全側で読み込み失敗にする。
    let temp_dir = TestDir::new("unknown-schema");
    let repository = JsonTaskRepository::from_app_data_dir(temp_dir.path());
    let payload = json!({
        "schemaVersion": 99,
        "tasks": []
    });
    fs::write(
        repository.tasks_file_path(),
        serde_json::to_string_pretty(&payload).expect("payload should serialize"),
    )
    .expect("failed to write payload");

    let result = repository.load_tasks();

    assert!(matches!(result, Err(RepositoryError::InvalidData(_))));
}
