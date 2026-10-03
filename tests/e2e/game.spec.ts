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
