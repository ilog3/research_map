# 共词分析网络页面 — 设计文档

## 概述

在知识图谱应用中新增"共词分析"独立页面，展示教育研究关键词的共现网络。默认展示全局 Top 50 关键词的力导向图，点击任意节点可以该关键词为中心展开其 Top 20 共现词，支持探索式导航。数据从 670k 论文数据库预计算。

## 数据预生成

### 脚本：`src/data/generate-coword.ts`

从 `/data/merged.db3` 预计算两个 JSON 文件。

**提取逻辑：**
1. 遍历所有 `keyword_c` 非空的记录
2. 对每条记录，拆分关键词列表，生成所有两两组合
3. 统计每个关键词的总论文数 + 每对关键词的共现次数
4. 根据 `showclasstypes` 判断每个关键词最常出现的领域，赋予领域标签

**`src/data/coword-global.json`**

全局 Top 100 关键词的共现网络（页面默认展示前 50）。

```typescript
interface CowordGlobal {
  nodes: Array<{
    id: string;       // 关键词
    count: number;    // 论文总数
    domain: string;   // 最常出现的领域名
    color: string;    // 领域颜色
  }>;
  links: Array<{
    source: string;   // 关键词 A
    target: string;   // 关键词 B
    weight: number;   // 共现次数
  }>;
}
```

links 只保留权重 >= 5 的连线，避免图过于密集。

**`src/data/coword-neighbors.json`**

Top 500 关键词各自的 Top 20 共现邻居，用于点击展开。

```typescript
type CowordNeighbors = Record<string, Array<{
  keyword: string;
  weight: number;
  count: number;   // 该邻居关键词自身的论文总数
  domain: string;
  color: string;
}>>;
```

### 领域分类

复用现有 10 个领域定义和颜色（与知识图谱页和趋势页一致）：

| 领域 | showclasstypes LIKE | 颜色 |
|------|-------------------|------|
| 高等教育·人才培养 | %高等教育% | #45b7d1 |
| 教育学原理·教育技术 | %教育学原理% | #4ecdc4 |
| 课程与教学论 | %课程与教学% | #ff6b6b |
| 职业技术教育 | %职业技术教育% | #f7dc6f |
| 教育信息化·教育技术 | %教育技术% | #bb8fce |
| 学前教育·儿童发展 | %学前教育% | #f0b27a |
| 特殊教育·心理学 | %特殊教育% | #f1948a |
| 成人教育·继续教育 | %成人教育% | #82e0aa |
| 教育心理·发展心理 | %心理% | #85c1e9 |
| 基础教育·教育学 | %教育学;% | #d7bde2 |

对于匹配多个领域或不匹配任何领域的关键词，取其出现次数最多的领域。

## 路由

新增路由 `/coword`，TopNav 增加"共词分析"链接。

- `/` — 知识图谱
- `/trends` — 统计分析
- `/coword` — 共词分析

## 页面布局

深色主题，两栏布局：左侧力导向图（flex-[3]），右侧详情面板（flex-[1]，min-width 280px）。

```
┌───────────────────────────────────────────────────┐
│  TopNav: 知识图谱 | 统计分析 | [共词分析] | 论文检索 │
├───────────────────────────────────────────────────┤
│  🔍 搜索关键词...       [当前: 全局视图 / XXX]     │
├────────────────────────────────┬──────────────────┤
│                                │  节点详情         │
│                                │  ─────────        │
│    SVG 力导向网络图             │  关键词名         │
│                                │  论文数: N        │
│    (d3-force simulation)       │  所属领域: XXX    │
│                                │                   │
│                                │  Top 共现词       │
│                                │  1. XXX (N次)     │
│                                │  2. XXX (N次)     │
│                                │  ...              │
│                                │                   │
│                                │  [查看趋势]       │
│                                │  [返回全局视图]    │
├────────────────────────────────┴──────────────────┘
```

## 技术选型

| 类别 | 选型 |
|------|------|
| 力模拟 | d3-force（仅引入力模拟模块） |
| 渲染 | React + SVG（节点为 `<circle>`，连线为 `<line>`，标签为 `<text>`） |
| 交互 | SVG 事件 + d3-drag（节点拖拽） |

## 交互细节

### 默认视图（全局）
- 展示 coword-global.json 的前 50 个节点及其连线
- 力模拟参数：center force + many-body(charge=-200) + link force(distance按权重反比)
- 节点大小：`Math.max(8, Math.log2(count) * 4)` px 半径
- 节点颜色：领域色
- 连线粗细：`Math.max(0.5, Math.log2(weight))` px
- 连线颜色：`#ffffff` opacity 0.1-0.3（按权重）

### Hover 效果
- 高亮该节点（描边变亮）+ 所有直连连线（opacity 提升到 0.8）
- 非相关节点和连线透明度降到 0.1
- 右侧面板显示节点信息

### 点击展开
- 点击节点 → 从 coword-neighbors.json 获取该关键词的 Top 20 邻居
- 中心节点 + 20 个邻居构成新的网络
- 动画过渡：现有节点平滑移动到新位置，新节点淡入，消失的节点淡出
- 顶部状态栏更新为"当前中心: XXX"
- 右侧面板显示该关键词详情

### 搜索框
- autocomplete 从 500 个关键词中匹配
- 选中后等同于点击该节点（切换到以其为中心的视图）

### 返回全局
- 按钮点击回到默认 Top 50 全局视图

### 拖拽
- d3-drag 实现节点拖拽
- 拖拽时固定该节点位置，松开后恢复模拟

## 组件架构

```
src/
  pages/
    CowordPage.tsx              # 页面容器 + 状态管理
  components/
    CowordPage/
      ForceGraph.tsx            # D3 force simulation + SVG 渲染
      CowordSearch.tsx          # 搜索框 + autocomplete
      NodeDetail.tsx            # 右侧节点详情面板
  data/
    coword-global.json          # 预生成的全局共现网络
    coword-neighbors.json       # 预生成的邻居数据
    generate-coword.ts          # 数据生成脚本
```

## 类型定义

```typescript
interface CowordNode {
  id: string;
  count: number;
  domain: string;
  color: string;
  // d3-force 运行时添加
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface CowordLink {
  source: string | CowordNode;
  target: string | CowordNode;
  weight: number;
}

interface NeighborEntry {
  keyword: string;
  weight: number;
  count: number;
  domain: string;
  color: string;
}
```
