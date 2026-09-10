from pathlib import Path
import json


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)

server = Path("server.js")
app = Path("public/app.js")
css = Path("public/styles.css")
pkg = Path("package.json")
lock = Path("package-lock.json")

s = server.read_text(encoding="utf-8")
a = app.read_text(encoding="utf-8")
c = css.read_text(encoding="utf-8")

# Prefer scenes that do not naturally invite text-heavy image artifacts.
s = replace_once(
    s,
    '5. 优先一个清晰动作和一个视觉焦点，避免堆砌物件。\\n6. 问题要让用户自然说出与自己有关的话，不给答案。',
    '5. 优先一个清晰动作和一个视觉焦点，避免堆砌物件。尽量避开超市密集货架、广告墙、街道路牌、电脑界面等天然文字很多的构图；若语义需要这些环境，只保留无品牌、无可读文字的简化背景。\\n6. 问题要让用户自然说出与自己有关的话，不给答案。',
    "scene composition guard",
)

# When an old AI scene is refreshed, replace the draft too only if the user did not diverge from that suggestion.
old_block = '''  const cardId=card.id;
  const previous=String(state.study.visualNote||card.visualSceneSuggestion?.scene||"");
  state.study.visualSceneLoading=true;'''
new_block = '''  const cardId=card.id;
  const previousSuggestedScene=String(card.visualSceneSuggestion?.scene||"");
  const previous=String(state.study.visualNote||previousSuggestedScene||"");
  const draftFollowedSuggestion=!state.study.visualSceneDirty||normalizeSearchText(state.study.visualNote)===normalizeSearchText(previousSuggestedScene);
  state.study.visualSceneLoading=true;'''
a = replace_once(a, old_block, new_block, "capture previous scene")

old_sync = '''    if(state.study?.cardId===cardId&&!state.study.visualSceneDirty&&nextScene){
      state.study.visualNote=nextScene;
    }'''
new_sync = '''    if(state.study?.cardId===cardId&&nextScene&&draftFollowedSuggestion){
      state.study.visualNote=nextScene;
      state.study.visualSceneDirty=false;
      if(refresh&&visualSceneNeedsRefresh(previous,card.word)) latest.visualNote=nextScene;
    }'''
a = replace_once(a, old_sync, new_sync, "refresh stale AI scene draft")

a = a.replace('  const riskyStoredScene=visualSceneNeedsRefresh(scene,card.word);\n', '  const riskyStoredScene=visualSceneNeedsRefresh(scene,card.word);\n  const riskyDraftScene=scene&&normalizeSearchText(sceneDraft)===normalizeSearchText(scene)&&visualSceneNeedsRefresh(sceneDraft,card.word);\n')
a = a.replace('if((!scene||!card.practicePrompt?.question||riskyStoredScene)&&!sceneLoading)', 'if((!scene||!card.practicePrompt?.question||riskyStoredScene||riskyDraftScene)&&!sceneLoading)')
a = a.replace('ensureVisualSceneSuggestion(card,riskyStoredScene)', 'ensureVisualSceneSuggestion(card,riskyStoredScene||riskyDraftScene)')

# Remove decorative AI branding from the sentence feedback surface while preserving functionality.
a = a.replace('<span class="ai-spark">✦</span><div><small>AI 正在帮你看看</small>', '<div><small>正在检查</small>')
a = a.replace('<span class="ai-spark">✦</span><div><small>${fb.inputLanguage==="zh"?"AI 已把你的意思转成英文":"AI 建议"}</small>', '<div><small>${fb.inputLanguage==="zh"?"英文表达":"修改建议"}</small>')
a = a.replace('<span class="ai-spark">✦</span><div><small>AI 反馈</small>', '<div><small>检查结果</small>')
a = a.replace('继续首次复习 →', '继续首次复习')
a = a.replace('采用这句话', '采用建议')

# Quiet the remaining visible AI-style copy in the learning flow.
a = a.replace('AI 正在帮你看看', '正在检查')
a = a.replace('AI 建议', '修改建议')
a = a.replace('AI 反馈', '检查结果')

quiet = r'''

/* v0.8.5 — restrained desktop editorial finish */
:root{--blue:#4f6687;--blue-2:#3e526f;--blue-soft:#f0f2f4}
.page-head h1,.learning-stage-heading h2,.target-word-text,.prompt-big,.primary-meaning,.word-line h2{font-family:"Segoe UI Variable Display","Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI","PingFang SC","Noto Sans CJK SC",sans-serif}
.page-head h1{font-weight:620}.learning-stage-heading h2{font-weight:620}.target-word-text,.prompt-big,.primary-meaning,.word-line h2{font-weight:620}
.btn.primary{background:#26282b!important;border-color:#26282b!important;color:#fff!important}.btn.primary:hover:not(:disabled){background:#111214!important;border-color:#111214!important}.study-stepper-item.active{color:#32363b}.study-stepper-item.active .study-stepper-dot{background:#34383d}.study-stepper-line.done{background:#b9c5bd}.study-stepper-item.done{color:#61736a}
.card,.study-card,.search-hero-card,.lookup-surface,.today-card,.setting-row{box-shadow:none!important}.study-card{border-color:#deded9}.learning-stage-heading{border-bottom-color:#e7e7e2}
.scene-panel{border-left-color:#deded9}.scene-panel-label span{font-weight:620}.scene-editor{font-size:14px;font-weight:450;line-height:1.85;color:#34373b}.scene-cue{color:#8a8e93}.text-action{color:#686d73}.text-action:hover{color:#25282c}
.visual-image-canvas{background:#ecece8;border-color:#d9d9d4}.visual-memory-image{filter:saturate(.94) contrast(.99)}.visual-command-bar{margin-top:14px}.visual-primary-action{min-width:110px}.learning-stage-footer .btn.primary{min-width:84px}
.ai-feedback-panel{border:1px solid #dfdfda!important;border-radius:9px!important;background:#fafaf8!important;box-shadow:none!important;padding:16px!important}.ai-feedback-panel.good{background:#f8faf8!important;border-color:#dce5df!important}.ai-feedback-panel.warn{background:#fbfaf7!important;border-color:#e8e1d5!important}.ai-feedback-head{gap:0!important}.ai-feedback-head small{color:#8b8f94!important;font-size:10px!important;font-weight:600!important;letter-spacing:.04em}.ai-feedback-head strong{font-weight:620!important;color:#303338!important}.ai-spark{display:none!important}.ai-keyword-chip{border-radius:5px!important;background:#eceeea!important;color:#555b60!important;font-weight:600!important}.ai-suggestion-sentence{border:0!important;background:transparent!important;padding-left:0!important;padding-right:0!important}.ai-feedback-notes span{background:transparent!important;border:0!important;padding-left:0!important;color:#73777d!important}.ai-feedback-actions{border-top:1px solid #e7e7e2!important;padding-top:12px!important}
.auto-visual-card{background:#fafaf8!important;border-color:#dfdfda!important}.auto-visual-icon{display:none!important}.auto-visual-card{grid-template-columns:minmax(0,1fr) auto!important}.keyword-mark{background:#eceeea!important;color:#303338!important;border-radius:3px!important;font-weight:650!important}
.pill.blue{background:#efefec!important;color:#5f6469!important}.auto-resolved-note{background:#f8f8f5!important;border-color:#e1e1dc!important}.lookup-loader-orb{background:#efefec!important}.lookup-loader-track i{background:#7c8288!important}
@media(max-width:920px){.auto-visual-card{grid-template-columns:1fr!important}}
'''
c += quiet

server.write_text(s, encoding="utf-8")
app.write_text(a, encoding="utf-8")
css.write_text(c, encoding="utf-8")

for path in (pkg, lock):
    data = json.loads(path.read_text(encoding="utf-8"))
    data["version"] = "0.8.5"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
