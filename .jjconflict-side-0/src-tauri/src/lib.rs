mod auto_rebase;
mod binary_paths;
mod commands;
mod db;
mod file_indexer;
mod jj;
mod jj_lib_ops;
mod local_db;
mod pty;

use commands::file_watcher::WatcherManager;
use db::Database;
use pty::PtyManager;
use std::sync::Mutex;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, EventTarget, Manager};

pub(crate) struct AppState {
    db: Mutex<Database>,
    pty_manager: Mutex<PtyManager>,
    watcher_manager: WatcherManager,
}

/// Emits an event only to the focused webview window.
/// Falls back to broadcasting if no focused window is found.
pub fn emit_to_focused<S: serde::Serialize + Clone>(app: &AppHandle, event: &str, payload: S) {
    for (label, window) in app.webview_windows() {
        if window.is_focused().unwrap_or(false) {
            let _ = app.emit_to(EventTarget::webview_window(&label), event, payload);
            return;
        }
    }
    // Fallback: emit globally if no focused window found
    let _ = app.emit(event, payload);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("treq".to_string()),
                    },
                ))
                .level(log::LevelFilter::Warn)
                .level_for("treq", log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Initialize database
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_dir).expect("Failed to create app data directory");
            let db_path = app_dir.join("treq.db");

            let db = Database::new(db_path).expect("Failed to open database");
            db.init().expect("Failed to initialize database");

            // Load cached binary paths and initialize in-memory cache
            let binary_paths = commands::load_cached_binary_paths(&db);
            binary_paths::init_binary_paths_cache(binary_paths);

            let pty_manager = PtyManager::new();

            // Initialize file watcher
            let watcher_manager = WatcherManager::new();
            watcher_manager.set_app_handle(app.handle().clone());

            let app_state = AppState {
                db: Mutex::new(db),
                pty_manager: Mutex::new(pty_manager),
                watcher_manager,
            };

            app.manage(app_state);

            // Create menu
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::PredefinedMenuItem;

                // App menu (automatically gets app name on macOS)
                let app_menu = SubmenuBuilder::new(app, "App")
                    .item(&PredefinedMenuItem::hide(app, None)?)
                    .item(&PredefinedMenuItem::hide_others(app, None)?)
                    .item(&PredefinedMenuItem::show_all(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::quit(app, None)?)
                    .build()?;

                // File menu items
                let open_item = MenuItemBuilder::with_id("open", "Open...")
                    .accelerator("CmdOrCtrl+O")
                    .build(app)?;

                let open_new_window_item =
                    MenuItemBuilder::with_id("open_new_window", "Open in New Window...")
                        .accelerator("CmdOrCtrl+Shift+O")
                        .build(app)?;

                let file_menu = SubmenuBuilder::new(app, "File")
                    .item(&open_item)
                    .item(&open_new_window_item)
                    .build()?;

                // Edit menu with native shortcuts
                let edit_menu = SubmenuBuilder::new(app, "Edit")
                    .item(&PredefinedMenuItem::undo(app, None)?)
                    .item(&PredefinedMenuItem::redo(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::cut(app, None)?)
                    .item(&PredefinedMenuItem::copy(app, None)?)
                    .item(&PredefinedMenuItem::paste(app, None)?)
                    .item(&PredefinedMenuItem::select_all(app, None)?)
                    .build()?;

                // View menu
                let view_menu = SubmenuBuilder::new(app, "View")
                    .item(&PredefinedMenuItem::fullscreen(app, None)?)
                    .build()?;

                // Go menu items
                let dashboard_item = MenuItemBuilder::with_id("dashboard", "Dashboard")
                    .accelerator("CmdOrCtrl+D")
                    .build(app)?;

                let settings_item = MenuItemBuilder::with_id("settings", "Settings")
                    .accelerator("CmdOrCtrl+,")
                    .build(app)?;

                let go_menu = SubmenuBuilder::new(app, "Go")
                    .item(&dashboard_item)
                    .item(&settings_item)
                    .build()?;

                // Developer menu (only in debug mode)
                #[cfg(debug_assertions)]
                let developer_menu = {
                    let force_rebase_item =
                        MenuItemBuilder::with_id("force_rebase_workspace", "Force Rebase Workspace")
                            .accelerator("CmdOrCtrl+Shift+R")
                            .build(app)?;

                    SubmenuBuilder::new(app, "Developer")
                        .item(&force_rebase_item)
                        .build()?
                };

                // Window menu
                let window_menu = SubmenuBuilder::new(app, "Window")
                    .item(&PredefinedMenuItem::minimize(app, None)?)
                    .item(&PredefinedMenuItem::maximize(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::close_window(app, None)?)
                    .build()?;

                // Help menu
                let learn_more_item =
                    MenuItemBuilder::with_id("learn_more", "Learn More").build(app)?;

                let help_menu = SubmenuBuilder::new(app, "Help")
                    .item(&learn_more_item)
                    .build()?;

                let mut menu_builder = MenuBuilder::new(app)
                    .item(&app_menu)
                    .item(&file_menu)
                    .item(&edit_menu)
                    .item(&view_menu)
                    .item(&go_menu);

                // Add Developer menu in debug mode
                #[cfg(debug_assertions)]
                {
                    menu_builder = menu_builder.item(&developer_menu);
                }

                let menu = menu_builder
                    .item(&window_menu)
                    .item(&help_menu)
                    .build()?;

                app.set_menu(menu)?;
            }

            #[cfg(not(target_os = "macos"))]
            {
                // File menu items
                let open_item = MenuItemBuilder::with_id("open", "Open...")
                    .accelerator("CmdOrCtrl+O")
                    .build(app)?;

                let open_new_window_item =
                    MenuItemBuilder::with_id("open_new_window", "Open in New Window...")
                        .accelerator("CmdOrCtrl+Shift+O")
                        .build(app)?;

                let file_menu = SubmenuBuilder::new(app, "File")
                    .item(&open_item)
                    .item(&open_new_window_item)
                    .build()?;

                // Go menu items
                let dashboard_item = MenuItemBuilder::with_id("dashboard", "Dashboard")
                    .accelerator("CmdOrCtrl+D")
                    .build(app)?;

                let settings_item = MenuItemBuilder::with_id("settings", "Settings")
                    .accelerator("CmdOrCtrl+,")
                    .build(app)?;

                let go_menu = SubmenuBuilder::new(app, "Go")
                    .item(&dashboard_item)
                    .item(&settings_item)
                    .build()?;

                // Developer menu (only in debug mode)
                #[cfg(debug_assertions)]
                let developer_menu = {
                    let force_rebase_item =
                        MenuItemBuilder::with_id("force_rebase_workspace", "Force Rebase Workspace")
                            .accelerator("CmdOrCtrl+Shift+R")
                            .build(app)?;

                    SubmenuBuilder::new(app, "Developer")
                        .item(&force_rebase_item)
                        .build()?
                };

                let mut menu_builder = MenuBuilder::new(app)
                    .item(&file_menu)
                    .item(&go_menu);

                // Add Developer menu in debug mode
                #[cfg(debug_assertions)]
                {
                    menu_builder = menu_builder.item(&developer_menu);
                }

                let menu = menu_builder.build()?;

                app.set_menu(menu)?;
            }

            // Handle menu events - emit only to focused window
            app.on_menu_event(move |app, event| match event.id().as_ref() {
                "dashboard" => emit_to_focused(app, "navigate-to-dashboard", ()),
                "settings" => emit_to_focused(app, "navigate-to-settings", ()),
                "open" => emit_to_focused(app, "menu-open-repository", ()),
                "open_new_window" => emit_to_focused(app, "menu-open-in-new-window", ()),
                "force_rebase_workspace" => emit_to_focused(app, "menu-force-rebase-workspace", ()),
                "learn_more" => {
                    #[cfg(target_os = "macos")]
                    {
                        use tauri_plugin_opener::OpenerExt;
                        let _ = app.opener().open_url("https://treq.dev", None::<&str>);
                    }
                }
                _ => {}
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::detect_binaries,
            commands::get_workspaces,
            commands::add_workspace_to_db,
            commands::create_workspace,
            commands::delete_workspace_from_db,
            commands::delete_workspace,
            commands::cleanup_stale_workspaces,
            commands::rebuild_workspaces,
            commands::update_workspace_metadata,
            commands::update_workspace_conflicts,
            commands::set_workspace_target_branch,
            commands::check_and_rebase_workspaces,
            commands::ensure_workspace_indexed,
            commands::get_setting,
            commands::get_settings_batch,
            commands::set_setting,
            commands::get_repo_setting,
            commands::set_repo_setting,
            commands::jj_create_workspace,
            commands::jj_list_workspaces,
            commands::jj_remove_workspace,
            commands::jj_get_workspace_info,
            commands::jj_squash_to_workspace,
            commands::jj_get_changed_files,
            commands::jj_get_file_hunks,
            commands::jj_get_file_lines,
            commands::jj_restore_file,
            commands::jj_restore_all,
            commands::jj_commit,
            commands::jj_split,
            commands::jj_is_workspace,
            commands::jj_init,
            commands::jj_rebase_onto,
            commands::jj_get_conflicted_files,
            commands::jj_get_default_branch,
            commands::jj_get_current_branch,
            commands::jj_push,
            commands::jj_get_sync_status,
            commands::jj_git_fetch,
            commands::jj_git_fetch_background,
            commands::jj_pull,
            commands::jj_get_log,
            commands::jj_get_commits_ahead,
            commands::jj_get_merge_diff,
            commands::jj_create_merge,
            commands::jj_check_branch_exists,
            commands::jj_get_branches,
            commands::pty_create_session,
            commands::pty_session_exists,
            commands::pty_write,
            commands::pty_resize,
            commands::pty_close,
            commands::read_file,
            commands::list_directory,
            commands::list_directory_cached,
            commands::get_change_indicators,
            commands::search_workspace_files,
            commands::create_session,
            commands::get_sessions,
            commands::update_session_access,
            commands::update_session_name,
            commands::delete_session,
            commands::get_session_model,
            commands::set_session_model,
            commands::mark_file_viewed,
            commands::unmark_file_viewed,
            commands::get_viewed_files,
            commands::clear_all_viewed_files,
            commands::start_file_watcher,
            commands::stop_file_watcher,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
