#![allow(dead_code)]

#[path = "../src/model/mod.rs"]
mod model;
#[path = "../src/service/mod.rs"]
mod service;

use std::sync::{Arc, Mutex};

use chrono::{DateTime, Duration, Local, LocalResult, TimeZone, Timelike};

use model::task::{Task, TaskCompletion, TaskType};
use service::{
    TaskService, TaskServiceError, TaskStore, UpdateTaskInput, COMPLETED_RETENTION_HOURS,
    DAILY_RESET_HOUR, MAX_PINNED_TASKS,
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
        completion: None,
    }
}

fn daily_task(id: &str, title: &str, is_pinned: bool) -> Task {
    Task {
        id: id.to_string(),
        title: title.to_string(),
        task_type: TaskType::Daily,
        is_pinned,
        completion: None,
    }
}

fn business_day_at_for_test(value: DateTime<Local>) -> chrono::NaiveDate {
    let date = value.date_naive();
    if value.hour() < DAILY_RESET_HOUR {
        return date.pred_opt().unwrap_or(date);
    }
    date
}

fn deadline_completion(completed_at: DateTime<Local>) -> TaskCompletion {
    TaskCompletion::Deadline { completed_at }
}

fn daily_completion(completed_at: DateTime<Local>) -> TaskCompletion {
    TaskCompletion::Daily {
        completed_at,
        business_day: business_day_at_for_test(completed_at),
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
    completed_old.completion = Some(deadline_completion(dt(2026, 3, 25, 12, 0)));

    let mut completed_new = deadline_task(
        "completed-new",
        "completed-new",
        dt(2026, 3, 24, 10, 0),
        false,
    );
    completed_new.completion = Some(deadline_completion(dt(2026, 3, 26, 9, 30)));

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
    assert!(completed.completion.is_some());
    assert!(!completed.is_pinned);

    let toggled_back = service
        .complete_task_at("a", dt(2026, 3, 26, 12, 5))
        .expect("toggle back should succeed");
    let restored = toggled_back
        .iter()
        .find(|task| task.id == "a")
        .expect("restored task should remain visible");
    assert!(restored.completion.is_none());
    assert!(!restored.is_pinned);

    let persisted_tasks = persisted.snapshot();
    assert!(persisted_tasks
        .iter()
        .any(|task| task.id == "a" && task.completion.is_none()));
}

#[test]
fn update_task_allows_completed_task_edit_when_pin_state_is_unchanged() {
    // 仕様: 完了タスクでも編集は可能。ただし pin 状態は変更しない。
    let mut completed = daily_task("done", "before", false);
    completed.completion = Some(daily_completion(dt(2026, 3, 26, 11, 0)));
    let store = InMemoryStore::with_tasks(vec![completed]);
    let persisted = store.clone();
    let mut service = TaskService::new(store).expect("service creation should succeed");

    let updated = service
        .update_task(UpdateTaskInput {
            id: "done".to_string(),
            title: Some("after".to_string()),
            task_type: Some(TaskType::Deadline {
                deadline_at: dt(2026, 3, 28, 9, 0),
            }),
            is_pinned: Some(false),
        })
        .expect("updating completed task should succeed");

    assert_eq!(updated.id, "done");
    assert_eq!(updated.title, "after");
    assert!(matches!(updated.task_type, TaskType::Deadline { .. }));
    assert!(updated.completion.is_some());

    let persisted_task = persisted
        .snapshot()
        .into_iter()
        .find(|task| task.id == "done")
        .expect("updated task should be persisted");
    assert_eq!(persisted_task.title, "after");
    assert!(matches!(persisted_task.task_type, TaskType::Deadline { .. }));
    assert!(persisted_task.completion.is_some());
    assert!(!persisted_task.is_pinned);
}

#[test]
fn update_task_rejects_pin_change_for_completed_task() {
    // 仕様: 完了タスクへの pin 更新は不可。
    let mut completed = daily_task("done", "done", false);
    completed.completion = Some(daily_completion(dt(2026, 3, 26, 11, 0)));
    let store = InMemoryStore::with_tasks(vec![completed]);
    let mut service = TaskService::new(store).expect("service creation should succeed");

    let result = service.update_task(UpdateTaskInput {
        id: "done".to_string(),
        title: Some("edited".to_string()),
        task_type: None,
        is_pinned: Some(true),
    });

    assert_eq!(
        result,
        Err(TaskServiceError::CompletedTaskImmutable {
            id: "done".to_string()
        })
    );
}

#[test]
fn list_tasks_resets_daily_completion_after_5am_boundary() {
    // 仕様: daily の完了状態は営業日境界（05:00）をまたぐと未完了へ戻る。
    let mut daily = daily_task("daily", "daily", false);
    daily.completion = Some(daily_completion(dt(2026, 3, 26, 4, 30)));

    let mut deadline = deadline_task("deadline", "deadline", dt(2026, 3, 27, 12, 0), false);
    deadline.completion = Some(deadline_completion(dt(2026, 3, 26, 4, 30)));

    let store = InMemoryStore::with_tasks(vec![daily, deadline]);
    let mut service = TaskService::new(store).expect("service creation should succeed");

    let before_reset = service.list_tasks_at(dt(2026, 3, 26, DAILY_RESET_HOUR - 1, 59));
    let before_daily = before_reset
        .iter()
        .find(|task| task.id == "daily")
        .expect("daily task should exist");
    assert!(before_daily.completion.is_some());

    let after_reset = service.list_tasks_at(dt(2026, 3, 26, DAILY_RESET_HOUR, 0));
    let after_daily = after_reset
        .iter()
        .find(|task| task.id == "daily")
        .expect("daily task should exist");
    let after_deadline = after_reset
        .iter()
        .find(|task| task.id == "deadline")
        .expect("deadline task should exist");

    assert!(after_daily.completion.is_none());
    assert!(after_deadline.completion.is_some());
}

#[test]
fn cleanup_completed_tasks_respects_72h_boundary_and_persists() {
    // 仕様: 72時間を超えた完了タスクのみ削除し、結果を永続化する。
    let now = dt(2026, 3, 26, 12, 0);
    let mut keep_task = deadline_task("keep", "keep", dt(2026, 3, 27, 12, 0), false);
    keep_task.completion = Some(deadline_completion(
        now - Duration::hours(COMPLETED_RETENTION_HOURS - 1),
    ));

    let mut remove_task = deadline_task("remove", "remove", dt(2026, 3, 28, 12, 0), false);
    remove_task.completion = Some(deadline_completion(
        now - Duration::hours(COMPLETED_RETENTION_HOURS),
    ));

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
fn cleanup_completed_tasks_keeps_daily_tasks_that_crossed_business_day() {
    // 仕様: cleanupはDeadline完了のみ削除対象。Daily完了は保持し、リセット責務はlist側に委譲する。
    let now = dt(2026, 3, 30, 6, 0);
    let mut daily = daily_task("daily", "daily", false);
    daily.completion = Some(daily_completion(dt(2026, 3, 26, 4, 30)));
    let mut deadline = deadline_task("deadline", "deadline", dt(2026, 4, 1, 12, 0), false);
    deadline.completion = Some(deadline_completion(dt(2026, 3, 26, 4, 30)));

    let store = InMemoryStore::with_tasks(vec![daily, deadline]);
    let persisted = store.clone();
    let mut service = TaskService::new(store).expect("service creation should succeed");

    let removed = service
        .cleanup_completed_tasks_at(now)
        .expect("cleanup should succeed");

    assert_eq!(removed, 1);
    let persisted_tasks = persisted.snapshot();
    assert_eq!(persisted_tasks.len(), 1);
    assert_eq!(persisted_tasks[0].id, "daily");
    assert!(persisted_tasks[0].completion.is_some());
}

#[test]
fn set_task_pinned_rejects_completed_task() {
    // 仕様: 完了タスクは pin 更新不可。
    let mut completed = daily_task("done", "done", false);
    completed.completion = Some(daily_completion(dt(2026, 3, 26, 11, 0)));

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
