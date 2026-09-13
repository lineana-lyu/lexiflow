from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'public'/'app.js'
text=path.read_text(encoding='utf-8')
text=text.replace('mastered','stableTotal')
if 'mastered' in text:
    raise SystemExit('historical mastered identifier still present in app.js')
path.write_text(text,encoding='utf-8')
print('stats stable identifier normalized')
