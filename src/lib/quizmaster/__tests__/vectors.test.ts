/**
 * Golden vectors made by running the original Python automation
 * (`python -I make_vectors.py` on the exported quizmaster sources, Python
 * 3.14; see vectors.json `python`). They pin the parts that must stay
 * bit-for-bit compatible with what the Python jobs wrote.
 */
import { describe, expect, it } from "vitest";
import vectors from "./vectors.json";
import { PyRandom } from "../pyRandom";
import { pyDumps } from "../pyJson";
import { decode, encode, md5, MemoryBankStore, makeDoc, appendBatch } from "../questionBank";
import { dedupHash, normalize } from "../questionChecks";
import * as ist from "../ist";
import { chooseDaily } from "../dailyQuiz";
import { leaks } from "../dailyNotify";
import { seedBank, type Group } from "../assets";

describe("CPython random.Random port", () => {
  it("getrandbits(32) after seeding with a string", () => {
    const r = new PyRandom("2026-10-16");
    expect(Array.from({ length: 8 }, () => r.getrandbits(32))).toEqual(vectors.getrandbits32);
  });

  it("shuffle sequences match for every seed", () => {
    for (const [seed, seqs] of Object.entries(vectors.shuffles)) {
      const r = new PyRandom(seed);
      for (const expected of seqs as number[][]) {
        const list = Array.from({ length: expected.length }, (_, i) => i);
        r.shuffle(list);
        expect(list).toEqual(expected);
      }
    }
  });

  it("state survives a JSON round trip mid-sequence", () => {
    const a = new PyRandom("2026-10-16/am/science");
    const order = [0, 1, 2, 3];
    a.shuffle(order);
    const b = new PyRandom(JSON.parse(JSON.stringify(a.getState())));
    const x = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const y = [...x];
    a.shuffle(x);
    b.shuffle(y);
    expect(y).toEqual(x);
  });
});

describe("packed question docs", () => {
  it("json.dumps(ensure_ascii=False) is reproduced exactly", () => {
    const body = { category: "science", period: "base", questions: vectors.encode.groups };
    expect(pyDumps(body)).toBe(vectors.encode.json);
  });

  it("gzip bytes and md5 match the Python output", () => {
    const data = encode("science", "base", vectors.encode.groups as unknown as Group[]);
    expect(data.subarray(0, 10).toString("hex")).toBe(vectors.encode.gzip_header_hex);
    expect(data.subarray(-8).toString("hex")).toBe(vectors.encode.trailer_hex);
    expect(data.length).toBe(vectors.encode.len);
    expect(md5(data)).toBe(vectors.encode.md5);
    expect(decode(data).questions).toEqual(vectors.encode.groups);
  });

  it("the real seed bank packs to the same bytes as stock zlib (the GitHub runners)", () => {
    const data = encode("science", "base", seedBank().science!);
    expect(data.length).toBe(vectors.encode_seed_science.stock_zlib_len);
    expect(md5(data)).toBe(vectors.encode_seed_science.stock_zlib_md5);
  });
});

describe("dedup hash", () => {
  it("normalize and dedup_hash match Python for unicode text", () => {
    for (const c of vectors.dedup) {
      expect(normalize(c.q), c.q).toBe(c.nq);
      expect(normalize(c.a), c.a).toBe(c.na);
      expect(dedupHash(c.q, c.a)).toBe(c.hash);
    }
  });
});

describe("IST calendar", () => {
  it("day numbers, ISO weeks and weekdays", () => {
    for (const c of vectors.ist) {
      const day = ist.fromKey(c.date);
      expect(ist.dayNumber(day), c.date).toBe(c.day_number);
      expect(ist.isoWeekKey(day), c.date).toBe(c.iso_week);
      expect(ist.previousIsoWeekKey(day), c.date).toBe(c.prev_week);
      expect(ist.wallClock(day).weekday, c.date).toBe(c.weekday);
    }
  });
});

describe("daily quiz pick", () => {
  it("choose_daily picks the same groups as Python for the same date", async () => {
    const store = new MemoryBankStore();
    const groups = vectors.choose_daily.groups as unknown as Group[];
    // Rebuild the fixture exactly as the Python script did: base, then each day's batch.
    const base = groups.filter((g) => !g.addedOn);
    await store.put(makeDoc("base_science", "science", "base", base));
    for (const date of ["2026-10-16", "2026-10-15", "2026-10-01"]) {
      await appendBatch(store, "science", date, "am", groups.filter((g) => g.addedOn === date));
    }
    const { groups: picked, older } = await chooseDaily(
      store,
      "science",
      "2026-10-16",
      new Set(vectors.choose_daily.used),
      new PyRandom("2026-10-16"),
      () => {}
    );
    expect(picked.map((g) => g.groupId)).toEqual(vectors.choose_daily.ids);
    expect(older).toBe(vectors.choose_daily.older);
  });
});

describe("answer leak check", () => {
  it("matches Python's Devanagari-aware whole-word search", () => {
    for (const c of vectors.leaks) expect(leaks(c.text, c.answers), c.text).toEqual(c.found);
  });
});
