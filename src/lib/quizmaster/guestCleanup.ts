/**
 * Deletes stale guest (anonymous) accounts from Firebase Auth.
 * Port of quizmaster `tool/cleanup_guests.py`.
 *
 * Every first launch and every logout starts an anonymous guest session.
 * Guests left by uninstalls, cleared app data or players who never come back
 * stay in Firebase Auth forever; this removes those, never a guest that is
 * still in use. A user is a guest when it has no sign-in provider, no email
 * and no phone. A guest is stale when its newest activity is older than
 * `days` (at least 30): the newest of its creation time, its last sign-in
 * and its last token refresh (the app refreshes the token on every launch).
 *
 * Python listed every user then deleted in batches of 1000. Here one unit
 * handles one page of up to 1000 users (`listUsers(1000, pageToken)`), so a
 * big project is cleaned over several ticks.
 */
import "server-only";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_DAYS = 30;
export const MIN_DAYS = 30;
export const DELETE_BATCH = 1000; // auth.deleteUsers limit
export const PAGE_SIZE = 1000;

/** The fields of a firebase-admin `UserRecord` the rules read. */
export interface GuestUser {
  uid: string;
  providerData: unknown[];
  email?: string | null;
  phoneNumber?: string | null;
  /** Milliseconds, or null/undefined when Auth has none. */
  createdMs?: number | null;
  lastSignInMs?: number | null;
  lastRefreshMs?: number | null;
}

export interface CleanupCounts {
  scanned: number;
  guests: number;
  stale: number;
  deleted: number;
  failed: number;
}

export const emptyCounts = (): CleanupCounts => ({ scanned: 0, guests: 0, stale: 0, deleted: 0, failed: 0 });

/** True for an anonymous account (no provider, email or phone). */
export function isGuest(user: GuestUser): boolean {
  return !user.providerData.length && !user.email && !user.phoneNumber;
}

/** Newest of creation, last sign-in and last token refresh (ms), or 0. */
export function lastActiveMs(user: GuestUser): number {
  const times = [user.createdMs, user.lastSignInMs, user.lastRefreshMs].filter((t): t is number => Boolean(t));
  return times.length ? Math.max(...times) : 0;
}

/** A guest that hasn't been active for `days` days. */
export function isStaleGuest(user: GuestUser, nowMs: number, days = DEFAULT_DAYS): boolean {
  if (!isGuest(user)) return false;
  const last = lastActiveMs(user);
  return last > 0 && nowMs - last > days * DAY_MS;
}

/** The server-side floor: never fewer than 30 days. */
export function checkDays(days: number): number {
  if (!Number.isInteger(days) || days < MIN_DAYS) {
    throw new Error(`days must be at least ${MIN_DAYS} (never remove recently active guests)`);
  }
  return days;
}

export type DeleteFn = (uids: string[]) => Promise<{ successCount: number; failureCount: number }>;

/** Deletes the stale guests among `users` with `remove`, adding to `counts`. */
export async function cleanUsers(
  users: Iterable<GuestUser>,
  remove: DeleteFn,
  nowMs: number,
  counts: CleanupCounts,
  opts: { days?: number; dryRun?: boolean } = {}
): Promise<CleanupCounts> {
  const days = checkDays(opts.days ?? DEFAULT_DAYS);
  let batch: string[] = [];
  const flush = async () => {
    if (!batch.length) return;
    if (!opts.dryRun) {
      const result = await remove([...batch]);
      counts.deleted += result.successCount;
      counts.failed += result.failureCount;
    }
    batch = [];
  };
  for (const user of users) {
    counts.scanned += 1;
    if (!isGuest(user)) continue;
    counts.guests += 1;
    if (!isStaleGuest(user, nowMs, days)) continue;
    counts.stale += 1;
    batch.push(user.uid);
    if (batch.length === DELETE_BATCH) await flush();
  }
  await flush();
  return counts;
}

/** What one paged unit needs from Firebase Auth. */
export interface UserAdmin {
  listUsers(maxResults: number, pageToken?: string): Promise<{ users: GuestUser[]; pageToken?: string }>;
  deleteUsers: DeleteFn;
}

export interface CleanupState {
  days: number;
  dryRun: boolean;
  pageToken?: string;
  pages: number;
  done: boolean;
  counts: CleanupCounts;
}

export const startCleanup = (days: number, dryRun: boolean): CleanupState => ({
  days: checkDays(days),
  dryRun,
  pages: 0,
  done: false,
  counts: emptyCounts(),
});

/** One page of users. */
export async function cleanupPage(
  admin: UserAdmin,
  state: CleanupState,
  nowMs: number,
  log: (line: string) => void = () => {}
): Promise<CleanupState> {
  const s: CleanupState = JSON.parse(JSON.stringify(state));
  const page = await admin.listUsers(PAGE_SIZE, s.pageToken);
  const before = { ...s.counts };
  await cleanUsers(page.users, admin.deleteUsers, nowMs, s.counts, { days: s.days, dryRun: s.dryRun });
  s.pages += 1;
  s.pageToken = page.pageToken;
  s.done = !page.pageToken;
  log(
    `page ${s.pages}: ${s.counts.scanned - before.scanned} users, ${s.counts.guests - before.guests} guests, ` +
      `${s.counts.stale - before.stale} stale, ${s.counts.deleted - before.deleted} deleted` +
      (s.counts.failed - before.failed ? `, ${s.counts.failed - before.failed} failed` : "")
  );
  if (s.done) {
    const c = s.counts;
    log(
      `Guest cleanup: inactive for more than ${s.days} days${s.dryRun ? " (dry run, nothing deleted)" : ""}: ` +
        `scanned ${c.scanned}, guests ${c.guests}, stale ${c.stale}, deleted ${c.deleted}, failed ${c.failed}`
    );
    if (c.failed) log(`warning: ${c.failed} guest(s) could not be deleted`);
  }
  return s;
}
