# EduGraph — Education Research Knowledge Graph

A 3D interactive knowledge graph visualization system built on **670,822 real education research papers**. Explore research landscapes, discover trends, analyze keyword co-occurrences, and get AI-powered topic recommendations.

## Features

### Knowledge Graph (3D Point Cloud)
- **8,000 papers** sampled from 670k, rendered as a 3D point cloud via `InstancedMesh`
- 10 education sub-domain clusters with color coding
- Click to select papers, hover for tooltips, drag to rotate
- Cluster filtering, year range slider, fuzzy search
- 2D/3D view toggle, auto-rotation, time evolution player
- **AI Chat**: real-time LLM conversation grounded in selected paper metadata

### Trends Analysis
- **Keyword trend comparison**: multi-line chart for up to 5 keywords (top 200 pre-computed)
- **Domain evolution**: stacked area chart showing sub-keyword shifts within each domain
- **Top keywords ranking**: horizontal bar chart with adjustable time range

### Co-word Analysis Network
- **Force-directed graph** of top 50 keyword co-occurrences (from 7.5M pairs)
- Click any node to explore its top 20 neighbors
- Hover highlights connected nodes and edges
- Drag nodes to rearrange layout
- **AI interpretation** of co-occurrence relationships

### Topic Recommendations
- **4 recommendation algorithms**: Trending, Cross-disciplinary, Blue Ocean, Classic Extension
- **Dual-dimension scoring**: Innovation (crossDomain × gapRatio × novelty) + Practicality (growth × literatureBase × policyFit)
- Verifiable evidence for each recommendation
- Mini sparkline trend charts
- **AI frontier analysis**: LLM-generated knowledge boundary assessment per topic

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| 3D Rendering | React Three Fiber + Drei |
| Charts | Recharts |
| Force Graph | d3-force |
| State | Zustand |
| Styling | TailwindCSS |
| Build | Vite |
| LLM | Gemini 3.1 Pro (via OpenAI-compatible API) |
| Data | SQLite (better-sqlite3) |

## Getting Started

### Prerequisites
- Node.js >= 20
- The paper database file `data/merged.db3` (not included in repo, 1.6GB)

### Install & Run

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

### Regenerate Data (optional)

If you have the `data/merged.db3` database:

```bash
# Generate paper samples for point cloud (8,000 from 670k)
npx tsx src/data/generate-from-db.ts

# Generate keyword trend data (top 200 keywords)
npx tsx src/data/generate-trends.ts

# Generate co-word network (top 100 nodes, 500 neighbor sets)
npx tsx src/data/generate-coword.ts

# Generate topic recommendations with scoring
npx tsx src/data/generate-topics.ts
```

### Open Agent Harness (chat template)

The app talks to OAH using the **general** research agent by default (`resolveOahAgentName('general')` in `src/services/llm.ts`). Override with env vars if your workspace uses different agent names:

1. **`VITE_OAH_AGENT_GENERAL`** (preferred) — e.g. `general`, matching `.openharness/agents/general.md`.
2. **`VITE_OAH_AGENT_NAME`** — fallback when the dedicated variable is unset.
3. **`VITE_OAH_AGENT_DISCOVERY` / `VITE_OAH_AGENT_FRAMING`** — optional migration fallbacks if `general` is not registered yet.

See **`.env.example`** and the Chinese README section *Open Agent Harness：通用助手 agent 名* for details.

## Project Structure

```
src/
  pages/                    # 4 page components
    KnowledgeGraph.tsx      # 3D point cloud + AI chat
    TrendsPage.tsx          # Keyword trends + domain evolution
    CowordPage.tsx          # Force-directed co-word network
    TopicsPage.tsx          # AI-powered topic recommendations
  components/               # UI components per page
  services/
    llm.ts                  # LLM API service (streaming)
  store/
    index.ts                # Zustand global state
  data/
    papers.json             # 8,000 sampled papers
    clusters.json           # 10 domain clusters
    trends-keywords.json    # Top 200 keyword yearly counts
    trends-domains.json     # Per-domain sub-keyword trends
    coword-global.json      # Global co-occurrence network
    coword-neighbors.json   # Per-keyword neighbor data
    topic-recommendations.json  # Scored recommendations
    generate-*.ts           # Data generation scripts
  types/
    index.ts                # TypeScript interfaces
```

## License

MIT
