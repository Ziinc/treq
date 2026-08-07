import {
	forwardRef,
	memo,
	useCallback,
	type KeyboardEvent as ReactKeyboardEvent,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import type { CommitInputHandle, CommitInputProps } from "./types";

const CommitInput = memo(
	forwardRef<CommitInputHandle, CommitInputProps>(
		(
			{
				onCommit,
				onCommitAndPush,
				onCommitAndCreatePR,
				disabled,
				pending,
				pendingAction,
				canCreatePr = false,
				selectedFileCount = 0,
			},
			ref,
		) => {
			const [message, setMessage] = useState("");
			const textareaRef = useRef<HTMLTextAreaElement>(null);

			useImperativeHandle(
				ref,
				() => ({
					focus: () => {
						requestAnimationFrame(() => {
							if (textareaRef.current) {
								textareaRef.current.focus();
								textareaRef.current.select();
							}
						});
					},
				}),
				[],
			);

			const runAction = useCallback(
				(action: (message: string) => void) => {
					action(message.trim());
					setMessage("");
				},
				[message],
			);

			const handleKeyDown = useCallback(
				(event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
					if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
						event.preventDefault();
						runAction(onCommit);
					}
				},
				[onCommit, runAction],
			);

			const commitLabel =
				selectedFileCount > 0
					? `Commit ${selectedFileCount} file${
							selectedFileCount !== 1 ? "s" : ""
						}`
					: "Commit";

			const pendingLabel =
				pendingAction === "push"
					? "Pushing…"
					: pendingAction === "pr"
						? "Creating PR…"
						: "Committing…";

			return (
				<div className="px-4 py-3 border-b border-border space-y-2">
					<Textarea
						ref={textareaRef}
						placeholder="Message"
						value={message}
						onChange={(event) => setMessage(event.target.value)}
						onKeyDown={handleKeyDown}
						disabled={disabled || pending}
						className="resize-none overflow-hidden"
						style={{ minHeight: "24px" }}
					/>
					<div className="flex w-full">
						<Button
							className="flex-1 text-sm !h-auto py-1.5 rounded-r-none gap-1.5"
							disabled={disabled || pending}
							onClick={() => runAction(onCommit)}
							size="sm"
						>
							{pending ? (
								<>
									<Loader2 className="w-4 h-4 animate-spin" />
									{pendingLabel}
								</>
							) : (
								commitLabel
							)}
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									className="!h-auto py-1.5 px-1.5 rounded-l-none border-l border-primary-foreground/20"
									disabled={disabled || pending}
									size="sm"
									aria-label="More commit options"
								>
									<ChevronDown className="w-4 h-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" sideOffset={4}>
								<DropdownMenuItem
									disabled={disabled || pending}
									onSelect={() => runAction(onCommitAndPush)}
								>
									Commit and push
								</DropdownMenuItem>
								<DropdownMenuItem
									disabled={disabled || pending || !canCreatePr}
									onSelect={() => runAction(onCommitAndCreatePR)}
								>
									Commit and create PR
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
			);
		},
	),
);
CommitInput.displayName = "CommitInput";

export { CommitInput };
export type { CommitInputHandle };
