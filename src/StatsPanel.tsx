import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { configKey, type Session } from "./engine";
import {
  filterSessions,
  operationStats,
  settingsLabel,
  type Period,
} from "./analytics";
import { ko } from "./copy";
const seconds = (ms: number) => (ms / 1000).toFixed(1);
export function Analytics({ sessions }: { sessions: Session[] }) {
  const [kind, setKind] = useState<Session["kind"]>("timed");
  const [selected, setSelected] = useState("");
  const [period, setPeriod] = useState<Period>("20");
  const eligible = sessions.filter((s) => s.completed && s.kind === kind);
  const configs = [
    ...new Map(
      eligible.map((s) => [configKey(s.settings), s.settings]),
    ).entries(),
  ];
  const key = configs.some(([k]) => k === selected)
    ? selected
    : configs[0]?.[0];
  const filtered = filterSessions(sessions, kind, key, period);
  return (
    <section className="analytics" aria-label="조건별 통계">
      <div className="card analytics-filters">
        <div className="section-heading">
          <h2>같은 조건에서, 얼마나 달라졌을까요?</h2>
          <span className="pill">완료한 게임만 비교</span>
        </div>
        <div className="filter-grid">
          <label>
            게임 종류
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as Session["kind"]);
                setSelected("");
              }}
            >
              {(["timed", "practice", "review"] as const).map((k) => (
                <option key={k} value={k}>
                  {ko.modes[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            비교할 설정
            <select
              value={key ?? ""}
              onChange={(e) => setSelected(e.target.value)}
              disabled={!configs.length}
            >
              {configs.length ? (
                configs.map(([k, s]) => (
                  <option key={k} value={k}>
                    {settingsLabel(s)}
                  </option>
                ))
              ) : (
                <option value="">완료한 기록 없음</option>
              )}
            </select>
          </label>
          <label>
            기간
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
            >
              <option value="20">최근 20회</option>
              <option value="7">최근 7일</option>
              <option value="30">최근 30일</option>
              <option value="all">전체 기간</option>
            </select>
          </label>
        </div>
        <p className="filter-caption" role="status">
          선택한 조건의 완료 기록 {filtered.length}회 ·{" "}
          {filtered.reduce((sum, s) => sum + s.score, 0)}문제
        </p>
        <p className="filter-note">
          시간제·자유 연습·복습을 구분합니다. 중도 종료 기록은 아래 기록
          목록에서 확인할 수 있어요.
        </p>
      </div>
      {kind === "timed" && <HistoryChart sessions={filtered} />}
      <OperationStats sessions={filtered} />
    </section>
  );
}
export function OperationStats({ sessions }: { sessions: Session[] }) {
  const values = operationStats(sessions);
  const max = Math.max(1, ...values.map((v) => v.mean));
  return (
    <section className="card operation-stats">
      <div className="section-heading">
        <h2>연산별 페이스</h2>
        <span className="muted">정답 문제의 풀이 시간 · 낮을수록 빨라요</span>
      </div>
      <div className="op-stat-grid">
        {values.map((v) => (
          <div className="op-stat" key={v.op} data-testid={`stat-${v.op}`}>
            <div>
              <span className="op-stat-symbol">{v.op}</span>
              <span>{ko.operations[v.op]}</span>
              <strong>
                {v.count ? seconds(v.mean) : "—"}
                <small> 초</small>
              </strong>
            </div>
            <div className="stat-track">
              <span
                style={{
                  width: v.count
                    ? `${Math.max(3, (v.mean / max) * 100)}%`
                    : "0%",
                }}
              />
            </div>
            <p className="median-stat">
              평균 {v.count ? seconds(v.mean) + "초" : "—"} · 중앙값{" "}
              <strong>{v.count ? seconds(v.median) + "초" : "—"}</strong>
            </p>
            <p>
              정답 {v.count}개 · 건너뜀 {v.skipped}개
            </p>
          </div>
        ))}
      </div>
      <p className="stats-note">
        중앙값은 풀이 시간을 순서대로 놓았을 때 가운데 값으로, 유난히 오래 걸린
        문제의 영향을 덜 받습니다.
      </p>
    </section>
  );
}
function HistoryChart({ sessions }: { sessions: Session[] }) {
  const daily = new Map<string, number>();
  for (const s of sessions) {
    const date = new Intl.DateTimeFormat("sv-SE").format(new Date(s.startedAt));
    daily.set(date, Math.max(daily.get(date) ?? 0, s.score));
  }
  const points = [...daily.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14);
  const max = Math.max(10, ...points.map(([, v]) => v));
  const x = (i: number) =>
    50 + (points.length === 1 ? 290 : (i * 580) / (points.length - 1));
  const y = (v: number) => 170 - (v / max) * 135;
  const path = points
    .map(([, v], i) => `${i ? "L" : "M"} ${x(i)} ${y(v)}`)
    .join(" ");
  return (
    <section className="card chart-card">
      <div className="section-heading">
        <div>
          <h2>꾸준함의 궤적</h2>
          <p className="muted">
            선택한 조건의 날짜별 최고 점수 · 최대 14개 연습일
          </p>
        </div>
      </div>
      {points.length ? (
        <>
          <svg
            viewBox="0 0 680 215"
            role="img"
            aria-label="날짜별 최고 점수 그래프"
          >
            {[0, 0.5, 1].map((r) => (
              <g key={r}>
                <line
                  x1="50"
                  x2="640"
                  y1={y(max * r)}
                  y2={y(max * r)}
                  className="chart-grid"
                />
                <text x="32" y={y(max * r) + 4} textAnchor="end">
                  {Math.round(max * r)}
                </text>
              </g>
            ))}
            {points.length > 1 && (
              <path
                d={path + ` L ${x(points.length - 1)} 170 L ${x(0)} 170 Z`}
                className="chart-area"
              />
            )}
            <path d={path} className="chart-line" />
            {points.map(([d, v], i) => (
              <g key={d}>
                <circle cx={x(i)} cy={y(v)} r="4" className="chart-point">
                  <title>
                    {d}: {v}문제
                  </title>
                </circle>
                {(i === 0 || i === points.length - 1 || points.length <= 7) && (
                  <text x={x(i)} y="199" textAnchor="middle">
                    {d.slice(5).replace("-", ".")}
                  </text>
                )}
              </g>
            ))}
          </svg>
          <div className="sr-only">
            {points.map(([d, v]) => (
              <p key={d}>
                {d}: {v}문제
              </p>
            ))}
          </div>
        </>
      ) : (
        <div className="chart-empty">
          <TrendingUp size={28} />
          <p>선택한 조건에 완료한 기록이 없습니다.</p>
        </div>
      )}
    </section>
  );
}
