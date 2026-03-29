use tauri::{
    menu::{CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Manager, Runtime,
};

use super::{autostart, window};

const TRAY_ICON_ID: &str = "lucid-task-tray";
const MENU_ID_TOGGLE_VISIBILITY: &str = "tray.toggle_visibility";
const MENU_ID_SHOW_MAIN: &str = "tray.show_main";
const MENU_ID_TOGGLE_AUTOSTART: &str = "tray.toggle_autostart";
const MENU_ID_QUIT: &str = "tray.quit";

pub struct TrayState<R: Runtime> {
    // TrayIconはDropされるとトレイから消えるため、Stateで生存期間を維持する。
    _tray_icon: TrayIcon<R>,
    // メニュー項目も保持しておくと、将来の状態同期時に参照しやすい。
    _autostart_item: CheckMenuItem<R>,
}

#[derive(Debug, PartialEq, Eq)]
enum TrayMenuCommand {
    ToggleVisibility,
    ShowMainWindow,
    ToggleAutostart,
    Quit,
    Unknown,
}

pub fn initialize<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if app.try_state::<TrayState<R>>().is_some() {
        return Ok(());
    }

    let toggle_visibility = MenuItem::with_id(
        app,
        MENU_ID_TOGGLE_VISIBILITY,
        "表示/非表示",
        true,
        None::<&str>,
    )?;
    let show_main = MenuItem::with_id(
        app,
        MENU_ID_SHOW_MAIN,
        "メイン画面を表示",
        true,
        None::<&str>,
    )?;
    let autostart_enabled = autostart::is_enabled(app)?;
    let autostart_toggle = CheckMenuItem::with_id(
        app,
        MENU_ID_TOGGLE_AUTOSTART,
        "自動起動",
        true,
        autostart_enabled,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, MENU_ID_QUIT, "終了", true, None::<&str>)?;

    let tray_menu = Menu::with_items(
        app,
        &[
            &toggle_visibility,
            &show_main,
            &autostart_toggle,
            &separator,
            &quit,
        ],
    )?;

    let autostart_item_for_handler = autostart_toggle.clone();
    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ICON_ID)
        .menu(&tray_menu)
        .tooltip("Lucid Task")
        .on_menu_event(move |app_handle, event| {
            if let Err(error) = handle_menu_event(app_handle, &event, &autostart_item_for_handler) {
                eprintln!("tray menu handling failed: {error}");
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    let tray_icon = tray_builder.build(app)?;
    let state = TrayState {
        _tray_icon: tray_icon,
        _autostart_item: autostart_toggle,
    };
    // 既に同型Stateが登録済みの場合はfalseになるが、ここでは重複初期化を許容する。
    let _ = app.manage(state);
    Ok(())
}

fn handle_menu_event<R: Runtime>(
    app: &AppHandle<R>,
    event: &MenuEvent,
    autostart_item: &CheckMenuItem<R>,
) -> tauri::Result<()> {
    match parse_menu_command(event.id().as_ref()) {
        TrayMenuCommand::ToggleVisibility => {
            let _ = window::toggle_main_window_visibility(app)?;
        }
        TrayMenuCommand::ShowMainWindow => {
            window::show_and_focus_main_window(app)?;
        }
        TrayMenuCommand::ToggleAutostart => {
            let enabled = autostart::toggle(app)?;
            autostart_item.set_checked(enabled)?;
        }
        TrayMenuCommand::Quit => {
            app.exit(0);
        }
        TrayMenuCommand::Unknown => {}
    }
    Ok(())
}

fn parse_menu_command(menu_id: &str) -> TrayMenuCommand {
    match menu_id {
        MENU_ID_TOGGLE_VISIBILITY => TrayMenuCommand::ToggleVisibility,
        MENU_ID_SHOW_MAIN => TrayMenuCommand::ShowMainWindow,
        MENU_ID_TOGGLE_AUTOSTART => TrayMenuCommand::ToggleAutostart,
        MENU_ID_QUIT => TrayMenuCommand::Quit,
        _ => TrayMenuCommand::Unknown,
    }
}

// メニューIDの解釈は pure 関数で完結するため、private実装を inline で固定する。
#[cfg(test)]
mod tests {
    use super::{
        parse_menu_command, TrayMenuCommand, MENU_ID_QUIT, MENU_ID_SHOW_MAIN,
        MENU_ID_TOGGLE_AUTOSTART, MENU_ID_TOGGLE_VISIBILITY,
    };

    #[test]
    fn parse_menu_command_maps_known_ids() {
        // 仕様: 定義済みIDは対応するメニューコマンドに正規化される。
        assert_eq!(
            parse_menu_command(MENU_ID_TOGGLE_VISIBILITY),
            TrayMenuCommand::ToggleVisibility
        );
        assert_eq!(
            parse_menu_command(MENU_ID_SHOW_MAIN),
            TrayMenuCommand::ShowMainWindow
        );
        assert_eq!(
            parse_menu_command(MENU_ID_TOGGLE_AUTOSTART),
            TrayMenuCommand::ToggleAutostart
        );
        assert_eq!(parse_menu_command(MENU_ID_QUIT), TrayMenuCommand::Quit);
    }

    #[test]
    fn parse_menu_command_maps_unknown_ids() {
        // 仕様: 未知IDは安全に Unknown へフォールバックする。
        assert_eq!(parse_menu_command("other.id"), TrayMenuCommand::Unknown);
    }
}
