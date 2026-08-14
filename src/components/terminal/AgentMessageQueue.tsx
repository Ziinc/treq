import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useState,
} from "react";
import { ArrowUp, ListOrdered, Pencil, Trash2 } from "lucide-react";
import { type QueuedAgentMessage } from "../../lib/agentMessageQueue";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export interface AgentMessageQueueButtonProps {
  messages: QueuedAgentMessage[];
  onRemove: (id: string) => void;
  onUpdate: (id: string, text: string) => void;
  className?: string;
}

/**
 * Cursor-style queue chip. Opens a dark popover to edit or remove
 * queued follow-ups.
 */
export function AgentMessageQueueButton({
  messages,
  onRemove,
  onUpdate,
  className,
}: AgentMessageQueueButtonProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  if (messages.length === 0) return null;

  const startEdit = (message: QueuedAgentMessage) => {
    setEditingId(message.id);
    setEditDraft(message.text);
  };

  const commitEdit = () => {
    if (!editingId) return;
    onUpdate(editingId, editDraft);
    setEditingId(null);
    setEditDraft("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  return (
    <div
      data-testid="agent-message-queue"
      className={cn("flex items-center", className)}
    >
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setEditingId(null);
            setEditDraft("");
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="agent-message-queue-button"
            aria-label={`${messages.length} queued message${messages.length === 1 ? "" : "s"}`}
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-full border border-white/10",
              "bg-[#2f2f2f] px-2.5 text-[11px] font-medium text-zinc-200",
              "transition-colors hover:border-white/20 hover:bg-[#3a3a3a] hover:text-white",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400/70",
            )}
          >
            <ListOrdered className="h-3 w-3 text-zinc-400" />
            <span
              data-testid="agent-message-queue-count"
              className="tabular-nums text-zinc-100"
            >
              {messages.length}
            </span>
            <span className="text-zinc-500">queued</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          sideOffset={8}
          className={cn(
            "w-[24rem] border-white/10 bg-[#2a2a2a] p-2 text-zinc-100",
            "rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.45)]",
          )}
          data-testid="agent-message-queue-popover"
        >
          <div className="px-2 pb-2 pt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">
            Queued messages
          </div>
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {messages.map((message, index) => {
              const isEditing = editingId === message.id;
              return (
                <li
                  key={message.id}
                  data-testid={`agent-message-queue-item-${message.id}`}
                  className="group rounded-lg bg-white/[0.03] px-2.5 py-2 hover:bg-white/[0.05]"
                >
                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={editDraft}
                        onChange={(event) => setEditDraft(event.target.value)}
                        data-testid={`agent-message-queue-edit-input-${message.id}`}
                        className={cn(
                          "min-h-[72px] w-full resize-y rounded-lg border border-white/10",
                          "bg-[#1e1e1e] px-3 py-2 text-sm text-zinc-100",
                          "outline-none placeholder:text-zinc-500",
                          "focus:border-blue-400/60 focus:ring-1 focus:ring-blue-400/40",
                        )}
                        autoFocus
                      />
                      <div className="flex justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="h-7 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                          onClick={cancelEdit}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          data-testid={`agent-message-queue-save-${message.id}`}
                          onClick={commitEdit}
                          disabled={!editDraft.trim()}
                          className="h-7 rounded-md bg-blue-500 px-3 text-white hover:bg-blue-400"
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 w-4 shrink-0 text-[11px] tabular-nums text-zinc-600">
                        {index + 1}
                      </span>
                      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-zinc-200">
                        {message.text}
                      </p>
                      <div className="flex shrink-0 items-center gap-0.5 text-zinc-500">
                        <button
                          type="button"
                          aria-label={`Edit queued message ${index + 1}`}
                          data-testid={`agent-message-queue-edit-${message.id}`}
                          className="rounded-md p-1 hover:bg-white/5 hover:text-zinc-200"
                          onClick={() => startEdit(message)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove queued message ${index + 1}`}
                          data-testid={`agent-message-queue-remove-${message.id}`}
                          className="rounded-md p-1 hover:bg-white/5 hover:text-red-300"
                          onClick={() => onRemove(message.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export interface AgentMessageQueueComposerProps {
  onEnqueue: (text: string) => void;
  messages?: QueuedAgentMessage[];
  onRemove?: (id: string) => void;
  onUpdate?: (id: string, text: string) => void;
  className?: string;
}

/**
 * Cursor-style follow-up dock: queue chip (when non-empty) + composer.
 * Keeps queue controls next to the input instead of floating mid-terminal.
 */
export function AgentMessageQueueComposer({
  onEnqueue,
  messages = [],
  onRemove,
  onUpdate,
  className,
}: AgentMessageQueueComposerProps) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);

  const submitDraft = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onEnqueue(trimmed);
    setDraft("");
  }, [draft, onEnqueue]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitDraft();
      }
    },
    [submitDraft],
  );

  const canSend = draft.trim().length > 0;

  return (
    <div
      className={cn(
        "relative flex-shrink-0 bg-[#1e1e1e] px-3 pb-3 pt-2",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-b from-transparent to-[#1e1e1e]"
      />

      {messages.length > 0 && onRemove && onUpdate && (
        <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
          <AgentMessageQueueButton
            messages={messages}
            onRemove={onRemove}
            onUpdate={onUpdate}
          />
          <span className="text-[10px] text-zinc-600">
            Sends when the agent is idle
          </span>
        </div>
      )}

      <div
        className={cn(
          "flex flex-col rounded-xl border bg-[#252526] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors",
          focused ? "border-blue-400/70" : "border-white/10",
        )}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Add a follow-up to the queue…"
          aria-label="Queue agent message"
          data-testid="agent-message-queue-composer"
          rows={1}
          className={cn(
            "max-h-28 min-h-[44px] w-full resize-none border-0 bg-transparent",
            "px-3.5 pb-1 pt-3 text-[13px] leading-snug text-zinc-100",
            "outline-none placeholder:text-zinc-500 caret-blue-400",
          )}
        />
        <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
          <span className="px-1 text-[10px] text-zinc-600">
            Enter to queue · Shift+Enter for newline
          </span>
          <button
            type="button"
            aria-label="Queue message"
            disabled={!canSend}
            onClick={submitDraft}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors",
              canSend
                ? "bg-blue-500 text-white hover:bg-blue-400"
                : "bg-white/[0.06] text-zinc-600",
            )}
          >
            <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
