import {
  isTerminalSessionIdle,
  type TerminalSessionSummary,
} from "./types";

export interface SessionOrderState {
  order: string[];
  lastUserInputAt: Map<string, number>;
  idleIds: Set<string>;
}

export function createSessionOrderState(): SessionOrderState {
  return {
    order: [],
    lastUserInputAt: new Map(),
    idleIds: new Set(),
  };
}

/**
 * Sticky session list order:
 * - New sessions appear at the top.
 * - User input moves that session to the top.
 * - Becoming idle (no recent *process* output) moves it below active sessions.
 * - Process output / remaining idle does not reshuffle the list.
 */
export function nextTerminalSessionOrder(
  prev: SessionOrderState,
  sessions: TerminalSessionSummary[],
  now: number,
): SessionOrderState {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const liveIds = sessions.map((session) => session.id);

  let order = prev.order.filter((id) => byId.has(id));
  for (const id of liveIds) {
    if (!order.includes(id)) {
      order.unshift(id);
    }
  }

  const promoted = liveIds
    .filter((id) => {
      const current = byId.get(id)?.lastUserInputAt ?? 0;
      const previous = prev.lastUserInputAt.get(id) ?? 0;
      return current > previous;
    })
    .sort(
      (a, b) =>
        (byId.get(a)?.lastUserInputAt ?? 0) -
        (byId.get(b)?.lastUserInputAt ?? 0),
    );

  for (const id of promoted) {
    order = [id, ...order.filter((existing) => existing !== id)];
  }

  const idleIds = new Set(
    liveIds.filter((id) => isTerminalSessionIdle(byId.get(id)!, now)),
  );

  const newlyIdle = liveIds.filter(
    (id) => idleIds.has(id) && !prev.idleIds.has(id),
  );
  for (const id of newlyIdle) {
    const without = order.filter((existing) => existing !== id);
    let lastActiveIndex = -1;
    for (let index = without.length - 1; index >= 0; index -= 1) {
      if (!idleIds.has(without[index])) {
        lastActiveIndex = index;
        break;
      }
    }
    order = [
      ...without.slice(0, lastActiveIndex + 1),
      id,
      ...without.slice(lastActiveIndex + 1),
    ];
  }

  const lastUserInputAt = new Map(
    liveIds.map((id) => [id, byId.get(id)?.lastUserInputAt ?? 0]),
  );

  return { order, lastUserInputAt, idleIds };
}
