import type { AgentChat, LogRecordView } from "./api-types";

/** Project a stored agent conversation onto the shared log-feed row shape. */
export function agentChatToLogRecords(chat: AgentChat): LogRecordView[] {
  return chat.messages
    .filter((message) => message.message.trim().length > 0)
    .map((message) => ({
      timestamp: message.time,
      severity_number: 9,
      severity_text: "INFO",
      body: message.message,
      trace_id: String(chat.session_id),
      span_id: String(message.id),
      run_id: chat.session_id,
      job_id: message.role,
      step_index: message.id,
      step_name: chat.name,
      stream: message.role,
    }));
}
