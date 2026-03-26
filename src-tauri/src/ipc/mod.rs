use std::sync::Mutex;

use serde::Deserialize;
use tauri::{AppHandle, Manager, Runtime, State};
use uuid::Uuid;

use crate::model::task::{Task, TaskType};
use crate::repository::{JsonTaskRepository, RepositoryError};
use crate::service::{
    CreateTaskInput as ServiceCreateTaskInput, TaskService, TaskServiceError, TaskStore,
    UpdateTaskInput as ServiceUpdateTaskInput,
};

type CommandResult<T> = Result<T, String>;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskInput {
    pub title: String,
    pub task_type: TaskType,
    pub is_pinned: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskInput {
    pub id: String,
    pub title: Option<String>,
    pub task_type: Option<TaskType>,
    pub is_pinned: Option<bool>,
}

pub struct AppState {
    task_service: Mutex<TaskService<JsonTaskStore>>,
}

#[derive(Debug, Clone)]
struct JsonTaskStore {
    repository: JsonTaskRepository,
}

impl JsonTaskStore {
    fn new(repository: JsonTaskRepository) -> Self {
        Self { repository }
    }
}

impl TaskStore for JsonTaskStore {
    type Error = RepositoryError;

    fn load_active_tasks(&self) -> Result<Vec<Task>, Self::Error> {
        self.repository.load_tasks()
    }

    fn save_active_tasks(&mut self, tasks: &[Task]) -> Result<(), Self::Error> {
        self.repository.save_tasks(tasks)
    }
}

pub fn build_app_state<R: Runtime>(app: &AppHandle<R>) -> Result<AppState, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;

    let repository = JsonTaskRepository::from_app_data_dir(app_data_dir);
    let store = JsonTaskStore::new(repository);
    let task_service = TaskService::new(store).map_err(|error| error.to_string())?;

    Ok(AppState {
        task_service: Mutex::new(task_service),
    })
}

fn to_service_create_input(input: CreateTaskInput) -> ServiceCreateTaskInput {
    ServiceCreateTaskInput {
        id: Uuid::new_v4().to_string(),
        title: input.title,
        task_type: input.task_type,
        is_pinned: input.is_pinned.unwrap_or(false),
    }
}

fn to_service_update_input(input: UpdateTaskInput) -> ServiceUpdateTaskInput {
    ServiceUpdateTaskInput {
        id: input.id,
        title: input.title,
        task_type: input.task_type,
        is_pinned: input.is_pinned,
    }
}

fn with_task_service<T>(
    state: &State<'_, AppState>,
    operation: impl FnOnce(&mut TaskService<JsonTaskStore>) -> Result<T, TaskServiceError>,
) -> CommandResult<T> {
    let mut task_service = state
        .task_service
        .lock()
        .map_err(|_| "Task service lock was poisoned".to_string())?;
    operation(&mut task_service).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_tasks(state: State<'_, AppState>) -> CommandResult<Vec<Task>> {
    with_task_service(&state, |task_service| Ok(task_service.list_tasks()))
}

#[tauri::command]
pub fn create_task(state: State<'_, AppState>, input: CreateTaskInput) -> CommandResult<Task> {
    with_task_service(&state, |task_service| {
        task_service.create_task(to_service_create_input(input))
    })
}

#[tauri::command]
pub fn update_task(state: State<'_, AppState>, input: UpdateTaskInput) -> CommandResult<Task> {
    with_task_service(&state, |task_service| {
        task_service.update_task(to_service_update_input(input))
    })
}

#[tauri::command]
pub fn delete_task(state: State<'_, AppState>, id: String) -> CommandResult<Vec<Task>> {
    with_task_service(&state, |task_service| task_service.delete_task(&id))
}

#[tauri::command]
pub fn complete_task(state: State<'_, AppState>, id: String) -> CommandResult<Vec<Task>> {
    with_task_service(&state, |task_service| task_service.complete_task(&id))
}

#[tauri::command]
pub fn set_task_pinned(
    state: State<'_, AppState>,
    id: String,
    is_pinned: bool,
) -> CommandResult<Task> {
    with_task_service(&state, |task_service| {
        task_service.set_task_pinned(&id, is_pinned)
    })
}

#[tauri::command]
pub fn cleanup_completed_tasks(state: State<'_, AppState>) -> CommandResult<usize> {
    with_task_service(&state, |task_service| {
        task_service.cleanup_completed_tasks()
    })
}
