from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'scripts'/'check-learning-engine-v3.js'
text=path.read_text(encoding='utf-8')
old='assert(reviewUi.includes("没记住，明天再验证"),"next-day validation failure copy must not promise another same-day repair");'
new='assert(reviewUi.includes("没记住，明天再练"),"next-day validation failure copy must tell the learner to return tomorrow rather than promise another same-day repair");\nassert(!reviewUi.includes("没记住，明天再验证"),"retired internal validation wording must not return to the user surface");'
if old not in text:
    raise SystemExit('review copy contract anchor not found')
path.write_text(text.replace(old,new,1),encoding='utf-8')
print('user-facing review copy contract aligned')
