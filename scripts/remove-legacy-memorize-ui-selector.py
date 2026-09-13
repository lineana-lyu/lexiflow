from pathlib import Path

transition_path=Path("public/stage-transition-v3.js")
transition=transition_path.read_text(encoding="utf-8")
old='''    if(button.matches('[data-action="complete-stage"][data-next="memorize"],[data-action="complete-stage"][data-next="memorize1"]')){event.preventDefault();event.stopImmediatePropagation();void handle(button,"select");return;}'''
new='''    if(button.matches('[data-action="complete-stage"][data-next="memorize"]')){event.preventDefault();event.stopImmediatePropagation();void handle(button,"select");return;}'''
if transition.count(old)!=1:
    raise SystemExit(f"legacy memorize1 selector count was {transition.count(old)}")
transition=transition.replace(old,new,1)
if 'data-next="memorize1"' in transition:
    raise SystemExit("legacy memorize1 UI selector remains in Stage Transition")
if 'data-next="memorize"' not in transition:
    raise SystemExit("canonical Memorize UI selector missing")
transition_path.write_text(transition,encoding="utf-8")

check_path=Path("scripts/check-stage-model-v3.js")
check=check_path.read_text(encoding="utf-8")
anchor='assert(!transition.includes(\'card.stage="memorize1"\'),"Stage Transition V3 must not create a legacy Memorize sub-stage");'
addition='''\nassert(!transition.includes('data-next="memorize1"'),"Stage Transition V3 must not keep a retired memorize1 UI action selector");\nassert(transition.includes('data-next="memorize"'),"Stage Transition V3 must keep the canonical Memorize action selector");'''
if check.count(anchor)!=1:
    raise SystemExit("Stage Model legacy selector anchor not unique")
if "must not keep a retired memorize1 UI action selector" not in check:
    check=check.replace(anchor,anchor+addition,1)
check_path.write_text(check,encoding="utf-8")
