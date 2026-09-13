from pathlib import Path
import runpy

path=Path("public/app.js")
text=path.read_text(encoding="utf-8")
line='    state.visualSceneExpanded=Boolean(card.visualNote);\n'
if text.count(line)!=1:
    raise SystemExit(f"legacy visualSceneExpanded assignment count was {text.count(line)}")
path.write_text(text.replace(line,"",1),encoding="utf-8")
runpy.run_path("scripts/cleanup-legacy-stage-events.py",run_name="__main__")
