use std::{fs, io, path::PathBuf};

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_autostart::ManagerExt as _;

const INITIAL_POLICY_MARKER_FILE: &str = "autostart-initialized-v1";
const INITIAL_POLICY_MARKER_CONTENT: &[u8] = b"autostart=false\n";
pub const INITIAL_AUTOSTART_ENABLED: bool = false;

pub fn apply_initial_policy<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if let Some(marker_path) = marker_path(app) {
        if should_apply_initial_policy(marker_path.exists()) {
            // 初回だけ「自動起動OFF」を強制し、2回目以降はユーザー設定を尊重する。
            set_enabled(app, INITIAL_AUTOSTART_ENABLED)?;
            let _ = persist_marker(&marker_path);
        }
        return Ok(());
    }

    // マーカーを置けない環境では毎回デフォルトOFFを適用して安全側に倒す。
    set_enabled(app, INITIAL_AUTOSTART_ENABLED)?;
    Ok(())
}

pub fn is_enabled<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<bool> {
    app.autolaunch().is_enabled().map_err(plugin_error_to_tauri)
}

pub fn set_enabled<R: Runtime>(app: &AppHandle<R>, enabled: bool) -> tauri::Result<bool> {
    let manager = app.autolaunch();
    let current = manager.is_enabled().map_err(plugin_error_to_tauri)?;
    if current == enabled {
        return Ok(current);
    }

    if enabled {
        manager.enable().map_err(plugin_error_to_tauri)?;
    } else {
        manager.disable().map_err(plugin_error_to_tauri)?;
    }

    Ok(enabled)
}

pub fn toggle<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<bool> {
    let current = is_enabled(app)?;
    let next = toggled_state(current);
    set_enabled(app, next)
}

fn marker_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|path| path.join("system").join(INITIAL_POLICY_MARKER_FILE))
}

fn persist_marker(path: &PathBuf) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    // ファイル内容自体は意味を持たず「適用済みフラグ」としてだけ使う。
    fs::write(path, INITIAL_POLICY_MARKER_CONTENT)
}

fn should_apply_initial_policy(marker_exists: bool) -> bool {
    !marker_exists
}

fn toggled_state(current: bool) -> bool {
    !current
}

fn plugin_error_to_tauri(error: impl ToString) -> tauri::Error {
    tauri::Error::Io(io::Error::other(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::{should_apply_initial_policy, toggled_state};

    #[test]
    fn initial_policy_runs_only_before_marker_exists() {
        assert!(should_apply_initial_policy(false));
        assert!(!should_apply_initial_policy(true));
    }

    #[test]
    fn toggle_inverts_autostart_state() {
        assert!(toggled_state(false));
        assert!(!toggled_state(true));
    }
}
