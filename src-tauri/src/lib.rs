pub mod auto_rebase;
pub mod binary_paths;
mod cli;
mod commands;
pub mod conflict_markers;
pub mod core;
pub mod db;
pub mod file_indexer;
pub mod jj;
pub mod local_db;
pub mod pty;

use commands::file_watcher::WatcherManager;
use db::Database;
use pty::PtyManager;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, EventTarget, Manager};

pub(crate) struct AppState {
    db: Mutex<Database>,
    pty_manager: Mutex<PtyManager>,
    watcher_manager: WatcherManager,
    window_repo_paths: Mutex<HashMap<String, String>>,
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
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_cli::init())
        .setup(|app| {
            // --- CLI mode: handle commands and exit before any GUI init ---
            {
                use tauri_plugin_cli::CliExt;
                if let Ok(matches) = app.cli().matches() {
                    if let Some(ref subcommand) = matches.subcommand {
                        cli::init_cli_binary_paths();
                        let handled = cli::handle_cli_command(subcommand);
                        if handled {
                            app.handle().exit(0);
                            return Ok(());
                        }
                    }
                }
            }

            // --- GUI mode: initialize DB first so we can pass saved repo path in the window URL ---
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_dir).expect("Failed to create app data directory");
            let db_path = app_dir.join("treq.db");

            let db = Database::new(db_path).expect("Failed to open database");
            db.init().expect("Failed to initialize database");

            // Read saved repo path to embed in the window URL (avoids Onboarding flash)
            let saved_repo_path = db.get_setting("last_opened_repo_path").ok().flatten();
            let window_url = if let Some(ref path) = saved_repo_path {
                let encoded = urlencoding::encode(path).into_owned();
                format!("index.html?repo={}", encoded)
            } else {
                "index.html".to_string()
            };

            let _window = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App(window_url.into()),
            )
            .title("Treq - Coding Agent Manager")
            .inner_size(1400.0, 900.0)
            .build()?;

            // Load cached binary paths and initialize in-memory cache
            let binary_paths = commands::load_cached_binary_paths(&db);
            binary_paths::init_binary_paths_cache(binary_paths);

            // Load cached editor apps and initialize in-memory cache
            let editor_apps = commands::load_cached_editor_apps(&db);
            binary_paths::init_editor_apps_cache(editor_apps);

            let pty_manager = PtyManager::new();

            // Initialize file watcher
            let watcher_manager = WatcherManager::new();
            watcher_manager.set_app_handle(app.handle().clone());

            let app_state = AppState {
                db: Mutex::new(db),
                pty_manager: Mutex::new(pty_manager),
                watcher_manager,
                window_repo_paths: Mutex::new(HashMap::new()),
            };

            app.manage(app_state);

            // Listen for deep-link events and forward to frontend
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    let urls: Vec<String> =
                        event.urls().into_iter().map(|u| u.to_string()).collect();
                    let _ = handle.emit("deep-link-received", &urls);
                });
            }

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
                    let force_rebase_item = MenuItemBuilder::with_id(
                        "force_rebase_workspace",
                        "Force Rebase Workspace",
                    )
                    .accelerator("CmdOrCtrl+Shift+R")
                    .build(app)?;

                    let factory_reset_item =
                        MenuItemBuilder::with_id("factory_reset", "Factory Reset").build(app)?;

                    SubmenuBuilder::new(app, "Developer")
                        .item(&force_rebase_item)
                        .separator()
                        .item(&factory_reset_item)
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

                let menu_builder = MenuBuilder::new(app)
                    .item(&app_menu)
                    .item(&file_menu)
                    .item(&edit_menu)
                    .item(&view_menu)
                    .item(&go_menu);

                // Add Developer menu in debug mode
                #[cfg(debug_assertions)]
                let menu_builder = menu_builder.item(&developer_menu);

                let menu = menu_builder.item(&window_menu).item(&help_menu).build()?;

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
                    let force_rebase_item = MenuItemBuilder::with_id(
                        "force_rebase_workspace",
                        "Force Rebase Workspace",
                    )
                    .accelerator("CmdOrCtrl+Shift+R")
                    .build(app)?;

                    let factory_reset_item =
                        MenuItemBuilder::with_id("factory_reset", "Factory Reset").build(app)?;

                    SubmenuBuilder::new(app, "Developer")
                        .item(&force_rebase_item)
                        .separator()
                        .item(&factory_reset_item)
                        .build()?
                };

                let mut menu_builder = MenuBuilder::new(app).item(&file_menu).item(&go_menu);

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
                "factory_reset" => emit_to_focused(app, "menu-factory-reset", ()),
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
            commands::detect_editor_apps,
            commands::get_treq_bin_dir,
            commands::get_workspaces,
            commands::create_workspace,
            commands::delete_workspace,
            commands::push_workspace_to_remote,
            commands::pull_workspace_from_remote,
            commands::merge_workspace,
            commands::split_workspace,
            commands::move_commit_to_new_workspace,
            commands::move_commit_to_existing_workspace,
            commands::abandon_commit,
            commands::rename_workspace,
            commands::update_workspace_not_on_remote,
            commands::list_workspace_statuses,
            commands::get_workspace_status,
            commands::update_workspace,
            commands::set_workspace_target_branch,
            commands::check_and_rebase_workspaces,
            commands::resolve_workspace_bookmark_conflict,
            commands::ensure_workspace_indexed,
            commands::get_setting,
            commands::get_settings_batch,
            commands::set_setting,
            commands::get_repo_setting,
            commands::set_repo_setting,
            commands::jj_create_workspace,
            commands::jj_list_workspaces,

            commands::jj_get_workspace_info,

            commands::jj_get_changed_files,
            commands::get_workspace_file_hunks,
            commands::get_workspace_file_lines,
            commands::jj_restore_file,
            commands::jj_restore_all,
            commands::create_commit,
            commands::list_commits,
            commands::jj_split,

            commands::get_repo_status,
            commands::get_workspace_changed_files,
            commands::init_repo,

            commands::list_conflicted_files,
            commands::jj_get_default_branch,

            commands::jj_push,
            commands::jj_get_sync_status,
            commands::jj_git_fetch,
            commands::jj_git_fetch_background,
            commands::jj_pull,
            commands::jj_get_log,
            commands::jj_get_commits_ahead,
            commands::get_workspace_diff,
            commands::get_commit_diff,
            commands::jj_create_merge,
            commands::jj_check_branch_exists,
            commands::jj_get_branches,
            commands::list_repo_branches,
            commands::jj_edit_bookmark,
            commands::switch_repo_branch,
            commands::jj_track_workspace_bookmarks,
            commands::parse_conflict_markers,
            commands::pty_create_session,
            commands::pty_session_exists,
            commands::pty_write,
            commands::pty_write_suppress_echo,
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
            commands::load_pending_review,
            commands::save_pending_review,
            commands::clear_pending_review,
            commands::set_window_repo_path,
            commands::get_window_repo_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
