import { useState, useMemo } from 'react';
import KeywordSearch from '../components/TrendsPage/KeywordSearch';
import TrendLineChart from '../components/TrendsPage/TrendLineChart';
import DomainStream from '../components/TrendsPage/DomainStream';
import TopKeywordsBar from '../components/TrendsPage/TopKeywordsBar';
import keywordTrends from '../data/trends-keywords.json';

const allKeywords = Object.keys(keywordTrends);

const DEFAULT_KEYWORDS = ['人工智能', '在线学习', '核心素养'].filter((k) =>
  allKeywords.includes(k)
);

export default function TrendsPage() {
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>(
    DEFAULT_KEYWORDS.length > 0 ? DEFAULT_KEYWORDS : allKeywords.slice(0, 3)
  );

  const addKeyword = (kw: string) => {
    if (selectedKeywords.length < 5 && !selectedKeywords.includes(kw)) {
      setSelectedKeywords([...selectedKeywords, kw]);
    }
  };

  const removeKeyword = (kw: string) => {
    setSelectedKeywords(selectedKeywords.filter((k) => k !== kw));
  };

  const trendData = useMemo(() => {
    const trends = keywordTrends as Record<string, Record<string, number>>;
    const yearSet = new Set<string>();
    for (const kw of selectedKeywords) {
      if (trends[kw]) {
        Object.keys(trends[kw]).forEach((y) => yearSet.add(y));
      }
    }
    const years = [...yearSet].sort();
    return years.map((year) => {
      const point: Record<string, string | number> = { year };
      for (const kw of selectedKeywords) {
        point[kw] = trends[kw]?.[year] || 0;
      }
      return point;
    });
  }, [selectedKeywords]);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Keyword Search */}
        <KeywordSearch
          allKeywords={allKeywords}
          selectedKeywords={selectedKeywords}
          onAdd={addKeyword}
          onRemove={removeKeyword}
        />

        {/* Trend Line Chart */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">
            关键词趋势对比
          </h2>
          <div className="bg-[#0d0d20] border border-[#1a1a3a] rounded-xl p-4 h-[360px]">
            <TrendLineChart
              data={trendData}
              keywords={selectedKeywords}
            />
          </div>
        </section>

        {/* Domain Stream */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">领域演化</h2>
          <div className="bg-[#0d0d20] border border-[#1a1a3a] rounded-xl p-4">
            <DomainStream />
          </div>
        </section>

        {/* Top Keywords Bar */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">
            热门关键词排行
          </h2>
          <div className="bg-[#0d0d20] border border-[#1a1a3a] rounded-xl p-4">
            <TopKeywordsBar />
          </div>
        </section>
      </div>
    </div>
  );
}
