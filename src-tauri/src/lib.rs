use tauri::Manager;

mod ipc;
mod model;
mod repository;
mod service;
mod system;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(system::autostart_plugin())
        .setup(|app| {
            let app_state = ipc::build_app_state(app.handle()).map_err(std::io::Error::other)?;
            let _ = app.manage(app_state);
            system::initialize(&app.handle())?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            if let Err(error) = ipc::handle_native_menu_event(app, &event) {
                eprintln!("native context menu handling failed: {error}");
            }
        })
        .invoke_handler(tauri::generate_handler![
            ipc::list_tasks,
            ipc::create_task,
            ipc::update_task,
            ipc::delete_task,
            ipc::complete_task,
            ipc::set_task_pinned,
            ipc::cleanup_completed_tasks,
            ipc::get_autostart_enabled,
            ipc::set_autostart_enabled,
            ipc::show_context_menu,
            ipc::quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
