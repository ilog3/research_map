# 教育论文知识图谱可视化系统 — 设计文档

## 概述

一个基于 3D 点云可视化的教育学论文知识图谱系统。用户可以在 3D 空间中浏览 ~8000 篇教育学论文的 embedding 分布，按聚类、年份筛选，点击查看论文详情，并与 Mock AI 助手对话。纯前端静态项目，无后端依赖。

## 目标用户

- 教育学研究者/学者：发现研究热点、找相关论文
- 学生：了解教育学领域全貌、辅助选题
- 作为炫酷的可视化 demo / 作品集展示

## 技术栈

| 类别 | 选型 |
|------|------|
| 框架 | React 18 + TypeScript |
| 3D 渲染 | React Three Fiber (R3F) + Drei |
| 状态管理 | Zustand |
| 样式 | TailwindCSS |
| 构建 | Vite |
| 部署 | 纯静态站点（Vercel/Netlify/GitHub Pages） |

## 布局设计

三栏布局 + 顶部导航栏，深色宇宙主题。

```
┌─────────────────────────────────────────────────────────┐
│  TopNav: 标题 | 知识图谱 | 统计分析 | 论文检索 | 2D/3D  │
├──────────┬──────────────────────┬────────────────────────┤
│          │                      │  论文详情              │
│  聚类    │                      │  (标题/作者/机构/      │
│  标签    │    3D 点云画布        │   关键词/摘要)         │
│  面板    │                      ├────────────────────────┤
│          │   [搜索框 overlay]    │  AI 对话               │
│  年份    │                      │  (Mock 响应)           │
│  筛选    │                      │                        │
├──────────┴──────────────────────┴────────────────────────┘
  240px固定    flex: 2 自适应        flex: 1 (~1/3屏宽)
```

### 视觉风格

- 背景：深蓝黑 `#0a0a1a`，中央画布径向渐变 `#0f0f2a → #050510`
- 面板背景：`#0d0d20`，边框 `#1a1a3a`
- 强调色：`#4444aa`（按钮）、`#8888ff`（活跃标签）
- 聚类颜色：8 种高饱和霓虹色
- 字体：系统字体栈

### 导航标签

- **知识图谱**：主视图，即 3D 点云可视化（默认激活）
- **统计分析 / 论文检索**：占位标签，点击显示"功能开发中"提示，不实现具体页面

## 数据模型

### 论文数据结构

```typescript
interface Paper {
  id: string;
  title: string;
  authors: string[];
  institution: string;
  journal: string;
  year: number;
  keywords: string[];
  abstract: string;
  clusterId: number;
  embedding: [number, number, number]; // 预计算的 3D 坐标
}
```

### 聚类定义

```typescript
interface Cluster {
  id: number;
  name: string;
  color: string;
  count: number;
}
```

8 个聚类类别：

| ID | 名称 | 颜色 |
|----|------|------|
| 0 | 教育心理学·认知发展 | `#ff6b6b` |
| 1 | 课程改革·教学方法 | `#4ecdc4` |
| 2 | 高等教育·人才培养 | `#45b7d1` |
| 3 | 教育信息化·技术应用 | `#f7dc6f` |
| 4 | 学前教育·儿童发展 | `#bb8fce` |
| 5 | 教育公平·政策研究 | `#f1948a` |
| 6 | 教师教育·专业发展 | `#82e0aa` |
| 7 | 比较教育·国际视野 | `#f0b27a` |

### 数据生成策略

混合方案：少量真实论文元数据作为种子 + 批量生成补充。

- 总量：~8000 条
- 每个聚类用高斯分布生成 3D 坐标（聚类中心随机分布在 3D 空间中）
- 标题、关键词、摘要从预设的教育学词库中组合生成
- 年份分布 1990-2025，近年论文密度更高（指数增长曲线）
- 数据生成脚本输出 `papers.json`，构建时内嵌

## 交互功能

### 3D 点云交互

| 功能 | 实现 |
|------|------|
| 旋转/缩放/平移 | Drei `OrbitControls`，鼠标拖拽/滚轮/右键 |
| 点击选中 | R3F `Raycaster`，高亮选中点（白色光环），右侧显示详情 |
| Hover 预览 | 悬停时显示论文标题 tooltip（HTML overlay） |
| 2D/3D 切换 | 相机动画：3D 透视 ↔ 2D 正交俯视，平滑过渡 |
| 自动旋转 | 空闲时缓慢旋转，用户交互时停止 |

### 筛选功能

| 功能 | 实现 |
|------|------|
| 聚类筛选 | 点击左侧标签切换可见性，支持多选，不可见的点透明度降为 0 |
| 年份范围 | 双滑块组件，筛选结果实时更新点云显示 |
| 搜索 | 前端模糊搜索（标题/关键词/作者），匹配结果高亮（其余点变暗） |

### AI 对话（Mock）

- 预设若干问答模板，基于当前选中论文的关键词匹配响应
- 支持的 mock 场景：论文摘要解读、相关研究推荐、领域热点分析
- 打字机效果逐字输出
- 无需真实 LLM API

## 组件架构

```
src/
  components/
    Layout/
      Layout.tsx           # 三栏布局壳
    TopNav/
      TopNav.tsx           # 顶部导航栏 + 2D/3D 切换
    PointCloud/
      PointCloud.tsx       # R3F Canvas + 点云渲染
      Points.tsx           # InstancedMesh 点云
      Tooltip.tsx          # Hover tooltip overlay
    ClusterPanel/
      ClusterPanel.tsx     # 左侧面板：年份筛选 + 聚类标签列表
      ClusterItem.tsx      # 单个聚类标签行
      YearRangeSlider.tsx  # 年份范围双滑块
    DetailPanel/
      DetailPanel.tsx      # 右侧面板容器
      PaperDetail.tsx      # 论文详情展示
    AIChat/
      AIChat.tsx           # AI 对话组件
      ChatMessage.tsx      # 单条消息气泡
      mockResponses.ts     # Mock 响应模板
    SearchBar/
      SearchBar.tsx        # 悬浮搜索框
  hooks/
    usePointCloud.ts       # 点云数据加载、筛选、坐标计算
    useSearch.ts           # 搜索逻辑
  store/
    index.ts               # Zustand store（选中论文、筛选条件、聚类可见性、视图模式）
  data/
    papers.json            # 预生成的论文数据（~8000条）
    clusters.json          # 聚类定义
    generate.ts            # 数据生成脚本（Node.js，开发时运行）
  types/
    index.ts               # TypeScript 类型定义
  App.tsx
  main.tsx
```

## 状态管理（Zustand Store）

```typescript
interface AppState {
  // 数据
  papers: Paper[];
  clusters: Cluster[];

  // 选中
  selectedPaperId: string | null;
  hoveredPaperId: string | null;

  // 筛选
  visibleClusterIds: Set<number>;
  yearRange: [number, number];
  searchQuery: string;
  searchResults: Set<string>;

  // 视图
  viewMode: '2d' | '3d';

  // AI 对话
  chatMessages: ChatMessage[];

  // Actions
  selectPaper: (id: string | null) => void;
  hoverPaper: (id: string | null) => void;
  toggleCluster: (id: number) => void;
  setYearRange: (range: [number, number]) => void;
  setSearchQuery: (query: string) => void;
  setViewMode: (mode: '2d' | '3d') => void;
  sendChatMessage: (text: string) => void;
}
```

## 性能考量

- **InstancedMesh**：8000 个点用单次 draw call 渲染，每个点独立颜色/位置
- **筛选优化**：不重新创建 mesh，而是将隐藏点的 scale 设为 0 或 opacity 设为 0
- **搜索防抖**：300ms debounce，避免频繁重渲染
- **数据加载**：JSON 文件 gzip 后约 1-2MB，首屏加载可接受
