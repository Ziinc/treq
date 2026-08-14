import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useState,
} from "react";
import { ListOrdered, Pencil, Trash2 } from "lucide-react";
import { type QueuedAgentMessage } from "../../lib/agentMessageQueue";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Textarea } from "../ui/textarea";

export interface AgentMessageQueueButtonProps {
  messages: QueuedAgentMessage[];
  onRemove: (id: string) => void;
  onUpdate: (id: string, text: string) => void;
  className?: string;
}

/** Pinned rounded count button + popover to edit/remove queued messages. */
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
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-2",
        className,
      )}
    >
      <div className="pointer-events-auto">
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
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="agent-message-queue-button"
              aria-label={`${messages.length} queued message${messages.length === 1 ? "" : "s"}`}
              className="h-7 rounded-full border border-border/80 bg-background/95 px-3 text-xs font-medium shadow-md backdrop-blur hover:bg-background"
            >
              <ListOrdered className="h-3.5 w-3.5" />
              <span data-testid="agent-message-queue-count">
                {messages.length}
              </span>
              <span className="text-muted-foreground">queued</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="center"
            side="bottom"
            sideOffset={6}
            className="w-80 p-2"
            data-testid="agent-message-queue-popover"
          >
            <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
              {messages.map((message, index) => (
                <li
                  key={message.id}
                  data-testid={`agent-message-queue-item-${message.id}`}
                  className="rounded-md border border-border bg-muted/30 p-2"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      #{index + 1}
                    </span>
                    <div className="flex items-center gap-0.5">
                      {editingId !== message.id && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Edit queued message ${index + 1}`}
                          data-testid={`agent-message-queue-edit-${message.id}`}
                          onClick={() => startEdit(message)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove queued message ${index + 1}`}
                        data-testid={`agent-message-queue-remove-${message.id}`}
                        onClick={() => onRemove(message.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {editingId === message.id ? (
                    <div className="flex flex-col gap-1.5">
                      <Textarea
                        value={editDraft}
                        onChange={(event) => setEditDraft(event.target.value)}
                        data-testid={`agent-message-queue-edit-input-${message.id}`}
                        className="min-h-[60px] resize-y text-sm"
                        autoFocus
                      />
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
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
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-sm leading-snug">
                      {message.text}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export interface AgentMessageQueueComposerProps {
  onEnqueue: (text: string) => void;
  className?: string;
}

/** Bottom composer that queues a follow-up for the agent terminal. */
export function AgentMessageQueueComposer({
  onEnqueue,
  className,
}: AgentMessageQueueComposerProps) {
  const [draft, setDraft] = useState("");

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

  return (
    <div
      className={cn(
        "flex-shrink-0 border-t border-border/60 bg-[#1e1e1e] px-2 py-1.5",
        className,
      )}
    >
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Queue a follow-up for when the agent is idle…"
        aria-label="Queue agent message"
        data-testid="agent-message-queue-composer"
        rows={1}
        className="min-h-8 max-h-24 resize-none border-border/50 bg-background/80 text-sm"
      />
    </div>
  );
}
