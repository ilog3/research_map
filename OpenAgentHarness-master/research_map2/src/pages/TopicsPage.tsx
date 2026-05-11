import { useState } from 'react';
import recommendations from '../data/topic-recommendations.json';
import TopicCard from '../components/TopicsPage/TopicCard';

type RecType = 'all' | 'trending' | 'crossdisciplinary' | 'blueocean' | 'classic_extension';

const TYPE_LABELS: Record<RecType, string> = {
  all: '全部',
  trending: '趋势热点',
  crossdisciplinary: '交叉创新',
  blueocean: '蓝海选题',
  classic_extension: '经典延伸',
};

const TYPE_COLORS: Record<string, string> = {
  trending: '#ff6b6b',
  crossdisciplinary: '#4ecdc4',
  blueocean: '#45b7d1',
  classic_extension: '#f7dc6f',
};

export default function TopicsPage() {
  const [filter, setFilter] = useState<RecType>('all');

  const filtered = filter === 'all'
    ? recommendations
    : recommendations.filter((r) => r.type === filter);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white mb-2">选题推荐</h1>
          <p className="text-sm text-gray-500">
            基于 670,822 篇教育学论文的关键词趋势、共词网络和领域交叉分析，为你推荐潜在研究选题
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6">
          {(Object.entries(TYPE_LABELS) as [RecType, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === key
                  ? 'bg-[#2a2a4a] text-[#8888ff]'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a3a]'
              }`}
            >
              {label}
              {key !== 'all' && (
                <span
                  className="inline-block w-2 h-2 rounded-full ml-1.5"
                  style={{ backgroundColor: TYPE_COLORS[key] }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((rec, i) => (
            <TopicCard key={i} rec={rec} typeColor={TYPE_COLORS[rec.type] || '#888'} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center text-gray-600 text-sm mt-12">
            该分类暂无推荐选题
          </div>
        )}
      </div>
    </div>
  );
}
