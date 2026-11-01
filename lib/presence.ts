/**
 * Room presence helpers shared by the WebSocket server and the client.
 *
 * Presence is tracked per CONNECTION on the server (one entry per live
 * socket), but it must be DISPLAYED per USER: the same authenticated account
 * can have several live connections (multiple tabs, a reconnect racing the
 * old socket's teardown). Without deduplication a room panel renders the same
 * participant twice — and React reports duplicate keys.
 */

export interface PresenceEntry {
  userId: string
  userName: string | null
  role: string
}

const ROLE_RANK: Record<string, number> = { HOST: 0, MODERATOR: 1, MEMBER: 2 }

function roleRank(role: string): number {
  return ROLE_RANK[role] ?? 99
}

/**
 * Collapse connection-level presence entries into one entry per user,
 * keeping the highest-privilege role seen for that user. Order of first
 * appearance is preserved for stable rendering.
 */
export function dedupePresenceByUser(entries: PresenceEntry[]): PresenceEntry[] {
  const byUser = new Map<string, PresenceEntry>()
  for (const entry of entries) {
    if (!entry.userId) continue
    const existing = byUser.get(entry.userId)
    if (!existing) {
      byUser.set(entry.userId, entry)
    } else if (roleRank(entry.role) < roleRank(existing.role)) {
      byUser.set(entry.userId, entry)
    }
  }
  return Array.from(byUser.values())
}

/**
 * After a socket for `userId` closed in a room, determine whether that user
 * is still represented by another live connection in the room. Used to avoid
 * announcing a departure (and removing the participant) while the user still
 * has an active connection.
 */
export function userHasOtherConnection(
  remainingEntries: PresenceEntry[],
  userId: string | undefined
): boolean {
  if (!userId) return false
  return remainingEntries.some((entry) => entry.userId === userId)
}
