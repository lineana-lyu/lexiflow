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
# workload policy must not be injected into Settings.
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
path.write_text(text.replace(old,new,1),encoding='utf-8')
print('user-facing Review contracts aligned')
