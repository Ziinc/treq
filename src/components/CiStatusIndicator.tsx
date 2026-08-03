import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { usePrCiStatus } from "../hooks/useMergeQueueStatus";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";

interface CiStatusIndicatorProps {
	repoPath: string;
	branchName: string;
}

const CI_STATUS_STYLES: Record<
	string,
	{ label: string; className: string; Icon: typeof CheckCircle2 }
> = {
	success: {
		label: "CI passed",
		className:
			"border-green-600 text-green-700 hover:bg-green-600/10 hover:text-green-700 dark:text-green-400 dark:border-green-500",
		Icon: CheckCircle2,
	},
	failure: {
		label: "CI failed",
		className:
			"border-red-600 text-red-700 hover:bg-red-600/10 hover:text-red-700 dark:text-red-400 dark:border-red-500",
		Icon: XCircle,
	},
	pending: {
		label: "CI running",
		className:
			"border-blue-600 text-blue-700 hover:bg-blue-600/10 hover:text-blue-700 dark:text-blue-400 dark:border-blue-500",
		Icon: Loader2,
	},
};

export function CiStatusIndicator({
	repoPath,
	branchName,
}: CiStatusIndicatorProps) {
	const { data: ciStatus } = usePrCiStatus(repoPath, branchName);

	if (!ciStatus || ciStatus.total === 0) {
		return null;
	}

	const style = CI_STATUS_STYLES[ciStatus.state] ?? CI_STATUS_STYLES.pending;
	const { Icon } = style;
	const failingChecks = ciStatus.checks.filter(
		(check) => check.bucket === "fail" || check.bucket === "cancel",
	);
	const firstLink = ciStatus.checks[0]?.link;

	return (
		<TooltipProvider delayDuration={200}>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className={cn("gap-1 px-2", style.className)}
						onClick={() => {
							if (firstLink) openUrl(firstLink);
						}}
						aria-label={`${style.label}: ${ciStatus.passed}/${ciStatus.total} checks passed`}
					>
						<Icon
							className={cn(
								"w-4 h-4",
								ciStatus.state === "pending" && "animate-spin",
							)}
						/>
						{ciStatus.passed}/{ciStatus.total}
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					<div>
						{style.label}: {ciStatus.passed}/{ciStatus.total} checks passed
					</div>
					{failingChecks.length > 0 && (
						<div className="mt-1 text-xs opacity-80">
							Failing: {failingChecks.map((check) => check.name).join(", ")}
						</div>
					)}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
