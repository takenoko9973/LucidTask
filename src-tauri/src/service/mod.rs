use std::cmp::Ordering;
use std::fmt::{Display, Formatter};

use chrono::{DateTime, Duration, Local};

use crate::model::task::{Task, TaskType};

pub const MAX_PINNED_TASKS: usize = 3;
pub const COMPLETED_RETENTION_HOURS: i64 = 72;

pub trait TaskStore {
    type Error;

    fn load_active_tasks(&self) -> Result<Vec<Task>, Self::Error>;
    fn save_active_tasks(&mut self, tasks: &[Task]) -> Result<(), Self::Error>;
}

#[derive(Debug, Clone, PartialEq)]
pub struct CreateTaskInput {
    pub id: String,
    pub title: String,
    pub task_type: TaskType,
    pub is_pinned: bool,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct UpdateTaskInput {
    pub id: String,
    pub title: Option<String>,
    pub task_type: Option<TaskType>,
    pub is_pinned: Option<bool>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TaskServiceError {
    Repository(String),
    TaskNotFound { id: String },
    PinnedLimitExceeded { max: usize },
    InvalidTitle,
}

impl Display for TaskServiceError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Repository(message) => write!(f, "Repository error: {message}"),
            Self::TaskNotFound { id } => write!(f, "Task not found: {id}"),
            Self::PinnedLimitExceeded { max } => {
                write!(f, "Pinned task limit exceeded (max: {max})")
            }
            Self::InvalidTitle => write!(f, "Task title must not be empty"),
        }
    }
}

impl std::error::Error for TaskServiceError {}

pub struct TaskService<S>
where
    S: TaskStore,
{
    store: S,
    active_tasks: Vec<Task>,
    completed_tasks: Vec<Task>,
}

impl<S> TaskService<S>
where
    S: TaskStore,
    S::Error: ToString,
{
    fn to_repository_error(error: S::Error) -> TaskServiceError {
        TaskServiceError::Repository(error.to_string())
    }

    fn task_not_found(id: impl Into<String>) -> TaskServiceError {
        TaskServiceError::TaskNotFound { id: id.into() }
    }

    fn active_task_index_by_id(&self, id: &str) -> Result<usize, TaskServiceError> {
        self.active_tasks
            .iter()
            .position(|task| task.id == id)
            .ok_or_else(|| Self::task_not_found(id))
    }

    pub fn new(store: S) -> Result<Self, TaskServiceError> {
        let mut active_tasks = store
            .load_active_tasks()
            .map_err(Self::to_repository_error)?;

        // completed_at はメモリ専用情報のため、永続化から読んだ直後に必ず消去する。
        for task in &mut active_tasks {
            task.completed_at = None;
        }

        Ok(Self {
            store,
            active_tasks,
            completed_tasks: Vec::new(),
        })
    }

    pub fn list_tasks(&self) -> Vec<Task> {
        let mut tasks = self.active_tasks.clone();
        sort_tasks_in_place(&mut tasks, Local::now());
        tasks
    }

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
            completed_at: None,
        };

        self.active_tasks.push(task.clone());
        self.persist_active_tasks()?;
        Ok(task)
    }

    pub fn update_task(&mut self, input: UpdateTaskInput) -> Result<Task, TaskServiceError> {
        let UpdateTaskInput {
            id,
            title,
            task_type,
            is_pinned,
        } = input;
        let task_index = self.active_task_index_by_id(&id)?;

        // 未固定→固定への遷移時だけ上限判定する（固定→固定の更新は許容）。
        if matches!(is_pinned, Some(true)) && !self.active_tasks[task_index].is_pinned {
            self.ensure_pin_capacity(Some(id.as_str()))?;
        }

        let task = &mut self.active_tasks[task_index];

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
        self.persist_active_tasks()?;
        Ok(updated_task)
    }

    pub fn delete_task(&mut self, id: &str) -> Result<Vec<Task>, TaskServiceError> {
        let original_len = self.active_tasks.len();
        self.active_tasks.retain(|task| task.id != id);

        if self.active_tasks.len() == original_len {
            return Err(Self::task_not_found(id));
        }

        // 同じIDの完了済みタスクも同時に破棄し、状態を一意に保つ。
        self.completed_tasks.retain(|task| task.id != id);
        self.persist_active_tasks()?;
        Ok(self.list_tasks())
    }

    pub fn complete_task(&mut self, id: &str) -> Result<Vec<Task>, TaskServiceError> {
        self.complete_task_at(id, Local::now())
    }

    pub fn complete_task_at(
        &mut self,
        id: &str,
        completed_at: DateTime<Local>,
    ) -> Result<Vec<Task>, TaskServiceError> {
        let task_index = self.active_task_index_by_id(id)?;

        let mut task = self.active_tasks.remove(task_index);
        task.completed_at = Some(completed_at);
        // 完了済みはJSON保存せずメモリ側で72時間だけ保持する。
        self.completed_tasks.push(task);

        self.persist_active_tasks()?;
        Ok(self.list_tasks())
    }

    pub fn set_task_pinned(&mut self, id: &str, is_pinned: bool) -> Result<Task, TaskServiceError> {
        let task_index = self.active_task_index_by_id(id)?;

        if is_pinned && !self.active_tasks[task_index].is_pinned {
            self.ensure_pin_capacity(Some(id))?;
        }

        self.active_tasks[task_index].is_pinned = is_pinned;
        let updated_task = self.active_tasks[task_index].clone();
        self.persist_active_tasks()?;
        Ok(updated_task)
    }

    pub fn cleanup_completed_tasks(&mut self) -> Result<usize, TaskServiceError> {
        self.cleanup_completed_tasks_at(Local::now())
    }

    pub fn cleanup_completed_tasks_at(
        &mut self,
        now: DateTime<Local>,
    ) -> Result<usize, TaskServiceError> {
        let cutoff = now - Duration::hours(COMPLETED_RETENTION_HOURS);
        let before = self.completed_tasks.len();

        self.completed_tasks.retain(|task| match task.completed_at {
            // 72時間ちょうどは削除対象にするため、strictに `>` を使う。
            Some(ts) => ts > cutoff,
            None => true,
        });

        Ok(before - self.completed_tasks.len())
    }

    fn ensure_pin_capacity(&self, exempt_task_id: Option<&str>) -> Result<(), TaskServiceError> {
        let pinned_count = self
            .active_tasks
            .iter()
            .filter(|task| {
                // 更新対象自身はカウントから除外し、再固定操作で誤検知しないようにする。
                task.is_pinned
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

    fn persist_active_tasks(&mut self) -> Result<(), TaskServiceError> {
        self.store
            .save_active_tasks(&self.active_tasks)
            .map_err(Self::to_repository_error)
    }

    #[cfg(test)]
    fn completed_tasks(&self) -> &[Task] {
        &self.completed_tasks
    }

    #[cfg(test)]
    fn persisted_active_tasks(&self) -> Result<Vec<Task>, TaskServiceError> {
        self.store
            .load_active_tasks()
            .map_err(Self::to_repository_error)
    }
}

fn validate_title(title: String) -> Result<String, TaskServiceError> {
    if title.trim().is_empty() {
        return Err(TaskServiceError::InvalidTitle);
    }

    Ok(title)
}

fn sort_tasks_in_place(tasks: &mut [Task], now: DateTime<Local>) {
    tasks.sort_by(|left, right| compare_tasks(left, right, now));
}

fn compare_tasks(left: &Task, right: &Task, now: DateTime<Local>) -> Ordering {
    let left_key = task_sort_key(left, now);
    let right_key = task_sort_key(right, now);

    // 同順位時に title -> id で決定し、並び順を決定論的にする。
    left_key
        .cmp(&right_key)
        .then_with(|| left.title.cmp(&right.title))
        .then_with(|| left.id.cmp(&right.id))
}

fn task_sort_key(task: &Task, now: DateTime<Local>) -> (u8, i64) {
    // group: 0=固定, 1=期限超過/当日, 2=daily, 3=未来期限
    if task.is_pinned {
        return (0, deadline_sort_value(task));
    }

    match &task.task_type {
        TaskType::Deadline { deadline_at } => {
            if deadline_at.date_naive() <= now.date_naive() {
                (1, deadline_at.timestamp())
            } else {
                (3, deadline_at.timestamp())
            }
        }
        TaskType::Daily => (2, i64::MAX),
    }
}

fn deadline_sort_value(task: &Task) -> i64 {
    match &task.task_type {
        TaskType::Deadline { deadline_at } => deadline_at.timestamp(),
        TaskType::Daily => i64::MAX,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{LocalResult, TimeZone};

    #[derive(Default)]
    struct InMemoryStore {
        tasks: Vec<Task>,
        save_calls: usize,
    }

    impl InMemoryStore {
        fn with_tasks(tasks: Vec<Task>) -> Self {
            Self {
                tasks,
                save_calls: 0,
            }
        }
    }

    impl TaskStore for InMemoryStore {
        type Error = String;

        fn load_active_tasks(&self) -> Result<Vec<Task>, Self::Error> {
            Ok(self.tasks.clone())
        }

        fn save_active_tasks(&mut self, tasks: &[Task]) -> Result<(), Self::Error> {
            self.tasks = tasks.to_vec();
            self.save_calls += 1;
            Ok(())
        }
    }

    fn dt(year: i32, month: u32, day: u32, hour: u32, minute: u32) -> DateTime<Local> {
        match Local.with_ymd_and_hms(year, month, day, hour, minute, 0) {
            LocalResult::Single(value) => value,
            LocalResult::Ambiguous(early, _) => early,
            LocalResult::None => panic!("invalid local datetime"),
        }
    }

    fn deadline_task(id: &str, title: &str, deadline_at: DateTime<Local>, is_pinned: bool) -> Task {
        Task {
            id: id.to_string(),
            title: title.to_string(),
            task_type: TaskType::Deadline { deadline_at },
            is_pinned,
            completed_at: None,
        }
    }

    fn daily_task(id: &str, title: &str, is_pinned: bool) -> Task {
        Task {
            id: id.to_string(),
            title: title.to_string(),
            task_type: TaskType::Daily,
            is_pinned,
            completed_at: None,
        }
    }

    #[test]
    fn list_tasks_enforces_spec_priority() {
        let now = dt(2026, 3, 26, 10, 0);
        let mut tasks = vec![
            deadline_task("future-2", "future-2", dt(2026, 3, 28, 9, 0), false),
            deadline_task("today", "today", dt(2026, 3, 26, 23, 0), false),
            daily_task("daily", "daily", false),
            deadline_task("overdue", "overdue", dt(2026, 3, 25, 8, 0), false),
            deadline_task("pinned", "pinned", dt(2026, 3, 30, 12, 0), true),
            deadline_task("future-1", "future-1", dt(2026, 3, 27, 9, 0), false),
        ];

        sort_tasks_in_place(&mut tasks, now);

        let ordered_ids: Vec<&str> = tasks.iter().map(|task| task.id.as_str()).collect();
        assert_eq!(
            ordered_ids,
            vec!["pinned", "overdue", "today", "daily", "future-1", "future-2"]
        );
    }

    #[test]
    fn list_tasks_is_deterministic_for_same_rank() {
        let now = dt(2026, 3, 26, 10, 0);
        let shared_deadline = dt(2026, 3, 29, 9, 0);
        let mut tasks = vec![
            deadline_task("2", "same", shared_deadline, false),
            deadline_task("1", "same", shared_deadline, false),
        ];

        sort_tasks_in_place(&mut tasks, now);

        let ordered_ids: Vec<&str> = tasks.iter().map(|task| task.id.as_str()).collect();
        assert_eq!(ordered_ids, vec!["1", "2"]);
    }

    #[test]
    fn set_task_pinned_rejects_fourth_pinned_task() {
        let store = InMemoryStore::with_tasks(vec![
            daily_task("p1", "p1", true),
            daily_task("p2", "p2", true),
            daily_task("p3", "p3", true),
            daily_task("u1", "u1", false),
        ]);
        let mut service = TaskService::new(store).expect("service creation should succeed");

        let result = service.set_task_pinned("u1", true);

        assert_eq!(
            result,
            Err(TaskServiceError::PinnedLimitExceeded {
                max: MAX_PINNED_TASKS
            })
        );
    }

    #[test]
    fn complete_task_moves_task_out_of_active_list_and_persistence() {
        let store = InMemoryStore::with_tasks(vec![
            daily_task("a", "a", false),
            daily_task("b", "b", false),
        ]);
        let mut service = TaskService::new(store).expect("service creation should succeed");

        let remaining = service
            .complete_task_at("a", dt(2026, 3, 26, 12, 0))
            .expect("completion should succeed");

        let remaining_ids: Vec<&str> = remaining.iter().map(|task| task.id.as_str()).collect();
        assert_eq!(remaining_ids, vec!["b"]);

        assert_eq!(service.completed_tasks().len(), 1);
        assert_eq!(service.completed_tasks()[0].id, "a");
        assert!(service.completed_tasks()[0].completed_at.is_some());

        let persisted_tasks = service
            .persisted_active_tasks()
            .expect("active tasks should be persisted");
        let persisted_ids: Vec<&str> = persisted_tasks
            .iter()
            .map(|task| task.id.as_str())
            .collect();
        assert_eq!(persisted_ids, vec!["b"]);
    }

    #[test]
    fn cleanup_completed_tasks_respects_72h_boundary() {
        let store = InMemoryStore::default();
        let mut service = TaskService::new(store).expect("service creation should succeed");
        let now = dt(2026, 3, 26, 12, 0);

        service.completed_tasks = vec![
            Task {
                id: "keep".to_string(),
                title: "keep".to_string(),
                task_type: TaskType::Daily,
                is_pinned: false,
                completed_at: Some(now - Duration::hours(71) - Duration::minutes(59)),
            },
            Task {
                id: "remove".to_string(),
                title: "remove".to_string(),
                task_type: TaskType::Daily,
                is_pinned: false,
                completed_at: Some(now - Duration::hours(72)),
            },
        ];

        let removed = service
            .cleanup_completed_tasks_at(now)
            .expect("cleanup should succeed");

        assert_eq!(removed, 1);
        assert_eq!(service.completed_tasks().len(), 1);
        assert_eq!(service.completed_tasks()[0].id, "keep");
    }

    #[test]
    fn set_task_pinned_returns_not_found_for_unknown_id() {
        let store = InMemoryStore::with_tasks(vec![daily_task("existing", "existing", false)]);
        let mut service = TaskService::new(store).expect("service creation should succeed");

        let result = service.set_task_pinned("missing", true);

        assert_eq!(
            result,
            Err(TaskServiceError::TaskNotFound {
                id: "missing".to_string()
            })
        );
    }
}
