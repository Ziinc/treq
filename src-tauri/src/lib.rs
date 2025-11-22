mod db;
mod git;
mod git_ops;
mod local_db;
mod plan_storage;
mod pty;
mod shell;

use db::{Command as DbCommand, Database, Session, Worktree};
use git::{git_init, is_git_repository, *};
use git_ops::{
    BranchCommitInfo, BranchDiffFileChange, BranchDiffFileDiff, DiffHunk, MergeStrategy,
};
use ignore::WalkBuilder;
use local_db::{PlanHistoryEntry, PlanHistoryInput};
use plan_storage::{PlanFile, PlanMetadata};
use pty::PtyManager;
use shell::execute_command;
use std::sync::Mutex;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, State};

struct AppState {
    db: Mutex<Database>,
    pty_manager: Mutex<PtyManager>,
}

// Database commands
#[tauri::command]
fn get_worktrees(state: State<AppState>) -> Result<Vec<Worktree>, String> {
    let db = state.db.lock().unwrap();
    db.get_worktrees().map_err(|e| e.to_string())
}

#[tauri::command]
fn add_worktree_to_db(
    state: State<AppState>,
    repo_path: String,
    worktree_path: String,
    branch_name: String,
    metadata: Option<String>,
) -> Result<i64, String> {
    let db = state.db.lock().unwrap();
    let worktree = Worktree {
        id: 0,
        repo_path,
        worktree_path,
        branch_name,
        created_at: chrono::Utc::now().to_rfc3339(),
        metadata,
    };
    db.add_worktree(&worktree).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_worktree_from_db(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    // Cascade delete sessions (handled by DB foreign key constraint)
    db.delete_worktree(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_commands(state: State<AppState>, worktree_id: i64) -> Result<Vec<DbCommand>, String> {
    let db = state.db.lock().unwrap();
    db.get_commands(worktree_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn add_command(
    state: State<AppState>,
    worktree_id: i64,
    command: String,
    status: String,
    output: Option<String>,
) -> Result<i64, String> {
    let db = state.db.lock().unwrap();
    let cmd = DbCommand {
        id: 0,
        worktree_id,
        command,
        created_at: chrono::Utc::now().to_rfc3339(),
        status,
        output,
    };
    db.add_command(&cmd).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_setting(state: State<AppState>, key: String) -> Result<Option<String>, String> {
    let db = state.db.lock().unwrap();
    db.get_setting(&key).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_setting(state: State<AppState>, key: String, value: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.set_setting(&key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_repo_setting(
    state: State<AppState>,
    repo_path: String,
    key: String,
) -> Result<Option<String>, String> {
    let db = state.db.lock().unwrap();
    db.get_repo_setting(&repo_path, &key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_repo_setting(
    state: State<AppState>,
    repo_path: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.set_repo_setting(&repo_path, &key, &value)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_repo_setting(
    state: State<AppState>,
    repo_path: String,
    key: String,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.delete_repo_setting(&repo_path, &key)
        .map_err(|e| e.to_string())
}

// Git commands
#[tauri::command]
fn git_create_worktree(
    state: State<AppState>,
    repo_path: String,
    branch: String,
    new_branch: bool,
) -> Result<String, String> {
    // Load inclusion patterns from database
    let inclusion_patterns = {
        let db = state.db.lock().unwrap();
        db.get_repo_setting(&repo_path, "included_copy_files")
            .ok()
            .flatten()
            .map(|patterns_str| {
                patterns_str
                    .lines()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect::<Vec<String>>()
            })
    };

    create_worktree(&repo_path, &branch, new_branch, inclusion_patterns)
}

#[tauri::command]
fn git_get_current_branch(repo_path: String) -> Result<String, String> {
    get_current_branch(&repo_path)
}

#[tauri::command]
fn git_execute_post_create_command(
    worktree_path: String,
    command: String,
) -> Result<String, String> {
    git::execute_post_create_command(&worktree_path, &command)
}

#[tauri::command]
fn git_list_worktrees(repo_path: String) -> Result<Vec<WorktreeInfo>, String> {
    list_worktrees(&repo_path)
}

#[tauri::command]
fn git_remove_worktree(repo_path: String, worktree_path: String) -> Result<String, String> {
    remove_worktree(&repo_path, &worktree_path)
}

#[tauri::command]
fn git_get_status(worktree_path: String) -> Result<GitStatus, String> {
    get_git_status(&worktree_path)
}

#[tauri::command]
fn git_get_branch_info(worktree_path: String) -> Result<BranchInfo, String> {
    get_branch_info(&worktree_path)
}

#[tauri::command]
fn git_get_branch_divergence(
    worktree_path: String,
    base_branch: String,
) -> Result<BranchDivergence, String> {
    get_branch_divergence(&worktree_path, &base_branch)
}

#[tauri::command]
fn git_get_file_diff(worktree_path: String, file_path: String) -> Result<String, String> {
    get_file_diff(&worktree_path, &file_path)
}

#[tauri::command]
fn git_get_diff_between_branches(
    repo_path: String,
    base_branch: String,
    head_branch: String,
) -> Result<Vec<BranchDiffFileDiff>, String> {
    git_ops::git_get_diff_between_branches(&repo_path, &base_branch, &head_branch)
}

#[tauri::command]
fn git_get_changed_files_between_branches(
    repo_path: String,
    base_branch: String,
    head_branch: String,
) -> Result<Vec<BranchDiffFileChange>, String> {
    git_ops::git_get_changed_files_between_branches(&repo_path, &base_branch, &head_branch)
}

#[tauri::command]
fn git_get_commits_between_branches(
    repo_path: String,
    base_branch: String,
    head_branch: String,
    limit: Option<usize>,
) -> Result<Vec<BranchCommitInfo>, String> {
    git_ops::git_get_commits_between_branches(&repo_path, &base_branch, &head_branch, limit)
}

#[tauri::command]
fn git_list_branches(repo_path: String) -> Result<Vec<String>, String> {
    list_branches(&repo_path)
}

#[tauri::command]
fn git_is_repository(path: String) -> Result<bool, String> {
    is_git_repository(&path)
}

#[tauri::command]
fn git_init_repo(path: String) -> Result<String, String> {
    git_init(&path)
}

#[tauri::command]
fn git_list_gitignored_files(repo_path: String) -> Result<Vec<String>, String> {
    list_gitignored_files(&repo_path)
}

#[tauri::command]
fn git_merge(
    repo_path: String,
    branch: String,
    strategy: String,
    commit_message: Option<String>,
) -> Result<String, String> {
    let strategy = match strategy.as_str() {
        "regular" => MergeStrategy::Regular,
        "squash" => MergeStrategy::Squash,
        "no_ff" => MergeStrategy::NoFastForward,
        "ff_only" => MergeStrategy::FastForwardOnly,
        other => {
            return Err(format!("Unsupported merge strategy: {}", other));
        }
    };

    git_ops::git_merge(&repo_path, &branch, strategy, commit_message.as_deref())
}

#[tauri::command]
fn git_discard_all_changes(worktree_path: String) -> Result<String, String> {
    git_ops::git_discard_all_changes(&worktree_path)
}

#[tauri::command]
fn git_has_uncommitted_changes(worktree_path: String) -> Result<bool, String> {
    git_ops::has_uncommitted_changes(&worktree_path)
}

// PTY commands
#[tauri::command]
fn pty_create_session(
    state: State<AppState>,
    app: AppHandle,
    session_id: String,
    working_dir: Option<String>,
    shell: Option<String>,
    initial_command: Option<String>,
) -> Result<(), String> {
    let pty_manager = state.pty_manager.lock().unwrap();
    let sid = session_id.clone();

    pty_manager.create_session(
        session_id,
        working_dir,
        shell,
        initial_command,
        Box::new(move |data| {
            let _ = app.emit(&format!("pty-data-{}", sid), data);
        }),
    )
}

#[tauri::command]
fn pty_session_exists(state: State<AppState>, session_id: String) -> Result<bool, String> {
    let pty_manager = state.pty_manager.lock().unwrap();
    Ok(pty_manager.session_exists(&session_id))
}

#[tauri::command]
fn pty_write(state: State<AppState>, session_id: String, data: String) -> Result<(), String> {
    let pty_manager = state.pty_manager.lock().unwrap();
    pty_manager.write_to_session(&session_id, &data)
}

#[tauri::command]
fn pty_resize(
    state: State<AppState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let pty_manager = state.pty_manager.lock().unwrap();
    pty_manager.resize_session(&session_id, rows, cols)
}

#[tauri::command]
fn pty_close(state: State<AppState>, session_id: String) -> Result<(), String> {
    let pty_manager = state.pty_manager.lock().unwrap();
    pty_manager.close_session(&session_id)
}

// File system commands
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct DirectoryEntry {
    name: String,
    path: String,
    is_directory: bool,
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<DirectoryEntry>, String> {
    use std::path::Path;

    let base_path = Path::new(&path);
    let mut files = Vec::new();

    // Use ignore::WalkBuilder to respect .gitignore patterns
    let walker = WalkBuilder::new(&path)
        .max_depth(Some(1)) // Only immediate children
        .hidden(false) // Show hidden files (except those in .gitignore)
        .git_ignore(true) // Respect .gitignore patterns
        .git_global(true) // Respect global gitignore
        .git_exclude(true) // Respect .git/info/exclude
        .parents(true) // Check parent directories for ignore files
        .build();

    for entry in walker {
        if let Ok(entry) = entry {
            let entry_path = entry.path();

            // Skip the base directory itself
            if entry_path == base_path {
                continue;
            }

            if let Some(name) = entry_path.file_name().and_then(|n| n.to_str()) {
                let is_dir = entry_path.is_dir();
                files.push(DirectoryEntry {
                    name: name.to_string(),
                    path: entry_path.to_string_lossy().to_string(),
                    is_directory: is_dir,
                });
            }
        }
    }

    // Sort: directories first, then files
    files.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    Ok(files)
}

// Shell commands
#[tauri::command]
fn shell_execute(command: String, working_dir: Option<String>) -> Result<String, String> {
    execute_command(&command, working_dir)
}

// Git operations
#[tauri::command]
fn git_commit(worktree_path: String, message: String) -> Result<String, String> {
    git_ops::git_commit(&worktree_path, &message)
}

#[tauri::command]
fn git_add_all(worktree_path: String) -> Result<String, String> {
    git_ops::git_add_all(&worktree_path)
}

#[tauri::command]
fn git_push(worktree_path: String) -> Result<String, String> {
    git_ops::git_push(&worktree_path)
}

#[tauri::command]
fn git_push_force(worktree_path: String) -> Result<String, String> {
    git_ops::git_push_force(&worktree_path)
}

#[tauri::command]
fn git_commit_amend(worktree_path: String, message: String) -> Result<String, String> {
    git_ops::git_commit_amend(&worktree_path, &message)
}

#[tauri::command]
fn git_pull(worktree_path: String) -> Result<String, String> {
    git_ops::git_pull(&worktree_path)
}

#[tauri::command]
fn git_fetch(worktree_path: String) -> Result<String, String> {
    git_ops::git_fetch(&worktree_path)
}

#[tauri::command]
fn git_log(worktree_path: String, count: usize) -> Result<Vec<String>, String> {
    git_ops::git_log(&worktree_path, count)
}

#[tauri::command]
fn git_stage_file(worktree_path: String, file_path: String) -> Result<String, String> {
    git_ops::git_stage_file(&worktree_path, &file_path)
}

#[tauri::command]
fn git_unstage_file(worktree_path: String, file_path: String) -> Result<String, String> {
    git_ops::git_unstage_file(&worktree_path, &file_path)
}

#[tauri::command]
fn git_get_changed_files(worktree_path: String) -> Result<Vec<String>, String> {
    git_ops::git_get_changed_files(&worktree_path)
}

#[tauri::command]
fn git_stage_hunk(worktree_path: String, patch: String) -> Result<String, String> {
    git_ops::git_stage_hunk(&worktree_path, &patch)
}

#[tauri::command]
fn git_unstage_hunk(worktree_path: String, patch: String) -> Result<String, String> {
    git_ops::git_unstage_hunk(&worktree_path, &patch)
}

#[tauri::command]
fn git_get_file_hunks(worktree_path: String, file_path: String) -> Result<Vec<DiffHunk>, String> {
    git_ops::git_get_file_hunks(&worktree_path, &file_path)
}

// Calculate directory size (excluding .git)
#[tauri::command]
fn calculate_directory_size(path: String) -> Result<u64, String> {
    use std::fs;
    use std::path::Path;

    fn dir_size(path: &Path) -> std::io::Result<u64> {
        let mut total = 0;

        if path.is_dir() {
            for entry in fs::read_dir(path)? {
                let entry = entry?;
                let path = entry.path();

                // Skip .git and .treq directories
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name == ".git" || name == ".treq" {
                        continue;
                    }
                }

                if path.is_dir() {
                    total += dir_size(&path)?;
                } else {
                    total += entry.metadata()?.len();
                }
            }
        }

        Ok(total)
    }

    let path = Path::new(&path);
    dir_size(path).map_err(|e| e.to_string())
}

// Plan history commands
#[tauri::command]
fn save_executed_plan_command(
    repo_path: String,
    worktree_id: i64,
    plan_data: PlanHistoryInput,
) -> Result<i64, String> {
    local_db::save_executed_plan(&repo_path, worktree_id, plan_data)
}

#[tauri::command]
fn get_worktree_plans_command(
    repo_path: String,
    worktree_id: i64,
    limit: Option<i64>,
) -> Result<Vec<PlanHistoryEntry>, String> {
    local_db::get_worktree_plans(&repo_path, worktree_id, limit)
}

#[tauri::command]
fn get_all_worktree_plans_command(
    repo_path: String,
    worktree_id: i64,
) -> Result<Vec<PlanHistoryEntry>, String> {
    local_db::get_all_worktree_plans(&repo_path, worktree_id)
}

// Plan storage commands
#[tauri::command]
fn save_plan_to_file(
    repo_path: String,
    plan_id: String,
    content: String,
    metadata: PlanMetadata,
) -> Result<(), String> {
    plan_storage::save_plan_to_file(&repo_path, &plan_id, &content, metadata)
}

#[tauri::command]
fn load_plans_from_files(repo_path: String) -> Result<Vec<PlanFile>, String> {
    plan_storage::load_plans_from_files(&repo_path)
}

#[tauri::command]
fn get_plan_file(repo_path: String, plan_id: String) -> Result<PlanFile, String> {
    plan_storage::get_plan_file(&repo_path, &plan_id)
}

#[tauri::command]
fn delete_plan_file(repo_path: String, plan_id: String) -> Result<(), String> {
    plan_storage::delete_plan_file(&repo_path, &plan_id)
}

// Session management commands
#[tauri::command]
fn create_session(
    state: State<AppState>,
    worktree_id: Option<i64>,
    name: String,
    plan_title: Option<String>,
) -> Result<i64, String> {
    let db = state.db.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();
    let session = Session {
        id: 0,
        worktree_id,
        name,
        created_at: now.clone(),
        last_accessed: now,
        plan_title,
    };
    db.add_session(&session).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_sessions(state: State<AppState>) -> Result<Vec<Session>, String> {
    let db = state.db.lock().unwrap();
    db.get_sessions().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_sessions_by_worktree(
    state: State<AppState>,
    worktree_id: i64,
) -> Result<Vec<Session>, String> {
    let db = state.db.lock().unwrap();
    db.get_sessions_by_worktree(worktree_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_main_repo_sessions(state: State<AppState>) -> Result<Vec<Session>, String> {
    let db = state.db.lock().unwrap();
    db.get_main_repo_sessions().map_err(|e| e.to_string())
}

#[tauri::command]
fn update_session_access(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();
    db.update_session_access(id, &now)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_session_name(state: State<AppState>, id: i64, name: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.update_session_name(id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_session(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.delete_session(id).map_err(|e| e.to_string())
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

            let app_state = AppState {
                db: Mutex::new(db),
                pty_manager: Mutex::new(pty_manager),
            };

            app.manage(app_state);

            // Create menu
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

            let menu = MenuBuilder::new(app).item(&go_menu).build()?;

            app.set_menu(menu)?;

            // Handle menu events
            app.on_menu_event(move |app, event| {
                if event.id() == "dashboard" {
                    let _ = app.emit("navigate-to-dashboard", ());
                } else if event.id() == "settings" {
                    let _ = app.emit("navigate-to-settings", ());
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_worktrees,
            add_worktree_to_db,
            delete_worktree_from_db,
            get_commands,
            add_command,
            get_setting,
            set_setting,
            get_repo_setting,
            set_repo_setting,
            delete_repo_setting,
            git_create_worktree,
            git_get_current_branch,
            git_execute_post_create_command,
            git_list_worktrees,
            git_remove_worktree,
            git_get_status,
            git_get_branch_info,
            git_get_branch_divergence,
            git_get_file_diff,
            git_get_diff_between_branches,
            git_get_changed_files_between_branches,
            git_get_commits_between_branches,
            git_list_branches,
            git_is_repository,
            git_init_repo,
            git_list_gitignored_files,
            git_merge,
            git_discard_all_changes,
            git_has_uncommitted_changes,
            git_commit,
            git_commit_amend,
            git_add_all,
            git_push,
            git_push_force,
            git_pull,
            git_fetch,
            git_log,
            git_stage_file,
            git_unstage_file,
            git_stage_hunk,
            git_unstage_hunk,
            git_get_changed_files,
            git_get_file_hunks,
            pty_create_session,
            pty_session_exists,
            pty_write,
            pty_resize,
            pty_close,
            read_file,
            list_directory,
            shell_execute,
            calculate_directory_size,
            save_executed_plan_command,
            get_worktree_plans_command,
            get_all_worktree_plans_command,
            save_plan_to_file,
            load_plans_from_files,
            get_plan_file,
            delete_plan_file,
            create_session,
            get_sessions,
            get_sessions_by_worktree,
            get_main_repo_sessions,
            update_session_access,
            update_session_name,
            delete_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
