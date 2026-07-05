use crate::AppState;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn pty_create_session(
    state: State<AppState>,
    app: AppHandle,
    session_id: String,
    repo_path: String,
    working_dir: Option<String>,
    shell: Option<String>,
    initial_command: Option<String>,
    suppress_echo_for: Option<String>,
) -> Result<(), String> {
    log::debug!(
        "pty_create_session: session_id={}, working_dir={:?}, shell={:?}, initial_command_present={}, suppress_echo_for_present={}",
        session_id,
        working_dir,
        shell,
        initial_command.is_some(),
        suppress_echo_for.is_some()
    );
    let pty_manager = state.pty_manager.lock().unwrap();
    let sid = session_id.clone();
    let repo_path_for_logs = repo_path.clone();
    let workspace_key = working_dir
        .clone()
        .unwrap_or_else(|| repo_path_for_logs.clone());
    let event_name = format!("pty-data-{}", sid);

    pty_manager.create_session(
        session_id,
        working_dir,
        shell,
        initial_command,
        suppress_echo_for,
        Box::new(move |data| {
            let _ = crate::logs::append_workspace_log(
                &repo_path_for_logs,
                None,
                &workspace_key,
                &sid,
                "pty",
                "info",
                data.trim_end(),
            );
            if let Err(error) = app.emit(&event_name, data) {
                log::warn!(
                    "pty emit failed: session_id={}, event={}, error={}",
                    sid,
                    event_name,
                    error
                );
            }
        }),
    )
}

#[tauri::command]
pub fn pty_session_exists(state: State<AppState>, session_id: String) -> Result<bool, String> {
    let pty_manager = state.pty_manager.lock().unwrap();
    Ok(pty_manager.session_exists(&session_id))
}

#[tauri::command]
pub fn pty_write(state: State<AppState>, session_id: String, data: String) -> Result<(), String> {
    log::debug!(
        "pty_write: session_id={}, data_len={}",
        session_id,
        data.len()
    );
    let pty_manager = state.pty_manager.lock().unwrap();
    pty_manager.write_to_session(&session_id, &data)
}

#[tauri::command]
pub fn pty_resize(
    state: State<AppState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    log::debug!(
        "pty_resize: session_id={}, rows={}, cols={}",
        session_id,
        rows,
        cols
    );
    let pty_manager = state.pty_manager.lock().unwrap();
    pty_manager.resize_session(&session_id, rows, cols)
}

#[tauri::command]
pub fn pty_write_suppress_echo(
    state: State<AppState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    log::debug!(
        "pty_write_suppress_echo: session_id={}, data_len={}",
        session_id,
        data.len()
    );
    let pty_manager = state.pty_manager.lock().unwrap();
    pty_manager.set_auto_command(&session_id, &data)?;
    pty_manager.write_to_session(&session_id, &data)
}

#[tauri::command]
pub fn pty_close(state: State<AppState>, session_id: String) -> Result<(), String> {
    log::debug!("pty_close: session_id={}", session_id);
    let pty_manager = state.pty_manager.lock().unwrap();
    pty_manager.close_session(&session_id)
}
