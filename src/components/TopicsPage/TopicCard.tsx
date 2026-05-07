import { useState } from 'react';
import MiniTrend from './MiniTrend';
import ScoreBar from './ScoreBar';
import { chatCompletion, buildTopicAnalysisPrompt } from '../../services/llm';

const TYPE_NAMES: Record<string, string> = {
  trending: '趋势热点',
  crossdisciplinary: '交叉创新',
  blueocean: '蓝海选题',
  classic_extension: '经典延伸',
};

interface TopicRec {
  type: string;
  title: string;
  description: string;
  keywords: string[];
  paperCount: number;
  growthRate: number;
  trend: Record<string, number>;
  domains: string[];
  representativePapers: Array<{ title: string; year: number; authors: string; journal: string }>;
  scores?: {
    innovation: { crossDomain: number; gapRatio: number; novelty: number; total: number };
    practicality: { growth: number; literatureBase: number; policyFit: number; total: number };
    evidence: string;
  };
}

interface Props {
  rec: TopicRec;
  typeColor: string;
}

export default function TopicCard({ rec, typeColor }: Props) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    if (analysis || loading) return;
    setLoading(true);
    setAnalysis('');
    try {
      const messages = buildTopicAnalysisPrompt(rec);
      await chatCompletion(messages, (text) => setAnalysis(text));
    } catch (err) {
      setAnalysis('分析请求失败，请稍后重试。');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#0d0d20] border border-[#1a1a3a] rounded-xl p-5 hover:border-[#333366] transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="px-2 py-0.5 rounded text-[10px] font-medium"
              style={{ backgroundColor: typeColor + '20', color: typeColor }}
            >
              {TYPE_NAMES[rec.type] || rec.type}
            </span>
            {rec.growthRate > 0 && (
              <span className="text-[10px] text-green-400">
                ↑ {rec.growthRate}%
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-white leading-snug">
            {rec.title}
          </h3>
        </div>
        <div className="w-24 h-10 shrink-0 ml-3">
          <MiniTrend trend={rec.trend} color={typeColor} />
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500 leading-relaxed mb-3">
        {rec.description}
      </p>

      {/* Dual-dimension scores */}
      {rec.scores && <ScoreBar scores={rec.scores} />}

      {/* Meta */}
      <div className="flex items-center gap-3 mb-3 text-[10px] text-gray-600">
        <span>相关论文: {rec.paperCount.toLocaleString()} 篇</span>
        {rec.domains.map((d) => (
          <span key={d} className="bg-[#1a1a3a] px-1.5 py-0.5 rounded">{d}</span>
        ))}
      </div>

      {/* Keywords */}
      <div className="flex flex-wrap gap-1 mb-3">
        {rec.keywords.map((kw) => (
          <span
            key={kw}
            className="bg-[#1a1a3a] text-[#8888ff] px-2 py-0.5 rounded-full text-[10px]"
          >
            {kw}
          </span>
        ))}
      </div>

      {/* Representative papers */}
      {rec.representativePapers.length > 0 && (
        <div className="border-t border-[#1a1a3a] pt-3 mt-1">
          <div className="text-[10px] text-gray-600 mb-1.5">代表性论文</div>
          <div className="space-y-1.5">
            {rec.representativePapers.map((p, i) => (
              <div key={i} className="text-[11px] leading-snug">
                <span className="text-gray-400">{p.title}</span>
                <span className="text-gray-600 ml-1">
                  — {p.authors} ({p.year})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Analysis */}
      <div className="border-t border-[#1a1a3a] pt-3 mt-3">
        {!analysis && !loading && (
          <button
            onClick={handleAnalyze}
            className="flex items-center gap-1.5 text-xs text-[#6666cc] hover:text-[#8888ff] transition-colors"
          >
            <span className="text-sm">🧭</span>
            AI 分析知识边界
          </button>
        )}
        {(loading || analysis) && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-sm">🧭</span>
              <span className="text-[10px] font-medium text-[#8888ff]">知识边界分析</span>
              {loading && <span className="text-[10px] text-gray-600 animate-pulse">生成中...</span>}
            </div>
            <div className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">
              {analysis}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
