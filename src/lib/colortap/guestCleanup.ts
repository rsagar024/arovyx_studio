/**
 * The rules for deleting stale guest (anonymous) accounts from Color Tap's
 * Firebase Auth. Port of color_tap `tool/cleanup_guests.py`.
 *
 * Every first launch and every logout starts an anonymous guest session. The
 * game deletes the guest itself when a login replaces it, but guests left by
 * uninstalls, cleared app data or players who never come back stay in Firebase
 * Auth forever. This removes those, never a guest that is still in use.
 *
 * A user is a guest when it has no sign-in provider, no email and no phone. A
 * guest is stale when its newest activity is older than `days`: the newest of
 * its creation time, its last sign-in and its last token refresh. The refresh
 * is what keeps an active guest: for anonymous users the last sign-in is set
 * only once, but the game refreshes the token on every launch. Guests own no
 * Firestore data (rules limit it to registered accounts), so only the Auth
 * record is deleted.
 */
import "server-only";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_DAYS = 90;
export const MIN_DAYS = 30;
/** Also the limit of one `auth.deleteUsers` call. */
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
  return Math.max(0, user.createdMs ?? 0, user.lastSignInMs ?? 0, user.lastRefreshMs ?? 0);
}

/** A guest that hasn't been active for `days` days. No timestamps at all keeps it. */
export function isStaleGuest(user: GuestUser, nowMs: number, days: number): boolean {
  if (!isGuest(user)) return false;
  const last = lastActiveMs(user);
  return last > 0 && nowMs - last > days * DAY_MS;
}

export function validDays(days: number): boolean {
  return Number.isInteger(days) && days >= MIN_DAYS;
}

/** What a run needs from Firebase Auth. */
export interface UserAdmin {
  listUsers(maxResults: number, pageToken?: string): Promise<{ users: GuestUser[]; pageToken?: string }>;
  deleteUsers(uids: string[]): Promise<{ successCount: number; failureCount: number }>;
}

/** A run's progress, saved after every page. */
export interface CleanupState {
  pageToken?: string;
  pages: number;
  done: boolean;
  counts: CleanupCounts;
}

export const startState = (): CleanupState => ({ pages: 0, done: false, counts: emptyCounts() });

/** Handles one page of users, returning the new state. */
export async function cleanupPage(
  admin: UserAdmin,
  state: CleanupState,
  opts: { days: number; dryRun: boolean; nowMs: number; log?: (line: string) => void }
): Promise<CleanupState> {
  if (!validDays(opts.days)) {
    throw new Error(`days must be at least ${MIN_DAYS} (never remove recently active guests)`);
  }
  const page = await admin.listUsers(PAGE_SIZE, state.pageToken);
  const guests = page.users.filter(isGuest);
  const stale = guests.filter((u) => isStaleGuest(u, opts.nowMs, opts.days)).map((u) => u.uid);
  const result =
    stale.length && !opts.dryRun ? await admin.deleteUsers(stale) : { successCount: 0, failureCount: 0 };

  const counts: CleanupCounts = {
    scanned: state.counts.scanned + page.users.length,
    guests: state.counts.guests + guests.length,
    stale: state.counts.stale + stale.length,
    deleted: state.counts.deleted + result.successCount,
    failed: state.counts.failed + result.failureCount,
  };
  const next: CleanupState = { pageToken: page.pageToken, pages: state.pages + 1, done: !page.pageToken, counts };

  const log = opts.log ?? (() => {});
  log(
    `page ${next.pages}: ${page.users.length} users, ${guests.length} guests, ${stale.length} stale, ` +
      `${result.successCount} deleted` +
      (result.failureCount ? `, ${result.failureCount} failed` : "")
  );
  if (next.done) {
    log(
      `Inactive for more than ${opts.days} days${opts.dryRun ? " (dry run, nothing deleted)" : ""}: ` +
        `scanned ${counts.scanned}, guests ${counts.guests}, stale ${counts.stale}, ` +
        `deleted ${counts.deleted}, failed ${counts.failed}`
    );
    if (counts.failed) log(`warning: ${counts.failed} guest(s) could not be deleted`);
  }
  return next;
}
