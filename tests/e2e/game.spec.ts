import { expect, test, type Page } from "@playwright/test";
async function setup(page: Page) {
  await page.goto("/");
  await page.clock.install();
}
async function start(page: Page) {
  await page.getByRole("button", { name: "바로 시작", exact: true }).click();
  await page.clock.fastForward(3100);
  await expect(page.getByTestId("equation")).toBeVisible();
}
async function solve(page: Page, touch = false) {
  const value = await page.getByTestId("equation").innerText();
  const match = value.match(/(\d+)\s*([+−×÷])\s*(\d+)/)!;
  const a = Number(match[1]),
    b = Number(match[3]);
  const answer =
    match[2] === "+"
      ? a + b
      : match[2] === "−"
        ? a - b
        : match[2] === "×"
          ? a * b
          : a / b;
  for (const d of String(answer)) {
    if (touch)
      await page
        .getByRole("button", { name: `숫자 ${d}`, exact: true })
        .click();
    else await page.keyboard.press(d);
  }
  return value;
}
test("complete a timed game, retain records, review and open a challenge", async ({
  page,
  isMobile,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "30초", exact: true }).click();
  await start(page);
  await solve(page, isMobile);
  await page.getByRole("button", { name: "건너뛰기", exact: true }).click();
  await page.clock.fastForward(31000);
  await expect(
    page.getByRole("heading", { name: "좋은 집중이었어요." }),
  ).toBeVisible();
  await expect(page.getByText("건너뛴 문제", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "도전 공유", exact: true }).click();
  const shared = await page
    .getByRole("textbox", { name: "공유할 도전 링크" })
    .inputValue();
  expect(shared).toContain("#challenge=");
  await page
    .getByRole("button", { name: "느린 문제 복습", exact: true })
    .click();
  await page.clock.fastForward(3100);
  await solve(page, isMobile);
  await solve(page, isMobile);
  await expect(
    page.getByRole("heading", { name: "좋은 집중이었어요." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "나의 기록", exact: true }).click();
  await expect(page.getByText("시간제 30초")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "차곡차곡, 나의 기록." }),
  ).toBeVisible();
  await expect(page.getByText("시간제 30초")).toBeVisible();
  await page.goto(shared.split("\n").at(-1)!);
  await expect(page.getByText("도전장을 받았어요")).toBeVisible();
});
test("practice entry, deletion, theme, backup and restore", async ({
  page,
  isMobile,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "밝은 테마 / 어두운 테마 전환" })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "자유 연습", exact: true }).click();
  await start(page);
  await page.getByRole("button", { name: "숫자 9", exact: true }).click();
  await page.getByRole("button", { name: "전체 지우기", exact: true }).click();
  await expect(
    page.getByText("정답을 입력하세요", { exact: true }),
  ).toBeVisible();
  await solve(page, isMobile);
  await page.getByRole("button", { name: "연습 마치기" }).click();
  await expect(
    page.getByRole("heading", { name: "좋은 집중이었어요." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "나의 기록", exact: true }).click();
  const data = await page.evaluate(() => localStorage.getItem("sums.data.v1")!);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "백업", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/sums-backup/);
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "전체 삭제" }).click();
  await expect(
    page.getByRole("heading", { name: "성장은 첫 문제에서 시작돼요" }),
  ).toBeVisible();
  await page.getByLabel("JSON 백업 파일 가져오기").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(data),
  });
  await expect(
    page.getByText("백업을 가져왔습니다.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".session-row")).toHaveCount(1);
  await page.getByLabel("JSON 백업 파일 가져오기").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(data),
  });
  await expect(page.locator(".session-row")).toHaveCount(1);
});
test("reject invalid ranges and malformed challenges", async ({ page }) => {
  await page.goto("/#challenge=bad");
  await expect(
    page.getByText("유효하지 않거나 지원하지 않는 도전 링크입니다."),
  ).toBeVisible();
  await page.getByText("숫자 범위 설정", { exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "덧셈 1번째 수 최솟값" })
    .fill("101");
  await expect(
    page.getByRole("button", { name: "바로 시작", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("spinbutton", { name: "덧셈 1번째 수 최솟값" })
    .fill("2");
  await expect(
    page.getByRole("button", { name: "바로 시작", exact: true }),
  ).toBeEnabled();
});
test("no horizontal overflow at 320px or compact landscape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await setup(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await start(page);
  const portraitPad = await page.locator(".number-pad").boundingBox();
  const skipButton = await page
    .getByRole("button", { name: "건너뛰기", exact: true })
    .boundingBox();
  expect(skipButton!.y + skipButton!.height).toBeLessThanOrEqual(
    portraitPad!.y,
  );
  expect(portraitPad!.y + portraitPad!.height).toBeLessThanOrEqual(740);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 667, height: 375 });
  await expect(page.getByTestId("equation")).toBeVisible();
  const pad = await page.locator(".number-pad").boundingBox();
  expect(pad!.y + pad!.height).toBeLessThanOrEqual(375);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("a shared challenge starts the same sequence for its creator and recipient", async ({
  page,
  context,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "도전 공유", exact: true }).click();
  const shared = await page
    .getByRole("textbox", { name: "공유할 도전 링크" })
    .inputValue();
  await start(page);
  const first = await page.getByTestId("equation").innerText();
  const recipient = await context.newPage();
  await recipient.goto(shared.split("\n").at(-1)!);
  await recipient.clock.install();
  await start(recipient);
  expect(await recipient.getByTestId("equation").innerText()).toBe(first);
  await page.getByRole("button", { name: "건너뛰기", exact: true }).click();
  await recipient
    .getByRole("button", { name: "건너뛰기", exact: true })
    .click();
  expect(await recipient.getByTestId("equation").innerText()).toBe(
    await page.getByTestId("equation").innerText(),
  );
});
test("keeps playing if browser storage is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Full", "QuotaExceededError");
    };
  });
  await setup(page);
  await start(page);
  await expect(
    page.getByText("기록을 저장하지 못했습니다.", { exact: false }),
  ).toBeVisible();
  await solve(page);
  await page.clock.fastForward(121000);
  await expect(
    page.getByRole("heading", { name: "좋은 집중이었어요." }),
  ).toBeVisible();
});

test("focus mode, optional feedback and immediate Enter restart", async ({
  page,
  isMobile,
}) => {
  await setup(page);
  await page.getByText("플레이 옵션", { exact: true }).click();
  await page
    .getByRole("checkbox", { name: "시작 전 3초 카운트다운" })
    .uncheck();
  await page.getByRole("button", { name: "30초", exact: true }).click();
  await page.getByRole("button", { name: "바로 시작", exact: true }).click();
  await expect(page.getByTestId("equation")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await solve(page, isMobile);
  await expect(page.getByTestId("correct-feedback")).toHaveCount(1);
  const before = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem(
        Object.keys(localStorage).find((k) => k.startsWith("sums.draft.v1."))!,
      )!,
    ),
  );
  await page.clock.fastForward(31000);
  await expect(
    page.getByRole("heading", { name: "좋은 집중이었어요." }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("equation")).toBeVisible();
  const after = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem(
        Object.keys(localStorage).find((k) => k.startsWith("sums.draft.v1."))!,
      )!,
    ),
  );
  expect(after.settings).toEqual(before.settings);
  expect(after.id).not.toBe(before.id);
  await page.clock.fastForward(31000);
  await page.getByRole("button", { name: "연습으로 돌아가기" }).click();
  await page.getByText("플레이 옵션", { exact: true }).click();
  await page.getByRole("checkbox", { name: "정답 피드백" }).uncheck();
  await page.reload();
  await page.getByText("플레이 옵션", { exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "정답 피드백" }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "시작 전 3초 카운트다운" }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "바로 시작", exact: true }).click();
  await solve(page, isMobile);
  await expect(page.getByTestId("correct-feedback")).toHaveCount(0);
});

test("recovers interrupted play once and excludes it from statistics", async ({
  page,
  isMobile,
}) => {
  await setup(page);
  await start(page);
  await solve(page, isMobile);
  await page.reload();
  await expect(
    page.getByText("중단된 게임을 기록에 보관했습니다.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "나의 기록", exact: true }).click();
  await expect(page.locator(".session-row")).toHaveCount(1);
  await expect(page.locator(".session-row")).toContainText("중도 종료");
  await expect(
    page.getByText("선택한 조건의 완료 기록 0회", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".session-row")).toHaveCount(1);
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "전체 삭제" }).click();
  await page.reload();
  await expect(page.locator(".session-row")).toHaveCount(0);
});

test("keyboard restart respects focused controls and reduced motion", async ({
  page,
  isMobile,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setup(page);
  await page.getByRole("button", { name: "30초", exact: true }).click();
  await start(page);
  await solve(page, isMobile);
  await expect(page.getByTestId("correct-feedback")).toBeHidden();
  await page.clock.fastForward(31000);
  const share = page.getByRole("button", { name: "도전 공유", exact: true });
  await share.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("textbox", { name: "공유할 도전 링크" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "좋은 집중이었어요." }),
  ).toBeVisible();
});

test("small portrait and landscape keep controls reachable with large numbers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await setup(page);
  await page.getByText("숫자 범위 설정", { exact: true }).click();
  for (const name of [
    "덧셈 1번째 수 최댓값",
    "덧셈 2번째 수 최댓값",
    "곱셈 1번째 수 최댓값",
    "곱셈 2번째 수 최댓값",
  ])
    await page.getByRole("spinbutton", { name }).fill("999");
  for (const name of [
    "덧셈 1번째 수 최솟값",
    "덧셈 2번째 수 최솟값",
    "곱셈 1번째 수 최솟값",
    "곱셈 2번째 수 최솟값",
  ])
    await page.getByRole("spinbutton", { name }).fill("999");
  await start(page);
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    const pad = await page.locator(".number-pad").boundingBox();
    const skip = await page
      .getByRole("button", { name: "건너뛰기", exact: true })
      .boundingBox();
    expect(pad!.y + pad!.height).toBeLessThanOrEqual(viewport.height);
    expect(skip!.y + skip!.height).toBeLessThanOrEqual(viewport.height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const button of await page.locator(".number-pad button").all()) {
      const bounds = await button.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(48);
      expect(bounds!.width).toBeGreaterThanOrEqual(48);
    }
  }
});

test("statistics filter mode, conditions and period without mixing review records", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const settings = {
      mode: "timed",
      duration: 120,
      ops: ["+"],
      add: [
        [2, 100],
        [2, 100],
      ],
      multiply: [
        [2, 12],
        [2, 100],
      ],
    };
    const make = (id: string, ms: number, changes: object = {}) => ({
      id,
      settings,
      seed: 1,
      startedAt: new Date().toISOString(),
      elapsedMs: 120000,
      score: 1,
      attempts: [
        { problem: { a: 2, b: 3, op: "+", answer: 5 }, ms, skipped: false },
      ],
      kind: "timed",
      completed: true,
      ...changes,
    });
    localStorage.setItem(
      "sums.data.v1",
      JSON.stringify({
        v: 1,
        settings,
        sessions: [
          make("one", 1000),
          make("two", 3000),
          make("review", 10000, { kind: "review" }),
          make("range", 20000, {
            settings: {
              ...settings,
              add: [
                [2, 9],
                [2, 9],
              ],
            },
          }),
          make("old", 30000, {
            startedAt: new Date(Date.now() - 60 * 86400000).toISOString(),
          }),
          make("interrupted", 40000, { completed: false }),
        ],
      }),
    );
  });
  await page.goto("/#history");
  await page
    .getByRole("combobox", { name: "기간", exact: true })
    .selectOption("7");
  await expect(
    page.getByText("선택한 조건의 완료 기록 2회", { exact: false }),
  ).toBeVisible();
  await expect(page.getByTestId("stat-+")).toContainText("중앙값 2.0초");
  await page
    .getByRole("combobox", { name: "게임 종류", exact: true })
    .selectOption("review");
  await expect(
    page.getByText("선택한 조건의 완료 기록 1회", { exact: false }),
  ).toBeVisible();
  await expect(page.getByTestId("stat-+")).toContainText("중앙값 10.0초");
  await page
    .getByRole("combobox", { name: "게임 종류", exact: true })
    .selectOption("timed");
  await page
    .getByRole("combobox", { name: "비교할 설정", exact: true })
    .selectOption({ index: 1 });
  await expect(page.getByTestId("stat-+")).toContainText("중앙값 20.0초");
  await page
    .getByRole("combobox", { name: "비교할 설정", exact: true })
    .selectOption({ index: 0 });
  await page
    .getByRole("combobox", { name: "기간", exact: true })
    .selectOption("all");
  await expect(
    page.getByText("선택한 조건의 완료 기록 3회", { exact: false }),
  ).toBeVisible();
  await expect(page.getByTestId("stat-+")).toContainText("중앙값 3.0초");
});

test("closing and reopening a tab retains the last answered problem", async ({
  page,
  context,
  isMobile,
}) => {
  await setup(page);
  await start(page);
  await solve(page, isMobile);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/#history");
  await expect(reopened.locator(".session-row")).toHaveCount(1);
  await expect(reopened.locator(".session-row")).toContainText("중도 종료");
  await expect(reopened.locator(".session-score")).toHaveText("1 문제");
  await reopened.reload();
  await expect(reopened.locator(".session-row")).toHaveCount(1);
});
