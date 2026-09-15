# LexiFlow V7

LexiFlow 是一款面向 Windows 的本地优先英语词汇学习桌面应用。它把查词、选义、记忆、联想、应用和复习串成一条学习路径；“今天”是唯一的每日学习入口，系统自动安排新词和需要巩固的词。

## 当前能力

- 本地词典优先：LexiFlow Core、ECDICT 与短语词典均随应用打包，离线即可完成英文查词、中文反查和常用短语查询。
- 中文反查保留用户原始意图，并按词义、词性和学习价值选择英文词头。
- 单词优先使用词典美式音频；没有音频时使用本地 Kokoro 或系统语音。短语始终按完整表达发音，例句可整句播放。
- 文本与图片 AI 通过本机已登录的 Codex CLI 调用，不在应用中复制或保存 Codex 凭据。AI 不可用时仍可查词、手动编辑、上传图片或跳过联想图。
- 学习数据、设置和生成图片写入 Electron `userData/app-data/`，不依赖浏览器 `localStorage`。

## 学习流程

从“今天”添加的词会保存后直接进入当天学习；从侧栏“添加单词”保存的词先进入待学习区。正式流程为：

`Select → Memorize → Visualize → Apply → 自动复习`

旧的独立“复习中心”入口已移除，兼容路由会返回“今天”。

## 开发运行

要求 Node.js 22.12 或更高版本，并建议使用仓库锁定的依赖：

```powershell
npm ci
npm run app
```

仅启动本地 Web 运行时：

```powershell
npm run web
```

首次使用本地 Kokoro 发音时可能需要下载语音模型。

## 检查与构建

```powershell
npm run check
npm run build:win
```

`npm run check` 会校验 JavaScript、品牌图标文件、真实本地 HTTP 查词链路、学习引擎与主要用户界面约束。Windows 构建会生成 NSIS 安装包和便携版，输出到 `dist/`。

## 数据与安全

- 学习数据：`userData/app-data/learning-data.json`
- 应用设置：`userData/app-data/settings.json`
- 生成图片：`userData/app-data/generated/`
- Codex 认证：始终由本机 Codex CLI 管理；LexiFlow 不读取、复制或输出 token。
- 可选 Merriam-Webster Key：在 Electron 环境下通过系统安全存储加密后落盘，仅作为本地词典之外的补充来源。

## 开源与代码签名

LexiFlow 源代码采用 [Apache License 2.0](LICENSE) 发布。词典数据、模型与
第三方组件可能适用各自的许可证，详见 [第三方声明](THIRD_PARTY_NOTICES.md)。

- [隐私政策](PRIVACY.md)
- [代码签名政策](CODE_SIGNING_POLICY.md)
- [贡献指南](CONTRIBUTING.md)
- [安全报告方式](SECURITY.md)

项目正在准备申请 SignPath Foundation 的免费开源代码签名。申请获批并完成
自动构建集成前，Windows 安装包仍属于未签名版本。
