import type { TerminalSessionSummary } from "../terminal/types";

export interface MissionControlGroup {
  workspaceKey: string;
  workspaceName: string;
  isMainRepo: boolean;
  terminals: TerminalSessionSummary[];
}

/** Prefer whichever of input/output happened more recently. */
export function sessionActivityScore(session: TerminalSessionSummary): number {
  return Math.max(session.lastActivityAt, session.lastUserInputAt);
}

function workspaceKeyFor(session: TerminalSessionSummary): string {
  return session.isMainRepo ? "__main__" : (session.branchName ?? "unknown");
}

function workspaceNameFor(session: TerminalSessionSummary): string {
  if (session.isMainRepo) {
    return session.branchName || "main";
  }
  return session.branchName || "unknown";
}

/**
 * Groups terminal session summaries by workspace for Mission Control.
 * Groups and terminals within each group are sorted by most recent activity.
 */
export function buildMissionControlGroups(
  sessions: TerminalSessionSummary[],
): MissionControlGroup[] {
  const groupMap = new Map<string, MissionControlGroup>();

  for (const session of sessions) {
    const workspaceKey = workspaceKeyFor(session);
    const existing = groupMap.get(workspaceKey);
    if (existing) {
      existing.terminals.push(session);
    } else {
      groupMap.set(workspaceKey, {
        workspaceKey,
        workspaceName: workspaceNameFor(session),
        isMainRepo: session.isMainRepo,
        terminals: [session],
      });
    }
  }

  const groups = Array.from(groupMap.values());
  for (const group of groups) {
    group.terminals.sort(
      (a, b) => sessionActivityScore(b) - sessionActivityScore(a),
    );
  }

  groups.sort((a, b) => {
    const aScore = Math.max(...a.terminals.map(sessionActivityScore));
    const bScore = Math.max(...b.terminals.map(sessionActivityScore));
    return bScore - aScore;
  });

  return groups;
}
