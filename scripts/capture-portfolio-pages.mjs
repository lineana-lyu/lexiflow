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

  if (name === 'select') {
    await page.locator('#word-input').fill('grow');
    await page.getByRole('button', { name: /^查询$/ }).click();
    await page.waitForTimeout(3500);
    await capture('lookup-grow');

    const saveButton = page.locator('[data-action="save-card"]').first();
    await saveButton.click();
    await page.waitForTimeout(1800);
    await capture('today-with-grow');

    await page.getByRole('button', { name: /单词库/ }).first().click();
    await capture('library-with-grow');

    await page.getByRole('button', { name: /选词制卡/ }).first().click();
  }
}


async function setStage(stage, patch = {}) {
  const cardId = await page.evaluate(async ({ stage, patch }) => {
    const payload = await fetch('/api/learning-data', { cache: 'no-store' }).then(r => r.json());
    const data = payload.data;
    const card = data.cards[0];
    if (!card) throw new Error('NO_CARD_FOR_STAGE_CAPTURE');

    card.stage = stage;
    card.learningStage = stage;
    card.inboxPending = false;
    card.memoryState = patch.memoryState ?? (stage === 'review' ? 'reinforcing' : '');
    Object.assign(card, patch);

    if (stage === 'review') {
      const d = new Date();
      const day = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
      data.dailyPlan = {
        version: 3,
        date: day,
        frozen: true,
        review: [card.id],
        memorize: [],
        visualize: [],
        apply: [],
        select: [],
        remainingSelectSlots: 0,
      };
    }

    await fetch('/api/learning-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, appShellAuthority: 'portfolio-capture' }),
    });

    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('lexiflow-')) localStorage.removeItem(key);
    }
    return card.id;
  }, { stage, patch });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  return cardId;
}

const stageCardId = await setStage('memorize', { memorizeRound: 1 });
await page.evaluate(id => window.LexiFlowStudyRenderer.openCard(id), stageCardId);
await page.waitForSelector('.lexi-m2', { timeout: 15000 });
const revealButton = page.locator('[data-m2="reveal"]').first();
if (await revealButton.count()) {
  await revealButton.click();
  await page.waitForTimeout(450);
}
await capture('stage-memorize-grow');

await setStage('visualize', {
  visualNote: '',
  imageData: null,
  imageUrl: '',
  visualSceneSuggestion: null,
  visualImageConfirmed: false,
});
await page.evaluate(id => window.LexiFlowStudyRenderer.openCard(id), stageCardId);
await page.waitForSelector('[data-visualize-stage-v3]', { timeout: 15000 });
await page.locator('#visual-note').fill('想到阳台上的薄荷从一小株慢慢长高，我每天给它浇水。');
await page.waitForTimeout(350);
await capture('stage-visualize-grow');

await setStage('apply', {
  userSentence: '',
  practicePrompt: { question: '说说一个你想持续成长的真实目标。' },
});
await page.evaluate(id => window.LexiFlowStudyRenderer.openCard(id), stageCardId);
await page.waitForSelector('[data-apply-stage-v3-root]', { timeout: 15000 });
await page.locator('#apply-text').fill('I want to grow into a better product manager by building real products.');
await page.waitForTimeout(350);
await capture('stage-apply-grow');

await setStage('review', {
  reviewCount: 0,
  reviewStep: 0,
  initialReviewPending: false,
  memoryState: 'reinforcing',
});

await page.clock.install({ time: new Date(Date.now() + 36 * 60 * 60 * 1000) });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200);
await page.evaluate(() => localStorage.removeItem('lexiflow-review-session-v3'));
await page.evaluate(() => window.LexiFlowReviewSessionV3.restart());
await page.waitForTimeout(2200);

if (await page.locator('.lexi-r3-card').count()) {
  const reviewReveal = page.locator('[data-r3="reveal"]').first();
  if (await reviewReveal.count()) {
    await reviewReveal.click();
    await page.waitForTimeout(350);
  } else {
    const reviewInput = page.locator('#lexi-r3-answer');
    if (await reviewInput.count()) {
      await reviewInput.fill('grow');
      const check = page.locator('[data-r3="check"]').first();
      if (await check.count()) await check.click();
      await page.waitForTimeout(350);
    }
  }
  await capture('stage-review-grow');
} else {
  await capture('stage-review-debug');
  const debug = await page.evaluate(async () => {
    const payload = await fetch('/api/learning-data', { cache: 'no-store' }).then(r => r.json());
    return {
      bodyText: document.body.innerText,
      dailyPlan: payload.data?.dailyPlan || null,
      card: payload.data?.cards?.[0] || null,
      reviewSession: localStorage.getItem('lexiflow-review-session-v3'),
    };
  });
  await fs.writeFile(path.join(outDir, 'stage-review-debug.json'), JSON.stringify(debug, null, 2), 'utf8');
}

await fs.writeFile(path.join(outDir, 'browser-console.txt'), consoleLines.join('\n'), 'utf8');
await browser.close();
