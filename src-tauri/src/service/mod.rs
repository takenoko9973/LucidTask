use std::cmp::Ordering;
use std::fmt::{Display, Formatter};

use chrono::{DateTime, Duration, Local, NaiveDate, Timelike};

use crate::model::task::{Task, TaskType};

pub const MAX_PINNED_TASKS: usize = 3;
pub const COMPLETED_RETENTION_HOURS: i64 = 72;
pub const DAILY_RESET_HOUR: u32 = 5;
const DAILY_SORT_VALUE: i64 = i64::MAX;
type TaskSortGroup = u8;
const SORT_GROUP_PINNED: TaskSortGroup = 0;
const SORT_GROUP_DUE_OR_OVERDUE: TaskSortGroup = 1;
const SORT_GROUP_DAILY: TaskSortGroup = 2;
const SORT_GROUP_FUTURE_DEADLINE: TaskSortGroup = 3;
const SORT_GROUP_COMPLETED: TaskSortGroup = 4;

pub trait TaskStore {
    type Error;

    fn load_tasks(&self) -> Result<Vec<Task>, Self::Error>;
    fn save_tasks(&mut self, tasks: &[Task]) -> Result<(), Self::Error>;
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
    fn to_repository_error(error: S::Error) -> TaskServiceError {
        TaskServiceError::Repository(error.to_string())
    }

    fn task_not_found(id: impl Into<String>) -> TaskServiceError {
        TaskServiceError::TaskNotFound { id: id.into() }
    }

    fn completed_task_immutable(id: impl Into<String>) -> TaskServiceError {
        TaskServiceError::CompletedTaskImmutable { id: id.into() }
    }

    fn task_index_by_id(&self, id: &str) -> Result<usize, TaskServiceError> {
        self.tasks
            .iter()
            .position(|task| task.id == id)
            .ok_or_else(|| Self::task_not_found(id))
    }

    fn active_task_index_by_id(&self, id: &str) -> Result<usize, TaskServiceError> {
        let index = self.task_index_by_id(id)?;
        if self.tasks[index].completed_at.is_some() {
            return Err(Self::completed_task_immutable(id));
        }

        Ok(index)
    }

    pub fn new(store: S) -> Result<Self, TaskServiceError> {
        let tasks = store.load_tasks().map_err(Self::to_repository_error)?;

        Ok(Self { store, tasks })
    }

    pub fn list_tasks(&mut self) -> Vec<Task> {
        self.list_tasks_at(Local::now())
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

        self.tasks.push(task.clone());
        self.persist_tasks()?;
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

        if matches!(is_pinned, Some(true)) && !self.tasks[task_index].is_pinned {
            self.ensure_pin_capacity(Some(id.as_str()))?;
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

    pub fn delete_task(&mut self, id: &str) -> Result<Vec<Task>, TaskServiceError> {
        let original_len = self.tasks.len();
        self.tasks.retain(|task| task.id != id);

        if self.tasks.len() == original_len {
            return Err(Self::task_not_found(id));
        }

        self.persist_tasks()?;
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
        let task_index = self.task_index_by_id(id)?;

        let task = &mut self.tasks[task_index];
        if task.completed_at.is_some() {
            task.completed_at = None;
        } else {
            task.completed_at = Some(completed_at);
            // 完了時は固定を外し、固定枠を解放する。
            task.is_pinned = false;
        }

        self.persist_tasks()?;
        Ok(self.list_tasks_at(completed_at))
    }

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

    pub fn cleanup_completed_tasks(&mut self) -> Result<usize, TaskServiceError> {
        self.cleanup_completed_tasks_at(Local::now())
    }

    pub fn cleanup_completed_tasks_at(
        &mut self,
        now: DateTime<Local>,
    ) -> Result<usize, TaskServiceError> {
        let cutoff = now - Duration::hours(COMPLETED_RETENTION_HOURS);
        let before = self.tasks.len();

        self.tasks.retain(|task| match task.completed_at {
            Some(ts) => ts > cutoff,
            None => true,
        });

        let removed = before - self.tasks.len();
        if removed > 0 {
            self.persist_tasks()?;
        }

        Ok(removed)
    }

    fn ensure_pin_capacity(&self, exempt_task_id: Option<&str>) -> Result<(), TaskServiceError> {
        let pinned_count = self
            .tasks
            .iter()
            .filter(|task| {
                task.completed_at.is_none()
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

    fn persist_tasks(&mut self) -> Result<(), TaskServiceError> {
        self.store
            .save_tasks(&self.tasks)
            .map_err(Self::to_repository_error)
    }

    pub(crate) fn list_tasks_at(&mut self, now: DateTime<Local>) -> Vec<Task> {
        self.reset_daily_tasks_if_needed(now);
        let mut tasks = self.tasks.clone();
        sort_tasks_in_place(&mut tasks, now);
        tasks
    }

    fn reset_daily_tasks_if_needed(&mut self, now: DateTime<Local>) {
        for task in &mut self.tasks {
            if task.task_type != TaskType::Daily {
                continue;
            }

            let Some(completed_at) = task.completed_at else {
                continue;
            };

            if should_reset_daily_completion(completed_at, now) {
                task.completed_at = None;
            }
        }
    }
}

fn validate_title(title: String) -> Result<String, TaskServiceError> {
    if title.trim().is_empty() {
        return Err(TaskServiceError::InvalidTitle);
    }

    Ok(title)
}

fn business_day_at(value: DateTime<Local>) -> NaiveDate {
    let date = value.date_naive();
    if value.hour() < DAILY_RESET_HOUR {
        return date.pred_opt().unwrap_or(date);
    }

    date
}

fn should_reset_daily_completion(completed_at: DateTime<Local>, now: DateTime<Local>) -> bool {
    business_day_at(now) > business_day_at(completed_at)
}

fn sort_tasks_in_place(tasks: &mut [Task], now: DateTime<Local>) {
    tasks.sort_by(|left, right| compare_tasks(left, right, now));
}

fn compare_tasks(left: &Task, right: &Task, now: DateTime<Local>) -> Ordering {
    let left_key = task_sort_key(left, now);
    let right_key = task_sort_key(right, now);

    left_key
        .cmp(&right_key)
        .then_with(|| left.title.cmp(&right.title))
        .then_with(|| left.id.cmp(&right.id))
}

fn task_sort_key(task: &Task, now: DateTime<Local>) -> (TaskSortGroup, i64) {
    // 優先順: pinned -> 期限超過/当日 -> daily -> 未来期限 -> 完了
    if let Some(completed_at) = task.completed_at {
        return (SORT_GROUP_COMPLETED, -completed_at.timestamp());
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

fn deadline_sort_value(task: &Task) -> i64 {
    match &task.task_type {
        TaskType::Deadline { deadline_at } => deadline_at.timestamp(),
        TaskType::Daily => DAILY_SORT_VALUE,
    }
}
