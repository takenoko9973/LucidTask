#[path = "../src/model/mod.rs"]
mod model;
#[path = "../src/repository/mod.rs"]
mod repository;

use std::env;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::{Duration, Local};

use model::task::{Task, TaskType};
use repository::{JsonTaskRepository, RepositoryError};

fn make_task(id: &str, title: &str, is_pinned: bool) -> Task {
    Task {
        id: id.to_string(),
        title: title.to_string(),
        task_type: TaskType::Deadline {
            deadline_at: Local::now() + Duration::days(1),
        },
        is_pinned,
        completed_at: None,
    }
}

fn make_temp_dir(test_name: &str) -> PathBuf {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before UNIX_EPOCH")
        .as_millis();

    let dir = env::temp_dir().join(format!(
        "lucid-task-repository-{test_name}-{}-{millis}",
        std::process::id()
    ));

    fs::create_dir_all(&dir).expect("failed to create temp directory");
    dir
}

fn cleanup_temp_dir(path: &Path) {
    if path.exists() {
        fs::remove_dir_all(path).expect("failed to remove temp directory");
    }
}

#[test]
fn load_tasks_returns_empty_when_file_does_not_exist() {
    let temp_dir = make_temp_dir("load-empty");
    let repository = JsonTaskRepository::from_app_data_dir(&temp_dir);

    let loaded = repository.load_tasks().expect("load should succeed");

    assert!(loaded.is_empty());
    cleanup_temp_dir(&temp_dir);
}

#[test]
fn save_tasks_persists_and_load_returns_same_tasks() {
    let temp_dir = make_temp_dir("create-load");
    let repository = JsonTaskRepository::from_app_data_dir(&temp_dir);
    let task = make_task("task-1", "first", false);

    repository
        .save_tasks(std::slice::from_ref(&task))
        .expect("save should succeed");
    let loaded = repository.load_tasks().expect("load should succeed");

    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].id, "task-1");
    cleanup_temp_dir(&temp_dir);
}

#[test]
fn save_tasks_overwrites_existing_entries() {
    let temp_dir = make_temp_dir("update");
    let repository = JsonTaskRepository::from_app_data_dir(&temp_dir);
    let original = make_task("task-1", "original", false);
    repository
        .save_tasks(&[original])
        .expect("seed save should succeed");

    let updated = Task {
        id: "task-1".to_string(),
        title: "updated".to_string(),
        task_type: TaskType::Daily,
        is_pinned: true,
        completed_at: None,
    };

    repository
        .save_tasks(&[updated])
        .expect("second save should succeed");

    let loaded = repository.load_tasks().expect("load should succeed");

    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].title, "updated");
    assert!(loaded[0].is_pinned);
    assert_eq!(loaded[0].task_type, TaskType::Daily);
    cleanup_temp_dir(&temp_dir);
}

#[test]
fn save_tasks_removes_entries_omitted_from_next_write() {
    let temp_dir = make_temp_dir("delete");
    let repository = JsonTaskRepository::from_app_data_dir(&temp_dir);
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
    cleanup_temp_dir(&temp_dir);
}

#[test]
fn save_tasks_excludes_completed_tasks() {
    let temp_dir = make_temp_dir("exclude-completed");
    let repository = JsonTaskRepository::from_app_data_dir(&temp_dir);

    let mut completed_task = make_task("task-1", "completed", false);
    completed_task.completed_at = Some(Local::now());

    let active_task = make_task("task-2", "active", true);
    repository
        .save_tasks(&[completed_task, active_task.clone()])
        .expect("save should succeed");

    let loaded = repository.load_tasks().expect("load should succeed");

    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].id, active_task.id);
    cleanup_temp_dir(&temp_dir);
}

#[test]
fn load_tasks_returns_error_when_json_is_broken() {
    let temp_dir = make_temp_dir("broken-json");
    let repository = JsonTaskRepository::from_app_data_dir(&temp_dir);

    fs::write(repository.tasks_file_path(), "{ this is not valid json }")
        .expect("failed to write invalid json");

    let result = repository.load_tasks();

    assert!(matches!(result, Err(RepositoryError::Serde(_))));
    cleanup_temp_dir(&temp_dir);
}
