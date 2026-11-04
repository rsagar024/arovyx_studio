/**
 * Ports of quizmaster `automation/tests/test_categories.py`, `test_ist.py`,
 * `test_question_checks.py` and `test_templates.py`.
 */
import { describe, expect, it } from "vitest";
import { notificationTemplates, type Lang } from "../assets";
import { ALL_CATEGORIES, FREE_CATEGORIES, categoryFor, categoryName } from "../categories";
import * as ist from "../ist";
import { extractJson } from "../jsonExtract";
import { dedupHash, validateEn, validateVariant } from "../questionChecks";
import { emojiCount, hasDevanagari, hasUrl, isMostlyDevanagari } from "../textChecks";
import { pyLen } from "../pyText";

const at = (iso: string) => new Date(iso);

/* --- test_categories.py ---------------------------------------------------- */

describe("categories", () => {
  // The Python tests read the app's lib/core/constants/category_config.dart,
  // which isn't in this repo. These lists and their order MUST match
  // `Categories.free` and `Categories.all` in that file of the quizmaster app:
  // the daily quiz rotation depends on it.
  it("the free rotation is pinned (must match category_config.dart Categories.free)", () => {
    expect([...FREE_CATEGORIES]).toEqual(["general_knowledge", "bollywood", "cricket", "science", "indian_culture"]);
  });

  it("all categories are pinned (must match category_config.dart Categories.all)", () => {
    expect([...ALL_CATEGORIES]).toEqual([
      "general_knowledge",
      "bollywood",
      "cricket",
      "science",
      "history",
      "geography",
      "technology",
      "indian_culture",
      "space",
    ]);
  });

  it("category_for rotates by IST day", () => {
    // 18:30 UTC is already the next day in IST.
    const before = new Date(Date.UTC(2026, 9, 15, 18, 29));
    const after = new Date(Date.UTC(2026, 9, 15, 18, 30));
    expect(ist.dayNumber(after)).toBe(ist.dayNumber(before) + 1);
    expect(categoryFor(ist.dayNumber(after))).not.toBe(categoryFor(ist.dayNumber(before)));
    const days = Array.from({ length: FREE_CATEGORIES.length }, (_, i) => categoryFor(16 + i));
    expect([...days].sort()).toEqual([...FREE_CATEGORIES].sort());
  });

  it("names", () => {
    expect(categoryName("indian_culture")).toBe("Indian Culture");
    expect(categoryName("cricket", "hi")).toBe("क्रिकेट");
  });
});

/* --- test_ist.py ----------------------------------------------------------- */

describe("IST", () => {
  it("the date flips at midnight IST, not UTC", () => {
    const before = at("2026-10-13T23:59:00+05:30");
    const after = at("2026-10-14T00:01:00+05:30");
    expect(ist.dateKey(before)).toBe("2026-10-13");
    expect(ist.dateKey(after)).toBe("2026-10-14");
    expect(ist.nextMidnight(before)).toEqual(at("2026-10-14T00:00:00+05:30"));
  });

  it("UTC server time maps to the IST date", () => {
    expect(ist.dateKey(at("2026-10-15T01:30:00+00:00"))).toBe("2026-10-15");
    expect(ist.dateKey(at("2026-10-15T20:00:00+00:00"))).toBe("2026-10-16");
  });

  it("at_time and the noon cutoff", () => {
    const instant = at("2026-10-15T03:30:00+00:00"); // 09:00 IST
    const noon = ist.atTime(instant, 12);
    expect(noon).toEqual(at("2026-10-15T12:00:00+05:30"));
    expect(instant.getTime()).toBeLessThan(noon.getTime());
  });

  it("day_number matches the app rotation", () => {
    const instant = at("2026-10-13T10:00:00+05:30");
    const expected = Math.floor(Date.UTC(2026, 9, 13) / 86_400_000);
    expect(ist.dayNumber(instant)).toBe(expected);
    expect(ist.dayNumber(new Date(instant.getTime() + 86_400_000))).toBe(expected + 1);
    // 23:00 UTC on the 12th is already the 13th in IST.
    expect(ist.dayNumber(at("2026-10-12T23:00:00+00:00"))).toBe(expected);
  });

  it("ISO week keys", () => {
    expect(ist.isoWeekKey(at("2026-10-14T10:00:00+05:30"))).toBe("2026-W42");
    // Monday 00:00 IST starts the next week even though UTC is still Sunday.
    expect(ist.isoWeekKey(at("2026-10-18T18:29:00+00:00"))).toBe("2026-W42");
    expect(ist.isoWeekKey(at("2026-10-18T18:30:00+00:00"))).toBe("2026-W43");
    // Year boundaries: ISO years follow the week's Thursday.
    expect(ist.isoWeekKey(at("2026-01-01T12:00:00+05:30"))).toBe("2026-W01");
    expect(ist.isoWeekKey(at("2027-01-01T12:00:00+05:30"))).toBe("2026-W53");
    expect(ist.isoWeekKey(at("2024-12-30T12:00:00+05:30"))).toBe("2025-W01");
  });

  it("date_key_days_ago and from_key", () => {
    const instant = at("2026-10-01T09:00:00+05:30");
    expect(ist.dateKeyDaysAgo(instant, 1)).toBe("2026-09-30");
    expect(ist.fromKey("2026-10-15")).toEqual(at("2026-10-15T00:00:00+05:30"));
    expect(() => ist.fromKey("2026-02-30")).toThrow();
  });
});

/* --- test_question_checks.py ------------------------------------------------- */

const GOOD = {
  difficulty: "easy",
  correctIndex: 2,
  en: {
    question: "In the 1983 World Cup final, which team did India defeat?",
    options: ["England", "Australia", "West Indies", "Pakistan"],
    explanation: "India defended 183 at Lord's to beat West Indies by 43 runs.",
  },
};
const HI = {
  question: "1983 वर्ल्ड कप फाइनल में भारत ने किस टीम को हराया था?",
  options: ["इंग्लैंड", "ऑस्ट्रेलिया", "वेस्टइंडीज", "पाकिस्तान"],
  explanation: "भारत ने लॉर्ड्स में 183 रन का बचाव करते हुए वेस्टइंडीज को 43 रन से हराया था।",
};
const HI_LATN = {
  question: "1983 World Cup final mein India ne kis team ko haraya tha?",
  options: ["England", "Australia", "West Indies", "Pakistan"],
  explanation: "India ne Lord's mein 183 runs defend karke West Indies ko 43 runs se haraya.",
};

function broken(path: string[], value: unknown) {
  const group = JSON.parse(JSON.stringify(GOOD));
  let target = group;
  for (const p of path.slice(0, -1)) target = target[p];
  target[path[path.length - 1]!] = value;
  return group;
}

describe("question checks", () => {
  it("a good question passes", () => {
    expect(validateEn(GOOD)).toEqual([]);
    expect(validateVariant("hi", HI, GOOD.en)).toEqual([]);
    expect(validateVariant("hi-Latn", HI_LATN, GOOD.en)).toEqual([]);
  });

  it.each<[string[], unknown]>([
    [["difficulty"], "expert"],
    [["correctIndex"], 4],
    [["correctIndex"], true],
    [["correctIndex"], "2"],
    [["en", "options"], ["A", "B", "C"]],
    [["en", "options"], ["Delhi", "delhi ", "Mumbai", "Pune"]],
    [["en", "options"], ["Delhi", "Mumbai", "Pune", "All of the above"]],
    [["en", "options"], ["Delhi", "Mumbai", "Pune", ""]],
    [["en", "options"], ["Delhi", "Mumbai", "Pune", "x".repeat(81)]],
    [["en", "question"], "  "],
    [["en", "question"], "Why? ".repeat(41)],
    [["en", "explanation"], ""],
    [["en", "explanation"], "See https://example.com for more."],
    [["en", "question"], "Which city is दिल्ली?"],
    [["en"], null],
  ])("bad English is rejected: %j = %j", (path, value) => {
    expect(validateEn(broken(path, value)).length).toBeGreaterThan(0);
  });

  it("variant scripts", () => {
    expect(validateVariant("hi", HI_LATN, GOOD.en).length).toBeGreaterThan(0); // hi must be Devanagari
    const withDevanagari = { ...HI_LATN, options: ["England", "ऑस्ट्रेलिया", "West Indies", "Pakistan"] };
    expect(validateVariant("hi-Latn", withDevanagari, GOOD.en).length).toBeGreaterThan(0); // hi-Latn must have none
  });

  it("variant option numbers must match", () => {
    const en = { ...GOOD.en, options: ["1975", "1983", "1987", "1992"] };
    const same = { ...HI, options: ["1975", "१९८३", "1987", "1992"] };
    expect(validateVariant("hi", same, en)).toEqual([]); // Devanagari digits count as digits
    const swapped = { ...HI, options: ["1983", "1975", "1987", "1992"] };
    expect(validateVariant("hi", swapped, en).length).toBeGreaterThan(0);
  });

  it("the dedup hash ignores case, punctuation and spacing", () => {
    const a = dedupHash("What is the capital of France?", "Paris");
    expect(dedupHash("  what is the CAPITAL of france ", "paris.")).toBe(a);
    expect(dedupHash("What is the capital of France?", "Lyon")).not.toBe(a);
  });

  it("extract_json", () => {
    expect(extractJson('{"a": 1}')).toEqual({ a: 1 });
    expect(extractJson('Sure! Here it is:\n```json\n{"a": [1, 2]}\n```')).toEqual({ a: [1, 2] });
    expect(extractJson('<think>maybe {"a": 0}</think>{"a": 3}')).toEqual({ a: 3 });
    expect(extractJson("text [x] then [1]")).toEqual([1]);
    expect(() => extractJson("no json here")).toThrow();
  });
});

/* --- test_templates.py ----------------------------------------------------- */

const TEMPLATES = notificationTemplates();
const LANGUAGES: Lang[] = ["en", "hi", "hi-Latn"];

function* filled(lang: Lang) {
  for (const template of TEMPLATES.templates[lang]) {
    for (const names of Object.values(TEMPLATES.categories)) {
      yield {
        title: template.title.replaceAll("{category}", names[lang]),
        body: template.body.replaceAll("{category}", names[lang]),
      };
    }
  }
}

describe("push templates", () => {
  it("every app category has names in all languages", () => {
    expect(new Set(Object.keys(TEMPLATES.categories))).toEqual(new Set(ALL_CATEGORIES));
    for (const names of Object.values(TEMPLATES.categories)) expect(new Set(Object.keys(names))).toEqual(new Set(LANGUAGES));
  });

  it.each(LANGUAGES)("ten templates with the category placeholder: %s", (lang) => {
    const templates = TEMPLATES.templates[lang];
    expect(templates.length).toBe(10);
    for (const t of templates) expect(t.title).toContain("{category}");
  });

  it.each(LANGUAGES)("length limits hold for the longest category: %s", (lang) => {
    for (const t of filled(lang)) {
      expect(pyLen(t.title), t.title).toBeLessThanOrEqual(40);
      expect(pyLen(t.body), t.body).toBeLessThanOrEqual(120);
    }
  });

  it.each(LANGUAGES)("one or two emojis and no URLs: %s", (lang) => {
    for (const t of TEMPLATES.templates[lang]) {
      const text = `${t.title} ${t.body}`;
      expect(emojiCount(text), text).toBeGreaterThanOrEqual(1);
      expect(emojiCount(text), text).toBeLessThanOrEqual(2);
      expect(hasUrl(text)).toBe(false);
    }
  });

  it("scripts", () => {
    for (const t of filled("hi")) expect(isMostlyDevanagari(t.title) && isMostlyDevanagari(t.body), t.title).toBe(true);
    for (const lang of ["en", "hi-Latn"] as Lang[]) {
      for (const t of filled(lang)) expect(hasDevanagari(t.title + t.body), t.title).toBe(false);
    }
  });

  it.each(LANGUAGES)("new_questions templates follow the same rules: %s", (lang) => {
    const templates = TEMPLATES.new_questions[lang];
    expect(templates.length).toBeGreaterThanOrEqual(3);
    for (const t of templates) {
      const text = `${t.title} ${t.body}`;
      expect(text).not.toContain("{category}"); // the push covers every category
      expect(pyLen(t.title)).toBeLessThanOrEqual(40);
      expect(pyLen(t.body)).toBeLessThanOrEqual(120);
      expect(emojiCount(text)).toBeGreaterThanOrEqual(1);
      expect(emojiCount(text)).toBeLessThanOrEqual(2);
      expect(hasUrl(text)).toBe(false);
      if (lang === "hi") expect(isMostlyDevanagari(t.title) && isMostlyDevanagari(t.body)).toBe(true);
      else expect(hasDevanagari(text)).toBe(false);
    }
  });

  it("text checks", () => {
    expect(isMostlyDevanagari("आज का क्रिकेट क्विज़ आ गया! 10 सवाल")).toBe(true);
    expect(isMostlyDevanagari("IPL में सबसे ज़्यादा रन किसने बनाए?")).toBe(true); // brand names may stay Latin
    expect(isMostlyDevanagari("Aaj ka Cricket Quiz aa gaya!")).toBe(false);
    expect(isMostlyDevanagari("🪙 100")).toBe(false);
    expect(hasDevanagari("Quiz क्विज़") && !hasDevanagari("Quiz")).toBe(true);
    expect(hasUrl("Play at https://x.co") && hasUrl("visit quizmaster.in")).toBe(true);
    expect(hasUrl("10 questions. 100 coins!")).toBe(false);
  });
});
