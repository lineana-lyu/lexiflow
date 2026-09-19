const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.LEXIFLOW_CAPTURE_URL || "http://127.0.0.1:4177";
const OUT = path.resolve(process.env.LEXIFLOW_CAPTURE_DIR || "portfolio-screenshots");

fs.mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  console.log("[capture] screenshot", name);
  await page.screenshot({
    path: path.join(OUT, name),
    type: "png",
    fullPage: false,
    animations: "disabled",
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  const hardStop = setTimeout(() => {
    console.error("[capture] hard timeout");
    process.exit(124);
  }, 110000);
  hardStop.unref();

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: "light",
      locale: "zh-CN",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);

    page.on("console", msg => console.log("[browser]", msg.type(), msg.text()));
    page.on("pageerror", err => console.error("[pageerror]", err.message));

    console.log("[capture] open app");
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(3500);
    await shot(page, "01-today.png");

    console.log("[capture] open add page");
    const addButton = page.locator('[data-route="add"]').first();
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click().catch(err => console.warn("[capture] add click:", err.message));
      await sleep(1200);
      await shot(page, "02-add-word.png");
    }

    console.log("[capture] lookup grow");
    const input = page.locator("#word-input");
    if (await input.isVisible().catch(() => false)) {
      await input.fill("grow").catch(err => console.warn("[capture] fill:", err.message));
      await page.locator("#lookup-form").evaluate(form => form.requestSubmit()).catch(err => console.warn("[capture] submit:", err.message));
      await sleep(4500);
      await shot(page, "03-lookup-grow.png");
    }

    console.log("[capture] save card");
    const save = page.locator('[data-action="save-card"]').first();
    if (await save.isVisible().catch(() => false) && !(await save.isDisabled().catch(() => true))) {
      await save.click().catch(err => console.warn("[capture] save:", err.message));
      await sleep(1800);
      await shot(page, "04-today-with-word.png");
    }

    console.log("[capture] open library");
    const library = page.locator('[data-route="library"]').first();
    if (await library.isVisible().catch(() => false)) {
      await library.click().catch(err => console.warn("[capture] library:", err.message));
      await sleep(1400);
      await shot(page, "05-library.png");

      const edit = page.locator('[data-action="open-library-editor"]').first();
      if (await edit.isVisible().catch(() => false)) {
        await edit.click().catch(err => console.warn("[capture] editor:", err.message));
        await sleep(1000);
        await shot(page, "06-library-editor.png");
      }
    }

    console.log("[capture] complete");
  } finally {
    await browser.close().catch(() => {});
  }
})().catch(err => {
  console.error("[capture] fatal", err);
  process.exitCode = 1;
});
