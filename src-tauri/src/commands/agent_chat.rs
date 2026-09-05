use crate::core::agent_chat::{AgentChat, AgentChatSummary};

#[tauri::command]
pub fn register_agent_chat(
  repo_path: String,
  session_id: i64,
  pty_session_id: String,
  name: String,
  agent: String,
  workspace_id: Option<i64>,
  initial_prompt: Option<String>,
) -> Result<AgentChat, String> {
  crate::core::agent_chat::register_agent_chat(
    &repo_path,
    session_id,
    &pty_session_id,
    &name,
    &agent,
    workspace_id,
    initial_prompt.as_deref(),
  )
}

#[tauri::command]
pub fn record_agent_chat_user_message(
  repo_path: String,
  session_id: i64,
  screen_before: String,
  text: String,
) -> Result<AgentChat, String> {
  crate::core::agent_chat::record_user_message(&repo_path, session_id, &screen_before, &text)
}

#[tauri::command]
pub fn record_agent_chat_screen(
  repo_path: String,
  session_id: i64,
  screen: String,
) -> Result<AgentChat, String> {
  crate::core::agent_chat::record_screen(&repo_path, session_id, &screen)
}

#[tauri::command]
pub fn list_agent_chats(repo_path: String) -> Result<Vec<AgentChatSummary>, String> {
  crate::core::agent_chat::list_agent_chats(&repo_path)
}

#[tauri::command]
pub fn get_agent_chat(repo_path: String, session_id: i64) -> Result<Option<AgentChat>, String> {
  crate::core::agent_chat::get_agent_chat(&repo_path, session_id)
}
