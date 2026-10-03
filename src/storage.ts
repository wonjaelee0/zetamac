import { OPS, validSettings, type Session, type Settings } from "./engine";
export const STORAGE_KEY = "sums.data.v1";
export type Data = { v: 1; settings: Settings; sessions: Session[] };
const record = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object";
const finite = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;
export function validSession(x: unknown): x is Session {
  if (!record(x)) return false;
  const s = x as unknown as Session;
  if (
    typeof s.id !== "string" ||
    !s.id ||
    s.id.length > 100 ||
    !validSettings(s.settings) ||
    !Number.isInteger(s.seed) ||
    s.seed < 0 ||
    s.seed > 4294967295 ||
    typeof s.startedAt !== "string" ||
    !Number.isFinite(Date.parse(s.startedAt)) ||
    !finite(s.elapsedMs) ||
    !Number.isInteger(s.score) ||
    s.score < 0 ||
    !["timed", "practice", "review"].includes(s.kind) ||
    typeof s.completed !== "boolean" ||
    !Array.isArray(s.attempts) ||
    s.attempts.length > 100000
  )
    return false;
  if (s.kind !== "review" && s.kind !== s.settings.mode) return false;
  if (
    !s.attempts.every((a) => {
      if (
        !record(a) ||
        !record(a.problem) ||
        !finite(a.ms) ||
        typeof a.skipped !== "boolean"
      )
        return false;
      const p = a.problem;
      if (
        !OPS.includes(p.op) ||
        ![p.a, p.b, p.answer].every(
          (n) => Number.isInteger(n) && n >= 0 && n <= 998001,
        )
      )
        return false;
      const answer =
        p.op === "+"
          ? p.a + p.b
          : p.op === "−"
            ? p.a - p.b
            : p.op === "×"
              ? p.a * p.b
              : p.b
                ? p.a / p.b
                : NaN;
      return answer === p.answer;
    })
  )
    return false;
  return (
    s.score === s.attempts.filter((a) => !a.skipped).length &&
    s.attempts.reduce((n, a) => n + a.ms, 0) <= s.elapsedMs + 1
  );
}
export function parseData(raw: string): Data {
  const x: unknown = JSON.parse(raw);
  if (
    !record(x) ||
    x.v !== 1 ||
    !validSettings(x.settings) ||
    !Array.isArray(x.sessions) ||
    x.sessions.length > 500 ||
    !x.sessions.every(validSession)
  )
    throw new Error("지원하지 않거나 손상된 백업 파일입니다.");
  return x as Data;
}
export function loadData(): Data | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? parseData(raw) : null;
}
export function saveData(data: Data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
export function mergeSessions(a: Session[], b: Session[]) {
  return [...new Map([...b, ...a].map((s) => [s.id, s])).values()]
    .sort((x, y) => Date.parse(y.startedAt) - Date.parse(x.startedAt))
    .slice(0, 500);
}

// A separate key per run keeps a new game from overwriting an interrupted one.
export const DRAFT_PREFIX = "sums.draft.v1.";
export function saveDraft(session: Session) {
  localStorage.setItem(
    DRAFT_PREFIX + session.id,
    JSON.stringify({ ...session, completed: false }),
  );
}
export function removeDraft(id: string) {
  localStorage.removeItem(DRAFT_PREFIX + id);
}
export function loadDrafts(): Session[] {
  const drafts: Session[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(DRAFT_PREFIX)) continue;
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
      if (validSession(value) && key === DRAFT_PREFIX + value.id)
        drafts.push({ ...value, completed: false });
    } catch {
      /* A damaged draft must not hide the rest of the saved history. */
    }
  }
  return drafts;
}
export function recoverDrafts(sessions: Session[], drafts: Session[]) {
  const recovered = drafts.filter(
    (d) =>
      !sessions.some(
        (s) => s.id === d.id && (s.completed || s.elapsedMs >= d.elapsedMs),
      ),
  );
  return {
    sessions: mergeSessions(recovered, sessions),
    count: recovered.length,
  };
}
