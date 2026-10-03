import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  Clock3,
  Download,
  Eraser,
  History,
  Keyboard,
  Moon,
  Play,
  RotateCcw,
  Settings2,
  Share2,
  SkipForward,
  Sparkles,
  Sun,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  X,
  Zap,
  Delete,
} from "lucide-react";
import {
  DEFAULTS,
  DURATIONS,
  OPS,
  Run,
  challengeHash,
  configKey,
  readChallenge,
  reviewProblems,
  summary,
  validSettings,
  type Op,
  type Problem,
  type Session,
  type Settings,
} from "./engine";
import {
  loadData,
  mergeSessions,
  parseData,
  saveData,
  type Data,
} from "./storage";
import { ko } from "./copy";

type Screen = "home" | "countdown" | "play" | "result" | "history";
type Theme = "system" | "light" | "dark";
const seconds = (ms: number) => (ms / 1000).toFixed(1);
const date = (s: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(s));
const bestFor = (sessions: Session[], settings: Settings) =>
  sessions.filter(
    (s) =>
      s.kind === "timed" &&
      s.completed &&
      configKey(s.settings) === configKey(settings),
  );
function initial() {
  let warning = "";
  let data: Data = { v: 1, settings: structuredClone(DEFAULTS), sessions: [] };
  let theme: Theme = "system";
  try {
    data = loadData() ?? data;
    const t = localStorage.getItem("sums.theme");
    if (t === "light" || t === "dark") theme = t;
  } catch {
    warning =
      "저장된 기록을 읽을 수 없습니다. 백업 파일이 있다면 기록 화면에서 가져와 주세요.";
  }
  let challenge: { settings: Settings; seed: number } | null = null;
  if (location.hash.startsWith("#challenge=")) {
    try {
      challenge = readChallenge(location.hash);
      data = { ...data, settings: challenge.settings };
    } catch {
      warning = "유효하지 않거나 지원하지 않는 도전 링크입니다.";
      history.replaceState(null, "", "#home");
    }
  }
  return { data, warning, theme, challenge };
}

export default function App() {
  const [boot] = useState(initial);
  const [settings, setSettings] = useState(boot.data.settings);
  const [sessions, setSessions] = useState(boot.data.sessions);
  const [screen, setScreen] = useState<Screen>(
    location.hash === "#history" ? "history" : "home",
  );
  const [notice, setNotice] = useState(boot.warning);
  const [theme, setTheme] = useState<Theme>(boot.theme);
  const [challenge, setChallenge] = useState(boot.challenge);
  const [result, setResult] = useState<Session | null>(null);
  const [count, setCount] = useState(3);
  const [pending, setPending] = useState<{
    settings: Settings;
    seed: number;
    review?: Problem[];
  } | null>(null);
  const [tick, setTick] = useState(0);
  const [shareText, setShareText] = useState("");
  const runRef = useRef<Run | null>(null);
  const dataRef = useRef<Data>(boot.data);
  const importRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const persist = useCallback((data: Data) => {
    dataRef.current = data;
    try {
      saveData(data);
      return true;
    } catch {
      setNotice(ko.storageError);
      return false;
    }
  }, []);
  const updateSettings = (next: Settings) => {
    setSettings(next);
    setChallenge(null);
    if (location.hash.startsWith("#challenge="))
      history.replaceState(null, "", "#home");
    if (validSettings(next)) persist({ ...dataRef.current, settings: next });
  };
  const route = useCallback((next: Screen, replace = false) => {
    setScreen(next);
    history[replace ? "replaceState" : "pushState"](
      null,
      "",
      "#" + (next === "countdown" ? "play" : next),
    );
  }, []);
  const finish = useCallback(
    (completed: boolean) => {
      const run = runRef.current;
      if (!run) return;
      runRef.current = null;
      const item = run.result(Date.now(), completed);
      const merged = mergeSessions([item], dataRef.current.sessions);
      setSessions(merged);
      persist({ ...dataRef.current, sessions: merged });
      setResult(item);
      route("result", true);
    },
    [persist, route],
  );
  const navigate = (next: "home" | "history") => {
    if (runRef.current) {
      if (!window.confirm("진행 중인 연습을 끝낼까요?")) return;
      finish(false);
    }
    setPending(null);
    setShareText("");
    route(next);
  };
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    if (screen !== "play" && screen !== "countdown")
      headingRef.current?.focus();
  }, [screen]);
  useEffect(() => {
    const onHash = () => {
      const requestedHash = location.hash;
      if (runRef.current) finish(false);
      history.replaceState(null, "", requestedHash || "#home");
      setPending(null);
      setShareText("");
      if (location.hash.startsWith("#challenge=")) {
        try {
          const c = readChallenge(location.hash);
          setChallenge(c);
          setSettings(c.settings);
          setScreen("home");
        } catch {
          setNotice("유효하지 않거나 지원하지 않는 도전 링크입니다.");
          route("home", true);
        }
      } else setScreen(location.hash === "#history" ? "history" : "home");
    };
    window.addEventListener("popstate", onHash);
    return () => window.removeEventListener("popstate", onHash);
  }, [finish, route]);
  useEffect(() => {
    if (!pending) return;
    const deadline = Date.now() + 3000;
    setCount(3);
    const timer = window.setInterval(() => {
      const left = Math.ceil((deadline - Date.now()) / 1000);
      if (left > 0) {
        setCount(left);
        return;
      }
      clearInterval(timer);
      const run = new Run(
        pending.settings,
        pending.seed,
        Date.now(),
        pending.review,
      );
      if (document.hidden) run.pause(Date.now());
      runRef.current = run;
      setPending(null);
      setScreen("play");
      setTick((t) => t + 1);
    }, 50);
    return () => clearInterval(timer);
  }, [pending]);
  useEffect(() => {
    if (screen !== "play") return;
    const interval = window.setInterval(() => {
      const run = runRef.current;
      if (run?.expired(Date.now())) finish(true);
      else setTick((t) => t + 1);
    }, 80);
    const visibility = () => {
      const r = runRef.current;
      if (!r) return;
      if (document.hidden) r.pause(Date.now());
      else {
        r.resume(Date.now());
        if (r.expired(Date.now())) finish(true);
      }
      setTick((t) => t + 1);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [screen, finish]);
  const enter = useCallback(
    (key: string) => {
      const r = runRef.current;
      if (!r) return;
      r.key(key, Date.now());
      if (r.done) finish(true);
      else setTick((t) => t + 1);
    },
    [finish],
  );
  useEffect(() => {
    if (screen !== "play") return;
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.isComposing)
        return;
      if (/^\d$/.test(e.key) || e.key === "Backspace" || e.key === "Escape") {
        e.preventDefault();
        enter(e.key);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [screen, enter]);
  const start = (review?: Problem[], source?: Session) => {
    const selected = source?.settings ?? settings;
    if (!validSettings(selected)) {
      setNotice(
        "연산을 하나 이상 선택하고, 숫자 범위를 1~999 사이의 작은 수 → 큰 수 순서로 입력해 주세요.",
      );
      return;
    }
    const seed =
      source?.seed ??
      challenge?.seed ??
      crypto.getRandomValues(new Uint32Array(1))[0];
    setNotice("");
    setShareText("");
    if (!review) persist({ ...dataRef.current, settings: selected });
    setPending({ settings: structuredClone(selected), seed, review });
    route("countdown");
  };
  const skip = () => {
    const run = runRef.current;
    if (!run) return;
    run.advance(Date.now(), true);
    if (run.done) finish(true);
    else setTick((t) => t + 1);
  };
  const switchTheme = () => {
    const dark = document.documentElement.dataset.theme === "dark";
    const next = dark ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("sums.theme", next);
    } catch {
      setNotice("테마 설정을 저장하지 못했습니다.");
    }
  };
  const share = async (s?: Session) => {
    const selected = s?.settings ?? settings;
    if (!validSettings(selected)) {
      setNotice("게임 설정을 먼저 확인해 주세요.");
      return;
    }
    const seed =
      s?.seed ??
      challenge?.seed ??
      crypto.getRandomValues(new Uint32Array(1))[0];
    const url =
      location.origin + location.pathname + challengeHash(selected, seed);
    if (!s) {
      setChallenge({ settings: selected, seed });
      history.replaceState(null, "", challengeHash(selected, seed));
    }
    const text = `sums · ${selected.duration}초 암산 도전${s ? " · " + s.score + "문제 정답" : ""}\n${selected.ops.join(" ")} · 같은 문제로 도전해 보세요!\n${url}`;
    setShareText(text);
    try {
      if (navigator.share)
        await navigator.share({ title: "sums 암산 도전", text });
      else {
        await navigator.clipboard.writeText(text);
        setNotice("도전 링크를 복사했습니다. 친구에게 공유해 보세요.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setNotice("아래 도전 링크를 직접 복사해 공유해 주세요.");
    }
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify(dataRef.current, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sums-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importData = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("20MB 이하의 백업 파일을 선택해 주세요.");
      const incoming = parseData(await file.text());
      const merged = mergeSessions(sessions, incoming.sessions);
      setSessions(merged);
      setSettings(incoming.settings);
      setChallenge(null);
      if (persist({ v: 1, settings: incoming.settings, sessions: merged })) {
        setNotice("백업을 가져왔습니다. 중복 기록은 한 번만 저장했습니다.");
      }
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "백업 파일을 읽지 못했습니다.",
      );
    }
    if (importRef.current) importRef.current.value = "";
  };
  const matching = bestFor(sessions, settings);
  const best = matching.length
    ? Math.max(...matching.map((s) => s.score))
    : null;
  const run = runRef.current;
  void tick;
  const playing = screen === "play" || screen === "countdown";
  return (
    <div className={"app " + (playing ? "in-game" : "")}>
      <header className="site-header">
        <div className="header-inner">
          <button
            className="brand"
            onClick={() => navigate("home")}
            aria-label="sums 홈"
          >
            <span className="brand-mark">±</span>
            <span>
              sums<span className="brand-dot">.</span>
            </span>
          </button>
          <nav aria-label="주 메뉴">
            <button
              className={
                screen === "home" || playing ? "nav-link active" : "nav-link"
              }
              onClick={() => navigate("home")}
            >
              <Zap size={16} />
              {ko.training}
            </button>
            <button
              className={screen === "history" ? "nav-link active" : "nav-link"}
              onClick={() => navigate("history")}
            >
              <BarChart3 size={16} />
              {ko.history}
            </button>
          </nav>
          <button
            className="icon-button theme-button"
            onClick={switchTheme}
            aria-label="밝은 테마 / 어두운 테마 전환"
          >
            <Sun className="sun-icon" size={19} />
            <Moon className="moon-icon" size={19} />
          </button>
        </div>
      </header>
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="알림 닫기"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <main>
        {screen === "home" && (
          <>
            <section className="hero">
              <div>
                <div className="eyebrow">
                  <span className="status-dot" />
                  {ko.tagline}
                </div>
                <h1 ref={headingRef} tabIndex={-1}>
                  {ko.hero}
                  <br />
                  <span>{ko.heroAccent}</span>
                </h1>
                <p>
                  {ko.intro}
                  <br className="mobile-break" /> 오늘의 나를 한 문제씩
                  넘어보세요.
                </p>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="art-grid" />
                <span className="art-label">A LITTLE BETTER, EVERY DAY</span>
                <div className="equation-card">
                  <span>
                    24 <i>×</i> 3
                  </span>
                  <span className="equation-answer">
                    72{" "}
                    <span>
                      <Check size={18} />
                    </span>
                  </span>
                </div>
                <div className="float-symbol plus">+</div>
                <div className="float-symbol multiply">×</div>
                <div className="art-caption">
                  <TrendingUp size={15} /> 오늘도 한 걸음 앞으로
                </div>
              </div>
            </section>
            {challenge && (
              <div className="challenge-banner">
                <Target size={20} />
                <div>
                  <strong>도전장을 받았어요</strong>
                  <span>같은 설정과 문제 순서로 도전합니다.</span>
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setChallenge(null);
                    history.replaceState(null, "", "#home");
                  }}
                >
                  일반 연습으로 전환
                </button>
              </div>
            )}
            <div className="home-grid">
              <section className="card setup-card">
                <div className="section-heading">
                  <div>
                    <span className="section-index">01 / GET READY</span>
                    <h2>오늘의 연습</h2>
                  </div>
                  <span className="pill">
                    <span className="status-dot" /> 나에게 맞는 페이스
                  </span>
                </div>
                <div className="segmented mode-tabs">
                  <button
                    className={settings.mode === "timed" ? "selected" : ""}
                    onClick={() =>
                      updateSettings({ ...settings, mode: "timed" })
                    }
                  >
                    <Clock3 size={17} />
                    {ko.timed}
                  </button>
                  <button
                    className={settings.mode === "practice" ? "selected" : ""}
                    onClick={() =>
                      updateSettings({ ...settings, mode: "practice" })
                    }
                  >
                    <span className="infinity" aria-hidden="true">
                      ∞
                    </span>
                    {ko.practice}
                  </button>
                </div>
                <div className="setting-block">
                  <div className="setting-label">
                    <label>연산 선택</label>
                    <span>여러 개를 함께 선택할 수 있어요</span>
                  </div>
                  <div className="operation-grid">
                    {OPS.map((op) => (
                      <button
                        key={op}
                        aria-pressed={settings.ops.includes(op)}
                        className={
                          "operation " +
                          (settings.ops.includes(op) ? "selected" : "")
                        }
                        onClick={() =>
                          updateSettings({
                            ...settings,
                            ops: settings.ops.includes(op)
                              ? settings.ops.filter((x) => x !== op)
                              : [...settings.ops, op],
                          })
                        }
                      >
                        <span className="op-symbol">{op}</span>
                        <span>{ko.operations[op]}</span>
                        <span className="op-check">
                          {settings.ops.includes(op) && <Check size={10} />}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="setting-block">
                  <div className="setting-label">
                    <label>
                      {settings.mode === "timed" ? "제한 시간" : "연습 시간"}
                    </label>
                    <span>
                      {settings.mode === "timed"
                        ? "짧게, 그리고 꾸준하게"
                        : "시간에 쫓기지 않고 천천히"}
                    </span>
                  </div>
                  {settings.mode === "timed" ? (
                    <div className="duration-grid">
                      {DURATIONS.map((d) => (
                        <button
                          key={d}
                          aria-label={`${d}초`}
                          aria-pressed={settings.duration === d}
                          className={settings.duration === d ? "selected" : ""}
                          onClick={() =>
                            updateSettings({ ...settings, duration: d })
                          }
                        >
                          {d}
                          <small>초</small>
                          {settings.duration === d && (
                            <span className="duration-dot" />
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="practice-note">
                      <span>∞</span> 제한 없이 연습하고, 원하는 때에 마치세요.
                    </div>
                  )}
                </div>
                <details className="range-details">
                  <summary>
                    <span>
                      <Settings2 size={17} />
                      숫자 범위 설정
                    </span>
                    <span>
                      맞춤 설정 <ChevronDown size={14} />
                    </span>
                  </summary>
                  <div className="ranges">
                    {(["add", "multiply"] as const).map((group) => (
                      <fieldset key={group}>
                        <legend>
                          {group === "add" ? "덧셈 · 뺄셈" : "곱셈 · 나눗셈"}
                        </legend>
                        {settings[group].map((range, index) => (
                          <div className="range-row" key={index}>
                            <span>{index + 1}번째 수</span>
                            {range.map((value, edge) => (
                              <label key={edge}>
                                <span className="sr-only">
                                  {group === "add" ? "덧셈" : "곱셈"}{" "}
                                  {index + 1}번째 수{" "}
                                  {edge === 0 ? "최솟값" : "최댓값"}
                                </span>
                                <input
                                  type="number"
                                  min="1"
                                  max="999"
                                  value={Number.isNaN(value) ? "" : value}
                                  onChange={(e) => {
                                    const next = structuredClone(settings);
                                    next[group][index][edge] =
                                      e.target.value === ""
                                        ? NaN
                                        : Number(e.target.value);
                                    updateSettings(next);
                                  }}
                                />
                              </label>
                            ))}{" "}
                          </div>
                        ))}
                      </fieldset>
                    ))}
                    <p>
                      1~999의 정수를 사용합니다. 뺄셈과 나눗셈은 역산으로
                      출제됩니다.
                    </p>
                  </div>
                </details>
                {!validSettings(settings) && (
                  <p className="validation" role="alert">
                    연산을 하나 이상 선택하고 올바른 숫자 범위를 입력해 주세요.
                  </p>
                )}
                <button
                  className="primary start-button"
                  disabled={!validSettings(settings)}
                  onClick={() => start()}
                >
                  <Play size={18} fill="currentColor" />
                  {ko.start}
                  <ArrowRight size={19} />
                </button>
                <div className="setup-foot">
                  <span>
                    <Keyboard size={14} /> 정답을 입력하면 자동으로 다음 문제
                  </span>
                  {settings.mode === "timed" && (
                    <button className="text-button" onClick={() => share()}>
                      <Share2 size={13} />
                      도전 공유
                    </button>
                  )}
                </div>
              </section>
              <aside className="home-aside">
                <section className="card personal-card">
                  <div className="section-heading">
                    <h2>나의 베스트</h2>
                    <TrendingUp size={19} />
                  </div>
                  <div className="personal-score">
                    {best ?? "—"}
                    <span>문제</span>
                  </div>
                  <p>
                    {matching.length
                      ? "같은 설정에서 세운 나의 최고 기록"
                      : "첫 기록이 새로운 시작이 될 거예요"}
                  </p>
                  <div className="personal-rule" />
                  <div className="mini-stat">
                    <span>완료한 연습</span>
                    <strong>
                      {sessions.filter((s) => s.completed).length}
                      <small> 회</small>
                    </strong>
                  </div>
                  <div className="mini-stat">
                    <span>지금까지 푼 문제</span>
                    <strong>
                      {sessions
                        .reduce((n, s) => n + s.score, 0)
                        .toLocaleString()}
                      <small> 개</small>
                    </strong>
                  </div>
                  <button
                    className="aside-link"
                    onClick={() => navigate("history")}
                  >
                    나의 기록 살펴보기 <ArrowUpRight size={17} />
                  </button>
                </section>
                <section className="tip-card">
                  <div className="tip-icon">
                    <Sparkles size={20} />
                  </div>
                  <span className="section-index">A SMALL TIP</span>
                  <h3>빠르기보다, 꾸준함.</h3>
                  <p>
                    하루 2분이면 충분해요.
                    <br />
                    어제의 기록보다 오늘의 집중에
                    <br />
                    먼저 마음을 기울여 보세요.
                  </p>
                  <span className="tip-decoration" aria-hidden="true">
                    ÷
                  </span>
                </section>
              </aside>
            </div>
            <section className="recent-section">
              <div className="section-heading">
                <h2>
                  <History size={18} />
                  최근 연습
                </h2>
                <button
                  className="text-button"
                  onClick={() => navigate("history")}
                >
                  전체 기록 <ArrowRight size={14} />
                </button>
              </div>
              {sessions.length ? (
                <SessionList
                  sessions={sessions.slice(0, 3)}
                  onSelect={(s) => {
                    setResult(s);
                    route("result");
                  }}
                />
              ) : (
                <div className="empty-recent">
                  <div className="empty-icon">
                    <BarChart3 size={22} />
                  </div>
                  <div>
                    <strong>아직은 비어 있는 기록장</strong>
                    <p>첫 연습을 마치면 이곳에 성장의 발자국이 쌓여요.</p>
                  </div>
                  <span>
                    LET’S MAKE YOUR FIRST MARK <ArrowUpRight size={14} />
                  </span>
                </div>
              )}
            </section>
          </>
        )}
        {screen === "countdown" && (
          <section className="countdown">
            <div className="eyebrow">잠깐, 숨을 고르고</div>
            <h1 aria-live="assertive">{count}</h1>
            <p>정답을 입력하면 자동으로 다음 문제로 넘어갑니다.</p>
            <button
              className="text-button"
              onClick={() => {
                setPending(null);
                route("home", true);
              }}
            >
              취소
            </button>
          </section>
        )}
        {screen === "play" && run && (
          <section className="play-shell">
            <div className="play-top">
              <span className="pill">
                <span className="status-dot" />
                {run.review ? "느린 문제 복습" : ko.modes[run.settings.mode]}
              </span>
              <button
                className="text-button"
                onClick={() => {
                  if (run.settings.mode === "practice" || run.review)
                    finish(!run.review);
                  else if (
                    confirm(
                      "시간제 게임을 일찍 마칠까요? 최고 기록에서는 제외됩니다.",
                    )
                  )
                    finish(false);
                }}
              >
                연습 마치기 <X size={15} />
              </button>
            </div>
            <div className="play-metrics">
              <div>
                <span>
                  {run.settings.mode === "timed" && !run.review
                    ? "남은 시간"
                    : "연습 시간"}
                </span>
                <strong
                  className={
                    run.settings.mode === "timed" &&
                    !run.review &&
                    run.elapsed(Date.now()) >=
                      (run.settings.duration - 10) * 1000
                      ? "time-low"
                      : ""
                  }
                >
                  {run.settings.mode === "timed" && !run.review
                    ? Math.ceil(
                        Math.max(
                          0,
                          run.settings.duration * 1000 -
                            run.elapsed(Date.now()),
                        ) / 1000,
                      )
                    : Math.floor(run.elapsed(Date.now()) / 1000)}
                  <small>초</small>
                </strong>
              </div>
              <div>
                <span>{run.review ? "복습 진행" : "정답 수"}</span>
                <strong>
                  {run.review
                    ? `${run.reviewIndex} / ${run.review.length}`
                    : run.score}
                  <small>{!run.review && "문제"}</small>
                </strong>
              </div>
            </div>
            {run.settings.mode === "timed" && !run.review && (
              <div
                className="timer-track"
                role="progressbar"
                aria-label="남은 시간"
                aria-valuemin={0}
                aria-valuemax={run.settings.duration}
                aria-valuenow={Math.max(
                  0,
                  Math.ceil(
                    run.settings.duration - run.elapsed(Date.now()) / 1000,
                  ),
                )}
              >
                <span
                  style={{
                    width: `${Math.max(0, 100 - run.elapsed(Date.now()) / (run.settings.duration * 10))}%`,
                  }}
                />
              </div>
            )}
            <div className="play-body">
              <div className="problem-area">
                <div className="problem-counter">
                  {String(run.attempts.length + 1).padStart(2, "0")} / ONE AT A
                  TIME
                </div>
                <h1
                  className="equation"
                  aria-label={`${run.problem.a} ${ko.operations[run.problem.op]} ${run.problem.b}`}
                  data-testid="equation"
                >
                  {run.problem.a} <span>{run.problem.op}</span> {run.problem.b}
                </h1>
                <div
                  className="answer-box"
                  aria-label="현재 입력값"
                  role="status"
                >
                  <span>
                    {run.input || (
                      <span className="input-placeholder">
                        정답을 입력하세요
                      </span>
                    )}
                  </span>
                  <i />
                </div>
                <button className="skip-button" onClick={skip}>
                  건너뛰기 <SkipForward size={16} />
                </button>
                <p className="keyboard-hint">
                  <Keyboard size={15} /> 숫자 키로 입력 · Backspace 삭제 · Esc
                  전체 지우기
                </p>
              </div>
              <div className="number-pad" aria-label="숫자패드">
                {[
                  "1",
                  "2",
                  "3",
                  "4",
                  "5",
                  "6",
                  "7",
                  "8",
                  "9",
                  "Escape",
                  "0",
                  "Backspace",
                ].map((key) => (
                  <button
                    key={key}
                    className={/\d/.test(key) ? "" : "pad-action"}
                    aria-label={
                      key === "Escape"
                        ? "전체 지우기"
                        : key === "Backspace"
                          ? "한 자리 삭제"
                          : `숫자 ${key}`
                    }
                    onClick={() => enter(key)}
                  >
                    {key === "Escape" ? (
                      <Eraser size={23} />
                    ) : key === "Backspace" ? (
                      <Delete size={25} />
                    ) : (
                      key
                    )}
                  </button>
                ))}
              </div>
            </div>
            {run.pausedAt !== null && (
              <div className="pause-overlay">잠시 쉬는 중</div>
            )}
          </section>
        )}
        {screen === "result" && result && (
          <section className="result-page">
            <button className="back-link" onClick={() => navigate("home")}>
              <ChevronLeft size={16} />
              연습으로 돌아가기
            </button>
            <div className="result-heading">
              <span className="eyebrow">ONE STEP FORWARD</span>
              <h1 ref={headingRef} tabIndex={-1}>
                {result.completed
                  ? "좋은 집중이었어요."
                  : "잠깐의 연습도 의미 있어요."}
              </h1>
              <p>
                {ko.modes[result.kind]} · {result.settings.ops.join(" ")} ·{" "}
                {date(result.startedAt)}
                {!result.completed ? " · 중도 종료" : ""}
              </p>
            </div>
            <div className="result-main card">
              <div className="result-score">
                <span>이번에 푼 문제</span>
                <strong>
                  {result.score}
                  <small>문제</small>
                </strong>
                {result.kind === "timed" && result.completed && (
                  <span className="pill">
                    {result.score >=
                    Math.max(
                      0,
                      ...bestFor(sessions, result.settings).map((s) => s.score),
                    )
                      ? "✦ 나의 최고 기록"
                      : "차곡차곡 쌓이는 나의 기록"}
                  </span>
                )}
              </div>
              <div className="result-stats">
                {[
                  ["분당 풀이", summary(result).rate.toFixed(1) + "개"],
                  ["평균 풀이", seconds(summary(result).mean) + "초"],
                  ["중앙 풀이", seconds(summary(result).median) + "초"],
                  ["건너뛴 문제", summary(result).skipped + "개"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </div>
            {result.kind === "timed" && result.completed && (
              <div className="comparison">
                <span>
                  같은 설정 최고 기록{" "}
                  <strong>
                    {Math.max(
                      ...bestFor(sessions, result.settings).map((s) => s.score),
                      result.score,
                    )}
                    문제
                  </strong>
                </span>
                <span>
                  직전 기록{" "}
                  <strong>
                    {bestFor(sessions, result.settings).filter(
                      (s) =>
                        s.id !== result.id &&
                        Date.parse(s.startedAt) <= Date.parse(result.startedAt),
                    )[0]?.score ?? "—"}
                    문제
                  </strong>
                </span>
              </div>
            )}
            <div className="result-actions">
              <button
                className="primary"
                onClick={() => {
                  setSettings(result.settings);
                  setChallenge(null);
                  start(undefined, {
                    ...result,
                    seed: crypto.getRandomValues(new Uint32Array(1))[0],
                  });
                }}
              >
                <RotateCcw size={17} />
                다시 연습하기
              </button>
              <button
                className="secondary"
                disabled={!reviewProblems(result).length}
                onClick={() => start(reviewProblems(result), result)}
              >
                <Target size={17} />
                느린 문제 복습
              </button>
              {result.kind === "timed" && (
                <button className="secondary" onClick={() => share(result)}>
                  <Share2 size={17} />
                  도전 공유
                </button>
              )}
            </div>
            <OperationStats sessions={[result]} />
            <section className="card review-list">
              <div className="section-heading">
                <h2>다시 보면 좋은 문제</h2>
                <span className="muted">건너뛴 문제 + 가장 느린 10문제</span>
              </div>
              {reviewProblems(result).length ? (
                <div className="review-items">
                  {[
                    ...result.attempts.filter((a) => a.skipped),
                    ...result.attempts
                      .filter((a) => !a.skipped)
                      .sort((a, b) => b.ms - a.ms)
                      .slice(0, 10),
                  ].map((a, i) => (
                    <div key={i}>
                      <span>
                        {a.problem.a} {a.problem.op} {a.problem.b}{" "}
                        <span className="muted">= {a.problem.answer}</span>
                      </span>
                      <span className="pill">
                        {a.skipped ? "건너뜀" : seconds(a.ms) + "초"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-text">
                  문제를 풀면 이곳에서 복습할 내용을 확인할 수 있어요.
                </p>
              )}
            </section>
          </section>
        )}
        {screen === "history" && (
          <section className="history-page">
            <div className="page-heading">
              <div>
                <span className="eyebrow">YOUR PRACTICE, IN NUMBERS</span>
                <h1 ref={headingRef} tabIndex={-1}>
                  차곡차곡, 나의 기록.
                </h1>
                <p>작은 연습이 모여 만드는 변화를 확인해 보세요.</p>
              </div>
              <span className="pill">이 브라우저에 저장됨</span>
            </div>
            <div className="history-totals">
              <Metric
                label="완료한 연습"
                value={sessions.filter((s) => s.completed).length + "회"}
                icon={<Clock3 size={18} />}
              />
              <Metric
                label="풀어낸 문제"
                value={
                  sessions.reduce((n, s) => n + s.score, 0).toLocaleString() +
                  "개"
                }
                icon={<Check size={18} />}
              />
              <Metric
                label="함께한 시간"
                value={
                  Math.round(
                    sessions.reduce((n, s) => n + s.elapsedMs, 0) / 60000,
                  ) + "분"
                }
                icon={<TrendingUp size={18} />}
              />
            </div>
            <HistoryChart sessions={sessions} />
            <OperationStats sessions={sessions} />
            <section className="card records-card">
              <div className="section-heading">
                <h2>
                  모든 연습{" "}
                  <span className="count-badge">{sessions.length}</span>
                </h2>
                <div className="backup-actions">
                  <button className="text-button" onClick={exportData}>
                    <Download size={15} />
                    백업
                  </button>
                  <button
                    className="text-button"
                    onClick={() => importRef.current?.click()}
                  >
                    <Upload size={15} />
                    가져오기
                  </button>
                  <button
                    className="text-button danger"
                    disabled={!sessions.length}
                    onClick={() => {
                      if (
                        confirm(
                          "저장된 모든 연습 기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.",
                        )
                      ) {
                        setSessions([]);
                        persist({ ...dataRef.current, sessions: [] });
                      }
                    }}
                  >
                    <Trash2 size={15} />
                    전체 삭제
                  </button>
                </div>
              </div>
              <input
                ref={importRef}
                className="sr-only"
                type="file"
                accept="application/json,.json"
                aria-label="JSON 백업 파일 가져오기"
                onChange={(e) => void importData(e.target.files?.[0])}
              />
              {sessions.length ? (
                <SessionList
                  sessions={sessions}
                  onSelect={(s) => {
                    setResult(s);
                    route("result");
                  }}
                />
              ) : (
                <div className="history-empty">
                  <BarChart3 size={32} />
                  <h3>성장은 첫 문제에서 시작돼요</h3>
                  <p>연습을 마치면 기록과 분석이 이곳에 표시됩니다.</p>
                  <button className="primary" onClick={() => navigate("home")}>
                    첫 연습 시작하기 <ArrowRight size={16} />
                  </button>
                </div>
              )}
              <p className="storage-note">
                최근 500회 기록을 보관합니다. 기기를 옮기거나 브라우저 데이터를
                지우기 전 JSON 백업을 내려받으세요.
              </p>
            </section>
          </section>
        )}
        {shareText && !playing && (
          <section className="share-panel card">
            <div className="section-heading">
              <h2>같은 문제로 함께 도전하세요</h2>
              <button
                className="icon-button"
                aria-label="공유 닫기"
                onClick={() => setShareText("")}
              >
                <X size={17} />
              </button>
            </div>
            <textarea
              aria-label="공유할 도전 링크"
              readOnly
              value={shareText}
              onFocus={(e) => e.target.select()}
            />
            <p className="muted">
              링크에는 게임 설정과 문제 순서만 담겨요. 개인 기록은 공유되지
              않습니다.
            </p>
          </section>
        )}
      </main>
      {!playing && (
        <footer>
          <span>
            <span className="footer-logo">sums.</span> 조금씩 쌓이는, 나만의
            속도.
          </span>
          <span>
            로그인 없이 · 기록은 내 기기에 <span className="footer-dot">·</span>{" "}
            Inspired by{" "}
            <a
              href="https://arithmetic.zetamac.com/"
              target="_blank"
              rel="noreferrer"
            >
              Zetamac <ArrowUpRight size={12} />
            </a>
          </span>
        </footer>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card metric">
      <span>
        {icon}
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}
function SessionList({
  sessions,
  onSelect,
}: {
  sessions: Session[];
  onSelect: (s: Session) => void;
}) {
  return (
    <div className="session-list">
      {sessions.map((s) => (
        <button className="session-row" key={s.id} onClick={() => onSelect(s)}>
          <span className="session-icon">
            {s.kind === "review" ? (
              <Target size={17} />
            ) : s.kind === "practice" ? (
              <Zap size={17} />
            ) : (
              <Clock3 size={17} />
            )}
          </span>
          <span className="session-title">
            <strong>
              {ko.modes[s.kind]}{" "}
              <span>
                {s.kind === "timed" ? s.settings.duration + "초" : ""}
                {!s.completed ? " · 중도 종료" : ""}
              </span>
            </strong>
            <small>{date(s.startedAt)}</small>
          </span>
          <span className="session-ops">{s.settings.ops.join(" ")}</span>
          <strong className="session-score">
            {s.score}
            <small> 문제</small>
          </strong>
          <ArrowUpRight size={16} />
        </button>
      ))}
    </div>
  );
}
function OperationStats({ sessions }: { sessions: Session[] }) {
  const attempts = sessions.flatMap((s) => s.attempts);
  const values = OPS.map((op) => {
    const all = attempts.filter((a) => a.problem.op === op);
    const correct = all.filter((a) => !a.skipped);
    return {
      op,
      count: correct.length,
      skipped: all.length - correct.length,
      mean: correct.length
        ? correct.reduce((n, a) => n + a.ms, 0) / correct.length
        : 0,
    };
  });
  const max = Math.max(1, ...values.map((v) => v.mean));
  return (
    <section className="card operation-stats">
      <div className="section-heading">
        <h2>연산별 페이스</h2>
        <span className="muted">정답 문제의 평균 풀이 시간</span>
      </div>
      <div className="op-stat-grid">
        {values.map((v) => (
          <div className="op-stat" key={v.op}>
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
            <p>
              정답 {v.count}개 · 건너뜀 {v.skipped}개
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
function HistoryChart({ sessions }: { sessions: Session[] }) {
  const eligible = sessions.filter((s) => s.kind === "timed" && s.completed);
  const configs = [
    ...new Map(
      eligible.map((s) => [configKey(s.settings), s.settings]),
    ).entries(),
  ];
  const [selected, setSelected] = useState("");
  const key = configs.some(([k]) => k === selected)
    ? selected
    : configs[0]?.[0];
  const daily = new Map<string, number>();
  for (const s of eligible
    .filter((s) => configKey(s.settings) === key)
    .reverse()) {
    const d = new Intl.DateTimeFormat("sv-SE").format(new Date(s.startedAt));
    daily.set(d, Math.max(daily.get(d) ?? 0, s.score));
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
            같은 설정의 날짜별 최고 점수 · 최근 14개 연습일
          </p>
        </div>
        {configs.length > 0 && (
          <select
            aria-label="기록 그래프 설정 선택"
            value={key}
            onChange={(e) => setSelected(e.target.value)}
          >
            {configs.map(([k, s]) => (
              <option key={k} value={k}>
                {s.duration}초 · {s.ops.join(" ")} · 덧셈{" "}
                {s.add.map((r) => r.join("–")).join("/")} · 곱셈{" "}
                {s.multiply.map((r) => r.join("–")).join("/")}
              </option>
            ))}
          </select>
        )}
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
          <p>시간제 게임을 완료하면 성장 그래프가 시작됩니다.</p>
        </div>
      )}
    </section>
  );
}
