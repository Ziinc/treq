mod commands;
mod db;
mod file_indexer;
mod git;
mod git_ops;
mod git2_ops;
mod git_watcher;
mod jj;
mod jj_lib_ops;
mod local_db;
mod pty;

use db::Database;
use git::is_git_repository;
use pty::PtyManager;
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, EventTarget, Manager, State};

pub(crate) struct AppState {
    db: Mutex<Database>,
    pty_manager: Mutex<PtyManager>,
    watcher_manager: git_watcher::GitWatcherManager,
}

/// Track which repositories have had their initialization triggered
/// to avoid spawning multiple background tasks for the same repo
static REPO_INIT_STARTED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

/// Ensure repository is properly configured before operations
/// This includes git config and jj initialization
/// Spawns background tasks for heavy operations to avoid blocking the UI
/// Emits events to frontend when initialization completes or fails
pub(crate) fn ensure_repo_ready(
    state: &State<AppState>,
    app: &AppHandle,
    repo_path: &str,
) -> Result<(), String> {
    // Only initialize if it's a git repository
    if !is_git_repository(repo_path).unwrap_or(false) {
        return Ok(());
    }

    // Check if we've already triggered initialization for this repo
    let init_started = REPO_INIT_STARTED.get_or_init(|| Mutex::new(HashSet::new()));
    {
        let mut guard = init_started.lock().unwrap();
        if guard.contains(repo_path) {
            // Initialization already in progress or completed
            return Ok(());
        }
        guard.insert(repo_path.to_string());
    }

    // Clone what we need for the background task
    let app_clone = app.clone();
    let repo_path_clone = repo_path.to_string();
    let db_path = {
        let db = state.db.lock().unwrap();
        db.db_path().to_path_buf()
    };

    // Spawn background task for initialization
    tauri::async_runtime::spawn(async move {
        initialize_repo_background(&app_clone, &repo_path_clone, &db_path).await;
    });

    Ok(())
}

/// Background task for repository initialization
/// Runs gitignore updates, git config checks, and jj initialization
async fn initialize_repo_background(app: &AppHandle, repo_path: &str, db_path: &std::path::Path) {
    #[derive(Clone, serde::Serialize)]
    struct InitError {
        repo_path: String,
        error: String,
        error_type: String,
    }

    #[derive(Clone, serde::Serialize)]
    struct JjInitSuccess {
        repo_path: String,
    }

    // Ensure .jj and .treq are in .gitignore
    if let Err(ref error) = jj::ensure_gitignore_entries(repo_path) {
        let _ = app.emit(
            "repo-init-error",
            InitError {
                repo_path: repo_path.to_string(),
                error: error.to_string(),
                error_type: "gitignore".to_string(),
            },
        );
    }

    // Open a database connection for this background task
    let db = match Database::new(db_path.to_path_buf()) {
        Ok(db) => db,
        Err(e) => {
            let _ = app.emit(
                "repo-init-error",
                InitError {
                    repo_path: repo_path.to_string(),
                    error: format!("Failed to open database: {}", e),
                    error_type: "database".to_string(),
                },
            );
            return;
        }
    };

    // Check/initialize git config
    if let Err(ref error) = git::ensure_repo_configured(&db, repo_path) {
        let _ = app.emit(
            "repo-init-error",
            InitError {
                repo_path: repo_path.to_string(),
                error: error.clone(),
                error_type: "git-config".to_string(),
            },
        );
    }

    // Initialize jj for git repository
    match jj::ensure_jj_initialized(&db, repo_path) {
        Ok(true) => {
            // jj was newly initialized - emit success event
            let _ = app.emit(
                "jj-initialized",
                JjInitSuccess {
                    repo_path: repo_path.to_string(),
                },
            );
        }
        Ok(false) => {
            // Already initialized, no action needed
        }
        Err(jj::JjError::AlreadyInitialized) | Err(jj::JjError::NotGitRepository) => {
            // Not an error, just skip
        }
        Err(ref error) => {
            // Other errors should be reported
            let _ = app.emit(
                "repo-init-error",
                InitError {
                    repo_path: repo_path.to_string(),
                    error: error.to_string(),
                    error_type: "jj-init".to_string(),
                },
            );
        }
    }
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

            let pty_manager = PtyManager::new();
            let watcher_manager = git_watcher::GitWatcherManager::new(app.handle().clone());

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

                // Window menu
                let window_menu = SubmenuBuilder::new(app, "Window")
                    .item(&PredefinedMenuItem::minimize(app, None)?)
                    .item(&PredefinedMenuItem::maximize(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::close_window(app, None)?)
                    .build()?;

                // Help menu
                let learn_more_item = MenuItemBuilder::with_id("learn_more", "Learn More")
                    .build(app)?;

                let help_menu = SubmenuBuilder::new(app, "Help")
                    .item(&learn_more_item)
                    .build()?;

                let menu = MenuBuilder::new(app)
                    .item(&app_menu)
                    .item(&file_menu)
                    .item(&edit_menu)
                    .item(&view_menu)
                    .item(&go_menu)
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

                let menu = MenuBuilder::new(app)
                    .item(&file_menu)
                    .item(&go_menu)
                    .build()?;

                app.set_menu(menu)?;
            }

            // Handle menu events - emit only to focused window
            app.on_menu_event(move |app, event| {
                match event.id().as_ref() {
                    "dashboard" => emit_to_focused(app, "navigate-to-dashboard", ()),
                    "settings" => emit_to_focused(app, "navigate-to-settings", ()),
                    "open" => emit_to_focused(app, "menu-open-repository", ()),
                    "open_new_window" => emit_to_focused(app, "menu-open-in-new-window", ()),
                    "learn_more" => {
                        #[cfg(target_os = "macos")]
                        {
                            use tauri_plugin_opener::OpenerExt;
                            let _ = app.opener().open_url("https://treq.dev", None::<&str>);
                        }
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_workspaces,
            commands::add_workspace_to_db,
            commands::delete_workspace_from_db,
            commands::rebuild_workspaces,
            commands::update_workspace_metadata,
            commands::ensure_workspace_indexed,
            commands::get_setting,
            commands::get_settings_batch,
            commands::set_setting,
            commands::get_repo_setting,
            commands::set_repo_setting,
            commands::get_git_cache,
            commands::set_git_cache,
            commands::invalidate_git_cache,
            commands::get_cached_git_changes,
            commands::start_git_watcher,
            commands::stop_git_watcher,
            commands::trigger_workspace_scan,
            commands::preload_workspace_git_data,
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
            commands::jj_is_workspace,
            commands::jj_init,
            commands::jj_rebase_onto,
            commands::jj_get_conflicted_files,
            commands::jj_get_default_branch,
            commands::git_get_current_branch,
            commands::git_execute_post_create_command,
            commands::git_get_status,
            commands::git_get_branch_info,
            commands::git_get_branch_divergence,
            commands::git_get_line_diff_stats,
            commands::git_get_workspace_info,
            commands::git_get_diff_between_branches,
            commands::git_get_changed_files_between_branches,
            commands::git_get_commits_between_branches,
            commands::git_list_branches,
            commands::git_list_branches_detailed,
            commands::git_checkout_branch,
            commands::git_is_repository,
            commands::git_init_repo,
            commands::git_list_gitignored_files,
            commands::git_merge,
            commands::git_discard_all_changes,
            commands::git_discard_files,
            commands::git_has_uncommitted_changes,
            commands::git_stash_push_files,
            commands::git_stash_pop,
            commands::git_commit,
            commands::git_commit_amend,
            commands::git_add_all,
            commands::git_unstage_all,
            commands::git_push,
            commands::git_push_force,
            commands::git_pull,
            commands::git_fetch,
            commands::git_stage_file,
            commands::git_unstage_file,
            commands::git_list_remotes,
            commands::git_stage_hunk,
            commands::git_unstage_hunk,
            commands::git_get_changed_files,
            commands::git_get_file_hunks,
            commands::git_get_file_lines,
            commands::git_stage_selected_lines,
            commands::git_unstage_selected_lines,
            commands::pty_create_session,
            commands::pty_session_exists,
            commands::pty_write,
            commands::pty_resize,
            commands::pty_close,
            commands::read_file,
            commands::list_directory,
            commands::list_directory_cached,
            commands::get_change_indicators,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
