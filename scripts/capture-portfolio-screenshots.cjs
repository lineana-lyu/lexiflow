const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.LEXIFLOW_CAPTURE_URL || "http://127.0.0.1:4177";
const OUT = path.resolve(process.env.LEXIFLOW_CAPTURE_DIR || "portfolio-screenshots");

function ensureDir() {
  fs.mkdirSync(OUT, { recursive: true });
}

async function waitForText(page, text) {
  await page.getByText(text, { exact: true }).first().waitFor({ state: "visible", timeout: 30000 });
}

async function shot(page, name) {
  await page.screenshot({
    path: path.join(OUT, name),
    type: "png",
    fullPage: false,
    animations: "disabled",
  });
}

(async () => {
  ensureDir();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "zh-CN",
  });
  const page = await context.newPage();

  page.on("console", msg => console.log("[browser]", msg.type(), msg.text()));
  page.on("pageerror", err => console.error("[pageerror]", err.message));

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForText(page, "今日学习");
  await shot(page, "01-today-empty.png");

  const firstWord = page.getByRole("button", { name: "添加第一个单词" });
  if (await firstWord.count()) {
    await firstWord.click();
  } else {
    await page.locator('[data-route="add"]').first().click();
  }

  await waitForText(page, "选词制卡");
  await page.locator("#word-input").fill("grow");
  await page.locator("#lookup-form").evaluate(form => form.requestSubmit());
  await page.locator(".word-result").waitFor({ state: "visible", timeout: 30000 });
  await page.getByText("grow", { exact: true }).first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(800);
  await shot(page, "02-lookup-grow.png");

  const save = page.locator('[data-action="save-card"]');
  await save.waitFor({ state: "visible", timeout: 15000 });
  await save.click();

  await waitForText(page, "今日学习");
  await page.waitForTimeout(800);
  await shot(page, "03-today-with-word.png");

  await page.locator('[data-route="library"]').first().click();
  await waitForText(page, "单词库");
  await page.getByText("grow", { exact: true }).first().waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(500);
  await shot(page, "04-library.png");

  const edit = page.locator('[data-action="open-library-editor"]').first();
  if (await edit.count()) {
    await edit.click();
    await page.waitForTimeout(600);
    await shot(page, "05-library-editor.png");
  }

  await browser.close();
  console.log("Saved screenshots to", OUT);
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
