import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS, Run, configKey, type Session } from "../src/engine";
import { filterSessions, operationStats, median } from "../src/analytics";
import {
  DRAFT_PREFIX,
  loadDrafts,
  recoverDrafts,
  saveDraft,
} from "../src/storage";
import { loadPreferences, savePreferences } from "../src/preferences";
function session(id: string, changes: Partial<Session> = {}): Session {
  return {
    id,
    settings: structuredClone(DEFAULTS),
    seed: 1,
    startedAt: new Date(2026, 9, 3, 10).toISOString(),
    elapsedMs: 120000,
    score: 1,
    attempts: [
      { problem: { a: 2, b: 3, op: "+", answer: 5 }, ms: 1000, skipped: false },
    ],
    kind: "timed",
    completed: true,
    ...changes,
  };
}
afterEach(() => vi.unstubAllGlobals());
function mockStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => data.delete(k),
  });
  return data;
}
describe("interrupted game safety", () => {
  it("uses one ID for checkpoints and the final result", () => {
    const run = new Run(structuredClone(DEFAULTS), 1, 0);
    expect(run.result(1000, false).id).toBe(run.result(120000, true).id);
  });
  it("recovers an interrupted game once, never replacing its completed result", () => {
    const draft = session("one", { completed: false, elapsedMs: 1000 });
    expect(recoverDrafts([], [draft])).toEqual({ sessions: [draft], count: 1 });
    expect(recoverDrafts([draft], [draft]).count).toBe(0);
    const completed = session("one");
    expect(recoverDrafts([completed], [draft])).toEqual({
      sessions: [completed],
      count: 0,
    });
  });
  it("keeps the more recent checkpoint under the same ID", () => {
    const old = session("one", { completed: false, elapsedMs: 2000 });
    const next = { ...old, elapsedMs: 3000 };
    expect(recoverDrafts([old], [next])).toEqual({
      sessions: [next],
      count: 1,
    });
  });
  it("isolates drafts and ignores malformed or mismatched payloads", () => {
    const storage = mockStorage();
    saveDraft(session("one"));
    saveDraft(session("two"));
    storage.set(DRAFT_PREFIX + "broken", "not json");
    storage.set(DRAFT_PREFIX + "wrong", JSON.stringify(session("different")));
    expect(loadDrafts().map((s) => s.id)).toEqual(["one", "two"]);
    expect(loadDrafts().every((s) => !s.completed)).toBe(true);
  });
  it("reports quota errors without destroying previously saved drafts", () => {
    const data = mockStorage();
    saveDraft(session("saved"));
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw Error("quota");
      },
    });
    expect(() => saveDraft(session("new"))).toThrow();
    expect(data.has(DRAFT_PREFIX + "saved")).toBe(true);
  });
});
describe("comparable statistics", () => {
  it("separates mode, ranges, duration, and incomplete games", () => {
    const original = session("a");
    const others = [
      session("b", { kind: "review" }),
      session("c", { settings: { ...DEFAULTS, duration: 30 } }),
      session("d", {
        settings: {
          ...DEFAULTS,
          add: [
            [2, 9],
            [2, 9],
          ],
        },
      }),
      session("e", { completed: false }),
    ];
    expect(
      filterSessions(
        [original, ...others],
        "timed",
        configKey(DEFAULTS),
        "all",
      ),
    ).toEqual([original]);
    expect(
      filterSessions(
        [original, ...others],
        "review",
        configKey(DEFAULTS),
        "all",
      ).map((s) => s.id),
    ).toEqual(["b"]);
  });
  it("filters local calendar periods and selects the latest twenty", () => {
    const now = new Date(2026, 9, 3, 20).getTime();
    const recent = session("recent");
    const boundary = session("boundary", {
      startedAt: new Date(2026, 8, 27, 0).toISOString(),
    });
    const old = session("old", {
      startedAt: new Date(2026, 8, 26, 23, 59).toISOString(),
    });
    expect(
      filterSessions(
        [old, boundary, recent],
        "timed",
        configKey(DEFAULTS),
        "7",
        now,
      ).map((s) => s.id),
    ).toEqual(["recent", "boundary"]);
    const many = Array.from({ length: 25 }, (_, i) =>
      session(String(i), { startedAt: new Date(now - i * 1000).toISOString() }),
    );
    expect(
      filterSessions(
        many.reverse(),
        "timed",
        configKey(DEFAULTS),
        "20",
        now,
      ).map((s) => s.id),
    ).toEqual(Array.from({ length: 20 }, (_, i) => String(i)));
  });
  it("computes median without including skipped problems", () => {
    const s = session("one", {
      attempts: [1000, 2000, 15000]
        .map((ms) => ({
          problem: { a: 2, b: 3, op: "+" as const, answer: 5 },
          ms,
          skipped: false,
        }))
        .concat([
          {
            problem: { a: 2, b: 3, op: "+", answer: 5 },
            ms: 50000,
            skipped: true,
          },
        ]),
    });
    const plus = operationStats([s])[0];
    expect(plus.mean).toBe(6000);
    expect(plus.median).toBe(2000);
    expect(plus.skipped).toBe(1);
    expect(median([])).toBe(0);
    expect(median([4000, 2000])).toBe(3000);
  });
});
describe("play preferences", () => {
  it("keeps old storage compatible and persists explicit options", () => {
    mockStorage();
    expect(loadPreferences()).toEqual({ feedback: true, countdown: true });
    savePreferences({ feedback: false, countdown: false });
    expect(loadPreferences()).toEqual({ feedback: false, countdown: false });
  });
  it("falls back when storage is damaged or unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw Error("blocked");
      },
    });
    expect(loadPreferences()).toEqual({ feedback: true, countdown: true });
  });
});
