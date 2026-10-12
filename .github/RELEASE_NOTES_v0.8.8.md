# LexiFlow v0.8.8 — Windows 自然发音修复测试版

本版本修复了 Windows 安装包中自然发音准备时报错的问题：

`Cannot find package 'kokoro-js' imported from .../app.asar.unpacked/lib/kokoro-worker.js`

## 修改

- 调整 Electron ASAR 解包结构，使 Kokoro Worker 与所需的完整 Node 运行依赖在相同的可解析文件目录内。
- 增加打包后依赖检查：从 Windows 安装包中实际 Worker 目录导入 Kokoro 与 Transformers，避免只靠源码测试。
- 保留既有词典、学习数据和 Select / Memorize / Visualize / Apply / Review 逻辑。

## 下载方式

Assets 包含 Windows 安装版（Setup .exe）与免安装便携版（Portable .exe），请选择其中一种安装。

**本版本属于未签名测试修复版。** Windows 可能出现 SmartScreen 的未知发布者提示。应用已经通过 GitHub Actions 的源码检查、真实词典检查、Windows 构建和打包后模块导入检查；尚未完成所有电脑上的首次 Kokoro 模型下载和真人试听验证。

升级前建议备份 `%APPDATA%\LexiFlow\app-data`。不要删除原有学习记录。
