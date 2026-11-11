/**
 * Builds what a run's units talk to: the bank, the other Firestore docs,
 * FCM, Auth, Remote Config and NIM, real or dry-run.
 *
 * As in Python, a dry run reads the real data and logs every write and push
 * instead of making it (FCM still validates the pushes with `dryRun`). With
 * no Firebase key, a dry run works against an empty bank and prints the
 * pushes; a real run refuses.
 */
import "server-only";
import { seedBank, type Group } from "./assets";
import type { RemoteConfigParameters } from "./dailyNotify";
import {
  FcmMessenger,
  FirebaseNotConfigured,
  FirebaseUserAdmin,
  FirestoreBankStore,
  FirestoreDocStore,
  firebaseConfigured,
  remoteConfigParameters,
} from "./firebase";
import type { UserAdmin } from "./guestCleanup";
import { PrintMessenger, type Messenger } from "./messenger";
import { NimClient, models, type Models, type Nim } from "./nimClient";
import { CachedBankStore, DryRunBankStore, MemoryBankStore, type BankStore } from "./questionBank";
import { DryRunDocStore, MemoryDocStore, type DocStore } from "./writes";

export interface JobDeps {
  bank: BankStore;
  docs: DocStore;
  messenger: Messenger;
  nim: Nim;
  models: Models;
  seed: Record<string, Group[]>;
  /** Null without a Firebase key. */
  users: UserAdmin | null;
  remoteConfig: () => Promise<RemoteConfigParameters | null>;
  /** Bank docs read and written by this tick so far (Firestore only). */
  usage?: () => { reads: number; writes: number };
}

export interface JobContext {
  dryRun: boolean;
  /** Epoch ms by which every model call must be done. */
  deadline: number;
  log: (line: string) => void;
  now?: () => number;
}

export function makeJobDeps(ctx: JobContext): JobDeps {
  const nim = new NimClient({ deadline: ctx.deadline, now: ctx.now ?? Date.now, log: ctx.log });
  const base = { nim, models: models(), seed: seedBank() };
  if (firebaseConfigured()) {
    // One tick reads each bank doc once (see CachedBankStore).
    const bank = new CachedBankStore(new FirestoreBankStore());
    const docs = new FirestoreDocStore();
    return {
      ...base,
      usage: () => ({ reads: bank.reads, writes: bank.writes }),
      bank: ctx.dryRun ? new DryRunBankStore(bank, ctx.log) : bank,
      docs: ctx.dryRun ? new DryRunDocStore(docs, ctx.log) : docs,
      messenger: new FcmMessenger(),
      users: new FirebaseUserAdmin(),
      remoteConfig: remoteConfigParameters,
    };
  }
  if (!ctx.dryRun) throw new FirebaseNotConfigured();
  ctx.log("No Firebase key (QUIZMASTER_FIREBASE_SERVICE_ACCOUNT); dry run against an empty Firestore.");
  return {
    ...base,
    bank: new DryRunBankStore(new MemoryBankStore(), ctx.log),
    docs: new DryRunDocStore(new MemoryDocStore(() => new Date(), () => true), ctx.log),
    messenger: new PrintMessenger(ctx.log),
    users: null,
    remoteConfig: async () => null,
  };
}
