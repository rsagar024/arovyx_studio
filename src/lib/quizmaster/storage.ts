/** Quiz Master's storage, in the Quiz Master project's Firestore: the runs repo and the schedule document. */
import "server-only";
import { toRow } from "@/lib/firestore";
import { STUDIO_COL, firestore } from "./firebase";
import { FirestoreRunRepo } from "./repo";
import type { ScheduleDb, ScheduleRow } from "./schedule";

export const repo = new FirestoreRunRepo();

const scheduleRef = () => firestore().collection(STUDIO_COL.config).doc("quizSchedule");

async function read(): Promise<ScheduleRow> {
  return { ...toRow<ScheduleRow>(await scheduleRef().get()), id: 1 };
}

/** The `config/quizSchedule` document behind schedule.ts's small interface. */
export const scheduleDb: ScheduleDb = {
  quizSchedule: {
    async upsert({ create, update }) {
      const ref = scheduleRef();
      await firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const { id: _id, ...fields } = snap.exists ? update : create;
        if (!snap.exists) {
          tx.set(ref, { intervalHours: 12, nextRunAt: null, paused: false, lastCleanupAt: null, ...fields, updatedAt: new Date() });
        } else if (Object.keys(fields).length) {
          tx.update(ref, { ...fields, updatedAt: new Date() });
        }
      });
      return read();
    },
    async update({ data }) {
      const { id: _id, ...fields } = data;
      await scheduleRef().update({ ...fields, updatedAt: new Date() });
      return read();
    },
  },
};
