import { configKey, OPS, type Session, type Settings } from "./engine";
export type Period = "all" | "7" | "30" | "20";
export function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length
    ? (sorted[Math.floor((sorted.length - 1) / 2)] +
        sorted[Math.floor(sorted.length / 2)]) /
        2
    : 0;
}
export function filterSessions(
  sessions: Session[],
  kind: Session["kind"],
  key: string | undefined,
  period: Period,
  now = Date.now(),
) {
  let selected = sessions
    .filter(
      (s) => s.completed && s.kind === kind && configKey(s.settings) === key,
    )
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  if (period === "20") return selected.slice(0, 20);
  if (period !== "all") {
    const cutoff = new Date(now);
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (Number(period) - 1));
    selected = selected.filter(
      (s) =>
        Date.parse(s.startedAt) >= cutoff.getTime() &&
        Date.parse(s.startedAt) <= now,
    );
  }
  return selected;
}
export function operationStats(sessions: Session[]) {
  const attempts = sessions.flatMap((s) => s.attempts);
  return OPS.map((op) => {
    const all = attempts.filter((a) => a.problem.op === op);
    const times = all.filter((a) => !a.skipped).map((a) => a.ms);
    return {
      op,
      count: times.length,
      skipped: all.length - times.length,
      mean: times.length
        ? times.reduce((sum, n) => sum + n, 0) / times.length
        : 0,
      median: median(times),
    };
  });
}
export function settingsLabel(s: Settings) {
  const parts = [
    s.mode === "timed" ? `${s.duration}초` : "자유 연습",
    s.ops.join(" "),
  ];
  if (s.ops.some((o) => o === "+" || o === "−"))
    parts.push("덧셈 범위 " + s.add.map((r) => r.join("–")).join(" / "));
  if (s.ops.some((o) => o === "×" || o === "÷"))
    parts.push("곱셈 범위 " + s.multiply.map((r) => r.join("–")).join(" / "));
  return parts.join(" · ");
}
