import { useState } from 'react';
import { chatCompletion, buildCowordAnalysisPrompt } from '../../services/llm';

interface NodeInfo {
  id: string;
  count: number;
  domain: string;
  color: string;
}

interface NeighborInfo {
  keyword: string;
  weight: number;
}

interface Props {
  node: NodeInfo | null;
  neighbors: NeighborInfo[];
  onClickNeighbor: (kw: string) => void;
}

export default function NodeDetail({ node, neighbors, onClickNeighbor }: Props) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzedNode, setAnalyzedNode] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!node || loading) return;
    setLoading(true);
    setAnalysis('');
    setAnalyzedNode(node.id);
    try {
      const prompt = buildCowordAnalysisPrompt(
        node.id,
        neighbors,
        node.count,
        node.domain,
      );
      await chatCompletion(prompt, (text) => setAnalysis(text));
    } catch (err) {
      setAnalysis('分析请求失败，请稍后重试。');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Reset analysis when node changes
  if (node && node.id !== analyzedNode && analysis !== null) {
    setAnalysis(null);
    setAnalyzedNode(null);
  }

  if (!node) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 text-sm p-4">
        悬停或点击节点查看详情
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <h3 className="text-base font-semibold text-white mb-3">{node.id}</h3>

      <div className="grid grid-cols-[60px_1fr] gap-x-3 gap-y-1.5 text-xs mb-4">
        <span className="text-gray-600">论文数</span>
        <span className="text-gray-300">{node.count.toLocaleString()} 篇</span>
        <span className="text-gray-600">领域</span>
        <span className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{ backgroundColor: node.color }}
          />
          <span className="text-gray-300">{node.domain}</span>
        </span>
      </div>

      {neighbors.length > 0 && (
        <>
          <div className="text-xs text-gray-500 mb-2 font-medium">Top 共现关键词</div>
          <div className="space-y-1">
            {neighbors.map((n, i) => (
              <button
                key={n.keyword}
                onClick={() => onClickNeighbor(n.keyword)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-[#1a1a3a] transition-colors text-left"
              >
                <span className="text-gray-600 w-4 text-right">{i + 1}</span>
                <span className="flex-1 text-gray-300 truncate">{n.keyword}</span>
                <span className="text-gray-600 tabular-nums">{n.weight}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* AI Analysis */}
      <div className="border-t border-[#1a1a3a] pt-3 mt-3">
        {!analysis && !loading && (
          <button
            onClick={handleAnalyze}
            className="flex items-center gap-1.5 text-xs text-[#6666cc] hover:text-[#8888ff] transition-colors"
          >
            <span className="text-sm">🔬</span>
            AI 解读共现关系
          </button>
        )}
        {(loading || analysis) && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-sm">🔬</span>
              <span className="text-[10px] font-medium text-[#8888ff]">共现关系解读</span>
              {loading && <span className="text-[10px] text-gray-600 animate-pulse">分析中...</span>}
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
