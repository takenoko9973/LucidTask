#[path = "../src/model/task.rs"]
mod task_model;

use chrono::{Local, TimeZone};
use serde_json::json;
use task_model::{Task, TaskCompletion, TaskType};

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
    // 仕様: タイムゾーン表記は `Z` / `+00:00` の揺れがあるため、絶対時刻で比較する。
    let serialized_deadline = serialized["deadlineAt"]
        .as_str()
        .expect("deadlineAt should be serialized as string");
    let actual = chrono::DateTime::parse_from_rfc3339(serialized_deadline)
        .expect("deadlineAt should be RFC3339");
    assert_eq!(actual.timestamp(), deadline.timestamp());
}

#[test]
fn task_serialization_uses_camel_case_and_includes_completed_at_when_present() {
    // 仕様: Task は camelCase 契約で出力し、completion は Some のときのみ含める。
    let completed_at = fixed_deadline();
    let task = Task {
        id: "task-1".to_string(),
        title: "契約テスト".to_string(),
        task_type: TaskType::Daily,
        is_pinned: true,
        completion: Some(TaskCompletion::Daily {
            completed_at,
            business_day: completed_at.date_naive(),
        }),
    };

    let serialized = serde_json::to_value(task).expect("task should serialize");
    let object = serialized
        .as_object()
        .expect("serialized task must be an object");

    assert!(object.contains_key("taskType"));
    assert!(object.contains_key("isPinned"));
    assert!(object.contains_key("completion"));
    assert!(!object.contains_key("completedAt"));
    assert!(!object.contains_key("completed_at"));
    assert_eq!(serialized["completion"]["kind"], json!("daily"));
    assert_eq!(
        serialized["completion"]["businessDay"],
        json!(completed_at.date_naive().to_string())
    );
}

#[test]
fn task_deserializes_from_frontend_contract_shape() {
    // 仕様: フロント契約形（taskType/isPinned/completion）から逆変換できる。
    let completed_at = fixed_deadline();
    let payload = json!({
        "id": "task-2",
        "title": "デシリアライズ",
        "taskType": {
            "kind": "daily"
        },
        "isPinned": false,
        "completion": {
            "kind": "daily",
            "completedAt": completed_at.to_rfc3339(),
            "businessDay": completed_at.date_naive().to_string()
        }
    });

    let task: Task = serde_json::from_value(payload).expect("task should deserialize");

    assert_eq!(task.id, "task-2");
    assert_eq!(task.task_type, TaskType::Daily);
    assert!(matches!(
        task.completion,
        Some(TaskCompletion::Daily { .. })
    ));
}
