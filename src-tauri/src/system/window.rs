use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

pub const MAIN_WINDOW_LABEL: &str = "main";

pub fn enforce_widget_policy<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let window = main_window(app)?;
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
    Ok(())
}

pub fn toggle_main_window_always_on_top<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<bool> {
    let window = main_window(app)?;
    let next = !window.is_always_on_top()?;
    window.set_always_on_top(next)?;
    Ok(next)
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
