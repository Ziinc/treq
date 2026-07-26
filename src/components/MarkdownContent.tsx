import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { cn } from "../lib/utils";

const PROSE_CLASS =
	"prose dark:prose-invert max-w-none prose-headings:font-semibold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-a:text-blue-500 prose-a:no-underline hover:prose-a:underline prose-strong:font-semibold prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-[''] prose-code:after:content-[''] prose-pre:bg-muted prose-pre:border prose-pre:border-border";

interface MarkdownContentProps {
	content: string;
	className?: string;
	/** Optional image src resolver (used by README for relative paths). */
	resolveImageSrc?: (src: string | undefined) => string | undefined;
}

export function MarkdownContent({
	content,
	className,
	resolveImageSrc,
}: MarkdownContentProps) {
	const stripped = content.replace(/<!--[\s\S]*?-->/g, "");

	return (
		<div className={cn(PROSE_CLASS, className)}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeRaw]}
				components={
					resolveImageSrc
						? {
								img: ({ src, alt, ...props }) => (
									<img src={resolveImageSrc(src)} alt={alt ?? ""} {...props} />
								),
							}
						: undefined
				}
			>
				{stripped}
			</ReactMarkdown>
		</div>
	);
}
