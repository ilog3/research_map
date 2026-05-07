# LLM 深度融合 + 双维度选题评估 — 设计文档

## 概述

将 LLM 从"附加功能"升级为系统核心能力，同时建立"创新性 × 实效性"双维度选题评估框架。模型从 gemini-2.5-flash 切换至 gemini-3.1-pro-preview。清理残留 mock 代码。

## 变更范围

### 1. 模型升级 + Mock 清理

**`services/llm.ts`**
- MODEL 从 `gemini-2.5-flash` 改为 `gemini-3.1-pro-preview`

**`store/index.ts`**
- 删除 `chatMessages` 状态和 `sendChatMessage` mock action（AIChat 组件已自管状态，store 中的是死代码）

### 2. 双维度选题评估框架

核心理念：每个推荐选题从**创新性**和**实效性**两个维度评分，给出可验证可追溯的依据。

#### 2.1 评分维度定义

**创新性（Innovation）**— 该选题是否处于知识边界？

| 指标 | 计算方法 | 数据来源 | 分值 0-1 |
|------|---------|---------|---------|
| 交叉度 | 关键词涉及的不同教育子领域数 / 总领域数(10) | coword-global.json 节点 domain | 跨 2 个领域=0.5，3+=0.8，同领域=0.2 |
| 空白度 | 1 - (共现论文数 / min(各关键词论文数)) | trends-keywords.json + coword | 比值越低 = 空白越大 = 分越高 |
| 新颖度 | 关键词首次出现年份映射 | trends-keywords.json 第一个非零年份 | 2020后=1.0, 2015-2019=0.7, 2010-2014=0.4, 更早=0.2 |

**实效性（Practicality）**— 该选题是否可行且有价值？

| 指标 | 计算方法 | 数据来源 | 分值 0-1 |
|------|---------|---------|---------|
| 增长势能 | 近3年增长率归一化 (min-max in top 200) | trends-keywords.json | 线性映射到 0-1 |
| 文献基础 | 总论文数是否足够支撑研究 | trends-keywords.json | <30=0.2, 30-200=0.6, 200-1000=0.8, 1000+=1.0 |
| 政策契合 | 关键词是否匹配近期教育政策热词 | 硬编码政策词表 | 匹配=1.0, 不匹配=0.3 |

**政策热词表**（2023-2025 教育政策关键词）：
`中国式现代化, 教育强国, 高质量发展, 双减, 新质生产力, 科学教育, 拔尖创新人才, 教育数字化, 产教融合, 核心素养, 立德树人, 思政课, 教育评价改革, 乡村振兴, 终身学习`

#### 2.2 数据结构

`generate-topics.ts` 为每个推荐计算评分并附带依据：

```typescript
interface TopicScores {
  innovation: {
    crossDomain: number;
    gapRatio: number;
    novelty: number;
    total: number;          // 加权平均 (0.3, 0.4, 0.3)
  };
  practicality: {
    growth: number;
    literatureBase: number;
    policyFit: number;
    total: number;          // 加权平均 (0.4, 0.3, 0.3)
  };
  evidence: string;         // 可验证依据文本
}
```

#### 2.3 前端展示

TopicCard 顶部新增双维度评分条：
- 创新性用蓝色进度条，实效性用绿色进度条
- 子指标小字展示
- evidence 文本显示在评分下方

新组件 `ScoreBar.tsx`：双维度进度条 + 子指标。

#### 2.4 AI 分析 Prompt 升级

要求 LLM 从创新性和实效性两个维度分析，必须引用具体数据作为依据。

### 3. 共词分析页 AI 解读

NodeDetail 选中节点后新增"AI 解读关系"按钮，LLM 分析关键词共现的学理关系。

### 4. 知识图谱页 AI 对话增强

AIChat 系统 prompt 注入当前聚类统计、年份范围、搜索状态等上下文。

### 5. 文件变更清单

| 文件 | 变更类型 | 内容 |
|------|---------|------|
| `services/llm.ts` | 修改 | 模型改 gemini-3.1-pro-preview，prompt 升级双维度，新增 buildCowordAnalysisPrompt |
| `store/index.ts` | 修改 | 删除 chatMessages/sendChatMessage 残留 mock |
| `data/generate-topics.ts` | 修改 | 新增双维度评分计算 + evidence 生成 |
| `data/topic-recommendations.json` | 重新生成 | 新增 scores 字段 |
| `components/TopicsPage/TopicCard.tsx` | 修改 | 展示双维度评分 + 升级 AI prompt |
| `components/TopicsPage/ScoreBar.tsx` | 新建 | 双维度评分进度条组件 |
| `components/CowordPage/NodeDetail.tsx` | 修改 | 新增 AI 解读按钮 |
| `components/AIChat/AIChat.tsx` | 修改 | 系统 prompt 注入聚类/筛选上下文 |
