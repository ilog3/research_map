# EduGraph — 教育学论文知识图谱系统

基于 **670,822 篇真实教育学论文** 构建的 3D 交互式知识图谱可视化系统。支持研究态势浏览、趋势分析、共词网络探索和 AI 驱动的选题推荐。

## 功能模块

### 知识图谱（3D 点云）
- 从 67 万篇论文中抽样 **8,000 篇**，通过 `InstancedMesh` 渲染为 3D 点云
- 10 个教育学子领域聚类，颜色区分
- 点击选中论文、悬停预览、拖拽旋转缩放
- 聚类筛选、年份范围滑块、模糊搜索（标题/关键词/作者）
- 2D/3D 视图切换、自动旋转、时间演进动画
- **AI 对话**：基于选中论文的真实 LLM 问答（流式输出），上下文感知当前聚类和筛选状态

### 统计分析
- **关键词趋势对比**：最多同时对比 5 个关键词的年度论文数折线图（预计算 Top 200 关键词）
- **领域演化**：堆叠面积图展示各子领域内子关键词的此消彼长
- **热门关键词排行**：可调时间段的水平柱状图

### 共词分析网络
- **力导向图**：全局 Top 50 关键词共现网络（从 750 万共现对中提取）
- 点击任意节点展开其 Top 20 共现邻居，支持探索式导航
- 悬停高亮相关节点和连线，拖拽调整布局
- **AI 解读**：LLM 分析关键词共现背后的学理关系

### 选题推荐
- **4 种推荐算法**：趋势热点、交叉创新、蓝海选题、经典延伸
- **双维度评分体系**：
  - **创新性**（交叉度 × 空白度 × 新颖度）— 是否处于知识边界？
  - **实效性**（增长势能 × 文献基础 × 政策契合）— 是否可行且有价值？
- 每条推荐附带可验证、可追溯的量化依据
- 迷你趋势火花图、代表性论文列表
- **AI 前沿分析**：LLM 从创新性和实效性两个维度生成知识边界评估

## 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | React 18 + TypeScript |
| 3D 渲染 | React Three Fiber + Drei |
| 图表 | Recharts |
| 力导向图 | d3-force |
| 状态管理 | Zustand |
| 样式 | TailwindCSS |
| 构建 | Vite |
| 大模型 | Gemini 3.1 Pro（OpenAI 兼容 API） |
| 数据库 | SQLite (better-sqlite3) |

## 快速开始

### 前置要求
- Node.js >= 20
- 论文数据库文件 `data/merged.db3`（未包含在仓库中，1.6GB）

### 安装与运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 重新生成数据（可选）

如果你有 `data/merged.db3` 数据库：

```bash
# 生成点云数据（从 67 万篇中抽样 8,000 篇）
npx tsx src/data/generate-from-db.ts

# 生成关键词趋势数据（Top 200 关键词）
npx tsx src/data/generate-trends.ts

# 生成共词网络（Top 100 节点，500 个关键词的邻居数据）
npx tsx src/data/generate-coword.ts

# 生成选题推荐（含双维度评分）
npx tsx src/data/generate-topics.ts
```

### PDF 文献解析（阅读助手 / 个人知识库综述）

前端通过 `src/services/llm.ts` 中的 **`parseDocumentSource`** 处理 PDF：

1. **默认**：向 `VITE_OAH_DOC_PARSE_API` 发请求（未配置时等价于 `{VITE_OAH_API_BASE}/documents/parse`），由 **后台 OAH 文献解析服务** 返回标题、摘要、分块片段等结构化结果。  
   - 若你的 OAH **尚未实现** `/documents/parse`，会出现 **404**，属预期。

2. **自动兜底（已实现）**：本地上传 PDF 时，若远程接口 **失败**（含 404、5xx、返回空），会自动改用浏览器内的 **PDF.js**（`pdfjs-dist`）抽取 **PDF 文本层**，不依赖 OAH 解析能力。  
   - **扫描版 / 纯图片 PDF** 没有文本层，本地与远程都可能失败，需要 OCR 或带版面分析的解析服务。

3. **完全不走远程（推荐在无解析后端时使用）**：在环境变量中设置  
   - `VITE_OAH_DOC_PARSE_DISABLED=true`  
   或  
   - `VITE_OAH_DOC_PARSE_API=off`  
   则上传 PDF **只使用浏览器 PDF.js**，不再请求会 404 的接口。

4. **以后接入真实解析**：在 OAH 实现与 `normalizeParsedDocument` 兼容的 JSON（含 `title`/`abstract`/`chunks` 或 `segments` 等），并将 `VITE_OAH_DOC_PARSE_API` 指向该地址即可；无需改前端业务逻辑。

### Open Agent Harness：通用助手 agent 名（部署）

研究对话、编排器 Plan/Search、意图路由、个人知识库等与 **同一 OAH agent** 通信，该名字由环境变量解析，逻辑见 `src/services/llm.ts` 中的 `OAH_AGENT_GENERAL`。

| 变量（优先级从高到低） | 说明 |
|------------------------|------|
| `VITE_OAH_AGENT_GENERAL` | 推荐。应与本仓库 `.openharness` 模板中的 **`general`**（`agents/general.md`）及 `default_agent: general` 一致。 |
| `VITE_OAH_AGENT_NAME` | 历史/兼容：未设置上一项时，可作为全局默认 agent 名。 |
| `VITE_OAH_AGENT_DISCOVERY` / `VITE_OAH_AGENT_FRAMING` | **迁移兜底**：workspace 若尚未注册 `general`，仍只有旧 agent 时，可设为 `discovery` 或 `framing`，避免 `agent_not_found`。 |
| （均未设置） | 默认使用字面量 **`general`**。 |

可复制根目录 **`.env.example`** 为 `.env.local` 并按实际 OAH workspace 修改。**长期建议**在模板中注册 `general`，再逐步去掉旧变量。

**开发代理**：`vite.config.ts` 将 `/oah` 转发到 **`VITE_OAH_DEV_PROXY_TARGET`**（默认 `http://127.0.0.1:8787`）。若终端出现 `ECONNREFUSED 127.0.0.1:8787`，说明本机该端口没有 OAH 进程——请先启动 Open Agent Harness 后端，或把 `VITE_OAH_DEV_PROXY_TARGET` 改成实际监听地址。

## 项目结构

```
src/
  pages/                    # 4 个页面组件
    KnowledgeGraph.tsx      # 3D 点云知识图谱 + AI 对话
    TrendsPage.tsx          # 关键词趋势 + 领域演化
    CowordPage.tsx          # 力导向共词分析网络
    TopicsPage.tsx          # AI 驱动的选题推荐
  components/               # 各页面的 UI 组件
  services/
    llm.ts                  # LLM API 服务（支持流式输出）
  store/
    index.ts                # Zustand 全局状态管理
  data/
    papers.json             # 8,000 篇抽样论文数据
    clusters.json           # 10 个领域聚类定义
    trends-keywords.json    # Top 200 关键词年度统计
    trends-domains.json     # 各领域子关键词趋势
    coword-global.json      # 全局共现网络
    coword-neighbors.json   # 关键词邻居数据
    topic-recommendations.json  # 含评分的选题推荐
    generate-*.ts           # 数据生成脚本
  types/
    index.ts                # TypeScript 类型定义
```

## 数据来源

论文数据来自教育学领域学术数据库，包含 670,822 篇论文的元数据（标题、作者、机构、关键词、摘要、分类、年份等）。数据存储在 SQLite 数据库中，通过预计算脚本提取为前端可用的 JSON 文件。

## 许可证

MIT
