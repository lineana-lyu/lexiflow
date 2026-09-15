# LexiFlow Privacy Policy

Last updated: September 15, 2026

LexiFlow is a local-first, single-user desktop application. It has no LexiFlow
account system, advertising, analytics, telemetry, or cloud synchronization.

## Data stored on the device

LexiFlow stores learning cards, progress, settings, cached models and generated
images in the application's Electron `userData/app-data/` directory. This data
stays on the user's device unless the user explicitly exports it or invokes an
optional network-backed feature described below.

Users can export their learning data from Settings. Users can also delete all
LexiFlow learning data from Settings. Uninstall behavior is controlled by the
operating system and may not automatically remove the Electron user-data folder.

## Network access

LexiFlow only uses networked systems for the following product functions:

- **Codex-assisted text and image features.** When the user explicitly requests
  AI feedback, example enrichment, a practice prompt, a visual-scene suggestion
  or image generation, the relevant word, selected meaning, example, learner
  sentence or visual description is passed to the locally installed Codex CLI.
  Codex then communicates with the provider configured by that Codex installation.
  That provider's privacy terms apply.
- **Optional Merriam-Webster lookup and audio.** If the user configures a
  Merriam-Webster API key and local dictionaries cannot satisfy a lookup, the
  queried word is sent to the Merriam-Webster Learner's Dictionary API. Playing
  a returned recording may request the corresponding audio file from
  Merriam-Webster.
- **Wikimedia pronunciation audio.** Playing available dictionary audio may
  request the selected public audio resource from Wikimedia infrastructure.
- **Kokoro model download.** On first use of optional local natural speech,
  LexiFlow downloads the Kokoro model files from their configured Hugging Face
  source. After download, speech inference runs locally; the text being spoken
  is not sent to Hugging Face by LexiFlow.

The dictionary data preparation scripts used by developers may download open
dictionary datasets from the sources listed in `THIRD_PARTY_NOTICES.md`. These
build-time downloads are not user learning-data transfers.

## Credentials

Codex authentication remains under the control of the locally installed Codex
CLI. LexiFlow checks whether Codex authentication is present but does not parse,
copy, export or log authentication tokens. LexiFlow may read non-secret Codex
configuration fields such as the selected model and provider so that it can show
and use the user's chosen runtime settings.

An optional Merriam-Webster API key is stored locally. In Electron environments
LexiFlow uses the operating system's secure-storage capability when available.
Credentials are not included in learning-data exports.

## User control

Network-backed AI, remote dictionary and model-download features are optional.
Core dictionary lookup, learning progress and review scheduling are designed to
work locally. Users can avoid a network-backed feature by not configuring it or
not invoking its action.

Privacy questions and reports can be submitted through the repository's GitHub
Issues. Security-sensitive reports should follow `SECURITY.md`.

## 中文摘要

LexiFlow 默认把学习数据保存在本机，不提供账户、广告、行为分析或云同步。
只有在用户主动使用 AI、远程词典、在线发音资源或首次下载 Kokoro 模型时，
才会访问对应的外部服务；LexiFlow 不读取、复制或输出 Codex 登录令牌。
