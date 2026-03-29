#![allow(dead_code)]

#[path = "../src/model/mod.rs"]
mod model;
#[path = "../src/service/mod.rs"]
mod service;

use std::sync::{Arc, Mutex};

use chrono::{DateTime, Duration, Local, LocalResult, TimeZone};

use model::task::{Task, TaskType};
use service::{
    TaskService, TaskServiceError, TaskStore, COMPLETED_RETENTION_HOURS, DAILY_RESET_HOUR,
    MAX_PINNED_TASKS,
};

#[derive(Clone, Default)]
struct InMemoryStore {
    tasks: Arc<Mutex<Vec<Task>>>,
}

impl InMemoryStore {
    fn with_tasks(tasks: Vec<Task>) -> Self {
        Self {
            tasks: Arc::new(Mutex::new(tasks)),
        }
    }

    fn snapshot(&self) -> Vec<Task> {
        self.tasks
            .lock()
            .expect("task store lock should not be poisoned")
            .clone()
    }
}

impl TaskStore for InMemoryStore {
    type Error = String;

    fn load_tasks(&self) -> Result<Vec<Task>, Self::Error> {
        Ok(self.snapshot())
    }

    fn save_tasks(&mut self, tasks: &[Task]) -> Result<(), Self::Error> {
        let mut target = self
            .tasks
            .lock()
            .map_err(|_| "task store lock should not be poisoned".to_string())?;
        *target = tasks.to_vec();
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
fn list_tasks_enforces_spec_priority_and_completed_last() {
    // 仕様: 並び順は pinned -> 期限超過/当日 -> daily -> 未来期限 -> 完了。
    let now = dt(2026, 3, 26, 10, 0);
    let mut completed_old = deadline_task(
        "completed-old",
        "completed-old",
        dt(2026, 3, 24, 9, 0),
        false,
    );
    completed_old.completed_at = Some(dt(2026, 3, 25, 12, 0));

    let mut completed_new = deadline_task(
        "completed-new",
        "completed-new",
        dt(2026, 3, 24, 10, 0),
        false,
    );
    completed_new.completed_at = Some(dt(2026, 3, 26, 9, 30));

    let store = InMemoryStore::with_tasks(vec![
        deadline_task("future-2", "future-2", dt(2026, 3, 28, 9, 0), false),
        deadline_task("today", "today", dt(2026, 3, 26, 23, 0), false),
        daily_task("daily", "daily", false),
        completed_old,
        deadline_task("overdue", "overdue", dt(2026, 3, 25, 8, 0), false),
        completed_new,
        deadline_task("pinned", "pinned", dt(2026, 3, 30, 12, 0), true),
        deadline_task("future-1", "future-1", dt(2026, 3, 27, 9, 0), false),
    ]);
    let mut service = TaskService::new(store).expect("service creation should succeed");

    let ordered_ids: Vec<String> = service
        .list_tasks_at(now)
        .iter()
        .map(|task| task.id.clone())
        .collect();

    assert_eq!(
        ordered_ids,
        vec![
            "pinned",
            "overdue",
            "today",
            "daily",
            "future-1",
            "future-2",
            "completed-new",
            "completed-old"
        ]
    );
}

#[test]
fn list_tasks_is_deterministic_for_same_rank() {
    // 仕様: 同順位のタスクは title -> id で安定順序を維持する。
    let now = dt(2026, 3, 26, 10, 0);
    let shared_deadline = dt(2026, 3, 29, 9, 0);
    let store = InMemoryStore::with_tasks(vec![
        deadline_task("2", "same", shared_deadline, false),
        deadline_task("1", "same", shared_deadline, false),
    ]);
    let mut service = TaskService::new(store).expect("service creation should succeed");

    let ordered_ids: Vec<String> = service
        .list_tasks_at(now)
        .iter()
        .map(|task| task.id.clone())
        .collect();

    assert_eq!(ordered_ids, vec!["1", "2"]);
}

#[test]
fn set_task_pinned_rejects_fourth_pinned_task() {
    // 仕様: 未完了 pinned は最大3件まで。
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
fn complete_task_toggles_completion_state() {
    // 仕様: complete はトグル動作（未完了<->完了）で、完了時は pinned を解除する。
    let store = InMemoryStore::with_tasks(vec![
        daily_task("a", "a", true),
        daily_task("b", "b", false),
    ]);
    let persisted = store.clone();
    let mut service = TaskService::new(store).expect("service creation should succeed");

    let completed_once = service
        .complete_task_at("a", dt(2026, 3, 26, 12, 0))
        .expect("completion should succeed");

    let completed = completed_once
        .iter()
        .find(|task| task.id == "a")
        .expect("completed task should remain visible");
    assert!(completed.completed_at.is_some());
    assert!(!completed.is_pinned);

    let toggled_back = service
        .complete_task_at("a", dt(2026, 3, 26, 12, 5))
        .expect("toggle back should succeed");
    let restored = toggled_back
        .iter()
        .find(|task| task.id == "a")
        .expect("restored task should remain visible");
    assert!(restored.completed_at.is_none());
    assert!(!restored.is_pinned);

    let persisted_tasks = persisted.snapshot();
    assert!(persisted_tasks
        .iter()
        .any(|task| task.id == "a" && task.completed_at.is_none()));
}

#[test]
fn list_tasks_resets_daily_completion_after_5am_boundary() {
    // 仕様: daily の完了状態は営業日境界（05:00）をまたぐと未完了へ戻る。
    let mut daily = daily_task("daily", "daily", false);
    daily.completed_at = Some(dt(2026, 3, 26, 4, 30));

    let mut deadline = deadline_task("deadline", "deadline", dt(2026, 3, 27, 12, 0), false);
    deadline.completed_at = Some(dt(2026, 3, 26, 4, 30));

    let store = InMemoryStore::with_tasks(vec![daily, deadline]);
    let mut service = TaskService::new(store).expect("service creation should succeed");

    let before_reset = service.list_tasks_at(dt(2026, 3, 26, DAILY_RESET_HOUR - 1, 59));
    let before_daily = before_reset
        .iter()
        .find(|task| task.id == "daily")
        .expect("daily task should exist");
    assert!(before_daily.completed_at.is_some());

    let after_reset = service.list_tasks_at(dt(2026, 3, 26, DAILY_RESET_HOUR, 0));
    let after_daily = after_reset
        .iter()
        .find(|task| task.id == "daily")
        .expect("daily task should exist");
    let after_deadline = after_reset
        .iter()
        .find(|task| task.id == "deadline")
        .expect("deadline task should exist");

    assert!(after_daily.completed_at.is_none());
    assert!(after_deadline.completed_at.is_some());
}

#[test]
fn cleanup_completed_tasks_respects_72h_boundary_and_persists() {
    // 仕様: 72時間を超えた完了タスクのみ削除し、結果を永続化する。
    let now = dt(2026, 3, 26, 12, 0);
    let mut keep_task = daily_task("keep", "keep", false);
    keep_task.completed_at = Some(now - Duration::hours(COMPLETED_RETENTION_HOURS - 1));

    let mut remove_task = daily_task("remove", "remove", false);
    remove_task.completed_at = Some(now - Duration::hours(COMPLETED_RETENTION_HOURS));

    let store = InMemoryStore::with_tasks(vec![keep_task, remove_task]);
    let persisted = store.clone();
    let mut service = TaskService::new(store).expect("service creation should succeed");

    let removed = service
        .cleanup_completed_tasks_at(now)
        .expect("cleanup should succeed");

    assert_eq!(removed, 1);
    let persisted_ids: Vec<String> = persisted
        .snapshot()
        .iter()
        .map(|task| task.id.clone())
        .collect();
    assert_eq!(persisted_ids, vec!["keep"]);
}

#[test]
fn set_task_pinned_rejects_completed_task() {
    // 仕様: 完了タスクは pin 更新不可。
    let mut completed = daily_task("done", "done", false);
    completed.completed_at = Some(dt(2026, 3, 26, 11, 0));

    let store = InMemoryStore::with_tasks(vec![completed]);
    let mut service = TaskService::new(store).expect("service creation should succeed");

    let result = service.set_task_pinned("done", true);

    assert_eq!(
        result,
        Err(TaskServiceError::CompletedTaskImmutable {
            id: "done".to_string()
        })
    );
}
