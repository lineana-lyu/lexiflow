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

async function capture(name, fullPage = true) {
  await page.waitForTimeout(900);
  await page.screenshot({
    path: path.join(outDir, `${name}.png`),
    fullPage,
  });
  const snapshot = await page.evaluate(() => ({
    title: document.title,
    bodyText: document.body.innerText,
    buttons: [...document.querySelectorAll('button')].map((el, index) => ({
      index,
      text: (el.textContent || '').trim(),
      className: el.className || '',
      action: el.getAttribute('data-action') || '',
      r3: el.getAttribute('data-r3') || '',
    })),
    inputs: [...document.querySelectorAll('input, textarea, select')].map((el, index) => ({
      index,
      tag: el.tagName,
      id: el.id || '',
      placeholder: el.getAttribute('placeholder') || '',
      value: 'value' in el ? String(el.value || '') : '',
    })),
  }));
  await fs.writeFile(path.join(outDir, `${name}-dom.json`), JSON.stringify(snapshot, null, 2), 'utf8');
}

async function boot() {
  await page.goto('http://127.0.0.1:4177', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(2200);
}

async function resetData(data) {
  await page.evaluate(async payload => {
    const response = await fetch('/api/learning-data', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({data: payload, appShellAuthority:'portfolio-capture'}),
    });
    if (!response.ok) throw new Error('seed failed');
  }, data);
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1800);
}

function isoToday(hour=9) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function isoYesterday() {
  const d = new Date();
  d.setDate(d.getDate()-1);
  d.setHours(9,0,0,0);
  return d.toISOString();
}

function baseCard(stage, overrides={}) {
  return {
    id: `portfolio-${stage}`,
    word: 'grow',
    phonetic: 'ɡrəʊ',
    pos: 'verb',
    meaningZh: '成长；发展；逐渐变得',
    exampleEn: 'You grow by what you practice.',
    exampleZh: '你会因反复练习的事情而成长。',
    stage,
    learningStage: stage,
    inboxPending: false,
    createdAt: isoYesterday(),
    updatedAt: isoToday(),
    stageEligibleOn: isoToday(),
    reviewCount: 0,
    memoryHistory: [],
    visualNote: '想到自己第一次独立完成一个完整项目，能力是一点点长出来的。',
    imageData: null,
    imageUrl: '',
    userSentence: 'I want to grow into a product manager who can turn ideas into real products.',
    sourceType: 'work',
    sourceTitle: '个人项目复盘',
    sourceContext: '能力不是一下子获得的，而是在一次次真实项目里慢慢长出来。',
    ...overrides,
  };
}

function dataFor(card) {
  return {
    version: 1,
    settings: { dailyGoal: 3, ttsVoice:'af_bella' },
    cards: [card],
    activities: [],
    createdAt: isoYesterday(),
  };
}

await boot();

// 1. Real lookup result: the entry point into Select.
await page.getByRole('button', { name: /选词制卡/ }).first().click();
await page.locator('#word-input').fill('grow');
await page.getByRole('button', { name: /^查询$/ }).click();
await page.waitForTimeout(2600);
await capture('core-select-lookup');

// 2. Memorize: active recall / memory-stage surface.
await resetData(dataFor(baseCard('memorize')));
const continueBtn = page.locator('[data-action="continue-learning"]').first();
await continueBtn.click();
await page.waitForTimeout(1500);
await capture('core-memorize');

// 3. Visualize: learner association first, AI is optional assistance.
await resetData(dataFor(baseCard('visualize', {
  visualNote: '想到一株植物从幼苗慢慢长高，也想到自己第一次独立完成产品闭环。',
})));
await page.locator('[data-action="continue-learning"]').first().click();
await page.waitForTimeout(1500);
await capture('core-visualize');

// 4. Apply: learner writes first, then AI checking.
await resetData(dataFor(baseCard('apply', {
  userSentence: '',
  practicePromptZh: '说一句你希望自己未来在哪方面成长。',
})));
await page.locator('[data-action="continue-learning"]').first().click();
await page.waitForTimeout(1500);
const applyEditor = page.locator('textarea, input').filter({has: page.locator('')});
const visibleTextarea = page.locator('textarea:visible').first();
if (await visibleTextarea.count()) {
  await visibleTextarea.fill('I want to grow into a product manager who can turn ideas into real products.');
}
await capture('core-apply');

// 5. Review: scheduled active recall.
const now = new Date();
const reviewCard = baseCard('review', {
  memoryState: 'reinforcing',
  reviewStep: 1,
  stableStep: 0,
  nextReviewAt: isoToday(8),
  stageEligibleOn: isoYesterday(),
  applyCompletedOn: isoYesterday(),
});
await resetData(dataFor(reviewCard));
const reviewBtn = page.locator('[data-action="start-review"]').first();
await reviewBtn.click();
await page.waitForTimeout(1500);
await capture('core-review');

await fs.writeFile(path.join(outDir, 'browser-console.txt'), consoleLines.join('\n'), 'utf8');
await browser.close();
