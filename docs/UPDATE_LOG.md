# Update Log

## 2026-04-09

### UI与布局
- 首页重构为三栏 Agent 工作区：左侧导航、中间 LLM 对话、右侧动态信息栏。
- 首页路由隐藏传统 TopNav，保留分析页导航，强化原生 Agent 交互感。
- 聊天气泡、输入区、头部状态样式升级为现代对话界面。

### 任务模式与状态机
- 新增任务模式：`general`、`reading_setup`、`reading_guided`、`reading_direct`。
- 新增阅读会话状态 `readingSession`，包含来源、目标、风格、证据、工具轨迹、推理轨迹、预览链接等。
- 补充阅读模式回退逻辑：从图谱论文进入后可正确返回通用模式。

### 阅读助手能力
- 新增阅读助手提示词构建与结构化响应解析：
  - `answer`
  - `nextQuestion`
  - `evidenceRefs`
  - `toolTrace`
  - `reasoningTrace`
- 中间对话支持意图触发阅读模式、引导/直答切换、结果写回状态。
- 右侧信息栏改为任务态动态卡片，支持论文展示/引导/证据/工具/推理/图谱。

### 文献导入与解析
- 左侧新增真实上传入口：
  - 上传 PDF
  - URL/DOI/arXiv 导入
- 新增文献解析函数 `parseDocumentSource`，兼容 URL 与文件上传两种输入。
- 支持证据卡片点击后跳转到 PDF 页码（`#page=`）。
- 新增 `parsedMeta` 结构化元信息并在论文信息页展示（标题、作者、机构、年份、DOI、关键词、摘要、期刊）。

### 降级与鲁棒性
- 当解析接口不可达时启用基础阅读模式：
  - 保留 PDF/URL 预览
  - 保留会话对话
  - 给出明确提示
- 解析逻辑增加空结果判定和多返回格式兼容（`chunks/segments/paragraphs/items`）。
- 修复右侧按钮 JSX 语法错误导致的 Vite 解析失败问题。

### 对话历史
- 左侧“对话历史”实体化：
  - 新建会话
  - 切换会话
  - 显示更新时间
- 新增会话管理：
  - 搜索过滤
  - 重命名
  - 删除（含删除当前会话后的自动切换）
- 对话历史持久化到 `localStorage`（`research_map2_chat_history_v1`），刷新后可恢复。
- 移除左侧导航冗余项“搜索历史记录”。

### 备注
- 本日志用于持续记录前端迭代；后续所有改动按日期追加到该文件。

## 2026-04-09 (Agent扩展)

### Agent封装与新增
- 将阅读助手封装为独立 Agent（`reading`），并新增写作助手 Agent（`writing`）。
- 左侧新增 Agent 切换入口，可在“阅读助手 / 写作助手”间切换。
- 对话线程新增 `agent` 归属，会话与 Agent 关联。

### 写作助手能力
- 新增写作任务与素材输入区（左栏）。
- 新增写作提示词与结构化响应解析，支持输出：
  - 写作提纲（outline）
  - 写作草稿（draft）
  - 下一步追问、工具轨迹与推理摘要
- 右侧信息栏新增写作卡片：任务、素材、提纲、草稿。

### 对话历史持久化增强
- 历史会话数据持久化至 `localStorage`，并兼容旧数据缺失 `agent` 字段的自动修复。
- 新建会话默认继承当前 Agent；切换历史会话会同步切换 Agent。

### Agent路由优化（对话驱动）
- 新增基于用户输入意图的自动 Agent 切换：
  - 识别阅读意图（如“带我阅读”“读论文”）自动进入阅读助手
  - 识别写作意图（如“我想写一篇文章”“润色/改写”）自动进入写作助手
  - 若出现 URL/DOI/PDF 等文献信号，优先进入阅读助手
- 上传 PDF 或 URL 导入时，自动切换到阅读助手（不依赖手动切换按钮）。

### Agent路由升级（LLM分类器）
- 新增 `classifyUserIntent`：规则优先 + LLM 分类兜底的混合意图识别。
- 路由输出结构化结果：`target`、`confidence`、`reason`。
- 中间对话发送前先做分类，再自动切换至 reading/writing/general，提升复杂表达下的路由准确率。

## 2026-04-09 (OAH Agent化)

### OAH目录与Agent定义
- 新增 `research_map2/.openharness/agents/`：
  - `framing.md`
  - `discovery.md`
  - `reading.md`
  - `writing.md`
- 新增 `research_map2/.openharness/settings.yaml`，默认 agent 为 `framing`。

### 前端按Agent分会话调用
- `chatCompletion` 支持 `agentName` 与 `sessionScope` 参数。
- 新增按 scope 的 session map 持久化（`research_map2_oah_session_map_v1`）。
- 阅读、写作、通用、意图分类分别调用对应 OAH agent：
  - 分类 -> framing
  - 通用 -> discovery
  - 阅读 -> reading
  - 写作 -> writing

## 2026-04-09 (任务卡与Run可视化)

### 右栏新增 Agent Run 可视化
- 在右侧 `工具过程` 卡片顶部新增运行状态区，实时显示：
  - 当前调用 Agent
  - Run 状态（idle/running/completed/failed）
  - runId
  - 起止时间
  - 错误信息（失败时）
- 在对话发送流程中，为 general/reading/writing 分支补充运行状态写入与失败回填。

### Framing 结构化任务卡（RQ卡）
- 新增 framing 任务卡协议：
  - `problemStatement`
  - `rqList`
  - `scopeInclude`
  - `scopeExclude`
  - `constraints`
  - `successCriteria`
- 每次用户发送消息时，异步调用 framing 生成/刷新任务卡（不阻塞主对话）。
- 新增右栏 `任务卡` 展示，统一支持通用/阅读/写作场景复用。

### 状态层与类型扩展
- 类型层新增：
  - `AgentRunState`
  - `ResearchTaskCard`
  - `RightPanelCard` 扩展 `task`
- Store 新增：
  - `agentRunState`
  - `researchTaskCard`
  - `setAgentRunState`
  - `setResearchTaskCard`
- 通用与阅读模式右栏卡片默认包含 `task`，实现“任务定义 → 执行 → 结果”闭环。

## 2026-04-09 (任务卡进一步增强)

### 任务卡按会话持久化
- 新增任务卡存储键：`research_map2_task_cards_v1`。
- 任务卡与 `threadId` 绑定：切换对话时自动切换对应任务卡。
- 新建/删除对话时同步维护任务卡数据，避免跨会话污染。

### 任务卡可控更新
- 新增任务卡锁定机制（`locked`）：
  - 锁定后不会被自动 framing 覆盖。
  - 解锁后恢复自动更新。
- 新增任务卡来源标记（`source`）：
  - `auto`：自动生成
  - `manual`：人工编辑

### 任务卡手动编辑
- 右栏任务卡新增“编辑任务卡”入口，支持逐字段编辑并保存：
  - 问题陈述
  - RQ 列表
  - 包含/排除范围
  - 约束
  - 成功标准
- 保存后写回当前会话任务卡，并标记为 `manual`。

## 2026-04-09 (错误可观测性增强)

### 无解析服务降级增强
- 文献解析失败时继续走降级（可预览+可对话），并在提示中展示真实错误原因（状态码/连接失败/URL）。

### 聊天失败文案增强
- `AIChat` 失败消息由通用“请求失败，请稍后重试”改为“请求失败：{真实后端错误}”。

### Tools 卡排障信息增强
- `agentRunState` 增加最近一次 HTTP 观测字段：
  - `lastHttpUrl`
  - `lastHttpStatus`
- 右侧 `tools` 卡新增显示：
  - Last HTTP URL
  - Last HTTP Status

### LLM 请求错误标准化
- `llm.ts` 新增 `checkedFetch`，统一包装 fetch 错误为可读信息：
  - `请求失败(状态码) url=...`
  - `连接失败 url=... message=...`

## 2026-04-09 (Template 运行模式兼容)

### OAH 会话创建策略调整
- 参考 `test_oah_server_v1` 的 template/chat 形态，新增 `VITE_OAH_TEMPLATE_MODE`（默认开启）。
- 在 template 模式下：
  - 忽略前端传入的 `agentName`，改为使用 workspace 的 `default_agent`
  - 统一复用单一会话 scope：`template-default`
- 目的：避免 workspace 未注册 `framing/reading/writing/discovery` 时触发 `agent_not_found` / 404，提升 template 项目开箱可用性。

## 2026-04-09 (流式空响应鲁棒性)

### 修复 `OAH returned empty response`
- 增强 `streamRunResult` 事件解析，兼容更多 payload 字段（`delta/text/content`）。
- 终态事件到达后新增短轮询回退读取 assistant 消息，处理“消息持久化晚于 run.completed”的竞态。
- 在无 `message.delta` 但存在 `message.completed` 文本时也能拼接输出，减少误判空响应。

## 2026-04-09 (后端部分成功容错)

### 修复 `create message 500` 但后台仍有运行
- 发现 OAH 在部分场景会出现“消息创建接口 500，但 run 已 queued/执行”的部分成功现象。
- 前端新增容错：
  - 若 `create message` 报错文本中可提取 `run_xxx`（及 `ses_xxx`），则直接订阅该 run 的事件流。
  - 避免前端误报失败而控制台已有分析结果的不一致体验。

## 2026-04-09 (研究流程编排修正)

### 修复“研究规划请求误入 writing”
- 新增研究规划意图识别（研究问题/评估标准/变量/假设/实验设计等关键词）。
- 命中后执行强制编排：`framing -> discovery`，不进入 `writing`。
- 中间对话区先展示 Framing 结构化结果，再展示 Discovery 下一步证据检索计划。
- 同步将 `activeAgent` 维持/切换为 `general`，与研究流程阶段一致。

## 2026-04-09 (交互流程增强)

### 手动切换 Agent 不再跳历史会话
- 新增 `createChatThreadForAgent(agent)`，左侧“自由研究/阅读助手/写作助手”按钮改为强制新建会话。
- 解决点击 Agent 按钮时自动跳转到历史对话的问题。

### 中间对话区思考可视化
- 新增“已思考 X 秒”状态展示。
- 支持“展开过程/收起过程”，可查看当前步骤（识别意图、Framing、Discovery等）。

### 右栏合并“思考过程 + 工具调用”
- 在 `tools` 卡中新增统一过程区：
  - 思考过程（thoughtTrace）
  - 工具调用过程（toolTrace）
- 研究规划请求下可先看到过程日志，再查看任务卡。

### 研究规划回复策略调整
- 对研究规划请求（研究问题/评估标准/变量/假设等）：
  - 保持 `framing -> discovery` 流程
  - 中间对话仅输出 Discovery 最终回复（不再拼接冗长 framing 文本）

## 2026-04-09 (过程与任务卡可见性修复)

### 右栏自动切换
- 当 run 进入 `running` 且存在思考/工具轨迹时，右栏自动切换到 `tools` 卡，确保能看到详细过程。
- 当任务卡被更新（`updatedAt` 变化）时，右栏自动切换到 `task` 卡，确保能立即看到最新任务卡。

### Framing 任务卡解析兜底
- `parseFramingTaskResponse` 增加文本兜底解析（非 JSON 输出也能尽量提取问题陈述、RQ、约束、评估标准）。
- 解决 template/default agent 场景下 framing 偶发不返回严格 JSON，导致任务卡不更新的问题。

## 2026-04-09 (右栏显示策略修正)

### 初始仅显示知识图谱
- 调整右栏默认卡片与渲染规则：在当前会话无消息时，仅展示 `graph`，隐藏其他卡片。

### 用户提问后再展示过程卡
- 用户发送消息且处于 general 研究流程时，动态切换右栏卡片为 `tools + task + graph`。
- `tools` 卡承担“思考过程 + 工具调用过程”合并展示。

### 任务卡内容误写修复
- 收紧文本兜底解析：不再把第一行任意文本当作问题陈述，避免把思考过程误写进任务卡。

## 2026-04-09 (任务卡与过程展示清洗)

### 过程卡命名与空态修正
- 右栏标签 `工具过程` 重命名为 `思考过程`。
- 空态文案从“暂无工具调用记录”改为“暂无思考过程记录”，避免误导。
- 过程展示优先使用 `agentRunState.toolTrace`，缺失时回退 `readingSession.toolTrace`。

### 任务卡内容去 JSON 残片
- `parseFramingTaskResponse` 增加清洗与去重：
  - 去除 `"rqList": [`、`[`、`]`、多余引号/逗号等残片
  - 过滤 key 行伪内容
  - 列表去重，避免重复 RQ 段落
- 文本兜底解析同样接入清洗逻辑，减少混乱输出。

## 2026-04-09 (Framing 会话隔离修复)

### 修复任务卡“像思考过程”的根因
- 发现 template 模式下使用单一 session scope 会导致 `framing/discovery/普通对话` 共享上下文，任务卡提取易被污染。
- 调整 `normalizeSessionOptions`：
  - `framing_task_card` 改为独立 scope：`template-framing-task`
  - 其他流程继续使用 `template-default`
- 目标：保证任务卡提取优先基于 framing 的干净输出，减少混入过程文本。

## 2026-04-09 (Framing JSON 提取稳定性修复)

### 修复 JSON 误提取导致任务卡污染
- 将 `extractJsonObject` 从贪婪正则改为“括号平衡扫描”。
- 仅保留可被 `JSON.parse` 成功解析的候选对象。
- 优先选择包含 `problemStatement/rqList/scopeInclude/successCriteria` 字段的对象。
- 解决“模型给了 JSON，但前端抓错 JSON 片段后回退文本解析”的问题。

## 2026-04-09 (Discovery 执行化编排)

### 从“计划”升级为“执行结果”
- 研究规划场景中，`discovery` 从仅输出检索计划升级为执行化输出：
  - 候选文献池（paper/report/blog/repo，含可信度评分）
  - 证据清单
  - 主题聚类
  - 工具过程与思考过程轨迹

### 前台展示策略
- 中间对话仅展示最终总结回复（由通用助手基于 discovery 结果生成）。
- 右栏“思考过程”展示详细执行过程与候选文献信息，便于回溯检索链路。

## 2026-04-09 (候选文献池与进程视图)

### 新增右栏“候选文献池”卡片
- 新增 `candidate` 卡片，独立展示：
  - 候选文献池（标题/类型/来源/可信度/入选理由）
  - 证据清单
  - 主题聚类

### 思考过程卡新增“当前进程 / 文件”双视图
- 在 `tools(思考过程)` 卡内新增页签：
  - `当前进程`：展示详细思考轨迹
  - `文件`：展示检索到的文章/报告/仓库等条目（含来源与可信度）
- 视觉与交互对齐“检索中可见过程、结果可回溯”的调研工作流。

## 2026-04-09 (时间轴状态流与顺序编排)

### 当前进程升级为时间轴状态流
- 新增 `queued / searching / deduping / scoring / clustering / summarized` 六阶段时间轴协议。
- 每阶段支持展示：
  - 新增文献数（addedCount）
  - 去重数（dedupedCount）
  - 淘汰原因（dropReasons）
  - 当前文献（currentTitle/currentUrl）

### 右栏出现顺序优化
- 研究规划流程改为阶段化显隐：
  1) 先显示 `思考过程(tools)`；
  2) Framing 生成后再显示 `任务卡(task)`；
  3) Discovery 执行完成后再显示 `候选文献池(candidate)`。

### 候选文献可点击
- `candidatePool` 新增可选 `url` 字段。
- 在“当前进程-文件”与“候选文献池”中，若存在 URL 则支持新标签页点击打开来源文献。

## 2026-04-09 (Discovery 真实检索接入)

### 多源真实检索聚合器
- 在 `llm.ts` 新增 `runRealDiscoveryRetrieval`，并行接入：
  - Crossref
  - OpenAlex
  - arXiv
  - Semantic Scholar（可选 API Key）
  - GitHub Repositories
- 支持统一去重（标题归一化）、来源可信度初评分、候选池截断与证据清单生成。

### 与现有 discovery 流程融合
- `AIChat` 规划分支中优先使用真实检索结果（候选>=5 时覆盖模型候选），不足时回退到 discovery agent JSON 输出。
- 实时回写 timeline/toolTrace/reasoningTrace 到右栏“思考过程”。

### 配置项
- 新增 `VITE_REAL_DISCOVERY_SEARCH`（默认 true，可关闭真实检索）。
- 新增 `VITE_SEMANTIC_SCHOLAR_API_KEY`（可选，用于提升 Semantic Scholar 稳定性）。

## 2026-04-09 (Chat Markdown 渲染)

### 问题修复
- 原因：消息组件将 assistant 输出按纯字符串直接渲染，未进行 Markdown 解析。
- 修复：`ChatMessage` 接入 `react-markdown + remark-gfm`，支持标题、列表、代码块、链接、表格等常见 Markdown 语法。

### 交互细节
- assistant 消息：按 Markdown 渲染。
- user 消息：保持纯文本（`whitespace-pre-wrap`），避免输入内容被误解析。
- 链接统一新标签页打开，提升可用性与安全性。

## 2026-04-09 (实时检索与重复输出修复)

### 修复“最终结果重复两遍”
- 调整 `streamRunResult` 的增量拼接逻辑：
  - 当 `message.completed` 返回整段快照时，用覆盖合并而非直接拼接；
  - 避免 `delta + completed` 双写导致文本重复。

### 思考过程/文件改为实时更新
- `runRealDiscoveryRetrieval` 新增 `onProgress` 回调，检索源完成后即时上报：
  - timeline 阶段状态
  - toolTrace 结果
  - candidatePool 增量
- `AIChat` 在 discovery 阶段接入进度回调，右栏“当前进程/文件”边检索边显示，不再等待全部完成。

### 扩大检索规模
- 每源检索上限从小样本提升（最高 25，当前调用 14）。
- GitHub 源每轮最多 10。
- 候选池上限提升到 60，证据清单提升到 15 条。

## 2026-04-09 (检索关键词与对话操作按钮)

### 显示检索关键词
- discovery 实时检索阶段新增关键词提取并展示：
  - 在 timeline `queued/searching` 消息中明确显示“检索关键词”
  - 在 `thoughtTrace` 中追加“检索关键词”项，便于回溯

### 对话操作按钮
- 在中间对话输入区上方新增：
  - `终止`：支持中止当前流式请求（AbortController）
  - `复制`：复制最近一条 assistant 回复
  - `转发`：优先 Web Share，降级为复制
  - `收藏`：保存最近 assistant 回复到本地收藏（localStorage）
  - `重新生成`：基于最近 user 提问再次发起生成

## 2026-04-09 (会话隔离与Google检索增强)

### 修复：刷新后历史会话右栏被覆盖
- 新增 `discoveryByThread`（按线程存储候选池/证据/主题），并持久化到 localStorage。
- `switchChatThread/create/delete/setActiveAgent` 时同步切换当前 discovery 数据，避免跨会话覆盖。
- 切换历史会话时恢复该会话对应右栏数据与卡片状态。

### 修复：最终输出偶发重复两次
- 在 `streamRunResult` 增加最终文本去重（覆盖式合并 + 重复块清洗）。
- 在 `AIChat` 规划流程最终流式展示处增加重复文本清洗兜底。

### 检索增强：Google 前5页 + 相关度排序
- 新增 Google CSE 检索源（可选）并接入实时检索流水。
- 若配置 `VITE_GOOGLE_CSE_API_KEY` + `VITE_GOOGLE_CSE_CX`，自动抓取 Google 前 5 页结果。
- 候选池排序从“仅可信度”升级为“可信度 + 相关度”混合评分，并在理由中标注相关度。

## 2026-04-09 (Discovery 两阶段通用化：先关键词后检索)

### 流程升级
- 将 discovery 执行流程明确为两阶段：
  1) `keywordPlan`：先抽取可检索关键词与查询式
  2) `retrieval`：再基于关键词执行多源检索、去重、评分、聚类

### 协议升级
- `buildDiscoveryExecutionPrompt` 的 JSON 协议新增：
  - `keywordPlan.keywords`
  - `keywordPlan.queries`
- `parseDiscoveryExecutionResponse` 增加 keywordPlan 解析与长度约束。

### 编排升级
- `AIChat` 先读取 discovery 返回的 `keywordPlan.keywords`，再传入真实检索层 `runRealDiscoveryRetrieval(seedKeywords)`。
- 前端关键词提取仅作为兜底，不再主导主流程。

## 2026-04-09 (历史会话信息栏隔离修复)

### 问题
- 切换/刷新后打开历史会话，右侧信息栏（尤其思考过程/运行状态）会显示其他会话的内容。

### 修复
- 新增 `agentRunByThread`（按 thread 保存 `agentRunState`）并持久化到 localStorage：
  - key: `research_map2_run_state_by_thread_v1`
- 在以下动作中同步加载/初始化/清理对应线程 run state：
  - `createChatThread`
  - `createChatThreadForAgent`
  - `switchChatThread`
  - `setActiveAgent`
  - `deleteChatThread`
- `setAgentRunState` 改为写入当前 `activeThreadId` 对应的 `agentRunByThread`，避免跨会话覆盖。

## 2026-04-09 (关键词来源一致性修复)

### 根因
- template 模式下曾统一忽略 `agentName`，导致 discovery 阶段偶发未命中 discovery agent，前端只能走 fallback 关键词抽取，出现与 OAH 控制台关键词不一致。

### 修复
- `normalizeSessionOptions` 调整为：template 模式下优先保留 `agentName`，并按 flow 隔离 `sessionScope`；
- `AIChat` 明确显示关键词来源（`discovery.keywordPlan` 或 `fallback`），便于排障与溯源。

## 2026-04-09 (信息栏线程绑定与同步增强)

### 右栏绑定会话线程
- 新增 `rightPanelByThread` + localStorage 持久化（`research_map2_right_panel_by_thread_v1`）。
- `setRightPanelCards` 按 `activeThreadId` 写入，切换历史会话时恢复对应卡片集合。
- 右栏组件在 `activeThreadId/rightPanelCards` 变化时自动校正 `activeCard`，防止跨会话残留。

### 思考过程实时状态修正
- 从 Framing 切到 Discovery 时，`agentRunState.agent/status` 立即切换为运行态，避免仍显示 framing。
- discovery 实时进度回调中持续刷新 `agent/status/timeline/toolTrace`，减少“已进入 discovery 但 UI 仍停留 framing”的滞后。

### 兜底原因可见
- 当关键词计划失败触发兜底时，在 `thoughtTrace/toolTrace/timeline` 明确写出原因：
  - `discovery 未返回 keywordPlan.keywords（可能是 agent 未命中或输出不符合 JSON 协议）`

## 2026-04-09 (Framing 与任务卡提取降噪重构)

### 1) 优化 framing agent
- `framing.md` 新增硬输出协议：
  - 必须使用 `<TASK_CARD_JSON>...</TASK_CARD_JSON>` 包裹单一 JSON 对象；
  - 禁止输出解释、思考过程、字段名噪声；
  - 信息不足时允许空数组，禁止猜测。

### 2) 优化任务卡提取过程
- `parseFramingTaskResponse` 改为严格结构化提取：
  - 优先解析 `<TASK_CARD_JSON>` 包裹 JSON；
  - 再回退解析平衡花括号 JSON；
  - 移除高噪声文本正则兜底提取路径（避免把思考过程混入任务卡）。
- 新增 `isValidTaskCard` 严格校验，发现噪声字段直接拒绝写入任务卡（返回 `null`）。

## 2026-04-09 (Framing 失败可视化与一键重试)

### 行为增强
- 当 framing 输出不合规、任务卡提取失败时：
  - 在“思考过程”中明确写出失败原因；
  - 工具轨迹标记 `framing` 为 failed（不再静默失败）。

### 交互增强
- 对话操作区新增 `重试Framing` 按钮：
  - 一键仅重跑 framing，不影响主对话上下文与最终回答；
  - 成功则自动更新任务卡，失败则继续在思考过程中展示原因。

## 2026-04-09 (Framing 输出-解析对照视图)

### 右栏“思考过程”新增 Framing 对照块
- 新增可折叠区：
  - `查看原始输出`：展示 Framing 原始文本（来自 thoughtTrace）
  - `查看解析结果`：展示当前任务卡各字段（problem/rq/scope/constraints/success）
- 用于快速定位“模型输出”和“任务卡落地”之间的偏差，便于调试解析链路。

## 2026-04-09 (信息栏与 Discovery 调整)

### 1) 删除 Framing 快照区
- 右栏 `思考过程` 中移除 `Framing 对照`折叠快照区。
- 保留思考过程中的 `Framing 输出回执` 文本，避免重复展示同源信息。

### 2) Discovery 关键词解析可见化
- 强化 `discovery.md`：明确“基于任务卡字段先做关键词与检索式解析”。
- 在编排中将 `keywordPlan.keywords` 与 `keywordPlan.queries` 输出到思考过程：
  - 新增“关键词计划”行
  - 新增“检索式”行
- 工具轨迹新增 `discovery.keywordPlan.queries` 步骤，便于排查关键词解析是否成功。

## 2026-04-09 (最终回复改为单次非流式)

### 变更
- 研究规划链路中“最终 AI 助手结论”改为 `finalOnly` 模式：
  - 不再实时流式覆盖中间对话气泡；
  - 仅提取最终落盘文本并一次性展示。

### 目的
- 避免最终回复受中间增量 token 影响，降低重复与抖动。

## 2026-04-09 (局部知识图谱 + 阅读联动 + 文献综述 Agent)

### 1) 新增“问题图谱”与“文献综述”信息卡
- `RightPanelCard` 新增：
  - `local_graph`（当前问题局部知识图谱）
  - `related_work`（结构化 Related Work）
- 右栏可展示：
  - 中心问题（problemStatement）
  - RQ 节点
  - 主题簇节点
  - 文献节点（可一键跳转阅读助手）
  - Related Work 表格（方法/数据/指标/局限）与 gap 列表

### 2) 候选文献 → 阅读助手联动
- 在 `当前进程 -> 文件` 与 `候选文献池` 中新增按钮：
  - `跳转阅读助手解读`
- 点击后自动：
  - 切换到阅读助手上下文
  - 注入文献标题/URL
  - 打开阅读相关右栏卡片并切到 `paper`

### 3) 新增 literature_review Agent
- 新增文件：`.openharness/agents/literature_review.md`
- 新增 LLM 编排能力：
  - `buildLiteratureReviewPrompt`
  - `parseLiteratureReviewResponse`
  - `getLiteratureReviewAgentName`
- 输出协议：JSON-only，包含：
  - `relatedWork[]`（title/method/data/metric/limitation/source/url）
  - `gaps[]`
  - `summary`

### 4) 综述结果按线程持久化
- store 新增：
  - `relatedWork`
  - `relatedWorkByThread`
  - `setRelatedWorkOutput`
- 本地存储键：`research_map2_related_work_by_thread_v1`

### 5) 交互编排更新
- 在研究规划链路中，Discovery 完成后自动调用 `literature_review`，再生成最终答复。
- 对“文献综述/related work/gap/横向对比”等请求，支持直接触发综述 agent，并把结构化结果落到右栏卡片。

## 2026-04-09 (问题图谱可视化 + 一键解读)

### 1) 问题图谱升级为 SVG 连线图
- `local_graph` 卡从列表改为 SVG force-like 可视化：
  - 节点层级：中心问题 -> RQ -> 主题簇 -> 候选文献
  - 边关系按层连接，支持 hover title 与文献节点点击。

### 2) 一键跳转阅读助手并自动发问
- 点击“跳转阅读助手解读/阅读助手解读”后：
  - 切换阅读助手上下文；
  - 自动注入并发送默认问题：
    - `请详细解读该文的方法、数据、指标与局限：{文献标题}`
- 新增 store 字段：
  - `pendingAutoAsk`
  - `setPendingAutoAsk`
- `AIChat` 在空闲时自动消费该问题并发起一次完整对话请求。

### 3) 信息侧栏导航单行与可滑动
- 右栏卡片导航按钮强制 `whitespace-nowrap`，并保持横向滚动：
  - 长标签不再折成两行；
  - 可左右滑动浏览全部卡片。
