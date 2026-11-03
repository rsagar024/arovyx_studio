/**
 * FCM messages as plain data, so tests and dry runs see exactly what would go
 * out. Port of quizmaster `automation/common/messenger.py`:
 *
 *     {topic, title, body, data: {...}, channel, tag, ttl: seconds}
 *
 * The Firebase sender lives in `firebase.ts`.
 */
import "server-only";
import { pyDumps } from "./pyJson";

export interface PushMessage {
  topic: string;
  title: string;
  body: string;
  data: Record<string, string>;
  channel: string;
  tag: string;
  /** Seconds. */
  ttl: number;
}

export interface Messenger {
  /** Sends `message` and returns FCM's message id. A dry run validates the
   * message with FCM but delivers nothing. */
  send(message: PushMessage, opts?: { dryRun?: boolean }): Promise<string>;
}

/** For a dry run with no Firebase key: logs the message. */
export class PrintMessenger implements Messenger {
  constructor(private log: (line: string) => void) {}
  async send(message: PushMessage) {
    this.log(`[dry-run] send ${pyDumps(message)}`);
    return "dry-run";
  }
}

/** The FCM v1 message the Python `FcmMessenger` built, for firebase-admin. */
export function toFcm(message: PushMessage) {
  return {
    topic: message.topic,
    notification: { title: message.title, body: message.body },
    data: message.data,
    android: {
      priority: "high" as const,
      // firebase-admin for Node takes the TTL in milliseconds.
      ttl: message.ttl * 1000,
      notification: { channelId: message.channel, tag: message.tag },
    },
  };
}

export class SendFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SendFailed";
  }
}
