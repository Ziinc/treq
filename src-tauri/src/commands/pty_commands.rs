use crate::AppState;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn pty_create_session(
    state: State<AppState>,
    app: AppHandle,
    session_id: String,
    working_dir: Option<String>,
    shell: Option<String>,
    initial_command: Option<String>,
    suppress_echo_for: Option<String>,
) -> Result<(), String> {
    let pty_manager = state.pty_manager.lock().unwrap();
    let sid = session_id.clone();

    pty_manager.create_session(
        session_id,
        working_dir,
        shell,
        initial_command,
        suppress_echo_for,
        Box::new(move |data| {
            let _ = app.emit(&format!("pty-data-{}", sid), data);
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
    let pty_manager = state.pty_manager.lock().unwrap();
    pty_manager.resize_session(&session_id, rows, cols)
}

#[tauri::command]
pub fn pty_write_suppress_echo(
    state: State<AppState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let pty_manager = state.pty_manager.lock().unwrap();
    pty_manager.set_auto_command(&session_id, &data)?;
    pty_manager.write_to_session(&session_id, &data)
}

#[tauri::command]
pub fn pty_close(state: State<AppState>, session_id: String) -> Result<(), String> {
    let pty_manager = state.pty_manager.lock().unwrap();
    pty_manager.close_session(&session_id)
}
