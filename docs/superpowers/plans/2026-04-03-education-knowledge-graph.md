# 教育论文知识图谱可视化系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 3D point-cloud knowledge graph visualization of ~8000 education research papers with cluster filtering, search, paper details, and mock AI chat.

**Architecture:** Pure frontend SPA. React Three Fiber renders ~8000 points via InstancedMesh in a three-panel layout (cluster sidebar, 3D canvas, detail+chat panel). Zustand manages global state (selection, filters, view mode). Data is pre-generated as static JSON.

**Tech Stack:** React 18, TypeScript, Vite, React Three Fiber, Drei, Zustand, TailwindCSS

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`

- [ ] **Step 1: Scaffold Vite + React + TypeScript project**

Run:
```bash
cd /Users/aarondi/workspace/research_map
npm create vite@latest . -- --template react-ts
```

If prompted about non-empty directory, proceed (only docs/ exists).

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install three @react-three/fiber @react-three/drei zustand
npm install -D tailwindcss @tailwindcss/vite @types/three
```

- [ ] **Step 3: Configure TailwindCSS**

Replace `src/index.css` with:
```css
@import "tailwindcss";
```

Update `vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

- [ ] **Step 4: Create minimal App with dark background**

Replace `src/App.tsx` with:
```tsx
export default function App() {
  return (
    <div className="h-screen w-screen bg-[#0a0a1a] text-white flex items-center justify-center">
      <h1 className="text-2xl font-bold">教育论文知识图谱</h1>
    </div>
  );
}
```

Replace `src/main.tsx` with:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 5: Verify dev server starts**

Run: `npm run dev`

Expected: Browser shows dark background with "教育论文知识图谱" centered text at `http://localhost:5173`.

- [ ] **Step 6: Commit**

```bash
git init
echo "node_modules\ndist\n.superpowers" > .gitignore
git add -A
git commit -m "feat: scaffold vite + react + r3f + tailwind project"
```

---

## Task 2: Type Definitions & Data Generation

**Files:**
- Create: `src/types/index.ts`, `src/data/generate.ts`, `src/data/clusters.json`, `src/data/papers.json`

- [ ] **Step 1: Define TypeScript types**

Create `src/types/index.ts`:
```typescript
export interface Paper {
  id: string;
  title: string;
  authors: string[];
  institution: string;
  journal: string;
  year: number;
  keywords: string[];
  abstract: string;
  clusterId: number;
  embedding: [number, number, number];
}

export interface Cluster {
  id: number;
  name: string;
  color: string;
  count: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}
```

- [ ] **Step 2: Create clusters.json**

Create `src/data/clusters.json`:
```json
[
  { "id": 0, "name": "教育心理学·认知发展", "color": "#ff6b6b", "count": 0 },
  { "id": 1, "name": "课程改革·教学方法", "color": "#4ecdc4", "count": 0 },
  { "id": 2, "name": "高等教育·人才培养", "color": "#45b7d1", "count": 0 },
  { "id": 3, "name": "教育信息化·技术应用", "color": "#f7dc6f", "count": 0 },
  { "id": 4, "name": "学前教育·儿童发展", "color": "#bb8fce", "count": 0 },
  { "id": 5, "name": "教育公平·政策研究", "color": "#f1948a", "count": 0 },
  { "id": 6, "name": "教师教育·专业发展", "color": "#82e0aa", "count": 0 },
  { "id": 7, "name": "比较教育·国际视野", "color": "#f0b27a", "count": 0 }
]
```

- [ ] **Step 3: Write data generation script**

Create `src/data/generate.ts`:
```typescript
/**
 * Run with: npx tsx src/data/generate.ts
 * Outputs: src/data/papers.json (updated clusters.json counts)
 */
import { writeFileSync } from 'fs';
import { join } from 'path';

const TOTAL = 8000;

const clusterDefs = [
  {
    id: 0, name: '教育心理学·认知发展', color: '#ff6b6b',
    center: [15, 20, 10] as [number, number, number],
    titlePrefixes: ['基于认知负荷理论的', '学习动机与', '元认知策略在', '自我调节学习的', '认知发展视角下的'],
    titleSuffixes: ['教学设计研究', '学业成就影响分析', '实证研究', '理论框架构建', '实验研究'],
    keywords: ['认知负荷', '学习动机', '元认知', '自我效能感', '学习策略', '认知发展', '心理韧性', '学业情绪'],
    journals: ['心理学报', '教育研究', '心理发展与教育', '教育学报', '华东师范大学学报(教育科学版)'],
    institutions: ['北京师范大学心理学部', '华东师范大学心理与认知科学学院', '西南大学心理学部', '华南师范大学心理学院', '东北师范大学心理学院'],
  },
  {
    id: 1, name: '课程改革·教学方法', color: '#4ecdc4',
    center: [-20, 5, -15] as [number, number, number],
    titlePrefixes: ['新课程改革背景下', '翻转课堂在', '项目式学习在', '核心素养导向的', '混合式教学模式在'],
    titleSuffixes: ['的教学实践研究', '的应用效果分析', '中的教学改革探索', '的课程设计研究', '的实施策略研究'],
    keywords: ['课程改革', '翻转课堂', '项目式学习', '核心素养', '混合式教学', '教学设计', '学科融合', 'STEM教育'],
    journals: ['课程·教材·教法', '教育研究', '中国教育学刊', '教育发展研究', '全球教育展望'],
    institutions: ['华东师范大学课程与教学研究所', '北京师范大学教育学部', '南京师范大学教育科学学院', '华中师范大学教育学院', '首都师范大学教育学院'],
  },
  {
    id: 2, name: '高等教育·人才培养', color: '#45b7d1',
    center: [5, -25, 20] as [number, number, number],
    titlePrefixes: ['双一流建设背景下', '研究生教育中', '创新创业教育在', '产教融合视角下', '高校'],
    titleSuffixes: ['人才培养模式研究', '的质量保障体系构建', '的现状与对策', '的改革路径探析', '的实践与反思'],
    keywords: ['双一流', '研究生教育', '创新创业', '产教融合', '人才培养', '学科建设', '教育质量', '高等教育'],
    journals: ['高等教育研究', '中国高教研究', '学位与研究生教育', '高等工程教育研究', '江苏高教'],
    institutions: ['北京大学教育学院', '清华大学教育研究院', '浙江大学教育学院', '厦门大学教育研究院', '武汉大学教育科学研究院'],
  },
  {
    id: 3, name: '教育信息化·技术应用', color: '#f7dc6f',
    center: [-10, -15, -25] as [number, number, number],
    titlePrefixes: ['人工智能赋能', '大数据驱动的', '虚拟现实技术在', '智慧教育环境下', '教育数字化转型中'],
    titleSuffixes: ['教育应用研究', '的学习分析框架', '教学效果实证研究', '的创新实践', '的技术路径探索'],
    keywords: ['人工智能', '大数据', '虚拟现实', '智慧教育', '在线学习', '教育信息化', '学习分析', 'MOOC'],
    journals: ['电化教育研究', '中国电化教育', '远程教育杂志', '开放教育研究', '现代教育技术'],
    institutions: ['华中师范大学国家数字化学习工程技术研究中心', '北京师范大学智慧学习研究院', '华东师范大学教育信息技术学系', '西北师范大学教育技术学院', '江南大学教育信息化研究中心'],
  },
  {
    id: 4, name: '学前教育·儿童发展', color: '#bb8fce',
    center: [25, 10, -5] as [number, number, number],
    titlePrefixes: ['幼儿园', '学前儿童', '游戏化教学在', '家园共育视角下', '早期阅读对'],
    titleSuffixes: ['教育质量评估研究', '社会性发展的影响', '幼儿教育中的应用', '的实践探索', '儿童语言发展的影响研究'],
    keywords: ['学前教育', '幼儿发展', '游戏化教学', '家园共育', '早期阅读', '幼儿园课程', '儿童社会性', '保教质量'],
    journals: ['学前教育研究', '幼儿教育', '早期教育', '教育导刊(下半月)', '学前教育'],
    institutions: ['南京师范大学学前教育系', '华东师范大学学前教育学系', '北京师范大学学前教育研究所', '西南大学教育学部', '浙江师范大学杭州幼儿师范学院'],
  },
  {
    id: 5, name: '教育公平·政策研究', color: '#f1948a',
    center: [-25, 20, 15] as [number, number, number],
    titlePrefixes: ['城乡教育均衡发展', '义务教育阶段', '教育扶贫政策的', '流动儿童', '"双减"政策下'],
    titleSuffixes: ['的政策分析', '资源配置公平性研究', '实施效果评估', '教育权利保障研究', '的影响与对策研究'],
    keywords: ['教育公平', '城乡教育', '教育政策', '教育扶贫', '流动儿童', '双减', '均衡发展', '教育财政'],
    journals: ['教育研究', '北京大学教育评论', '教育与经济', '教育发展研究', '中国教育政策评论'],
    institutions: ['北京大学中国教育财政科学研究所', '华中师范大学教育学院', '东北师范大学教育学部', '中国人民大学教育学院', '北京师范大学中国教育政策研究院'],
  },
  {
    id: 6, name: '教师教育·专业发展', color: '#82e0aa',
    center: [10, -10, -20] as [number, number, number],
    titlePrefixes: ['新手教师', '教师专业学习共同体', 'TPACK框架下', '乡村教师', '教师情感劳动与'],
    titleSuffixes: ['专业成长路径研究', '的构建与实践', '教师信息素养提升研究', '职业认同研究', '职业幸福感研究'],
    keywords: ['教师专业发展', '教师教育', 'TPACK', '教师培训', '职业认同', '教师素养', '反思性教学', '教师评价'],
    journals: ['教师教育研究', '教育研究', '教育发展研究', '全球教育展望', '教育科学'],
    institutions: ['北京师范大学教师教育研究中心', '华东师范大学教师教育学院', '陕西师范大学教育学部', '东北师范大学教育学部', '湖南师范大学教育科学学院'],
  },
  {
    id: 7, name: '比较教育·国际视野', color: '#f0b27a',
    center: [-15, -20, 25] as [number, number, number],
    titlePrefixes: ['芬兰基础教育', '日本', '美国STEM教育', '国际比较视角下', '德国双元制'],
    titleSuffixes: ['的经验与启示', '教育改革的最新动向', '对我国的借鉴意义', '的比较研究', '的本土化实践研究'],
    keywords: ['比较教育', '国际教育', 'PISA', '教育全球化', '跨文化教育', '教育借鉴', '国际组织', '教育交流'],
    journals: ['比较教育研究', '外国教育研究', '全球教育展望', '世界教育信息', '教育研究'],
    institutions: ['北京师范大学国际与比较教育研究院', '华东师范大学国际与比较教育研究所', '浙江大学教育学院', '西南大学教育学部', '华南师范大学国际与比较教育研究所'],
  },
];

function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateAbstract(cluster: typeof clusterDefs[0]): string {
  const sentences = [
    `本研究以${pickRandom(cluster.keywords)}为切入点，探讨了${pickRandom(cluster.keywords)}在当代教育中的重要作用。`,
    `通过文献分析与实证调查，研究发现${pickRandom(cluster.keywords)}与${pickRandom(cluster.keywords)}之间存在显著相关性。`,
    `研究采用混合方法设计，结合问卷调查（N=${Math.floor(Math.random() * 500 + 200)}）和深度访谈，系统分析了相关因素。`,
    `结果表明，${pickRandom(cluster.keywords)}对教育质量的提升具有积极影响，尤其在${pickRandom(cluster.keywords)}方面表现突出。`,
    `本文为${cluster.name.split('·')[0]}领域的研究提供了新的理论视角和实践参考。`,
  ];
  return sentences.join('');
}

function generatePapers() {
  const papers: Array<{
    id: string; title: string; authors: string[]; institution: string;
    journal: string; year: number; keywords: string[]; abstract: string;
    clusterId: number; embedding: [number, number, number];
  }> = [];

  const lastNames = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '胡', '朱', '郭', '何', '罗', '高', '林'];
  const firstNames = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '洋', '艳', '勇', '军', '杰', '娟', '涛', '明', '超', '秀英', '华', '建'];

  const clusterCounts = new Array(8).fill(0);

  for (let i = 0; i < TOTAL; i++) {
    const cluster = clusterDefs[i % clusterDefs.length];
    clusterCounts[cluster.id]++;

    // Year distribution: exponential growth toward recent years
    const yearRandom = Math.pow(Math.random(), 1.5);
    const year = Math.floor(1990 + yearRandom * 35);

    // Gaussian embedding around cluster center
    const spread = 6;
    const embedding: [number, number, number] = [
      cluster.center[0] + gaussianRandom() * spread,
      cluster.center[1] + gaussianRandom() * spread,
      cluster.center[2] + gaussianRandom() * spread,
    ];

    const numAuthors = Math.floor(Math.random() * 3) + 1;
    const authors = Array.from({ length: numAuthors }, () =>
      pickRandom(lastNames) + pickRandom(firstNames)
    );

    const numKeywords = Math.floor(Math.random() * 3) + 3;
    const kwSet = new Set<string>();
    while (kwSet.size < numKeywords) kwSet.add(pickRandom(cluster.keywords));

    papers.push({
      id: `paper-${String(i).padStart(5, '0')}`,
      title: pickRandom(cluster.titlePrefixes) + pickRandom(cluster.titleSuffixes),
      authors,
      institution: pickRandom(cluster.institutions),
      journal: pickRandom(cluster.journals),
      year,
      keywords: [...kwSet],
      abstract: generateAbstract(cluster),
      clusterId: cluster.id,
      embedding,
    });
  }

  // Update cluster counts
  const clusters = clusterDefs.map(c => ({
    id: c.id,
    name: c.name,
    color: c.color,
    count: clusterCounts[c.id],
  }));

  const dir = import.meta.dirname;
  writeFileSync(join(dir, 'papers.json'), JSON.stringify(papers));
  writeFileSync(join(dir, 'clusters.json'), JSON.stringify(clusters, null, 2));
  console.log(`Generated ${papers.length} papers across ${clusters.length} clusters`);
  clusters.forEach(c => console.log(`  ${c.name}: ${c.count}`));
}

generatePapers();
```

- [ ] **Step 4: Run data generation**

Run: `npx tsx src/data/generate.ts`

Expected: Console output showing 8000 papers generated across 8 clusters, each with 1000 papers. `src/data/papers.json` and `src/data/clusters.json` created.

- [ ] **Step 5: Verify generated data is loadable**

Run: `node -e "const d = require('./src/data/papers.json'); console.log('Papers:', d.length, 'First:', d[0].title)"`

Expected: Shows paper count (8000) and first paper title.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/data/generate.ts src/data/papers.json src/data/clusters.json
git commit -m "feat: add types and generate 8000 mock education papers"
```

---

## Task 3: Zustand Store

**Files:**
- Create: `src/store/index.ts`

- [ ] **Step 1: Create the store**

Create `src/store/index.ts`:
```typescript
import { create } from 'zustand';
import type { Paper, Cluster, ChatMessage } from '../types';
import papersData from '../data/papers.json';
import clustersData from '../data/clusters.json';

interface AppState {
  papers: Paper[];
  clusters: Cluster[];

  selectedPaperId: string | null;
  hoveredPaperId: string | null;

  visibleClusterIds: Set<number>;
  yearRange: [number, number];
  searchQuery: string;
  searchResults: Set<string> | null;

  viewMode: '2d' | '3d';

  chatMessages: ChatMessage[];

  selectPaper: (id: string | null) => void;
  hoverPaper: (id: string | null) => void;
  toggleCluster: (id: number) => void;
  toggleAllClusters: () => void;
  setYearRange: (range: [number, number]) => void;
  setSearchQuery: (query: string) => void;
  setViewMode: (mode: '2d' | '3d') => void;
  sendChatMessage: (text: string) => void;
}

const allClusterIds = new Set(clustersData.map((c: Cluster) => c.id));

export const useStore = create<AppState>((set, get) => ({
  papers: papersData as Paper[],
  clusters: clustersData as Cluster[],

  selectedPaperId: null,
  hoveredPaperId: null,

  visibleClusterIds: new Set(allClusterIds),
  yearRange: [1990, 2025],
  searchQuery: '',
  searchResults: null,

  viewMode: '3d',

  chatMessages: [],

  selectPaper: (id) => set({ selectedPaperId: id }),
  hoverPaper: (id) => set({ hoveredPaperId: id }),

  toggleCluster: (id) =>
    set((state) => {
      const next = new Set(state.visibleClusterIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { visibleClusterIds: next };
    }),

  toggleAllClusters: () =>
    set((state) => {
      if (state.visibleClusterIds.size === allClusterIds.size) {
        return { visibleClusterIds: new Set<number>() };
      }
      return { visibleClusterIds: new Set(allClusterIds) };
    }),

  setYearRange: (range) => set({ yearRange: range }),

  setSearchQuery: (query) =>
    set((state) => {
      if (!query.trim()) return { searchQuery: query, searchResults: null };
      const lower = query.toLowerCase();
      const results = new Set<string>();
      for (const p of state.papers) {
        if (
          p.title.toLowerCase().includes(lower) ||
          p.authors.some((a) => a.toLowerCase().includes(lower)) ||
          p.keywords.some((k) => k.toLowerCase().includes(lower))
        ) {
          results.add(p.id);
        }
      }
      return { searchQuery: query, searchResults: results };
    }),

  setViewMode: (mode) => set({ viewMode: mode }),

  sendChatMessage: (text) =>
    set((state) => {
      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: text,
      };

      const selectedPaper = state.papers.find(
        (p) => p.id === state.selectedPaperId
      );

      let responseText: string;
      if (selectedPaper) {
        const responses = [
          `这篇关于「${selectedPaper.title}」的论文发表于${selectedPaper.year}年，来自${selectedPaper.institution}。主要涉及${selectedPaper.keywords.slice(0, 3).join('、')}等研究方向。`,
          `从知识图谱中可以看到，与本文相近的研究主要集中在「${selectedPaper.keywords[0]}」领域。近年来该方向的研究呈增长趋势，特别是在${selectedPaper.keywords[1] || selectedPaper.keywords[0]}方面。`,
          `基于当前选中论文的分析：该研究属于「${state.clusters.find((c) => c.id === selectedPaper.clusterId)?.name}」聚类，该聚类共有${state.clusters.find((c) => c.id === selectedPaper.clusterId)?.count}篇相关论文。建议关注相邻聚类中的交叉研究。`,
        ];
        responseText = responses[state.chatMessages.length % responses.length];
      } else {
        responseText =
          '请先在知识图谱中点击选择一篇论文，我可以为你提供该论文的分析、相关推荐和领域热点等信息。';
      }

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: responseText,
      };

      return {
        chatMessages: [...state.chatMessages, userMsg, assistantMsg],
      };
    }),
}));
```

- [ ] **Step 2: Verify the app still builds**

Run: `npx tsc --noEmit`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/store/index.ts
git commit -m "feat: add zustand store with filtering, search, and mock AI chat"
```

---

## Task 4: Three-Panel Layout Shell

**Files:**
- Create: `src/components/Layout/Layout.tsx`, `src/components/TopNav/TopNav.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create TopNav**

Create `src/components/TopNav/TopNav.tsx`:
```tsx
import { useStore } from '../../store';

export default function TopNav() {
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);

  return (
    <nav className="h-12 bg-[#111128] border-b border-[#222244] flex items-center px-5 gap-4 shrink-0">
      <span className="text-base font-bold text-white tracking-wide">
        📚 教育论文知识图谱
      </span>
      <span className="bg-[#2a2a4a] text-[#8888ff] px-3 py-1 rounded-md text-xs font-medium">
        知识图谱
      </span>
      <span className="text-xs text-gray-500 cursor-default">统计分析</span>
      <span className="text-xs text-gray-500 cursor-default">论文检索</span>
      <div className="flex-1" />
      <div className="flex gap-1">
        <button
          onClick={() => setViewMode('2d')}
          className={`px-3 py-1 rounded text-xs transition-colors ${
            viewMode === '2d'
              ? 'bg-[#4444aa] text-white'
              : 'bg-[#2a2a4a] text-gray-400 hover:text-gray-200'
          }`}
        >
          2D
        </button>
        <button
          onClick={() => setViewMode('3d')}
          className={`px-3 py-1 rounded text-xs transition-colors ${
            viewMode === '3d'
              ? 'bg-[#4444aa] text-white'
              : 'bg-[#2a2a4a] text-gray-400 hover:text-gray-200'
          }`}
        >
          3D
        </button>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Create Layout shell**

Create `src/components/Layout/Layout.tsx`:
```tsx
import type { ReactNode } from 'react';

interface LayoutProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}

export default function Layout({ left, center, right }: LayoutProps) {
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left panel: fixed 240px */}
      <aside className="w-60 shrink-0 bg-[#0d0d20] border-r border-[#1a1a3a] overflow-y-auto">
        {left}
      </aside>

      {/* Center: flex-[2] */}
      <main className="flex-[2] relative bg-[radial-gradient(ellipse_at_center,#0f0f2a_0%,#050510_100%)]">
        {center}
      </main>

      {/* Right panel: flex-[1], min 360px */}
      <aside className="flex-1 min-w-[360px] bg-[#0d0d20] border-l border-[#1a1a3a] flex flex-col overflow-hidden">
        {right}
      </aside>
    </div>
  );
}
```

- [ ] **Step 3: Wire up App.tsx**

Replace `src/App.tsx`:
```tsx
import TopNav from './components/TopNav/TopNav';
import Layout from './components/Layout/Layout';

export default function App() {
  return (
    <div className="h-screen w-screen bg-[#0a0a1a] text-white flex flex-col">
      <TopNav />
      <Layout
        left={<div className="p-4 text-sm text-gray-500">聚类面板</div>}
        center={<div className="flex items-center justify-center h-full text-gray-500">3D 点云</div>}
        right={<div className="p-4 text-sm text-gray-500">详情 + AI</div>}
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify layout renders correctly**

Run: `npm run dev`

Expected: Three-panel layout visible — left sidebar (240px), center area, right panel (~1/3 width). Dark theme, nav bar at top with 2D/3D toggle.

- [ ] **Step 5: Commit**

```bash
git add src/components/Layout/Layout.tsx src/components/TopNav/TopNav.tsx src/App.tsx
git commit -m "feat: add three-panel layout shell and top nav"
```

---

## Task 5: Cluster Panel (Left Sidebar)

**Files:**
- Create: `src/components/ClusterPanel/ClusterPanel.tsx`, `src/components/ClusterPanel/ClusterItem.tsx`, `src/components/ClusterPanel/YearRangeSlider.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create YearRangeSlider**

Create `src/components/ClusterPanel/YearRangeSlider.tsx`:
```tsx
import { useStore } from '../../store';

export default function YearRangeSlider() {
  const yearRange = useStore((s) => s.yearRange);
  const setYearRange = useStore((s) => s.setYearRange);

  return (
    <div className="mb-4">
      <div className="text-xs text-gray-500 mb-2">年份范围</div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1990}
          max={yearRange[1]}
          value={yearRange[0]}
          onChange={(e) => setYearRange([Number(e.target.value), yearRange[1]])}
          className="flex-1 bg-[#1a1a3a] text-center text-xs text-gray-300 rounded px-2 py-1.5 border-none outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-gray-600">—</span>
        <input
          type="number"
          min={yearRange[0]}
          max={2025}
          value={yearRange[1]}
          onChange={(e) => setYearRange([yearRange[0], Number(e.target.value)])}
          className="flex-1 bg-[#1a1a3a] text-center text-xs text-gray-300 rounded px-2 py-1.5 border-none outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ClusterItem**

Create `src/components/ClusterPanel/ClusterItem.tsx`:
```tsx
import { useStore } from '../../store';
import type { Cluster } from '../../types';

interface Props {
  cluster: Cluster;
}

export default function ClusterItem({ cluster }: Props) {
  const visible = useStore((s) => s.visibleClusterIds.has(cluster.id));
  const toggleCluster = useStore((s) => s.toggleCluster);

  return (
    <button
      onClick={() => toggleCluster(cluster.id)}
      className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-left text-xs transition-colors ${
        visible ? 'bg-[#1a1a3a]' : 'opacity-40'
      } hover:bg-[#1a1a3a]`}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: cluster.color }}
      />
      <span className="flex-1 text-gray-300 truncate">{cluster.name}</span>
      <span className="text-gray-600 tabular-nums">
        {cluster.count.toLocaleString()}
      </span>
    </button>
  );
}
```

- [ ] **Step 3: Create ClusterPanel**

Create `src/components/ClusterPanel/ClusterPanel.tsx`:
```tsx
import { useStore } from '../../store';
import ClusterItem from './ClusterItem';
import YearRangeSlider from './YearRangeSlider';

export default function ClusterPanel() {
  const clusters = useStore((s) => s.clusters);
  const toggleAllClusters = useStore((s) => s.toggleAllClusters);

  return (
    <div className="p-3">
      <YearRangeSlider />
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-300">聚类标签</span>
        <button
          onClick={toggleAllClusters}
          className="text-xs text-[#6666cc] hover:text-[#8888ff] transition-colors"
        >
          全选
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        {clusters.map((c) => (
          <ClusterItem key={c.id} cluster={c} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire into App.tsx**

Update `src/App.tsx` — replace the left placeholder:
```tsx
import TopNav from './components/TopNav/TopNav';
import Layout from './components/Layout/Layout';
import ClusterPanel from './components/ClusterPanel/ClusterPanel';

export default function App() {
  return (
    <div className="h-screen w-screen bg-[#0a0a1a] text-white flex flex-col">
      <TopNav />
      <Layout
        left={<ClusterPanel />}
        center={<div className="flex items-center justify-center h-full text-gray-500">3D 点云</div>}
        right={<div className="p-4 text-sm text-gray-500">详情 + AI</div>}
      />
    </div>
  );
}
```

- [ ] **Step 5: Verify cluster panel works**

Run: `npm run dev`

Expected: Left sidebar shows year range inputs and 8 cluster items with colored dots, names, and counts. Clicking toggles visibility (opacity changes). "全选" toggles all.

- [ ] **Step 6: Commit**

```bash
git add src/components/ClusterPanel/ src/App.tsx
git commit -m "feat: add cluster panel with year filter and cluster toggles"
```

---

## Task 6: 3D Point Cloud

**Files:**
- Create: `src/components/PointCloud/PointCloud.tsx`, `src/components/PointCloud/Points.tsx`, `src/components/PointCloud/Tooltip.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create Points component (InstancedMesh)**

Create `src/components/PointCloud/Points.tsx`:
```tsx
import { useRef, useMemo, useCallback } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';

const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();

export default function Points() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const papers = useStore((s) => s.papers);
  const clusters = useStore((s) => s.clusters);
  const visibleClusterIds = useStore((s) => s.visibleClusterIds);
  const yearRange = useStore((s) => s.yearRange);
  const searchResults = useStore((s) => s.searchResults);
  const selectedPaperId = useStore((s) => s.selectedPaperId);
  const selectPaper = useStore((s) => s.selectPaper);
  const hoverPaper = useStore((s) => s.hoverPaper);

  const colorMap = useMemo(() => {
    const map = new Map<number, string>();
    clusters.forEach((c) => map.set(c.id, c.color));
    return map;
  }, [clusters]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < papers.length; i++) {
      const p = papers[i];
      const visible =
        visibleClusterIds.has(p.clusterId) &&
        p.year >= yearRange[0] &&
        p.year <= yearRange[1];
      const searched = searchResults === null || searchResults.has(p.id);
      const isSelected = p.id === selectedPaperId;

      tempObject.position.set(p.embedding[0], p.embedding[1], p.embedding[2]);
      const scale = isSelected ? 0.5 : visible && searched ? 0.25 : 0;
      tempObject.scale.setScalar(scale);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);

      const baseColor = colorMap.get(p.clusterId) || '#ffffff';
      const opacity = visible && searched ? 1 : 0;
      tempColor.set(baseColor).multiplyScalar(opacity);
      mesh.setColorAt(i, tempColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined) {
        selectPaper(papers[e.instanceId].id);
      }
    },
    [papers, selectPaper]
  );

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined) {
        hoverPaper(papers[e.instanceId].id);
        document.body.style.cursor = 'pointer';
      }
    },
    [papers, hoverPaper]
  );

  const handlePointerOut = useCallback(() => {
    hoverPaper(null);
    document.body.style.cursor = 'default';
  }, [hoverPaper]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, papers.length]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
```

- [ ] **Step 2: Create Tooltip component**

Create `src/components/PointCloud/Tooltip.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useStore } from '../../store';

export default function Tooltip() {
  const hoveredPaperId = useStore((s) => s.hoveredPaperId);
  const papers = useStore((s) => s.papers);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  if (!hoveredPaperId) return null;

  const paper = papers.find((p) => p.id === hoveredPaperId);
  if (!paper) return null;

  return (
    <div
      className="fixed z-50 pointer-events-none bg-[#1a1a3a] border border-[#333366] rounded-lg px-3 py-2 max-w-xs"
      style={{ left: pos.x + 12, top: pos.y - 8 }}
    >
      <div className="text-xs text-white font-medium leading-snug">
        {paper.title}
      </div>
      <div className="text-[10px] text-gray-500 mt-1">
        {paper.authors.join('; ')} · {paper.year}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create PointCloud canvas wrapper**

Create `src/components/PointCloud/PointCloud.tsx`:
```tsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useStore } from '../../store';
import Points from './Points';
import Tooltip from './Tooltip';

export default function PointCloud() {
  const viewMode = useStore((s) => s.viewMode);
  const selectPaper = useStore((s) => s.selectPaper);

  return (
    <>
      <Canvas
        camera={{ position: [0, 0, 60], fov: 50 }}
        onPointerMissed={() => selectPaper(null)}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={1} />
        <Points />
        <OrbitControls
          enableDamping
          dampingFactor={0.1}
          autoRotate={viewMode === '3d'}
          autoRotateSpeed={0.5}
          maxDistance={120}
          minDistance={10}
          enableRotate={viewMode === '3d'}
        />
      </Canvas>
      <Tooltip />
    </>
  );
}
```

- [ ] **Step 4: Wire into App.tsx**

Update `src/App.tsx`:
```tsx
import TopNav from './components/TopNav/TopNav';
import Layout from './components/Layout/Layout';
import ClusterPanel from './components/ClusterPanel/ClusterPanel';
import PointCloud from './components/PointCloud/PointCloud';

export default function App() {
  return (
    <div className="h-screen w-screen bg-[#0a0a1a] text-white flex flex-col">
      <TopNav />
      <Layout
        left={<ClusterPanel />}
        center={<PointCloud />}
        right={<div className="p-4 text-sm text-gray-500">详情 + AI</div>}
      />
    </div>
  );
}
```

- [ ] **Step 5: Verify 3D point cloud renders**

Run: `npm run dev`

Expected: 3D point cloud with ~8000 colored points visible in center panel. Points rotate slowly. Mouse drag rotates view, scroll zooms. Clicking a point should log selection (visible in React DevTools or console). Hovering shows tooltip with paper title. Toggling clusters in left panel hides/shows points.

- [ ] **Step 6: Commit**

```bash
git add src/components/PointCloud/ src/App.tsx
git commit -m "feat: add 3D point cloud with InstancedMesh, hover tooltip, and click selection"
```

---

## Task 7: Search Bar

**Files:**
- Create: `src/components/SearchBar/SearchBar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create SearchBar**

Create `src/components/SearchBar/SearchBar.tsx`:
```tsx
import { useState, useEffect } from 'react';
import { useStore } from '../../store';

export default function SearchBar() {
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const searchResults = useStore((s) => s.searchResults);
  const papers = useStore((s) => s.papers);
  const [input, setInput] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(input), 300);
    return () => clearTimeout(timer);
  }, [input, setSearchQuery]);

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 w-[360px]">
      <div className="bg-[#1a1a3a] border border-[#333366] rounded-lg flex items-center px-3 py-2 gap-2">
        <span className="text-gray-500 text-sm">🔍</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="搜索论文标题、关键词、作者..."
          className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none"
        />
        {searchResults && (
          <span className="text-[10px] text-gray-500 shrink-0">
            {searchResults.size}/{papers.length}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add SearchBar to the center panel in App.tsx**

Update `src/App.tsx`:
```tsx
import TopNav from './components/TopNav/TopNav';
import Layout from './components/Layout/Layout';
import ClusterPanel from './components/ClusterPanel/ClusterPanel';
import PointCloud from './components/PointCloud/PointCloud';
import SearchBar from './components/SearchBar/SearchBar';

export default function App() {
  return (
    <div className="h-screen w-screen bg-[#0a0a1a] text-white flex flex-col">
      <TopNav />
      <Layout
        left={<ClusterPanel />}
        center={
          <>
            <SearchBar />
            <PointCloud />
          </>
        }
        right={<div className="p-4 text-sm text-gray-500">详情 + AI</div>}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify search works**

Run: `npm run dev`

Expected: Search bar overlays top center of point cloud. Typing a keyword (e.g., "认知") filters points — non-matching points disappear, matching count shown. Clearing input restores all points.

- [ ] **Step 4: Commit**

```bash
git add src/components/SearchBar/SearchBar.tsx src/App.tsx
git commit -m "feat: add search bar with debounced fuzzy search"
```

---

## Task 8: Paper Detail Panel

**Files:**
- Create: `src/components/DetailPanel/DetailPanel.tsx`, `src/components/DetailPanel/PaperDetail.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create PaperDetail**

Create `src/components/DetailPanel/PaperDetail.tsx`:
```tsx
import { useStore } from '../../store';

export default function PaperDetail() {
  const selectedPaperId = useStore((s) => s.selectedPaperId);
  const papers = useStore((s) => s.papers);
  const clusters = useStore((s) => s.clusters);

  if (!selectedPaperId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
        点击知识图谱中的节点查看论文详情
      </div>
    );
  }

  const paper = papers.find((p) => p.id === selectedPaperId);
  if (!paper) return null;

  const cluster = clusters.find((c) => c.id === paper.clusterId);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex gap-3 mb-4">
        <span className="text-xs text-[#8888ff] border-b-2 border-[#8888ff] pb-1">
          论文信息
        </span>
        <span className="text-xs text-gray-600 pb-1">PDF预览</span>
        <span className="text-xs text-gray-600 pb-1">AI分析</span>
      </div>

      <h3 className="text-[15px] font-semibold text-white leading-relaxed mb-3">
        {paper.title}
      </h3>

      <div className="grid grid-cols-[60px_1fr] gap-x-3 gap-y-1.5 text-xs mb-4">
        <span className="text-gray-600">作者</span>
        <span className="text-gray-400">{paper.authors.join('; ')}</span>
        <span className="text-gray-600">机构</span>
        <span className="text-gray-400">{paper.institution}</span>
        <span className="text-gray-600">日期</span>
        <span className="text-gray-400">{paper.year}</span>
        <span className="text-gray-600">来源</span>
        <span className="text-[#45b7d1]">{paper.journal}</span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {paper.keywords.map((kw) => (
          <span
            key={kw}
            className="bg-[#1a1a3a] text-[#45b7d1] px-2.5 py-0.5 rounded-full text-[11px]"
          >
            {kw}
          </span>
        ))}
      </div>

      {cluster && (
        <div className="flex items-center gap-2 mb-4 text-xs">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: cluster.color }}
          />
          <span className="text-gray-400">{cluster.name}</span>
        </div>
      )}

      <div className="text-[11px] text-gray-600 mb-1.5">摘要</div>
      <p className="text-xs text-gray-400 leading-relaxed">{paper.abstract}</p>
    </div>
  );
}
```

- [ ] **Step 2: Create DetailPanel container**

Create `src/components/DetailPanel/DetailPanel.tsx`:
```tsx
import PaperDetail from './PaperDetail';

export default function DetailPanel() {
  return (
    <div className="flex-1 flex flex-col border-b border-[#1a1a3a] overflow-hidden">
      <PaperDetail />
    </div>
  );
}
```

- [ ] **Step 3: Wire into App.tsx**

Update `src/App.tsx`:
```tsx
import TopNav from './components/TopNav/TopNav';
import Layout from './components/Layout/Layout';
import ClusterPanel from './components/ClusterPanel/ClusterPanel';
import PointCloud from './components/PointCloud/PointCloud';
import SearchBar from './components/SearchBar/SearchBar';
import DetailPanel from './components/DetailPanel/DetailPanel';

export default function App() {
  return (
    <div className="h-screen w-screen bg-[#0a0a1a] text-white flex flex-col">
      <TopNav />
      <Layout
        left={<ClusterPanel />}
        center={
          <>
            <SearchBar />
            <PointCloud />
          </>
        }
        right={
          <DetailPanel />
        }
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify paper detail works**

Run: `npm run dev`

Expected: Right panel shows "点击知识图谱中的节点查看论文详情" placeholder. Clicking a point in the cloud populates the panel with paper title, authors, institution, year, journal, keywords, cluster tag, and abstract. Clicking empty space deselects.

- [ ] **Step 5: Commit**

```bash
git add src/components/DetailPanel/ src/App.tsx
git commit -m "feat: add paper detail panel with metadata and abstract display"
```

---

## Task 9: AI Chat Panel

**Files:**
- Create: `src/components/AIChat/AIChat.tsx`, `src/components/AIChat/ChatMessage.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create ChatMessage component**

Create `src/components/AIChat/ChatMessage.tsx`:
```tsx
import type { ChatMessage as ChatMessageType } from '../../types';

interface Props {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[90%] px-3 py-2.5 text-xs leading-relaxed ${
          isUser
            ? 'bg-[#2a2a6a] text-gray-100 rounded-xl rounded-br-sm'
            : 'bg-[#151530] text-gray-400 rounded-xl rounded-bl-sm'
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create AIChat component**

Create `src/components/AIChat/AIChat.tsx`:
```tsx
import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import ChatMessage from './ChatMessage';

export default function AIChat() {
  const chatMessages = useStore((s) => s.chatMessages);
  const sendChatMessage = useStore((s) => s.sendChatMessage);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    sendChatMessage(text);
  };

  return (
    <div className="flex-1 flex flex-col p-3 min-h-0">
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <span className="text-sm font-semibold text-white">💬 AI 助手</span>
        <span className="text-[10px] text-gray-600 bg-[#1a1a3a] px-2 py-0.5 rounded-full">
          基于当前论文
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col gap-2.5 min-h-0">
        {chatMessages.length === 0 && (
          <div className="text-xs text-gray-600 text-center mt-8">
            选中一篇论文后，可以向 AI 提问
          </div>
        )}
        {chatMessages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
      </div>

      <div className="flex gap-2 mt-2 shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="输入你的问题..."
          className="flex-1 bg-[#1a1a3a] border border-[#333366] rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 outline-none"
        />
        <button
          onClick={handleSend}
          className="bg-[#4444aa] hover:bg-[#5555bb] px-4 py-2 rounded-lg text-xs text-white transition-colors"
        >
          发送
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire AIChat into App.tsx**

Update `src/App.tsx`:
```tsx
import TopNav from './components/TopNav/TopNav';
import Layout from './components/Layout/Layout';
import ClusterPanel from './components/ClusterPanel/ClusterPanel';
import PointCloud from './components/PointCloud/PointCloud';
import SearchBar from './components/SearchBar/SearchBar';
import DetailPanel from './components/DetailPanel/DetailPanel';
import AIChat from './components/AIChat/AIChat';

export default function App() {
  return (
    <div className="h-screen w-screen bg-[#0a0a1a] text-white flex flex-col">
      <TopNav />
      <Layout
        left={<ClusterPanel />}
        center={
          <>
            <SearchBar />
            <PointCloud />
          </>
        }
        right={
          <>
            <DetailPanel />
            <AIChat />
          </>
        }
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify AI chat works**

Run: `npm run dev`

Expected: Bottom of right panel shows AI chat. Without a paper selected, shows "选中一篇论文后，可以向 AI 提问". After selecting a paper and sending a message, get a mock response referencing the selected paper's keywords/cluster. Messages scroll properly.

- [ ] **Step 5: Commit**

```bash
git add src/components/AIChat/ src/App.tsx
git commit -m "feat: add AI chat panel with mock responses"
```

---

## Task 10: Bottom Status Bar & Polish

**Files:**
- Modify: `src/components/PointCloud/PointCloud.tsx`

- [ ] **Step 1: Add status bar and controls overlay to PointCloud**

Update `src/components/PointCloud/PointCloud.tsx`:
```tsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useStore } from '../../store';
import Points from './Points';
import Tooltip from './Tooltip';

export default function PointCloud() {
  const viewMode = useStore((s) => s.viewMode);
  const selectPaper = useStore((s) => s.selectPaper);
  const papers = useStore((s) => s.papers);
  const visibleClusterIds = useStore((s) => s.visibleClusterIds);
  const yearRange = useStore((s) => s.yearRange);
  const searchResults = useStore((s) => s.searchResults);

  const visibleCount = papers.filter(
    (p) =>
      visibleClusterIds.has(p.clusterId) &&
      p.year >= yearRange[0] &&
      p.year <= yearRange[1] &&
      (searchResults === null || searchResults.has(p.id))
  ).length;

  return (
    <>
      <Canvas
        camera={{ position: [0, 0, 60], fov: 50 }}
        onPointerMissed={() => selectPaper(null)}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={1} />
        <Points />
        <OrbitControls
          enableDamping
          dampingFactor={0.1}
          autoRotate={viewMode === '3d'}
          autoRotateSpeed={0.5}
          maxDistance={120}
          minDistance={10}
          enableRotate={viewMode === '3d'}
        />
      </Canvas>
      <Tooltip />

      {/* Status bar */}
      <div className="absolute bottom-3 left-3 text-[10px] text-gray-600">
        {viewMode.toUpperCase()} · {visibleCount.toLocaleString()} / {papers.length.toLocaleString()} 篇
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify status bar displays**

Run: `npm run dev`

Expected: Bottom-left of point cloud shows "3D · 8,000 / 8,000 篇". Toggling clusters or changing year range updates the visible count.

- [ ] **Step 3: Commit**

```bash
git add src/components/PointCloud/PointCloud.tsx
git commit -m "feat: add status bar with visible/total paper count"
```

---

## Task 11: Final Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: Build succeeds, output in `dist/`.

- [ ] **Step 3: Preview production build**

Run: `npm run preview`

Expected: Production build loads at `http://localhost:4173` with all features working:
- 3D point cloud renders with 8 colored clusters
- Auto-rotation in 3D mode
- Click to select paper → detail panel populates
- Hover tooltip shows paper title
- Cluster toggles filter points
- Year range filter works
- Search filters and highlights
- 2D/3D toggle switches view mode
- AI chat returns mock responses
- Status bar shows correct counts

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify production build"
```
