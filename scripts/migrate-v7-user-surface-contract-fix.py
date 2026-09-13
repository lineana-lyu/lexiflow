from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

# User-facing Review copy: keep the next-day safety guarantee without exposing
# internal validation terminology.
path=ROOT/'scripts'/'check-learning-engine-v3.js'
text=path.read_text(encoding='utf-8')
old='assert(reviewUi.includes("没记住，明天再验证"),"next-day validation failure copy must not promise another same-day repair");'
new='assert(reviewUi.includes("没记住，明天再练"),"next-day validation failure copy must tell the learner to return tomorrow rather than promise another same-day repair");\nassert(!reviewUi.includes("没记住，明天再验证"),"retired internal validation wording must not return to the user surface");'
if old not in text:
    raise SystemExit('review copy contract anchor not found')
path.write_text(text.replace(old,new,1),encoding='utf-8')

# Runtime authority: Review V4 remains Core-owned, but its non-configurable
# workload policy must not be injected into Settings or exposed as engineering
# vocabulary on the Review page.
path=ROOT/'scripts'/'check-runtime-authority-v3.js'
text=path.read_text(encoding='utf-8')
old='''assert(reviewPolicy.includes("复习与学习负荷"),"Review workload surface must expose Review V4 load adaptation");
assert(reviewPolicy.includes("关键复习到期全部安排")&&reviewPolicy.includes("±2 / ±3 / ±4 / ±5"),"Review V4 surface must explain protected critical reviews and bounded Stable smoothing");
assert(!reviewPolicy.includes("data-review-mode")&&!reviewPolicy.includes("review-custom-cap")&&!reviewPolicy.includes("persistSettings"),"Review V4 must not restore manual daily Review caps or a second settings writer");'''
new='''assert(!reviewPolicy.includes("复习与学习负荷")&&!reviewPolicy.includes("settingsHtml")&&!reviewPolicy.includes("decorateSettings"),"Core-owned Review workload policy must stay out of user Settings because it is not configurable");
assert(reviewPolicy.includes("function syncFromGateway")&&reviewPolicy.includes("LexiFlowLearningDataGatewayV3?.current?.()"),"Review hint surface must read the shared Gateway snapshot");
assert(!reviewPolicy.includes("data-review-mode")&&!reviewPolicy.includes("review-custom-cap")&&!reviewPolicy.includes("persistSettings"),"Review V4 must not restore manual daily Review caps or a second settings writer");'''
if old not in text:
    raise SystemExit('runtime authority review-policy anchor not found')
text=text.replace(old,new,1)
old='assert(app.includes("自适应负荷")&&app.includes("关键复习不截断"),"app Review page must describe the active V4 workload policy");'
new='assert(!app.includes("自适应负荷")&&!app.includes("关键复习不截断"),"app Review page must not expose internal Review workload terminology");\nassert(app.includes("系统会自动安排今天真正需要巩固的词")&&app.includes("你不需要手动管理复习日期"),"app Review page must explain automatic scheduling in learner-facing language");'
if old not in text:
    raise SystemExit('runtime authority app-review-copy anchor not found')
text=text.replace(old,new,1)

# Settings still preserve the same underlying local-first dictionary and Codex
# runtime authorities, but they must present learner-facing connection states
# and verify them automatically on startup instead of exposing diagnostics.
old='''assert(app.includes("本地 Core + ECDICT 负责快速查词；在线词典只用于真人发音和例句增强。"),"Settings must explain the actual local-first dictionary architecture");
assert(app.includes("dictMaskedKey")&&app.includes("在线密钥已保存")&&app.includes("本地词典已就绪"),"Settings must expose saved dictionary-key and local dictionary readiness without revealing the credential");
assert(app.includes("providerChecks: { dictionary:null, ai:null }")&&app.includes("正在验证在线词典…")&&app.includes("在线增强验证失败"),"dictionary verification state must stay visibly persisted on the Settings page");
assert(app.includes("CLI 已检测")&&app.includes("未检测到登录")&&app.includes("runtimeTest")&&app.includes("fastTextTransport"),"AI Settings must distinguish CLI, auth, real runtime verification, and fast transport state");
assert(app.includes("正在发起真实 AI 请求…")&&app.includes("运行连接已验证")&&app.includes("运行连接失败"),"AI connection checks must have visible checking/success/failure states rather than toast-only feedback");'''
new='''assert(app.includes("本地词典负责快速查词；配置在线词典后，会自动补充真人发音和例句。"),"Settings must explain local-first dictionary behavior in learner-facing language");
assert(app.includes("dictMaskedKey")&&app.includes("密钥已保存")&&app.includes("本地词典可用"),"Settings must expose saved dictionary-key and local dictionary readiness without revealing the credential");
assert(app.includes("providerChecks: { dictionary:null, ai:null }")&&app.includes("正在连接在线词典…")&&app.includes("在线词典连接失败"),"dictionary connection state must remain visible on Settings");
assert(app.includes("verifyProviderConnectionsOnStartup")&&app.includes('/api/dictionary/test')&&app.includes('/api/ai/test'),"provider connections must be verified automatically with real service calls on startup");
assert(app.includes("正在连接 AI…")&&app.includes("AI 已连接")&&app.includes("AI 连接失败"),"AI connection state must expose checking/success/failure without diagnostic jargon");
for(const internalLabel of ["CLI 已检测","CLI 未检测","真实 AI 请求验证","Fast transport","运行连接已验证"]){assert(!app.includes(internalLabel),`Settings must not expose internal diagnostic label: ${internalLabel}`);}'''
if old not in text:
    raise SystemExit('runtime authority Settings block anchor not found')
text=text.replace(old,new,1)
old='assert(app.includes("<h3>AI 辅助</h3>")&&app.includes("<h3>AI 高级配置</h3>"),"app.js base Settings surface must match the current product labels");'
new='assert(app.includes("<h3>AI 辅助</h3>")&&app.includes("<h3>AI 模型</h3>"),"app.js Settings surface must use learner-facing AI labels");'
if old not in text:
    raise SystemExit('runtime authority AI label anchor not found')
text=text.replace(old,new,1)
path.write_text(text,encoding='utf-8')
print('user-facing Review and Settings contracts aligned')
