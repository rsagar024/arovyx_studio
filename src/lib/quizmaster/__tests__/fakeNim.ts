/**
 * A stand-in for the three NIM models, shared by the job tests (port of
 * quizmaster `automation/tests/fake_nim.py`). The generator writes numbered
 * questions; the verifier knows the right answers unless told otherwise;
 * the translators reply in Hindi and Hinglish.
 */
import type { ChatMessage, ChatOptions, Models, Nim } from "../nimClient";

export const MODELS: Models = { generate: "gen", verify: "ver", translate: "tr" };
export const OPTIONS = ["Alpha", "Bravo", "Charlie", "Delta"];
export const HI_OPTIONS = ["अल्फा", "ब्रावो", "चार्ली", "डेल्टा"];

type Item = Record<string, unknown>;

export class FakeNim implements Nim {
  n = 0;
  truth: Record<string, string> = {};
  calls: string[] = [];
  verifierWrong: (question: string) => boolean = () => false;
  /** Reply '' to this verify call. */
  verifierEmpty: (batchSize: number) => boolean = () => false;
  /** Returned first by the next generate. */
  extraItems: Item[] = [];
  /** Replies to spoil. */
  badTranslations: Record<"hi" | "hi-Latn", number> = { hi: 0, "hi-Latn": 0 };
  /** The push texts, or an error to throw. */
  notifyReply: string | Error = "{}";
  notifyPayloads: Array<Record<string, unknown>> = [];

  async chat(messages: ChatMessage[], opts: ChatOptions): Promise<string> {
    this.calls.push(opts.model);
    const system = messages[0]!.content;
    const payload = JSON.parse(messages[messages.length - 1]!.content);
    if (system.includes("push notification")) {
      this.notifyPayloads.push(payload);
      if (this.notifyReply instanceof Error) throw this.notifyReply;
      return this.notifyReply;
    }
    if (opts.model === "gen") return this.generate(payload);
    if (opts.model === "ver") return this.verify(payload);
    return this.translate(system.includes("Hinglish") ? "hi-Latn" : "hi", payload);
  }

  private generate(payload: { difficulty: string; count: number }) {
    const items = this.extraItems;
    this.extraItems = [];
    while (items.length < payload.count) {
      this.n += 1;
      items.push({
        question: `${payload.difficulty} question number ${this.n}?`,
        options: OPTIONS,
        correctIndex: this.n % 4,
        explanation: `Because of fact ${this.n}.`,
        subcategory: "trivia",
        tags: ["test"],
      });
    }
    for (const item of items) {
      if (Array.isArray(item.options) && typeof item.correctIndex === "number") {
        this.truth[item.question as string] = (item.options as string[])[item.correctIndex]!;
      }
    }
    return "Here you go:\n```json\n" + JSON.stringify({ questions: items }) + "\n```";
  }

  private verify(payload: { questions: Array<{ id: string; question: string; options: Record<string, string> }> }) {
    if (this.verifierEmpty(payload.questions.length)) return "";
    const answers = payload.questions.map((q) => {
      const right = Object.entries(q.options).find(([, v]) => v === this.truth[q.question])![0];
      const wrong = [..."ABCD"].find((k) => k !== right)!;
      return { id: q.id, answer: this.verifierWrong(q.question) ? wrong : right };
    });
    return JSON.stringify({ answers });
  }

  private translate(lang: "hi" | "hi-Latn", payload: { questions: Array<{ id: string; question: string; options: string[] }> }) {
    const spoil = this.badTranslations[lang] > 0;
    this.badTranslations[lang] -= 1;
    const out = payload.questions.map((q) => {
      let v: Item;
      if (lang === "hi" && !spoil) v = { question: "यह एक सवाल है?", options: HI_OPTIONS, explanation: "यही सही है।" };
      else if (lang === "hi") v = { question: "Yeh sawaal hai?", options: OPTIONS, explanation: "Yahi sahi hai." };
      else if (!spoil) v = { question: `${q.question} kya hai?`, options: q.options, explanation: "Yahi sahi hai." };
      else v = { question: "यह सवाल?", options: q.options, explanation: "सही" };
      return { id: q.id, ...v };
    });
    return JSON.stringify({ questions: out });
  }
}

/** Collects pushes like the Python tests' FakeMessenger. */
export class FakeMessenger {
  sent: Array<Record<string, unknown> & { topic: string; title: string; body: string; ttl: number; tag: string; data: Record<string, string>; channel: string }> = [];
  dryRuns: boolean[] = [];
  constructor(public fail = new Set<string>(), private prefix = "projects/x/messages/") {}
  async send(message: { topic: string; title: string; body: string; ttl: number; tag: string; data: Record<string, string>; channel: string }, opts: { dryRun?: boolean } = {}) {
    if (this.fail.has(message.topic)) throw new Error("FCM unavailable");
    this.sent.push(message);
    this.dryRuns.push(Boolean(opts.dryRun));
    return `${this.prefix}${this.sent.length}`;
  }
}
