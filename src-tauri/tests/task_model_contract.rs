#[path = "../src/model/task.rs"]
mod task_model;

use chrono::{Local, TimeZone};
use serde_json::json;
use task_model::{Task, TaskType};

fn fixed_deadline() -> chrono::DateTime<Local> {
    // 契約テストを安定化するため、毎回同じフォーマット比較可能な固定時刻を使う。
    Local
        .with_ymd_and_hms(2026, 3, 29, 12, 0, 0)
        .earliest()
        .expect("fixed local datetime should exist")
}

#[test]
fn deadline_task_type_serializes_as_discriminated_union() {
    // 仕様: TaskType は kind 判別付きユニオンでシリアライズされる。
    let deadline = fixed_deadline();
    let task_type = TaskType::Deadline {
        deadline_at: deadline,
    };

    let serialized = serde_json::to_value(task_type).expect("task_type should serialize");

    assert_eq!(serialized["kind"], json!("deadline"));
    assert_eq!(serialized["deadlineAt"], json!(deadline.to_rfc3339()));
}

#[test]
fn task_serialization_uses_camel_case_and_includes_completed_at_when_present() {
    // 仕様: Task は camelCase 契約で出力し、completedAt は Some のときのみ含める。
    let task = Task {
        id: "task-1".to_string(),
        title: "契約テスト".to_string(),
        task_type: TaskType::Daily,
        is_pinned: true,
        completed_at: Some(fixed_deadline()),
    };

    let serialized = serde_json::to_value(task).expect("task should serialize");
    let object = serialized
        .as_object()
        .expect("serialized task must be an object");

    assert!(object.contains_key("taskType"));
    assert!(object.contains_key("isPinned"));
    assert!(object.contains_key("completedAt"));
    assert!(!object.contains_key("completed_at"));
}

#[test]
fn task_deserializes_from_frontend_contract_shape() {
    // 仕様: フロント契約形（taskType/isPinned/completedAt）から逆変換できる。
    let payload = json!({
        "id": "task-2",
        "title": "デシリアライズ",
        "taskType": {
            "kind": "daily"
        },
        "isPinned": false,
        "completedAt": fixed_deadline().to_rfc3339()
    });

    let task: Task = serde_json::from_value(payload).expect("task should deserialize");

    assert_eq!(task.id, "task-2");
    assert_eq!(task.task_type, TaskType::Daily);
    assert!(task.completed_at.is_some());
}
