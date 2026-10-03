import { describe, expect, it } from "vitest";
import {
  DEFAULTS,
  OPS,
  Run,
  challengeHash,
  configKey,
  generator,
  readChallenge,
  remaining,
  reviewProblems,
  summary,
  validSettings,
  type Settings,
} from "../src/engine";
import {
  mergeSessions,
  parseData,
  saveData,
  validSession,
} from "../src/storage";
const settings = (change: Partial<Settings> = {}): Settings => ({
  ...structuredClone(DEFAULTS),
  ...change,
});
const solve = (run: Run, time: number) => {
  for (const c of String(run.problem.answer)) run.key(c, time);
};
describe("deterministic generator", () => {
  it("replays the same seed and canonicalizes operation order", () => {
    const a = generator(settings(), 42),
      b = generator(settings({ ops: [...OPS].reverse() }), 42);
    for (let i = 0; i < 200; i++) expect(a()).toEqual(b());
  });
  it.each(OPS)("generates valid %s problems with inverse ranges", (op) => {
    const next = generator(settings({ ops: [op] }), 9);
    for (let i = 0; i < 1000; i++) {
      const p = next();
      expect(Number.isInteger(p.answer)).toBe(true);
      expect(p.answer).toBeGreaterThanOrEqual(0);
      if (op === "+") {
        expect(p.a).toBeGreaterThanOrEqual(2);
        expect(p.a).toBeLessThanOrEqual(100);
        expect(p.answer).toBe(p.a + p.b);
      }
      if (op === "−") {
        expect(p.answer).toBeGreaterThanOrEqual(2);
        expect(p.answer).toBeLessThanOrEqual(100);
        expect(p.answer).toBe(p.a - p.b);
      }
      if (op === "×") {
        expect(p.a).toBeLessThanOrEqual(12);
        expect(p.b).toBeLessThanOrEqual(100);
        expect(p.answer).toBe(p.a * p.b);
      }
      if (op === "÷") {
        expect(p.b).toBeGreaterThan(0);
        expect(p.a % p.b).toBe(0);
        expect(p.answer).toBeLessThanOrEqual(12);
      }
    }
  });
  it("rejects invalid ranges and missing or repeated operations", () => {
    for (const s of [
      settings({ ops: [] }),
      settings({ ops: ["+", "+"] }),
      settings({
        add: [
          [0, 9],
          [2, 5],
        ],
      }),
      settings({
        multiply: [
          [8, 3],
          [1, 3],
        ],
      }),
      settings({ duration: 1 }),
    ]) {
      expect(validSettings(s)).toBe(false);
      expect(() => generator(s, 1)).toThrow();
    }
  });
  it("compares canonical configurations but separates duration and ranges", () => {
    expect(configKey(settings())).toBe(
      configKey(settings({ ops: [...OPS].reverse() })),
    );
    expect(configKey(settings())).not.toBe(
      configKey(settings({ duration: 60 })),
    );
  });
});
describe("run state", () => {
  it("accepts only a full answer, clears and skips synchronously", () => {
    const run = new Run(
      settings({
        ops: ["+"],
        add: [
          [12, 12],
          [12, 12],
        ],
      }),
      1,
      1000,
    );
    run.key("2", 1100);
    expect(run.score).toBe(0);
    run.key("Backspace", 1200);
    expect(run.input).toBe("");
    run.key("8", 1250);
    run.key("Escape", 1300);
    expect(run.input).toBe("");
    solve(run, 1500);
    expect(run.score).toBe(1);
    expect(run.input).toBe("");
    run.advance(1800, true);
    expect(run.score).toBe(1);
    expect(run.attempts).toHaveLength(2);
    expect(run.attempts[0].ms).toBe(500);
  });
  it("handles rapid sequences without duplicating the previous answer", () => {
    const run = new Run(
      settings({
        ops: ["+"],
        add: [
          [1, 1],
          [1, 1],
        ],
      }),
      1,
      0,
    );
    for (let i = 0; i < 20; i++) run.key("2", i + 1);
    expect(run.score).toBe(20);
    expect(run.attempts).toHaveLength(20);
  });
  it("rejects a correct answer exactly at the deadline and caps elapsed time", () => {
    const run = new Run(settings({ duration: 30 }), 1, 0);
    solve(run, 30000);
    expect(run.score).toBe(0);
    expect(run.done).toBe(true);
    expect(run.result(40000, true).elapsedMs).toBe(30000);
    expect(remaining(30000, 40000)).toBe(0);
  });
  it("counts time in the background for timed games", () => {
    const run = new Run(settings({ duration: 30 }), 1, 0);
    run.pause(1000);
    expect(run.pausedAt).toBe(null);
    expect(run.expired(31000)).toBe(true);
  });
  it("excludes background time and input from practice", () => {
    const run = new Run(settings({ mode: "practice" }), 1, 1000);
    run.pause(2000);
    solve(run, 3000);
    expect(run.score).toBe(0);
    run.resume(10000);
    solve(run, 11000);
    expect(run.elapsed(11000)).toBe(2000);
    expect(run.attempts[0].ms).toBe(2000);
  });
  it("replays review problems, excludes pauses, and completes exactly once", () => {
    const r = new Run(settings(), 1, 0, [{ a: 1, b: 1, op: "+", answer: 2 }]);
    r.pause(100);
    r.resume(500);
    r.key("2", 600);
    r.key("2", 700);
    expect(r.done).toBe(true);
    expect(r.score).toBe(1);
    expect(r.result(600, true).kind).toBe("review");
    expect(r.result(600, true).elapsedMs).toBe(200);
  });
});
describe("analysis and public formats", () => {
  it("calculates metrics and includes skips in review", () => {
    const run = new Run(settings({ mode: "practice" }), 1, 0);
    solve(run, 1000);
    solve(run, 4000);
    run.advance(6000, true);
    const s = run.result(6000, true);
    expect(summary(s)).toEqual({
      mean: 2000,
      median: 2000,
      rate: 20,
      skipped: 1,
    });
    expect(reviewProblems(s)).toHaveLength(3);
    expect(reviewProblems(s)[0]).toEqual(s.attempts[2].problem);
  });
  it("roundtrips challenge links and rejects future versions", () => {
    const hash = challengeHash(settings(), 123);
    expect(readChallenge(hash)).toEqual({ settings: settings(), seed: 123 });
    expect(() =>
      readChallenge(
        "#challenge=" +
          encodeURIComponent(
            JSON.stringify({ v: 2, g: 1, settings: settings(), seed: 123 }),
          ),
      ),
    ).toThrow();
    expect(() => readChallenge("#challenge=%XX")).toThrow();
  });
  it("validates backups, merges by ID, and caps records", () => {
    const run = new Run(settings(), 1, 0);
    solve(run, 1000);
    const s = run.result(3000, false);
    expect(validSession(s)).toBe(true);
    const data = { v: 1, settings: settings(), sessions: [s] };
    expect(parseData(JSON.stringify(data))).toEqual(data);
    expect(mergeSessions([s], [s])).toHaveLength(1);
    expect(
      mergeSessions(
        Array.from({ length: 510 }, (_, i) => ({ ...s, id: String(i) })),
        [],
      ),
    ).toHaveLength(500);
    expect(() => parseData(JSON.stringify({ ...data, v: 2 }))).toThrow();
    expect(validSession({ ...s, score: 9 })).toBe(false);
    expect(
      validSession({
        ...s,
        attempts: [
          { ...s.attempts[0], problem: { a: 1, b: 0, op: "÷", answer: 1 } },
        ],
      }),
    ).toBe(false);
    expect(validSession({ ...s, elapsedMs: -1 })).toBe(false);
  });
  it("reports storage quota failures to the caller", () => {
    const previous = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    });
    expect(() =>
      saveData({ v: 1, settings: settings(), sessions: [] }),
    ).toThrow("QuotaExceededError");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previous,
    });
  });
});
