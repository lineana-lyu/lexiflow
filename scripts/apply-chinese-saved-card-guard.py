from pathlib import Path
p = Path(__file__).resolve().parents[1] / 'public' / 'app.js'
text = p.read_text(encoding='utf-8')
before = '''        const exactLocal=Boolean(saved&&(
          normalizeSearchText(saved.word)===qNormalized ||
          String(saved.meaningZh||"").split(/[；;、，,/]/).some(part=>normalizeSearchText(part)===qNormalized)
        ));
'''
after = '''        // Exact English headwords can safely reuse an existing learning card.
        // Chinese queries must be resolved again: an older card may contain a
        // previously mis-resolved translation and must not shadow the verified resolver.
        const exactLocal=Boolean(saved&&!containsChinese(q)&&normalizeSearchText(saved.word)===qNormalized);
'''
if text.count(before) != 1:
    raise SystemExit(f'expected one saved-card shortcut block, got {text.count(before)}')
p.write_text(text.replace(before, after, 1), encoding='utf-8')
print('patched Chinese saved-card lookup guard')
