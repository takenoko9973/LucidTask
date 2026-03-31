use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuEvent, MenuItem, Submenu},
    AppHandle, Emitter, LogicalPosition, Manager, Runtime, State, WebviewWindow,
};
use uuid::Uuid;

mod native_menu_i18n;

use crate::model::task::{Task, TaskType};
use crate::repository::{JsonTaskRepository, RepositoryError};
use crate::service::{
    CreateTaskInput as ServiceCreateTaskInput, TaskService, TaskServiceError, TaskStore,
    UpdateTaskInput as ServiceUpdateTaskInput,
};
use native_menu_i18n::MenuLocale;

type CommandResult<T> = Result<T, String>;

const NATIVE_MENU_EVENT_NAME: &str = "tasks:native-menu-action";
const MENU_ID_APP_ALWAYS_ON_TOP_TOGGLE: &str = "ctx.app.always-on-top.toggle";
const MENU_ID_APP_AUTOSTART_TOGGLE: &str = "ctx.app.autostart.toggle";
const MENU_ID_APP_LOCALE_JA: &str = "ctx.app.locale.ja";
const MENU_ID_APP_LOCALE_EN: &str = "ctx.app.locale.en";
const MENU_ID_APP_QUIT: &str = "ctx.app.quit";
const MENU_ID_TASK_EDIT_PREFIX: &str = "ctx.task.edit::";
const MENU_ID_TASK_PIN_PREFIX: &str = "ctx.task.pin::";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ShowContextMenuKind {
    App,
    Task,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowContextMenuInput {
    pub kind: ShowContextMenuKind,
    pub x: f64,
    pub y: f64,
    pub locale: Option<String>,
    pub task_id: Option<String>,
    pub is_pinned: Option<bool>,
    pub is_completed: Option<bool>,
}

#[derive(Debug)]
struct AppContextMenuRequest {
    x: f64,
    y: f64,
    locale: MenuLocale,
}

#[derive(Debug)]
struct TaskContextMenuRequest {
    x: f64,
    y: f64,
    locale: MenuLocale,
    task_id: String,
    is_completed: bool,
    next_is_pinned: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct TaskContextMenuAvailability {
    pin_enabled: bool,
    edit_enabled: bool,
}

#[derive(Debug)]
enum ValidatedContextMenuRequest {
    App(AppContextMenuRequest),
    Task(TaskContextMenuRequest),
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "action", rename_all = "kebab-case")]
enum NativeMenuActionEvent {
    SetLocale {
        locale: String,
    },
    TaskEdit {
        #[serde(rename = "taskId")]
        task_id: String,
    },
    TaskPinToggle {
        #[serde(rename = "taskId")]
        task_id: String,
        #[serde(rename = "nextIsPinned")]
        next_is_pinned: bool,
    },
}

#[derive(Debug, PartialEq, Eq)]
enum NativeMenuAction {
    ToggleAlwaysOnTop,
    ToggleAutostart,
    Quit,
    Emit(NativeMenuActionEvent),
}

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

    fn load_tasks(&self) -> Result<Vec<Task>, Self::Error> {
        self.repository.load_tasks()
    }

    fn save_tasks(&mut self, tasks: &[Task]) -> Result<(), Self::Error> {
        self.repository.save_tasks(tasks)
    }
}

pub fn build_app_state<R: Runtime>(app: &AppHandle<R>) -> Result<AppState, String> {
    // 保存先は tauri.conf の identifier に紐づく。identifier変更時のデータ移行は今回は行わない。
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

fn ensure_finite_point(value: f64, name: &str) -> Result<f64, String> {
    if value.is_finite() {
        return Ok(value.max(0.0));
    }
    Err(format!("Invalid pointer coordinate: {name}"))
}

fn validate_show_context_menu_input(
    input: ShowContextMenuInput,
) -> Result<ValidatedContextMenuRequest, String> {
    let x = ensure_finite_point(input.x, "x")?;
    let y = ensure_finite_point(input.y, "y")?;
    let locale = MenuLocale::parse(input.locale.as_deref());

    match input.kind {
        ShowContextMenuKind::App => Ok(ValidatedContextMenuRequest::App(AppContextMenuRequest {
            x,
            y,
            locale,
        })),
        ShowContextMenuKind::Task => {
            let task_id = input
                .task_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "task menu requires taskId".to_string())?
                .to_string();
            let is_pinned = input
                .is_pinned
                .ok_or_else(|| "task menu requires isPinned".to_string())?;
            let is_completed = input
                .is_completed
                .ok_or_else(|| "task menu requires isCompleted".to_string())?;

            Ok(ValidatedContextMenuRequest::Task(TaskContextMenuRequest {
                x,
                y,
                locale,
                task_id,
                is_completed,
                next_is_pinned: !is_pinned,
            }))
        }
    }
}

fn popup_position(x: f64, y: f64) -> LogicalPosition<f64> {
    LogicalPosition::new(x.max(0.0), y.max(0.0))
}

fn show_app_context_menu<R: Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
    request: AppContextMenuRequest,
) -> Result<(), String> {
    let always_on_top_enabled = window
        .is_always_on_top()
        .map_err(|error| error.to_string())?;
    let always_on_top_toggle = CheckMenuItem::with_id(
        app,
        MENU_ID_APP_ALWAYS_ON_TOP_TOGGLE,
        request.locale.app_always_on_top_label(),
        true,
        always_on_top_enabled,
        None::<&str>,
    )
    .map_err(|error| error.to_string())?;
    let autostart_enabled =
        crate::system::autostart::is_enabled(app).map_err(|error| error.to_string())?;
    let autostart_toggle = CheckMenuItem::with_id(
        app,
        MENU_ID_APP_AUTOSTART_TOGGLE,
        request.locale.app_autostart_label(),
        true,
        autostart_enabled,
        None::<&str>,
    )
    .map_err(|error| error.to_string())?;
    let locale_ja = CheckMenuItem::with_id(
        app,
        MENU_ID_APP_LOCALE_JA,
        request.locale.app_language_ja_label(),
        true,
        request.locale == MenuLocale::Ja,
        None::<&str>,
    )
    .map_err(|error| error.to_string())?;
    let locale_en = CheckMenuItem::with_id(
        app,
        MENU_ID_APP_LOCALE_EN,
        request.locale.app_language_en_label(),
        true,
        request.locale == MenuLocale::En,
        None::<&str>,
    )
    .map_err(|error| error.to_string())?;
    let language_menu = Submenu::with_items(
        app,
        request.locale.app_language_label(),
        true,
        &[&locale_ja, &locale_en],
    )
    .map_err(|error| error.to_string())?;
    let quit_item = MenuItem::with_id(
        app,
        MENU_ID_APP_QUIT,
        request.locale.app_quit_label(),
        true,
        None::<&str>,
    )
    .map_err(|error| error.to_string())?;
    let menu = Menu::with_items(
        app,
        &[
            &always_on_top_toggle,
            &autostart_toggle,
            &language_menu,
            &quit_item,
        ],
    )
    .map_err(|error| error.to_string())?;

    window
        .popup_menu_at(&menu, popup_position(request.x, request.y))
        .map_err(|error| error.to_string())
}

fn build_task_edit_menu_id(task_id: &str) -> String {
    format!("{MENU_ID_TASK_EDIT_PREFIX}{task_id}")
}

fn build_task_pin_menu_id(task_id: &str, next_is_pinned: bool) -> String {
    let flag = if next_is_pinned { "1" } else { "0" };
    format!("{MENU_ID_TASK_PIN_PREFIX}{task_id}::{flag}")
}

fn parse_task_pin_menu_id(menu_id: &str) -> Option<(String, bool)> {
    let suffix = menu_id.strip_prefix(MENU_ID_TASK_PIN_PREFIX)?;
    let (task_id, flag) = suffix.rsplit_once("::")?;
    if task_id.is_empty() {
        return None;
    }
    match flag {
        "1" => Some((task_id.to_string(), true)),
        "0" => Some((task_id.to_string(), false)),
        _ => None,
    }
}

fn resolve_task_context_menu_availability(is_completed: bool) -> TaskContextMenuAvailability {
    // 仕様: 完了済みタスクは Pin を無効化するが、復帰導線のため Edit は許可する。
    TaskContextMenuAvailability {
        pin_enabled: !is_completed,
        edit_enabled: true,
    }
}

fn show_task_context_menu<R: Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
    request: TaskContextMenuRequest,
) -> Result<(), String> {
    let availability = resolve_task_context_menu_availability(request.is_completed);
    let pin_item = MenuItem::with_id(
        app,
        build_task_pin_menu_id(&request.task_id, request.next_is_pinned),
        if request.next_is_pinned {
            request.locale.task_pin_on_label()
        } else {
            request.locale.task_pin_off_label()
        },
        availability.pin_enabled,
        None::<&str>,
    )
    .map_err(|error| error.to_string())?;
    let edit_item = MenuItem::with_id(
        app,
        build_task_edit_menu_id(&request.task_id),
        request.locale.task_edit_label(),
        availability.edit_enabled,
        None::<&str>,
    )
    .map_err(|error| error.to_string())?;
    let menu =
        Menu::with_items(app, &[&pin_item, &edit_item]).map_err(|error| error.to_string())?;

    window
        .popup_menu_at(&menu, popup_position(request.x, request.y))
        .map_err(|error| error.to_string())
}

fn parse_native_menu_action(menu_id: &str) -> Option<NativeMenuAction> {
    if menu_id == MENU_ID_APP_ALWAYS_ON_TOP_TOGGLE {
        return Some(NativeMenuAction::ToggleAlwaysOnTop);
    }

    if menu_id == MENU_ID_APP_AUTOSTART_TOGGLE {
        return Some(NativeMenuAction::ToggleAutostart);
    }

    if menu_id == MENU_ID_APP_QUIT {
        return Some(NativeMenuAction::Quit);
    }

    if menu_id == MENU_ID_APP_LOCALE_JA {
        return Some(NativeMenuAction::Emit(NativeMenuActionEvent::SetLocale {
            locale: MenuLocale::Ja.as_code().to_string(),
        }));
    }

    if menu_id == MENU_ID_APP_LOCALE_EN {
        return Some(NativeMenuAction::Emit(NativeMenuActionEvent::SetLocale {
            locale: MenuLocale::En.as_code().to_string(),
        }));
    }

    if let Some(task_id) = menu_id.strip_prefix(MENU_ID_TASK_EDIT_PREFIX) {
        if !task_id.is_empty() {
            return Some(NativeMenuAction::Emit(NativeMenuActionEvent::TaskEdit {
                task_id: task_id.to_string(),
            }));
        }
    }

    if let Some((task_id, next_is_pinned)) = parse_task_pin_menu_id(menu_id) {
        return Some(NativeMenuAction::Emit(
            NativeMenuActionEvent::TaskPinToggle {
                task_id,
                next_is_pinned,
            },
        ));
    }

    None
}

fn emit_native_menu_action<R: Runtime>(
    app: &AppHandle<R>,
    action: NativeMenuActionEvent,
) -> Result<(), String> {
    app.emit(NATIVE_MENU_EVENT_NAME, action)
        .map_err(|error| error.to_string())
}

fn exit_app<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(crate::system::window::MAIN_WINDOW_LABEL) {
        let _ = window.hide();
        let _ = window.close();
    }
    app.exit(0);
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

#[tauri::command]
pub fn get_autostart_enabled<R: Runtime>(app: AppHandle<R>) -> CommandResult<bool> {
    crate::system::autostart::is_enabled(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_autostart_enabled<R: Runtime>(app: AppHandle<R>, enabled: bool) -> CommandResult<bool> {
    crate::system::autostart::set_enabled(&app, enabled).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn show_context_menu<R: Runtime>(
    app: AppHandle<R>,
    input: ShowContextMenuInput,
) -> CommandResult<()> {
    let request = validate_show_context_menu_input(input)?;
    let window = crate::system::window::main_window(&app).map_err(|error| error.to_string())?;

    match request {
        ValidatedContextMenuRequest::App(request) => show_app_context_menu(&app, &window, request)?,
        ValidatedContextMenuRequest::Task(request) => {
            show_task_context_menu(&app, &window, request)?
        }
    }

    Ok(())
}

pub fn handle_native_menu_event<R: Runtime>(
    app: &AppHandle<R>,
    event: &MenuEvent,
) -> Result<(), String> {
    let Some(action) = parse_native_menu_action(event.id().as_ref()) else {
        return Ok(());
    };

    match action {
        NativeMenuAction::ToggleAlwaysOnTop => {
            crate::system::window::toggle_main_window_always_on_top(app)
                .map_err(|error| error.to_string())?;
        }
        NativeMenuAction::ToggleAutostart => {
            crate::system::autostart::toggle(app).map_err(|error| error.to_string())?;
        }
        NativeMenuAction::Quit => {
            exit_app(app);
        }
        NativeMenuAction::Emit(payload) => {
            emit_native_menu_action(app, payload)?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn quit_app<R: Runtime>(app: AppHandle<R>) -> CommandResult<()> {
    exit_app(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        build_task_edit_menu_id, build_task_pin_menu_id, parse_native_menu_action,
        parse_task_pin_menu_id, resolve_task_context_menu_availability,
        validate_show_context_menu_input, NativeMenuAction, NativeMenuActionEvent,
        ShowContextMenuInput, ShowContextMenuKind, ValidatedContextMenuRequest,
    };

    #[test]
    fn validate_task_context_menu_requires_task_fields() {
        // 仕様: taskメニュー入力は taskId/isPinned/isCompleted が必須。
        let missing_task_id = ShowContextMenuInput {
            kind: ShowContextMenuKind::Task,
            x: 10.0,
            y: 20.0,
            locale: Some("ja".to_string()),
            task_id: None,
            is_pinned: Some(false),
            is_completed: Some(false),
        };

        let result = validate_show_context_menu_input(missing_task_id);
        assert!(result.is_err());
    }

    #[test]
    fn validate_app_context_menu_accepts_minimum_payload() {
        // 仕様: appメニュー入力は座標とkindだけで解決できる。
        let app_input = ShowContextMenuInput {
            kind: ShowContextMenuKind::App,
            x: 12.5,
            y: 30.0,
            locale: Some("en".to_string()),
            task_id: None,
            is_pinned: None,
            is_completed: None,
        };

        let result = validate_show_context_menu_input(app_input);
        assert!(matches!(result, Ok(ValidatedContextMenuRequest::App(_))));
    }

    #[test]
    fn task_pin_menu_id_round_trips() {
        // 仕様: task pin menu id は taskId/nextIsPinned を可逆に保持する。
        let menu_id = build_task_pin_menu_id("task-1", true);
        assert_eq!(
            parse_task_pin_menu_id(&menu_id),
            Some(("task-1".to_string(), true))
        );
    }

    #[test]
    fn parse_native_menu_action_maps_task_and_locale_items() {
        // 仕様: ネイティブメニューIDは always-on-top/locale/edit/pin のactionへ正しく変換される。
        let always_on_top_action = parse_native_menu_action("ctx.app.always-on-top.toggle");
        assert_eq!(
            always_on_top_action,
            Some(NativeMenuAction::ToggleAlwaysOnTop)
        );

        let locale_action = parse_native_menu_action("ctx.app.locale.en");
        assert_eq!(
            locale_action,
            Some(NativeMenuAction::Emit(NativeMenuActionEvent::SetLocale {
                locale: "en".to_string()
            }))
        );

        let edit_action = parse_native_menu_action(&build_task_edit_menu_id("task-2"));
        assert_eq!(
            edit_action,
            Some(NativeMenuAction::Emit(NativeMenuActionEvent::TaskEdit {
                task_id: "task-2".to_string()
            }))
        );
    }

    #[test]
    fn completed_task_menu_keeps_edit_enabled_and_pin_disabled() {
        // 仕様: 完了済みタスクでも edit は可能、pin は不可のままにする。
        let completed = resolve_task_context_menu_availability(true);
        assert_eq!(completed.pin_enabled, false);
        assert_eq!(completed.edit_enabled, true);

        let active = resolve_task_context_menu_availability(false);
        assert_eq!(active.pin_enabled, true);
        assert_eq!(active.edit_enabled, true);
    }

    #[test]
    fn native_menu_action_event_serializes_with_camel_case_fields() {
        // 仕様: フロント連携イベントは taskId / nextIsPinned の camelCase で送信する。
        let edit_event = serde_json::to_value(NativeMenuActionEvent::TaskEdit {
            task_id: "task-1".to_string(),
        })
        .expect("event should serialize");
        assert_eq!(edit_event["taskId"], "task-1");
        assert!(edit_event.get("task_id").is_none());

        let pin_event = serde_json::to_value(NativeMenuActionEvent::TaskPinToggle {
            task_id: "task-2".to_string(),
            next_is_pinned: true,
        })
        .expect("event should serialize");
        assert_eq!(pin_event["taskId"], "task-2");
        assert_eq!(pin_event["nextIsPinned"], true);
        assert!(pin_event.get("next_is_pinned").is_none());
    }
}
