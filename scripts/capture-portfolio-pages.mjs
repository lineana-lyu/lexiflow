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

await page.route('**/api/ai/visual-scene', async route => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      assist: {
        scene: '我站在阳台给一株刚冒出新叶的薄荷浇水。镜头拉近时能看到新叶一层层长出来，让我把“每天照料、慢慢长高”的过程和这个词绑定起来。',
        cue: '把 grow 和“每天照料、慢慢长高”的过程绑定。',
        practiceQuestion: '说一句你希望自己未来在哪方面持续成长。',
      },
    }),
  });
});

await page.route('**/api/ai/text', async route => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      feedback: {
        level: 'good',
        approved: true,
        inputLanguage: 'en',
        keyword: 'grow',
        title: '表达可以使用',
        suggestion: '',
        tips: [],
        changes: [],
        actions: [],
        issues: [
          {
            id: 'detail-1',
            span: 'better product manager',
            reason: '句子本身正确；如果想更具体，可以说明你希望成长成哪一类产品经理。',
            hint: '可以保留原句，也可以补充更具体的能力方向。',
            category: 'expression',
            severity: 'suggestion',
            blocking: false
          }
        ]
      }
    }),
  });
});

async function capture(name) {
  await page.waitForTimeout(700);
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
      className: el.className || '',
      action: el.getAttribute('data-action') || '',
    })),
    inputs: [...document.querySelectorAll('input, textarea, select')].map((el, index) => ({
      index,
      tag: el.tagName,
      id: el.id || '',
      value: 'value' in el ? String(el.value || '') : '',
    })),
  }));
  await fs.writeFile(path.join(outDir, `${name}-dom.json`), JSON.stringify(snapshot, null, 2), 'utf8');
}

await page.goto('http://127.0.0.1:4177', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(3000);

// Create one real learning card through the product's normal Select flow.
await page.getByRole('button', { name: /选词制卡/ }).first().click();
await page.locator('#word-input').fill('grow');
await page.getByRole('button', { name: /^查询$/ }).click();
await page.waitForTimeout(3000);
await page.locator('[data-action="save-card"]').first().click();
await page.waitForTimeout(1500);

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
  await page.waitForTimeout(1800);
  return cardId;
}

// Visualize: learner-owned association first, then explicit AI assistance.
const cardId = await setStage('visualize', {
  visualNote: '想到阳台上的薄荷从一小株慢慢长高，我每天给它浇水。',
  imageData: null,
  imageUrl: '',
  visualSceneSuggestion: null,
  visualImageConfirmed: false,
});
await page.evaluate(id => window.LexiFlowStudyRenderer.openCard(id), cardId);
await page.waitForSelector('[data-visualize-stage-v3]', { timeout: 15000 });
await page.locator('[data-visual-v3="assist"]').first().click();
await page.waitForFunction(() => document.body.innerText.includes('AI 建议 · 仅供参考'), null, { timeout: 10000 });
await capture('visualize-ai-assisted');

// Apply: learner writes first, then AI checks; optional advice keeps user agency.
await setStage('apply', {
  userSentence: '',
  applyDraft: '',
  applyDraftSavedAt: '',
  practicePrompt: { question: '说一句你希望自己未来在哪方面持续成长。' },
});
await page.evaluate(id => window.LexiFlowStudyRenderer.openCard(id), cardId);
await page.waitForSelector('[data-apply-stage-v3-root]', { timeout: 15000 });
await page.locator('#apply-text').fill('I want to grow into a better product manager by building real products.');
await page.locator('[data-action="submit-apply"]').first().click();
await page.waitForFunction(() => document.body.innerText.includes('表达可以使用'), null, { timeout: 10000 });
await capture('apply-ai-checked');

await fs.writeFile(path.join(outDir, 'browser-console.txt'), consoleLines.join('\n'), 'utf8');
await browser.close();
