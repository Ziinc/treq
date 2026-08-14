import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useState,
} from "react";
import { ArrowUp, ListOrdered, Pencil, Trash2 } from "lucide-react";
import { type QueuedAgentMessage } from "../../lib/agentMessageQueue";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Label } from "../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Textarea } from "../ui/textarea";

export type AgentMessageQueueVariant = "toolbar" | "pinned";

export interface AgentMessageQueueProps {
  messages: QueuedAgentMessage[];
  onEnqueue: (text: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, text: string) => void;
  /** toolbar = header icon when empty; pinned = top-of-terminal chip when non-empty */
  variant: AgentMessageQueueVariant;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/**
 * Queue control for agent terminals.
 * - Empty queue: toolbar icon; click opens popover with follow-up input.
 * - Non-empty: pinned count chip at top of terminal; same popover lists
 *   messages (edit/remove) and hosts the follow-up input.
 * The follow-up input is never shown outside the popover.
 */
export function AgentMessageQueue({
  messages,
  onEnqueue,
  onRemove,
  onUpdate,
  variant,
  open: openProp,
  onOpenChange,
  className,
}: AgentMessageQueueProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const submitDraft = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onEnqueue(trimmed);
    setDraft("");
  }, [draft, onEnqueue]);

  const handleComposerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitDraft();
      }
    },
    [submitDraft],
  );

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

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setEditingId(null);
      setEditDraft("");
      setDraft("");
    }
  };

  const count = messages.length;
  const isPinned = variant === "pinned";
  const canSend = draft.trim().length > 0;

  const toolbarButton = (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      data-testid="agent-message-queue-button"
      aria-label="Queue message"
      title="Queue message"
      className="bg-transparent text-gray-200 hover:bg-muted/20 hover:text-gray-200"
    >
      <ListOrdered className="h-4 w-4" />
    </Button>
  );

  const pinnedButton = (
    <Button
      type="button"
      variant="secondary"
      size="xs"
      data-testid="agent-message-queue-button"
      aria-label={`${count} queued message${count === 1 ? "" : "s"}`}
      className="h-6 gap-1.5 rounded-full px-2.5 text-[11px] font-medium shadow-sm"
    >
      <ListOrdered className="h-3 w-3 text-muted-foreground" />
      <span data-testid="agent-message-queue-count" className="tabular-nums">
        {count}
      </span>
      <span className="text-muted-foreground">queued</span>
    </Button>
  );

  return (
    <div
      data-testid="agent-message-queue"
      data-variant={variant}
      className={cn(
        isPinned &&
          "pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-2.5",
        className,
      )}
    >
      <div className={cn(isPinned && "pointer-events-auto")}>
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            {variant === "toolbar" ? toolbarButton : pinnedButton}
          </PopoverTrigger>
          <PopoverContent
            align={isPinned ? "center" : "end"}
            side="top"
            sideOffset={8}
            className="w-[24rem] space-y-2 rounded-xl p-3"
            data-testid="agent-message-queue-popover"
          >
            <Label className="px-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {count === 0 ? "Queue a follow-up" : "Queued messages"}
            </Label>

            {count > 0 && (
              <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                {messages.map((message, index) => {
                  const isEditing = editingId === message.id;
                  return (
                    <li key={message.id}>
                      <Card
                        data-testid={`agent-message-queue-item-${message.id}`}
                        className="border-border/60 bg-muted/40 p-2.5 shadow-none"
                      >
                        {isEditing ? (
                          <div className="flex flex-col gap-2">
                            <Textarea
                              value={editDraft}
                              onChange={(event) =>
                                setEditDraft(event.target.value)
                              }
                              data-testid={`agent-message-queue-edit-input-${message.id}`}
                              className="min-h-[72px] resize-y text-sm"
                              autoFocus
                            />
                            <div className="flex justify-end gap-1.5">
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
                          <div className="flex items-start gap-2.5">
                            <span className="mt-0.5 w-4 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                              {index + 1}
                            </span>
                            <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
                              {message.text}
                            </p>
                            <div className="flex shrink-0 items-center gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Edit queued message ${index + 1}`}
                                data-testid={`agent-message-queue-edit-${message.id}`}
                                className="text-muted-foreground"
                                onClick={() => startEdit(message)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Remove queued message ${index + 1}`}
                                data-testid={`agent-message-queue-remove-${message.id}`}
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => onRemove(message.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}

            <Card className="gap-0 overflow-hidden border-input p-0 shadow-none focus-within:border-primary focus-within:ring-1 focus-within:ring-ring">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Add a follow-up…"
                aria-label="Queue agent message"
                data-testid="agent-message-queue-composer"
                rows={2}
                className={cn(
                  "max-h-28 min-h-[52px] resize-none border-0 bg-transparent",
                  "px-3 pb-1 pt-2.5 text-[13px] shadow-none",
                  "focus-visible:ring-0 focus-visible:ring-offset-0 caret-primary",
                )}
              />
              <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-0.5">
                <span className="px-1 text-[10px] text-muted-foreground">
                  Enter to queue · sends when idle
                </span>
                <Button
                  type="button"
                  size="icon-xs"
                  aria-label="Add to queue"
                  disabled={!canSend}
                  onClick={submitDraft}
                  className="h-7 w-7 rounded-full"
                >
                  <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
                </Button>
              </div>
            </Card>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
