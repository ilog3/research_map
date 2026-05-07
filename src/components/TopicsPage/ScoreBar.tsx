interface Scores {
  innovation: { crossDomain: number; gapRatio: number; novelty: number; total: number };
  practicality: { growth: number; literatureBase: number; policyFit: number; total: number };
  evidence: string;
}

interface Props {
  scores: Scores;
}

function Bar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-gray-400">{label}</span>
        <span className="text-[10px] font-mono font-semibold" style={{ color }}>
          {value.toFixed(2)}
        </span>
      </div>
      <div className="h-1.5 bg-[#1a1a3a] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${value * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function SubScore({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-[9px] text-gray-600">
      {label} <span className="text-gray-500 font-mono">{value.toFixed(1)}</span>
    </span>
  );
}

export default function ScoreBar({ scores }: Props) {
  return (
    <div className="mb-3">
      <div className="flex gap-4 mb-1.5">
        <Bar value={scores.innovation.total} color="#6b8aff" label="创新性" />
        <Bar value={scores.practicality.total} color="#4ecdc4" label="实效性" />
      </div>
      <div className="flex gap-4">
        <div className="flex-1 flex gap-2">
          <SubScore label="交叉" value={scores.innovation.crossDomain} />
          <SubScore label="空白" value={scores.innovation.gapRatio} />
          <SubScore label="新颖" value={scores.innovation.novelty} />
        </div>
        <div className="flex-1 flex gap-2">
          <SubScore label="增长" value={scores.practicality.growth} />
          <SubScore label="文献" value={scores.practicality.literatureBase} />
          <SubScore label="政策" value={scores.practicality.policyFit} />
        </div>
      </div>
      <p className="text-[9px] text-gray-600 mt-1.5 leading-relaxed">
        依据：{scores.evidence}
      </p>
    </div>
  );
}
