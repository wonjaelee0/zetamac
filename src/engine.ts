export const OPS = ["+", "−", "×", "÷"] as const;
export type Op = (typeof OPS)[number];
export type Range = [number, number];
export type Settings = {
  mode: "timed" | "practice";
  duration: number;
  ops: Op[];
  add: [Range, Range];
  multiply: [Range, Range];
};
export type Problem = { a: number; b: number; op: Op; answer: number };
export type Attempt = { problem: Problem; ms: number; skipped: boolean };
export type Session = {
  id: string;
  settings: Settings;
  seed: number;
  startedAt: string;
  elapsedMs: number;
  score: number;
  attempts: Attempt[];
  kind: "timed" | "practice" | "review";
  completed: boolean;
};
export const DEFAULTS: Settings = {
  mode: "timed",
  duration: 120,
  ops: [...OPS],
  add: [
    [2, 100],
    [2, 100],
  ],
  multiply: [
    [2, 12],
    [2, 100],
  ],
};
export const DURATIONS = [30, 60, 120, 300];
export function validSettings(s: unknown): s is Settings {
  if (!s || typeof s !== "object") return false;
  const v = s as Settings;
  return (
    ["timed", "practice"].includes(v.mode) &&
    DURATIONS.includes(v.duration) &&
    Array.isArray(v.ops) &&
    v.ops.length > 0 &&
    v.ops.length <= 4 &&
    new Set(v.ops).size === v.ops.length &&
    v.ops.every((o) => OPS.includes(o)) &&
    [v.add, v.multiply].every(
      (pair) =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        pair.every(
          (r) =>
            Array.isArray(r) &&
            r.length === 2 &&
            r.every((n) => Number.isInteger(n) && n >= 1 && n <= 999) &&
            r[0] <= r[1],
        ),
    )
  );
}
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function generator(settings: Settings, seed: number) {
  if (!validSettings(settings))
    throw new Error("올바르지 않은 게임 설정입니다.");
  const rng = random(seed);
  const ops = OPS.filter((o) => settings.ops.includes(o));
  const int = ([min, max]: Range) => min + Math.floor(rng() * (max - min + 1));
  return (): Problem => {
    const op = ops[Math.floor(rng() * ops.length)];
    const ranges = op === "+" || op === "−" ? settings.add : settings.multiply;
    const a = int(ranges[0]),
      b = int(ranges[1]);
    if (op === "+") return { a, b, op, answer: a + b };
    if (op === "−") return { a: a + b, b, op, answer: a };
    if (op === "×") return { a, b, op, answer: a * b };
    return { a: a * b, b, op, answer: a };
  };
}
export function configKey(s: Settings) {
  return JSON.stringify([
    s.mode,
    s.duration,
    OPS.filter((o) => s.ops.includes(o)),
    s.add,
    s.multiply,
  ]);
}
export function summary(session: Session) {
  const times = session.attempts
    .filter((a) => !a.skipped)
    .map((a) => a.ms)
    .sort((a, b) => a - b);
  const n = times.length;
  return {
    mean: n ? times.reduce((a, b) => a + b, 0) / n : 0,
    median: n
      ? (times[Math.floor((n - 1) / 2)] + times[Math.floor(n / 2)]) / 2
      : 0,
    rate: session.elapsedMs ? (session.score * 60000) / session.elapsedMs : 0,
    skipped: session.attempts.filter((a) => a.skipped).length,
  };
}
export function reviewProblems(s: Session) {
  return [
    ...s.attempts.filter((a) => a.skipped),
    ...s.attempts
      .filter((a) => !a.skipped)
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 10),
  ].map((a) => a.problem);
}
export function remaining(end: number, now: number) {
  return Math.max(0, end - now);
}
export function challengeHash(settings: Settings, seed: number) {
  return (
    "#challenge=" +
    encodeURIComponent(
      JSON.stringify({
        v: 1,
        g: 1,
        settings: { ...settings, mode: "timed" },
        seed,
      }),
    )
  );
}
export function readChallenge(hash: string): {
  settings: Settings;
  seed: number;
} {
  const data = JSON.parse(decodeURIComponent(hash.slice("#challenge=".length)));
  if (
    data.v !== 1 ||
    data.g !== 1 ||
    !validSettings(data.settings) ||
    data.settings.mode !== "timed" ||
    !Number.isInteger(data.seed) ||
    data.seed < 0 ||
    data.seed > 4294967295
  )
    throw new Error("유효하지 않거나 지원하지 않는 도전 링크입니다.");
  return { settings: data.settings, seed: data.seed };
}
// Mutable engine consumes each input synchronously, avoiding stale React state during rapid typing.
export class Run {
  readonly next: () => Problem;
  problem: Problem;
  input = "";
  attempts: Attempt[] = [];
  score = 0;
  started: number;
  problemAt: number;
  pausedAt: number | null = null;
  pauseMs = 0;
  done = false;
  reviewIndex = 0;
  constructor(
    public settings: Settings,
    public seed: number,
    now: number,
    public review?: Problem[],
  ) {
    this.next = generator(settings, seed);
    this.problem = review?.[0] ?? this.next();
    this.started = now;
    this.problemAt = now;
  }
  elapsed(now: number) {
    return Math.max(0, (this.pausedAt ?? now) - this.started - this.pauseMs);
  }
  expired(now: number) {
    return (
      !this.review &&
      this.settings.mode === "timed" &&
      this.elapsed(now) >= this.settings.duration * 1000
    );
  }
  pause(now: number) {
    if (
      (this.settings.mode === "practice" || this.review) &&
      this.pausedAt === null
    )
      this.pausedAt = now;
  }
  resume(now: number) {
    if (this.pausedAt !== null) {
      const pause = now - this.pausedAt;
      this.pauseMs += pause;
      this.problemAt += pause;
      this.pausedAt = null;
    }
  }
  key(key: string, now: number) {
    if (this.done || this.pausedAt !== null) return;
    if (this.expired(now)) {
      this.done = true;
      return;
    }
    if (key === "Backspace") this.input = this.input.slice(0, -1);
    else if (key === "Escape") this.input = "";
    else if (/^\d$/.test(key) && this.input.length < 8)
      this.input = (this.input + key).replace(/^0+(?=\d)/, "");
    else return;
    if (this.input !== "" && Number(this.input) === this.problem.answer)
      this.advance(now, false);
  }
  advance(now: number, skipped: boolean) {
    if (this.done || this.pausedAt !== null) return;
    if (this.expired(now)) {
      this.done = true;
      return;
    }
    this.attempts.push({
      problem: this.problem,
      ms: Math.max(0, now - this.problemAt),
      skipped,
    });
    if (!skipped) this.score++;
    this.input = "";
    this.problemAt = now;
    if (this.review) {
      this.reviewIndex++;
      if (this.reviewIndex >= this.review.length) {
        this.done = true;
        return;
      }
      this.problem = this.review[this.reviewIndex];
    } else this.problem = this.next();
  }
  result(now: number, completed: boolean): Session {
    const elapsed = this.elapsed(now);
    return {
      id: crypto.randomUUID(),
      settings: structuredClone(this.settings),
      seed: this.seed,
      startedAt: new Date(this.started).toISOString(),
      elapsedMs:
        this.settings.mode === "timed" && !this.review
          ? Math.min(elapsed, this.settings.duration * 1000)
          : elapsed,
      score: this.score,
      attempts: [...this.attempts],
      kind: this.review ? "review" : this.settings.mode,
      completed,
    };
  }
}
