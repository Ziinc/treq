mod db;
mod git;
mod git_ops;
mod pty;
mod shell;

use db::{Database, Worktree, Command as DbCommand};
use git::{is_git_repository, git_init, *};
use pty::PtyManager;
use shell::{execute_command, launch_application, detect_available_editors};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use ignore::WalkBuilder;

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
fn get_repo_setting(state: State<AppState>, repo_path: String, key: String) -> Result<Option<String>, String> {
    let db = state.db.lock().unwrap();
    db.get_repo_setting(&repo_path, &key).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_repo_setting(state: State<AppState>, repo_path: String, key: String, value: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.set_repo_setting(&repo_path, &key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_repo_setting(state: State<AppState>, repo_path: String, key: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.delete_repo_setting(&repo_path, &key).map_err(|e| e.to_string())
}

// Git commands
#[tauri::command]
fn git_create_worktree(
    state: State<AppState>,
    repo_path: String,
    branch: String,
    new_branch: bool,
) -> Result<String, String> {
    // Load exclusion patterns from database
    let exclusion_patterns = {
        let db = state.db.lock().unwrap();
        db.get_repo_setting(&repo_path, "excluded_copy_dirs")
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
    
    create_worktree(&repo_path, &branch, new_branch, exclusion_patterns)
}

#[tauri::command]
fn git_get_current_branch(repo_path: String) -> Result<String, String> {
    get_current_branch(&repo_path)
}

#[tauri::command]
fn git_execute_post_create_command(worktree_path: String, command: String) -> Result<String, String> {
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
fn git_get_file_diff(worktree_path: String, file_path: String) -> Result<String, String> {
    get_file_diff(&worktree_path, &file_path)
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
fn pty_write(state: State<AppState>, session_id: String, data: String) -> Result<(), String> {
    let pty_manager = state.pty_manager.lock().unwrap();
    pty_manager.write_to_session(&session_id, &data)
}

#[tauri::command]
fn pty_resize(state: State<AppState>, session_id: String, rows: u16, cols: u16) -> Result<(), String> {
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
        .max_depth(Some(1))           // Only immediate children
        .hidden(false)                 // Show hidden files (except those in .gitignore)
        .git_ignore(true)              // Respect .gitignore patterns
        .git_global(true)              // Respect global gitignore
        .git_exclude(true)             // Respect .git/info/exclude
        .parents(true)                 // Check parent directories for ignore files
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
    files.sort_by(|a, b| {
        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        }
    });
    
    Ok(files)
}

// Shell commands
#[tauri::command]
fn shell_execute(command: String, working_dir: Option<String>) -> Result<String, String> {
    execute_command(&command, working_dir)
}

#[tauri::command]
fn shell_launch_app(app_name: String, path: String) -> Result<(), String> {
    launch_application(&app_name, &path)
}

#[tauri::command]
fn detect_editors() -> Result<Vec<String>, String> {
    detect_available_editors()
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
                
                // Skip .git directory
                if path.file_name().and_then(|n| n.to_str()) == Some(".git") {
                    continue;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Initialize database
            let app_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_dir).expect("Failed to create app data directory");
            let db_path = app_dir.join("treq.db");
            
            let db = Database::new(db_path).expect("Failed to open database");
            db.init().expect("Failed to initialize database");
            
            let pty_manager = PtyManager::new();
            
            app.manage(AppState {
                db: Mutex::new(db),
                pty_manager: Mutex::new(pty_manager),
            });

            // Create menu
            let dashboard_item = MenuItemBuilder::with_id("dashboard", "Dashboard")
                .accelerator("CmdOrCtrl+D")
                .build(app)?;
            
            let go_menu = SubmenuBuilder::new(app, "Go")
                .item(&dashboard_item)
                .build()?;
            
            let menu = MenuBuilder::new(app)
                .item(&go_menu)
                .build()?;
            
            app.set_menu(menu)?;

            // Handle menu events
            app.on_menu_event(move |app, event| {
                if event.id() == "dashboard" {
                    let _ = app.emit("navigate-to-dashboard", ());
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
            git_get_file_diff,
            git_list_branches,
            git_is_repository,
            git_init_repo,
            git_commit,
            git_add_all,
            git_push,
            git_pull,
            git_fetch,
            git_log,
            git_stage_file,
            git_unstage_file,
            git_get_changed_files,
            pty_create_session,
            pty_write,
            pty_resize,
            pty_close,
            read_file,
            list_directory,
            shell_execute,
            shell_launch_app,
            detect_editors,
            calculate_directory_size,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
