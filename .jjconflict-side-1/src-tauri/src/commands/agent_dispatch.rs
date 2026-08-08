/// Records the frontend's handling result for an agent dispatch.
///
/// Dispatch delivery currently responds as soon as the request is routed to a
/// matching window, so there is no pending backend waiter to notify. Keep this
/// command as the runtime counterpart to the frontend acknowledgement API.
#[tauri::command]
pub fn acknowledge_agent_dispatch(_request_id: String, _status: String, _reason: Option<String>) {}
