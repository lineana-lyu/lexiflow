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
        scene: '我站在阳台给一株刚冒出新叶的薄荷浇水。镜头拉近时能看到新叶一层层长出来，提醒我 grow 是“持续成长”，不是一瞬间变好。',
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
  await page.waitForTimeout(900);
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
    visualNote: '',
    imageData: null,
    imageUrl: '',
    userSentence: '',
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
  await page.waitForTimeout(1600);
}

await boot();

// Visualize: learner writes first, then explicitly asks AI to make the scene more concrete.
await resetData(dataFor(baseCard('visualize', {
  visualNote: '想到阳台上的薄荷从一小株慢慢长高，我每天给它浇水。',
})));
await page.locator('[data-action="continue-learning"]').first().click();
await page.waitForTimeout(1200);
await page.locator('[data-visual-v3="assist"]').first().click();
await page.waitForFunction(() => document.body.innerText.includes('AI 建议 · 仅供参考'), null, { timeout: 10000 });
await capture('visualize-ai-assisted');

// Apply: learner writes first, then AI checks it; optional advice does not overwrite the sentence.
await resetData(dataFor(baseCard('apply', {
  practicePrompt: { question: '说一句你希望自己未来在哪方面持续成长。' },
})));
await page.locator('[data-action="continue-learning"]').first().click();
await page.waitForTimeout(1200);
await page.locator('#apply-text').fill('I want to grow into a better product manager by building real products.');
await page.locator('[data-action="submit-apply"]').first().click();
await page.waitForFunction(() => document.body.innerText.includes('表达可以使用'), null, { timeout: 10000 });
await capture('apply-ai-checked');

await fs.writeFile(path.join(outDir, 'browser-console.txt'), consoleLines.join('\n'), 'utf8');
await browser.close();
