use std::cmp::Ordering;
use std::fmt::{Display, Formatter};

use chrono::{DateTime, Duration, Local, NaiveDate, Timelike};

use crate::model::task::{Task, TaskCompletion, TaskType};

/// タスクの業務ルール（並び順、Pin制約、完了保持、Dailyリセット）を管理するサービス層。
/// 永続化（TaskStore）への入出力もここで一元化する。
pub const MAX_PINNED_TASKS: usize = 3;
pub const COMPLETED_RETENTION_HOURS: i64 = 72;
pub const DAILY_RESET_HOUR: u32 = 5;
// Daily は明確な期限時刻を持たないため、並び順計算では最大値を使う。
const DAILY_SORT_VALUE: i64 = i64::MAX;

// タスク並び順のグループID（数値が小さいほど前に表示）。
type TaskSortGroup = u8;
const SORT_GROUP_PINNED: TaskSortGroup = 0;
const SORT_GROUP_DUE_OR_OVERDUE: TaskSortGroup = 1;
const SORT_GROUP_DAILY: TaskSortGroup = 2;
const SORT_GROUP_FUTURE_DEADLINE: TaskSortGroup = 3;
const SORT_GROUP_COMPLETED: TaskSortGroup = 4;

/// タスクの永続化インターフェース。
/// Tauri実装では JSON Repository がこのトレイトを実装する。
pub trait TaskStore {
    type Error;

    fn load_tasks(&self) -> Result<Vec<Task>, Self::Error>;
    fn save_tasks(&mut self, tasks: &[Task]) -> Result<(), Self::Error>;
}

/// 新規タスク作成時の入力。
#[derive(Debug, Clone, PartialEq)]
pub struct CreateTaskInput {
    pub id: String,
    pub title: String,
    pub task_type: TaskType,
    pub is_pinned: bool,
}

/// タスク更新時の入力（部分更新）。
#[derive(Debug, Clone, PartialEq, Default)]
pub struct UpdateTaskInput {
    pub id: String,
    pub title: Option<String>,
    pub task_type: Option<TaskType>,
    pub is_pinned: Option<bool>,
}

/// サービス層で返すドメインエラー。
#[derive(Debug, Clone, PartialEq)]
pub enum TaskServiceError {
    Repository(String),
    TaskNotFound { id: String },
    CompletedTaskImmutable { id: String },
    PinnedLimitExceeded { max: usize },
    InvalidTitle,
}

impl Display for TaskServiceError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Repository(message) => write!(f, "Repository error: {message}"),
            Self::TaskNotFound { id } => write!(f, "Task not found: {id}"),
            Self::CompletedTaskImmutable { id } => {
                write!(f, "Completed task is immutable: {id}")
            }
            Self::PinnedLimitExceeded { max } => {
                write!(f, "Pinned task limit exceeded (max: {max})")
            }
            Self::InvalidTitle => write!(f, "Task title must not be empty"),
        }
    }
}

impl std::error::Error for TaskServiceError {}

/// タスク一覧をメモリ上に保持し、業務ルールを適用して操作するサービス本体。
pub struct TaskService<S>
where
    S: TaskStore,
{
    store: S,
    tasks: Vec<Task>,
}

impl<S> TaskService<S>
where
    S: TaskStore,
    S::Error: ToString,
{
    /// 永続化層エラーをサービス層エラーへ正規化する。
    fn to_repository_error(error: S::Error) -> TaskServiceError {
        TaskServiceError::Repository(error.to_string())
    }

    /// タスク未検出エラーを生成する。
    fn task_not_found(id: impl Into<String>) -> TaskServiceError {
        TaskServiceError::TaskNotFound { id: id.into() }
    }

    /// 完了済み変更禁止エラーを生成する。
    fn completed_task_immutable(id: impl Into<String>) -> TaskServiceError {
        TaskServiceError::CompletedTaskImmutable { id: id.into() }
    }

    /// IDからタスク配列インデックスを解決する。
    fn task_index_by_id(&self, id: &str) -> Result<usize, TaskServiceError> {
        self.tasks
            .iter()
            .position(|task| task.id == id)
            .ok_or_else(|| Self::task_not_found(id))
    }

    /// IDから「未完了タスク」のインデックスを解決する。
    /// 完了済みの場合は変更対象外としてエラーにする。
    fn active_task_index_by_id(&self, id: &str) -> Result<usize, TaskServiceError> {
        let index = self.task_index_by_id(id)?;
        if self.tasks[index].completion.is_some() {
            return Err(Self::completed_task_immutable(id));
        }

        Ok(index)
    }

    /// ストアからタスクを読み込んでサービスを初期化する。
    pub fn new(store: S) -> Result<Self, TaskServiceError> {
        let tasks = store.load_tasks().map_err(Self::to_repository_error)?;

        Ok(Self { store, tasks })
    }

    /// 現在時刻基準でタスク一覧を取得する。
    pub fn list_tasks(&mut self) -> Vec<Task> {
        self.list_tasks_at(Local::now())
    }

    /// 新規タスクを作成する。
    /// titleは必須、Pinは上限（未完了3件）を検証する。
    pub fn create_task(&mut self, input: CreateTaskInput) -> Result<Task, TaskServiceError> {
        let title = validate_title(input.title)?;

        if input.is_pinned {
            self.ensure_pin_capacity(None)?;
        }

        let task = Task {
            id: input.id,
            title,
            task_type: input.task_type,
            is_pinned: input.is_pinned,
            completion: None,
        };

        self.tasks.push(task.clone());
        self.persist_tasks()?;
        Ok(task)
    }

    /// タスクを更新する。
    /// 完了タスクでも title/task_type の編集は許可するが、Pin状態の変更は不可。
    pub fn update_task(&mut self, input: UpdateTaskInput) -> Result<Task, TaskServiceError> {
        let UpdateTaskInput {
            id,
            title,
            task_type,
            is_pinned,
        } = input;
        let task_index = self.task_index_by_id(&id)?;

        if let Some(next_is_pinned) = is_pinned {
            let current_task = &self.tasks[task_index];
            if current_task.completion.is_some() && next_is_pinned != current_task.is_pinned {
                return Err(Self::completed_task_immutable(id));
            }

            if next_is_pinned && !current_task.is_pinned {
                self.ensure_pin_capacity(Some(id.as_str()))?;
            }
        }

        let task = &mut self.tasks[task_index];

        if let Some(title) = title {
            task.title = validate_title(title)?;
        }

        if let Some(task_type) = task_type {
            task.task_type = task_type;
        }

        if let Some(is_pinned) = is_pinned {
            task.is_pinned = is_pinned;
        }

        let updated_task = task.clone();
        self.persist_tasks()?;
        Ok(updated_task)
    }

    /// 指定IDのタスクを削除し、更新後一覧を返す。
    pub fn delete_task(&mut self, id: &str) -> Result<Vec<Task>, TaskServiceError> {
        let original_len = self.tasks.len();
        self.tasks.retain(|task| task.id != id);

        if self.tasks.len() == original_len {
            return Err(Self::task_not_found(id));
        }

        self.persist_tasks()?;
        Ok(self.list_tasks())
    }

    /// 完了状態を現在時刻でトグルする（未完了<->完了）。
    pub fn complete_task(&mut self, id: &str) -> Result<Vec<Task>, TaskServiceError> {
        self.complete_task_at(id, Local::now())
    }

    /// 完了状態を指定時刻でトグルする（テスト向けに時刻注入可能）。
    /// 完了化する際は Pin を自動解除する。
    pub fn complete_task_at(
        &mut self,
        id: &str,
        completed_at: DateTime<Local>,
    ) -> Result<Vec<Task>, TaskServiceError> {
        let task_index = self.task_index_by_id(id)?;

        let task = &mut self.tasks[task_index];
        if task.completion.is_some() {
            task.completion = None;
        } else {
            task.completion = Some(match &task.task_type {
                TaskType::Deadline { .. } => TaskCompletion::Deadline { completed_at },
                TaskType::Daily => TaskCompletion::Daily {
                    completed_at,
                    business_day: business_day_at(completed_at),
                },
            });
            // 完了時は固定を外し、固定枠を解放する。
            task.is_pinned = false;
        }

        self.persist_tasks()?;
        Ok(self.list_tasks_at(completed_at))
    }

    /// Pin状態を更新する。完了タスクのPin変更は禁止。
    pub fn set_task_pinned(&mut self, id: &str, is_pinned: bool) -> Result<Task, TaskServiceError> {
        let task_index = self.active_task_index_by_id(id)?;

        if is_pinned && !self.tasks[task_index].is_pinned {
            self.ensure_pin_capacity(Some(id))?;
        }

        self.tasks[task_index].is_pinned = is_pinned;
        let updated_task = self.tasks[task_index].clone();
        self.persist_tasks()?;
        Ok(updated_task)
    }

    /// 現在時刻基準で72時間超の完了タスクを削除する。
    pub fn cleanup_completed_tasks(&mut self) -> Result<usize, TaskServiceError> {
        self.cleanup_completed_tasks_at(Local::now())
    }

    /// 指定時刻基準で72時間超の完了タスクを削除する（テスト向け）。
    /// Daily完了は削除対象にせず、期限タスク完了のみ72時間保持ルールを適用する。
    pub fn cleanup_completed_tasks_at(
        &mut self,
        now: DateTime<Local>,
    ) -> Result<usize, TaskServiceError> {
        let cutoff = now - Duration::hours(COMPLETED_RETENTION_HOURS);
        let before = self.tasks.len();

        self.tasks.retain(|task| match &task.completion {
            Some(TaskCompletion::Deadline { completed_at }) => *completed_at > cutoff,
            Some(TaskCompletion::Daily { .. }) => true,
            None => true,
        });

        let removed = before - self.tasks.len();
        if removed > 0 {
            self.persist_tasks()?;
        }

        Ok(removed)
    }

    /// Pin上限（未完了3件）を超えないことを検証する。
    /// `exempt_task_id` は既存Pinタスク更新時の自己除外に使う。
    fn ensure_pin_capacity(&self, exempt_task_id: Option<&str>) -> Result<(), TaskServiceError> {
        let pinned_count = self
            .tasks
            .iter()
            .filter(|task| {
                task.completion.is_none()
                    && task.is_pinned
                    && exempt_task_id
                        .map(|exempt_id| task.id.as_str() != exempt_id)
                        .unwrap_or(true)
            })
            .count();

        if pinned_count >= MAX_PINNED_TASKS {
            return Err(TaskServiceError::PinnedLimitExceeded {
                max: MAX_PINNED_TASKS,
            });
        }

        Ok(())
    }

    /// 現在のタスク配列をストアへ保存する。
    fn persist_tasks(&mut self) -> Result<(), TaskServiceError> {
        self.store
            .save_tasks(&self.tasks)
            .map_err(Self::to_repository_error)
    }

    /// 指定時刻で業務ルールを適用した表示用一覧を返す。
    /// Dailyリセットはここでも適用する。
    pub(crate) fn list_tasks_at(&mut self, now: DateTime<Local>) -> Vec<Task> {
        self.reset_daily_tasks_if_needed(now);
        let mut tasks = self.tasks.clone();
        sort_tasks_in_place(&mut tasks, now);
        tasks
    }

    /// Daily完了が業務日境界（05:00）を跨いでいれば未完了に戻す。
    /// 変更があったかを返し、呼び出し側で永続化判断に使う。
    fn reset_daily_tasks_if_needed(&mut self, now: DateTime<Local>) -> bool {
        let mut changed = false;
        for task in &mut self.tasks {
            if task.task_type != TaskType::Daily {
                continue;
            }

            let Some(TaskCompletion::Daily { business_day, .. }) = task.completion.as_ref() else {
                continue;
            };

            if should_reset_daily_completion(*business_day, now) {
                task.completion = None;
                changed = true;
            }
        }
        changed
    }
}

/// 空白のみのタイトルを禁止し、正規化済みタイトルを返す。
fn validate_title(title: String) -> Result<String, TaskServiceError> {
    if title.trim().is_empty() {
        return Err(TaskServiceError::InvalidTitle);
    }

    Ok(title)
}

/// 業務日（05:00始まり）へ時刻を射影する。
/// 05:00未満は前日扱い。
fn business_day_at(value: DateTime<Local>) -> NaiveDate {
    let date = value.date_naive();
    if value.hour() < DAILY_RESET_HOUR {
        return date.pred_opt().unwrap_or(date);
    }

    date
}

/// Daily完了の業務日と現在業務日が異なれば、リセット対象。
fn should_reset_daily_completion(completed_business_day: NaiveDate, now: DateTime<Local>) -> bool {
    business_day_at(now) > completed_business_day
}

/// 仕様の固定優先順でタスクを並び替える。
fn sort_tasks_in_place(tasks: &mut [Task], now: DateTime<Local>) {
    tasks.sort_by(|left, right| compare_tasks(left, right, now));
}

/// タスク比較関数。グループ優先後に title -> id で安定化する。
fn compare_tasks(left: &Task, right: &Task, now: DateTime<Local>) -> Ordering {
    let left_key = task_sort_key(left, now);
    let right_key = task_sort_key(right, now);

    left_key
        .cmp(&right_key)
        .then_with(|| left.title.cmp(&right.title))
        .then_with(|| left.id.cmp(&right.id))
}

/// 仕様優先順に基づくソートキーを計算する。
fn task_sort_key(task: &Task, now: DateTime<Local>) -> (TaskSortGroup, i64) {
    // 優先順: pinned -> 期限超過/当日 -> daily -> 未来期限 -> 完了
    if let Some(completion) = &task.completion {
        return (SORT_GROUP_COMPLETED, -completion_completed_at(completion).timestamp());
    }

    if task.is_pinned {
        return (SORT_GROUP_PINNED, deadline_sort_value(task));
    }

    match &task.task_type {
        TaskType::Deadline { deadline_at } => {
            if deadline_at.date_naive() <= now.date_naive() {
                (SORT_GROUP_DUE_OR_OVERDUE, deadline_at.timestamp())
            } else {
                (SORT_GROUP_FUTURE_DEADLINE, deadline_at.timestamp())
            }
        }
        TaskType::Daily => (SORT_GROUP_DAILY, DAILY_SORT_VALUE),
    }
}

/// Pinタスク同士の並びで使う補助キーを計算する。
fn deadline_sort_value(task: &Task) -> i64 {
    match &task.task_type {
        TaskType::Deadline { deadline_at } => deadline_at.timestamp(),
        TaskType::Daily => DAILY_SORT_VALUE,
    }
}

fn completion_completed_at(completion: &TaskCompletion) -> DateTime<Local> {
    match completion {
        TaskCompletion::Deadline { completed_at } => *completed_at,
        TaskCompletion::Daily { completed_at, .. } => *completed_at,
    }
}
