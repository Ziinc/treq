import React, {
	forwardRef,
	memo,
	useCallback,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import type { CommitInputHandle, CommitInputProps } from "./types";

const CommitInput = memo(
	forwardRef<CommitInputHandle, CommitInputProps>(
		({ onCommit, disabled, pending, selectedFileCount = 0 }, ref) => {
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

			const handleKeyDown = useCallback(
				(event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
					if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
						event.preventDefault();
						onCommit(message.trim());
						setMessage("");
					}
				},
				[message, onCommit],
			);

			const handleCommit = useCallback(() => {
				onCommit(message.trim());
				setMessage("");
			}, [message, onCommit]);

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
					<Button
						className="w-full text-sm !h-auto py-1.5"
						disabled={disabled}
						onClick={handleCommit}
						size="sm"
					>
						{pending ? (
							<Loader2 className="w-4 h-4 animate-spin" />
						) : selectedFileCount > 0 ? (
							`Commit ${selectedFileCount} file${
								selectedFileCount !== 1 ? "s" : ""
							}`
						) : (
							"Commit"
						)}
					</Button>
				</div>
			);
		},
	),
);
CommitInput.displayName = "CommitInput";

export { CommitInput };
export type { CommitInputHandle };
