pub mod autostart;
pub mod tray;
pub mod window;

use tauri::{AppHandle, Runtime};

/// 自動起動プラグインを構築する。
///
/// 統合ポイント: `tauri::Builder::plugin(...)` で呼び出す。
pub fn autostart_plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_autostart::Builder::new().build()
}

/// システム連携をアプリ起動時に一度だけ初期化する。
///
/// 統合ポイント: `tauri::Builder::setup(...)` から呼び出す。
pub fn initialize<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    autostart::apply_initial_policy(app)?;
    tray::initialize(app)?;
    window::enforce_widget_policy(app)?;
    Ok(())
}
