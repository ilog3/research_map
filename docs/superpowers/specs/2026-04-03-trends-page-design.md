# 研究趋势分析页面 — 设计文档

## 概述

在现有知识图谱应用中新增"统计分析"页面，用于展示教育研究领域的关键词时间趋势和子领域演化。数据从 670k 论文数据库预计算导出为静态 JSON，前端使用 Recharts 渲染图表。

## 数据预生成

### 脚本：`src/data/generate-trends.ts`

从 `/data/merged.db3` 预计算两个 JSON 文件：

**`src/data/trends-keywords.json`**
- 统计所有关键词在各年份的论文数量
- 取 Top 200 关键词（按总论文数排序）
- 格式：`{ [keyword: string]: { [year: string]: number } }`

**`src/data/trends-domains.json`**
- 按 10 个教育子领域分组（复用现有 clusterConfig 的 showclasstypes 分类）
- 每个领域取 Top 20 子关键词的年度统计
- 格式：`{ [domain: string]: { color: string, keywords: { [keyword: string]: { [year: string]: number } } } }`

### 数据提取逻辑

1. 遍历 main0 表所有记录
2. 拆分 `keyword_c` 字段（分号分隔）
3. 按 keyword × year 聚合计数
4. Top 200 全局关键词 → `trends-keywords.json`
5. 按 showclasstypes 分组到 10 个领域 → 每个领域内取 Top 20 → `trends-domains.json`

## 路由

使用 React Router v6：
- `/` — 知识图谱页面（现有功能）
- `/trends` — 统计分析页面（新增）

TopNav 的"统计分析"标签改为 `<Link to="/trends">`，"知识图谱"改为 `<Link to="/">`。

## 页面布局

深色主题，全宽单栏布局，可滚动。

```
┌───────────────────────────────────────────────────┐
│  TopNav（共享）                                    │
├───────────────────────────────────────────────────┤
│  搜索栏：autocomplete 输入 + 已选关键词 tags       │
├───────────────────────────────────────────────────┤
│  Section 1: 关键词趋势对比                         │
│  - Recharts LineChart                             │
│  - X: 年份 (1990-2025), Y: 论文数量               │
│  - 最多 5 条折线，每条一个关键词                    │
│  - Hover tooltip 显示具体年份/数值                  │
│  - 每条线颜色不同，带图例                          │
├───────────────────────────────────────────────────┤
│  Section 2: 领域演化                              │
│  - 下拉菜单选择教育子领域                          │
│  - Recharts AreaChart (stacked) 模拟 Streamgraph  │
│  - 展示该领域内 Top 20 子关键词的面积占比变化       │
│  - 颜色渐变，hover 显示关键词名和数量               │
├───────────────────────────────────────────────────┤
│  Section 3: 热门关键词排行                         │
│  - 时间段选择器（起止年份）                        │
│  - 展示选定时间段内 Top 10 关键词的柱状图           │
│  - Recharts BarChart, horizontal                  │
└───────────────────────────────────────────────────┘
```

## 组件架构

```
src/
  pages/
    KnowledgeGraph.tsx    # 现有知识图谱页面内容（从 App.tsx 提取）
    TrendsPage.tsx        # 新页面容器
  components/
    TrendsPage/
      KeywordSearch.tsx   # 搜索框 + autocomplete + 已选 tags
      TrendLineChart.tsx  # 关键词趋势折线图
      DomainStream.tsx    # 领域演化堆叠面积图
      TopKeywordsBar.tsx  # 热门关键词柱状图
  data/
    trends-keywords.json  # 预生成
    trends-domains.json   # 预生成
    generate-trends.ts    # 数据生成脚本
```

## 类型定义

```typescript
// trends-keywords.json 的类型
type KeywordTrends = Record<string, Record<string, number>>;

// trends-domains.json 的类型
interface DomainTrends {
  [domain: string]: {
    color: string;
    keywords: Record<string, Record<string, number>>;
  };
}
```

## 技术选型

| 类别 | 选型 |
|------|------|
| 图表 | Recharts（React 原生，支持 LineChart / AreaChart / BarChart） |
| 路由 | React Router v6（`createBrowserRouter`） |
| 样式 | TailwindCSS（复用深色主题） |

## 交互细节

### 关键词搜索（KeywordSearch）
- 输入框带 autocomplete 下拉，从 200 个预计算关键词中匹配
- 选中后生成 tag，最多 5 个
- 点击 tag 上的 × 移除
- 默认预选 3 个热门关键词（如：人工智能、在线学习、核心素养）

### 趋势折线图（TrendLineChart）
- 每个选中的关键词一条折线
- X 轴：1990-2025（忽略早期无数据年份，从有数据的第一年开始）
- Y 轴：论文数量
- Hover tooltip 显示年份和各关键词的具体数量
- 折线带圆点标记

### 领域演化（DomainStream）
- 下拉菜单切换 10 个教育子领域
- Recharts StackedAreaChart，每个子关键词一个 area
- type="monotone" 平滑曲线
- 颜色使用该领域主色的不同深浅变体
- Hover tooltip 显示关键词名和数量

### 热门排行（TopKeywordsBar）
- 两个年份输入框选择时间段
- 从 trends-keywords.json 聚合该时间段内各关键词总数
- 取 Top 10 绘制水平柱状图
- 带数量标签
