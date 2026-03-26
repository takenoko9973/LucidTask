#[path = "../src/model/task.rs"]
mod task_model;

use chrono::Local;
use serde_json::json;
use task_model::{Task, TaskType};

#[test]
fn deadline_task_type_serializes_as_discriminated_union() {
    let deadline = Local::now();
    let task_type = TaskType::Deadline {
        deadline_at: deadline,
    };

    let serialized = serde_json::to_value(task_type).expect("task_type should serialize");

    assert_eq!(serialized["kind"], json!("deadline"));
    assert_eq!(serialized["deadlineAt"], json!(deadline.to_rfc3339()));
}

#[test]
fn task_serialization_uses_camel_case_and_skips_completed_at() {
    let task = Task {
        id: "task-1".to_string(),
        title: "契約テスト".to_string(),
        task_type: TaskType::Daily,
        is_pinned: true,
        completed_at: Some(Local::now()),
    };

    let serialized = serde_json::to_value(task).expect("task should serialize");
    let object = serialized
        .as_object()
        .expect("serialized task must be an object");

    assert!(object.contains_key("taskType"));
    assert!(object.contains_key("isPinned"));
    assert!(!object.contains_key("completedAt"));
    assert!(!object.contains_key("completed_at"));
}

#[test]
fn task_deserializes_from_frontend_contract_shape() {
    let payload = json!({
        "id": "task-2",
        "title": "デシリアライズ",
        "taskType": {
            "kind": "daily"
        },
        "isPinned": false
    });

    let task: Task = serde_json::from_value(payload).expect("task should deserialize");

    assert_eq!(task.id, "task-2");
    assert_eq!(task.task_type, TaskType::Daily);
    assert_eq!(task.completed_at, None);
}
