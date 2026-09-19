import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const outDir = path.resolve('portfolio-captures');
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  deviceScaleFactor: 1,
});

const consoleLines = [];
page.on('console', msg => consoleLines.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => consoleLines.push(`[pageerror] ${err.message}`));

async function capture(name) {
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(outDir, `${name}.png`),
    fullPage: true,
  });

  const snapshot = await page.evaluate(() => ({
    title: document.title,
    bodyText: document.body.innerText,
    buttons: [...document.querySelectorAll('button')].map((el, index) => ({
      index,
      text: (el.textContent || '').trim(),
      id: el.id || '',
      className: el.className || '',
      action: el.getAttribute('data-action') || '',
    })),
    links: [...document.querySelectorAll('a')].map((el, index) => ({
      index,
      text: (el.textContent || '').trim(),
      href: el.getAttribute('href') || '',
      className: el.className || '',
    })),
    inputs: [...document.querySelectorAll('input, textarea, select')].map((el, index) => ({
      index,
      tag: el.tagName,
      id: el.id || '',
      placeholder: el.getAttribute('placeholder') || '',
      name: el.getAttribute('name') || '',
      type: el.getAttribute('type') || '',
      value: 'value' in el ? String(el.value || '') : '',
    })),
  }));

  await fs.writeFile(path.join(outDir, `${name}-dom.json`), JSON.stringify(snapshot, null, 2), 'utf8');
}

await page.goto('http://127.0.0.1:4177', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(4000);

await capture('today-empty');

const routes = [
  ['select', /选词制卡/],
  ['library', /单词库/],
  ['stats', /学习统计/],
  ['settings', /设置/],
];

for (const [name, label] of routes) {
  const button = page.getByRole('button', { name: label }).first();
  await button.click();
  await capture(name);
}

await fs.writeFile(path.join(outDir, 'browser-console.txt'), consoleLines.join('\n'), 'utf8');
await browser.close();
