mod commands;

use commands::ai::analyze_with_ai;
use commands::organize::{execute_plan, has_undo_manifest, undo_plan};
use commands::scan::scan_directory;
use commands::settings::{load_settings, save_settings};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            analyze_with_ai,
            execute_plan,
            undo_plan,
            has_undo_manifest,
            load_settings,
            save_settings,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {});
}
