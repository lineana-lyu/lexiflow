# LexiFlow Desktop

LexiFlow 现在以 **Windows 桌面应用** 为主运行形态。学习数据、设置和生成图片不再依赖浏览器 localStorage。

- 学习数据：保存到 Electron `userData/app-data/learning-data.json`
- 词典/AI 设置：保存到 Electron `userData/app-data/settings.json`
- Merriam-Webster Key：在 Electron 环境下使用系统安全存储加密后落盘
- 生成图片：保存到 Electron `userData/app-data/generated/`
- 默认 Codex：`gpt-5.6-luna`
- 默认思考强度：`medium`
- 首次启动会尝试迁移旧项目目录里的设置、缓存和生成图片；浏览器 localStorage 中已有的学习卡也会在第一次打开新版本时自动迁移到本地文件。

开发运行：

```powershell
npm install
npm run app
```

构建 Windows 安装包 / 便携版：

```powershell
npm run build:win
```

---

# LexiFlow Standalone MVP v3

这是一个**全新的独立 MVP**，不连接旧 LexiFlow 项目。

## v3 Provider 方案

### 词典
使用 **Merriam-Webster's Learner's Dictionary API**：

`https://www.dictionaryapi.com/api/v3/references/learners/json/{word}?key={your-api-key}`

API Key 在 LexiFlow 的「设置」页面配置。

词典负责：
- 词条
- 词性
- 英文权威定义
- 原始例句（有则使用）
- 美式发音数据

LexiFlow 会优先播放 Merriam-Webster 返回的美式音频。

### 文本 AI
**不在 LexiFlow 中配置 OpenAI API Key。**

LexiFlow 调用本机已安装并已登录的 `codex` CLI。Codex 自己读取：

Windows:
`%USERPROFILE%\.codex\config.toml`

macOS / Linux:
`~/.codex/config.toml`

同时支持你已经设置的：

`CODEX_CLI_PATH`

应用只读取 Codex 的 model / model_provider 用于状态展示；不会复制 Codex 凭据。

文本 AI 用于：
- 把 Merriam-Webster 英文定义整理为简洁中文释义
- 翻译或补全中英文例句
- Apply 阶段造句反馈

### 图片 AI
Visualize 阶段同样调用本机 `codex exec`。

应用会要求 Codex 使用当前环境可用的图片生成能力并把 PNG 写入：

`generated/`

如果你当前 Codex Provider 不支持图片生成，LexiFlow 会明确报错，然后仍可：
- 上传本地图
- 跳过图片

不会因为图片 AI 不可用而卡死整个学习流程。

## 为什么 v3 不能再直接双击 index.html

浏览器页面不能安全地：
- 读取 `%USERPROFILE%\.codex\config.toml`
- 调用本机 `codex.exe`
- 在本地生成并保存图片

因此 v3 增加了一个很小的本地 Node 服务。

它**不需要 npm install**，没有第三方 Node 依赖。

## 使用

### 1. 环境

需要：
- Node.js 18+
- Codex CLI（文本/图片 AI 要用；仅查词时 Codex 不可用仍能返回词典数据，但中文内容需手动编辑）
- 已经正常登录/配置 Codex

### 2. 启动

Windows 直接双击：

`start.bat`

浏览器会自动打开：

`http://127.0.0.1:4177`

不要再直接双击 `public/index.html`。

### 3. 第一次配置词典

进入：

`设置 → Merriam-Webster Learner's Dictionary`

填入你的 Learner's Dictionary API Key，点击：

`保存 Key → 测试`

### 4. 检查 Codex

设置页会显示：
- Codex CLI 是否找到
- Codex 版本
- config.toml 路径
- model
- model_provider

LexiFlow 不要求你再次输入 AI API Key。

## 核心学习闭环

选词制卡
→ Merriam-Webster 查词
→ Codex 中文本地化
→ Select
→ Memorize 英→中
→ Memorize 中→英
→ Visualize（Codex 图片 / 本地图 / Skip）
→ Apply（Codex 文本反馈）
→ Review
→ 单词库 / 统计

## 数据位置

学习卡与学习进度：
- 浏览器 localStorage

Merriam-Webster Key：
- `data/settings.json`

AI 生成图片：
- `generated/`

Codex 登录/凭据：
- 仍由 Codex 自己管理
- LexiFlow 不复制、不导出

## 重要说明

- Merriam-Webster 免费 API 适用于符合其条件的非商业使用，并有查询配额；商业化前请确认授权。
- Merriam-Webster 对 API 应用有品牌展示要求，正式发布前需按其 Branding Guidelines 加入官方标识。
- Codex 图片生成能力取决于当前账户、Provider 和本地 Codex 版本。若当前 Provider 不提供图片能力，MVP 会自动保留上传本地图/Skip 的替代路径。


## v3.1 启动修复

如果双击旧版 `start.bat` 一闪而过，v3.1 已改成不会静默关闭的启动器。

优先双击：

`启动LexiFlow.bat`

它会：
- 自动打开 PowerShell
- 保持窗口不关闭
- 检查 Node.js
- 检查 Codex CLI
- 启动 server.js
- 把完整日志写入 `startup.log`

如果启动失败，把 `startup.log` 的内容发给 ChatGPT 即可定位。

也可以双击：

`diagnose.bat`

只做环境检查，不启动服务。


## v3.2：Codex auth.json 适配

如果你的 Codex 登录信息位于：

`C:\Users\<你的用户名>\.codex\auth.json`

v3.2 会自动按当前 Windows 用户解析：

`%USERPROFILE%\.codex\auth.json`

例如当前用户名是 `LLH` 时，会得到：

`C:\Users\LLH\.codex\auth.json`

### 安全原则

LexiFlow：

- 只检查 `auth.json` 是否存在；
- **不会读取 auth.json 内容**；
- 不解析 token；
- 不把 auth.json 复制到项目；
- 不把 auth.json 写入日志；
- 不导出 auth.json；
- 不把认证信息发送给前端。

真正的身份认证仍由 `codex` CLI 自己处理。

`config.toml` 在 v3.2 中只是可选配置来源，用于展示 model / model_provider；即使它不存在，只要 `codex --version` 能运行且 Codex 已经登录，LexiFlow 仍会直接调用 `codex exec`。


## v3.3：修复 Codex “检测可用但实际调用失败”

v3.2 有一个真实的调用错误：

- 设置页的“可用”只证明 `codex --version` 能运行；
- 但 v3.2 把完整 prompt 当成 `codex exec` 的位置参数传入；
- 当前 Codex 的程序化执行方式应把输入写入 **stdin**；
- 因此会出现“设置页检测到 Codex，但查词时中文处理失败”。

v3.3 已改为：

```text
codex exec
  --model <可选模型>
  --config model_reasoning_effort="<可选思考强度>"
  --sandbox read-only
  --skip-git-repo-check

prompt → stdin
```

图片任务使用 `workspace-write`，文本任务使用 `read-only`。

### 设置页新增

- Codex 模型：
  - 跟随 Codex 默认
  - gpt-6-astra
  - gpt-5.6-sol
  - gpt-5.6-terra
  - gpt-5.6-luna
  - 也可直接输入其它模型 ID
- 思考强度：
  - 跟随默认
  - low
  - medium
  - high
  - xhigh
  - max
- 「测试文本 AI」：
  - 不再只测 `codex --version`
  - 会真实执行一次 `codex exec`
  - 只有真正成功才显示“实际调用通过”

### 推荐验证顺序

1. 启动 v3.3。
2. 设置 → 刷新状态。
3. 模型先填 `gpt-6-astra`（或留空跟随你的 Codex 默认）。
4. 思考强度先选 `medium`。
5. 保存 AI 配置。
6. 点击「测试文本 AI」。
7. 必须看到「实际调用通过」。
8. 再去查询 `where`。


## v3.4：Apply 阶段一键使用 AI 建议

造句反馈现在保留结构化的 `suggestedSentence`，不再把建议句混在普通提示列表里。

交互流程：

```text
用户造句
→ 获取 AI 建议
→ AI 反馈 + 建议句
→ 一键应用 AI 建议
→ 建议句自动回填输入框
→ 用户可以继续修改
→ 可恢复最初原句
→ 再次获取 AI 反馈
→ 用户显式确认通过
```

### 新增

- `一键应用 AI 建议`
- `恢复原句`
- 应用 AI 建议后的状态提示
- 自动把光标放回输入框末尾
- 最终通过时保存输入框里的最新句子

### 保持的产品边界

`一键应用 AI 建议` **不会自动通过 Apply 阶段**。

AI 只帮助修改句子，最终是否进入首次复习仍由用户显式点击：

`确认通过，进入首次复习`


## v3.5：Visualize 场景描述链路与图片 Prompt 修复

v3.4 之前存在一个真实问题：

前端虽然发送了 `visualNote`，但后端 `generateVisual()` 没有读取并加入图片 Prompt。
因此用户输入：

`一个女生在图书馆看书`

模型实际仍主要只看到：

`book / 书；书籍 / 例句`

最终很容易退化成“单独一本书”。

### v3.5 修复

真实链路现在是：

```text
Visualize 场景输入
→ visualNote
→ /api/ai/image
→ generateVisual(body.visualNote)
→ Codex 图片 Prompt
→ generated PNG
```

### Prompt 优先级

```text
1. 用户场景描述 —— 最高优先级、硬约束
2. 当前中文词义 —— 防止画错义项
3. 英文例句 —— 补充语境
4. 目标单词 —— 学习目标，不自动等于唯一主体
```

例如：

`一个女生在图书馆看书`

Prompt 会明确要求最终图片必须同时包含：

- 女生
- 图书馆环境
- 正在看书的动作

并明确禁止退化为：

- 单独一本书
- 商品摄影
- 白底产品图
- 只有书架
- 没有指定动作的泛化画面

### UI 同步修改

原来的：

`写下你的视觉联想（可选）`

改为：

`你希望 AI 生成什么画面？（可选）`

并明确提示：

`AI 会优先严格按照你的场景描述生成；当前词义只用于避免画错义项。`

生成完成后页面会显示“生成时采用的场景”，方便确认数据链路没有丢失。

### 测试文件约束

v3.5 **没有向项目中新增任何测试文件、测试目录、fixture、mock 项目或测试脚本**。

本次只进行了外部静态语法校验：

- `node --check server.js`
- `node --check public/app.js`

这些检查不会向项目写入测试用例或测试产物。


## v3.6：查词结果“学习模式” + 性能优化

这一版专门解决两个问题：

1. `chair` 明明主要是“椅子”，页面却把完整词典中的多个细分义项全部摊开；
2. 每次查词都让 Codex 翻译多个义项，造成等待时间过长。

### 默认查词现在只显示 1 个核心词义

产品从“完整电子词典”改成“单词学习卡片”。

例如：

`chair`

默认应该优先显示：

```text
noun
中文释义：椅子
英文例句：a chair by the window
中文例句：窗边的一把椅子
```

而不会默认把：

- 系主任
- 主席
- 主持会议
- deck chair
- easy chair

全部塞进页面。

### 词典筛选规则

Merriam-Webster 返回结果后，v3.6 会先做确定性筛选：

1. 优先只保留与查询词 **精确 headword 匹配** 的条目；
2. 默认只取第一条核心定义；
3. 不再自动混入 `deck chair`、`easy chair` 等复合词条；
4. 不再把一个词典 entry 的 3 个 shortdef 全部展开；
5. 用户确实需要时，再点：

`查看其它常用词义`

扩展模式最多展示 3 个核心义项，并优先区分不同词性，而不是枚举所有细粒度词义。

### 中文释义 Prompt 收紧

Codex 被明确要求：

- `chair` → `椅子`
- 不要翻译成：
  `供一个人坐的椅子，有靠背，通常有四条腿`

即：
**学习卡片要的是简短释义，不是把英文词典定义逐字翻译成中文。**

### 查词速度优化

默认模式只让 Codex 处理 **1 个义项**，而不是之前最多 6 个。

同时新增 7 天本地查询缓存：

`data/dictionary-cache.json`

缓存键包含：
- 单词
- primary / expanded 模式
- LexiFlow 当前 Codex model
- 当前 reasoning effort

因此同一配置下重复查询同一个词时，通常可以直接命中缓存，不再重新调用 Merriam-Webster + Codex。

页面命中时会显示：

`⚡ 已缓存`

### 测试污染

没有向项目中新增任何测试文件、fixture、mock 或测试目录。

只在项目外执行：

- `node --check server.js`
- `node --check public/app.js`


## v3.7：中文释义、同义卡片去重、AI 建议后的确认通过

### 中文释义
中文释义现在强调“词典式词义”，不是英文 definition 的整句翻译。

例如：

- work → 工作
- chair → 椅子
- book → 书；书籍

避免：

- work → 有工作
- chair → 供一个人坐、有靠背、通常四条腿的座具

### 同中文词义只保留一张卡
“查看其它常用词义”中，如果不同 Merriam-Webster 条目经过中文整理后得到相同中文词义：

- verb：工作
- noun：工作

现在会合并为一张学习卡：

- 词性：verb · noun
- 中文释义：工作
- 保留一组完整、自然的中英文例句

也就是：

一个中文学习词义 = 一张学习卡片。

### 应用 AI 建议后显示确认通过
现在：

一键应用 AI 建议
→ 自动回填建议句
→ 显示：
  - 恢复原句
  - 继续修改
  - 确认通过，进入首次复习

AI 仍不会自动推进阶段，最终通过必须由用户显式确认。

### 测试污染
v3.7 没有新增任何 test/spec/fixture/mock/tests 文件或目录。

只在项目外进行了：
- node --check server.js
- node --check public/app.js


## v3.8：学习页信息层级、音标一致性、翻译质量与图片长任务反馈

### 学习页统一
Memorize 英→中、Memorize 中→英、Visualize、Apply 不再在左上角重复展示一套单词 + 喇叭。

学习单词统一使用“目标词组件”：
- 单词
- 音标
- 美式发音按钮
- 词性

规则：
- 只要学习主界面中把目标英文单词作为主信息展示，就同时显示音标。
- 中→英查看答案时，目标单词明显高于英文例句的视觉层级。
- 英文例句作为辅助语境，不与目标单词同级。

### 翻译偶发错误
词典 AI 仍然只调用一次，但增加内部自检字段：
- commonForLearner
- confidence

扩展义项会过滤明显稀有/古旧/专业义项。
低置信度翻译会在页面持续显示警告，提醒用户保存前检查。

缓存键升级到 v3.8，因此旧版本生成的错误翻译不会继续被旧缓存命中。

### 图片生成速度与状态
图片 Prompt 缩短，并固定使用 low reasoning 进行视觉任务规划，减少 Codex 的前置思考时间；仍然使用用户在设置里选定的模型。

图片生成错误不再只有短暂 toast。
Visualize 页面会持久保存并展示：
- 正在生成
- 生成成功
- 生成失败
- Codex 超时
- 具体错误信息
- 重新生成入口

即使 toast 消失，错误原因仍留在页面。

### 测试污染
没有新增任何 test/spec/fixture/mock/tests 文件。
仅在项目外执行 JavaScript 静态语法检查。


## v4.0：模型切换、友好错误、模糊搜索与性能体验

- 模型选择改为真正的下拉选择器：每次打开都保留常用模型，并合并 `config.toml` 中检测到的模型；另保留自定义模型 ID。
- 错误不再直接向用户展示 Codex/HTTP/CLI 底层字符串。服务器只在控制台记录技术详情，前端显示用户能理解的原因和下一步操作。
- 视觉联想明确提示“场景描述可选”：不填写可以直接自动生成；填写后按用户场景优先生成。
- 搜索支持：英文、中文词义、英文拼写错误、中文少量错别字。
  - 先查本地学习记录和缓存；
  - 英文拼错继续使用 Merriam-Webster 的建议；
  - 中文或中文错别字在无本地结果时才用 Codex Low 推理解析成英文候选。
- 查词中文整理使用 Low 推理并缩短超时，重复查询继续走 7 天本地缓存。
- 图片生成显式调用 `$imagegen`、使用 Low 推理、缩短代理 Prompt，并保留持久状态；但底层图片生成耗时仍取决于当前 Codex 图片能力与服务负载。
- 没有新增 test/spec/fixture/mock/tests 文件；仅做项目外 JavaScript 静态语法检查。


## v4.1：修复本地服务 / 词典 Key / Codex 连接回归

截图中的 `Failed to fetch` 说明浏览器没有连到本地 Node 服务，所以词典 Key 保存与 Codex 状态会一起失效。v4.1 增加本地服务自检、file:// 自动跳转、CORS、原子设置写入，以及 Windows Codex 路径自动发现。

请始终双击根目录 `启动LexiFlow.bat`，标准地址应为 `http://127.0.0.1:4177/`。


## v4.2

- 中文搜索、英文搜索和拼写纠错统一为一步式查词：用户提交后直接得到单词卡，不再先选候选词。
- 中文搜索只调用一次快速文本解析，再用 Merriam-Webster 验证词条、词性、IPA 与美式音频；中文释义和例句在同一次解析中准备，减少等待链路。
- 单词卡保存具体语义意图和视觉混淆项。视觉联想生成时会携带用户原始搜索、准确英文语义和需要排除的其它含义，例如“键盘”会明确约束为电脑键盘并排除钢琴键盘。
- 视觉联想默认采用“智能生成”，不要求填写场景；自定义场景折叠为可选高级操作。
- 界面视觉重新收敛为高留白、半透明面板、柔和聚光、克制的微动效和更明确的学习焦点。
- 对用户可见的开发/测试措辞已替换为产品化状态和操作文案。

## MVP Audit Round 1

本轮在继续扩展功能前先修复稳定性与业务正确性问题：

- Apply 不再自动算作“首次复习完成”；用户必须真正完成首次主动回忆后才进入后续复习计划。
- 中文查词展开其它义项时使用最终英文词条，不会把中文原始输入直接发给英文词典接口。
- 本地服务只接受 LexiFlow 自身来源，不再对任意网页开放跨域写入/AI 调用。
- 图片生成和造句 AI 在用户退出页面后不会继续写入已经销毁的学习会话状态。
- 本地上传图片写入 generated 目录，不再把大体积 base64 图片塞进 localStorage。
- 中文重复查询可以命中新版缓存 fast path；Codex CLI 状态短时间缓存，减少重复启动探测。
- 设置/搜索后台状态刷新会保留尚未提交的输入。
- 普通界面不再展示 Codex 底层错误字符串、认证文件路径等开发者信息。
- 词典缓存 schema 升级，旧版错误/缺字段缓存不会继续命中。
- 无可用 IPA 时明确显示“暂无音标”，不再永久显示“音标加载中”。


## UI Polish Round 2

- Normal product surfaces now use Chinese-first labels; internal English workflow labels were removed from navigation and learning stages.
- The add-word page no longer renders an empty result panel before search. The default result is a single learning-card preview; multiple senses only appear after the user asks for other common meanings.
- The lookup result hierarchy is now word + pronunciation + core Chinese meaning + labeled example, with secondary actions visually de-emphasized.
- Visual association makes the zero-input generation path explicit; custom scene description remains optional.
- Settings show user-facing service status by default and move Codex implementation details into collapsed advanced diagnostics.
- Visual styling was reduced from glass/dashboard effects to calmer solid surfaces, fewer hover motions, and a stronger study-first hierarchy.
