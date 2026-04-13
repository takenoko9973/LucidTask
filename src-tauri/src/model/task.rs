use chrono::{DateTime, Local, NaiveDate};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
// IPC契約では判別可能ユニオン形式（kind + 付随フィールド）に固定する。
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TaskType {
    Deadline {
        #[serde(rename = "deadlineAt")]
        deadline_at: DateTime<Local>,
    },
    Daily,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TaskCompletion {
    Deadline {
        #[serde(rename = "completedAt")]
        completed_at: DateTime<Local>,
    },
    Daily {
        #[serde(rename = "completedAt")]
        completed_at: DateTime<Local>,
        #[serde(rename = "businessDay")]
        business_day: NaiveDate,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub task_type: TaskType,
    pub is_pinned: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completion: Option<TaskCompletion>,
}
