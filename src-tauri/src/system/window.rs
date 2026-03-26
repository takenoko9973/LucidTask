use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const MAIN_WINDOW_LABEL: &str = "main";
pub const TASK_DIALOG_WINDOW_LABEL: &str = "task-dialog";
pub const TASK_DIALOG_ROUTE_EVENT: &str = "tasks:dialog-route";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskDialogMode {
    Create,
    Edit,
}

impl TaskDialogMode {
    fn as_query_value(self) -> &'static str {
        match self {
            Self::Create => "create",
            Self::Edit => "edit",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TaskDialogRoute {
    pub mode: TaskDialogMode,
    pub task_id: Option<String>,
}

pub fn enforce_widget_policy<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let window = main_window(app)?;
    window.set_always_on_top(true)?;
    window.set_skip_taskbar(true)?;
    Ok(())
}

pub fn show_and_focus_main_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let window = main_window(app)?;

    if window.is_minimized()? {
        window.unminimize()?;
    }

    window.show()?;
    window.set_focus()?;
    window.set_always_on_top(true)?;
    Ok(())
}

pub fn toggle_main_window_visibility<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<bool> {
    let window = main_window(app)?;
    if window.is_visible()? {
        window.hide()?;
        return Ok(false);
    }

    show_and_focus_main_window(app)?;
    Ok(true)
}

pub fn main_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<WebviewWindow<R>> {
    app.get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or(tauri::Error::WindowNotFound)
}

pub fn open_task_dialog_window<R: Runtime>(
    app: &AppHandle<R>,
    route: TaskDialogRoute,
) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(TASK_DIALOG_WINDOW_LABEL) {
        window.emit(TASK_DIALOG_ROUTE_EVENT, &route)?;
        if window.is_minimized()? {
            window.unminimize()?;
        }
        window.show()?;
        window.set_focus()?;
        return Ok(());
    }

    let dialog_url = dialog_url_path(&route);
    let window = WebviewWindowBuilder::new(
        app,
        TASK_DIALOG_WINDOW_LABEL,
        WebviewUrl::App(dialog_url.into()),
    )
    .title("Task Dialog")
    .inner_size(420.0, 360.0)
    .resizable(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .build()?;

    window.set_focus()?;
    Ok(())
}

fn dialog_url_path(route: &TaskDialogRoute) -> String {
    let mut query = format!("index.html?view=task-dialog&mode={}", route.mode.as_query_value());

    if let Some(task_id) = route.task_id.as_deref() {
        query.push_str("&taskId=");
        query.push_str(task_id);
    }

    query
}

#[cfg(test)]
mod tests {
    use super::{dialog_url_path, TaskDialogMode, TaskDialogRoute};

    #[test]
    fn dialog_url_path_for_create_mode() {
        let route = TaskDialogRoute {
            mode: TaskDialogMode::Create,
            task_id: None,
        };

        assert_eq!(
            dialog_url_path(&route),
            "index.html?view=task-dialog&mode=create"
        );
    }

    #[test]
    fn dialog_url_path_for_edit_mode() {
        let route = TaskDialogRoute {
            mode: TaskDialogMode::Edit,
            task_id: Some("task-123".to_string()),
        };

        assert_eq!(
            dialog_url_path(&route),
            "index.html?view=task-dialog&mode=edit&taskId=task-123"
        );
    }
}
