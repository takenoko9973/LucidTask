use chrono::{DateTime, Local};
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
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub task_type: TaskType,
    pub is_pinned: bool,
    // 完了時刻はメモリ専用。永続化JSONとIPCレスポンスには含めない。
    #[serde(skip)]
    pub completed_at: Option<DateTime<Local>>,
}
