import type { Paper, ReadingSession } from '../../types';

type Parsed = NonNullable<ReadingSession['parsedMeta']>;

function branchLabels(paper: Paper | null, parsed: Parsed | null): string[] {
  const kw = paper?.keywords?.length
    ? paper.keywords.slice(0, 5)
    : parsed?.keywords?.length
      ? parsed.keywords.slice(0, 5)
      : [];
  if (kw.length) return kw;
  return ['研究主题', '方法', '数据', '结论', '局限'].slice(0, 4);
}

function abstractSnippets(paper: Paper | null, parsed: Parsed | null): string[] {
  const raw = paper?.abstract?.trim() || parsed?.abstract?.trim() || '';
  if (!raw) return [];
  const parts = raw.split(/[。．\n]/).map((s) => s.trim()).filter(Boolean);
  return parts.slice(0, 4);
}

/** 阅读场景思维导图：中心主题 + 关键词分支 + 摘要要点（与全库 3D 知识图谱区分） */
export function ReadingMindmapPanel(props: {
  paper: Paper | null;
  readingSession: ReadingSession;
  clusterLabel?: string;
}) {
  const { paper, readingSession, clusterLabel } = props;
  const parsed = readingSession.parsedMeta;
  const center = paper?.title || parsed?.title || readingSession.paperTitle || '当前文献';
  const branches = branchLabels(paper, parsed);
  const snippets = abstractSnippets(paper, parsed);
  const w = 420;
  const h = 320;
  const cx = w / 2;
  const cy = h / 2 - 10;
  const r = 118;
  const n = Math.max(branches.length, 1);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3">
      <section className="rounded-lg border border-violet-200 bg-white shadow-sm p-3">
        <div className="text-xs font-medium text-violet-900">思维导图（当前论文）</div>
        <div className="mt-1 text-[11px] text-violet-600 leading-relaxed">
          以关键词与摘要句为分支，便于快速把握结构。全库论文的 3D 分布请在「更多 → 知识图谱」中浏览。
        </div>
      </section>
      <section className="rounded-lg border border-violet-200 bg-white shadow-sm p-3 overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[360px]" style={{ height: h }}>
          {branches.map((_, i) => {
            const angle = (-90 + (360 / n) * i) * (Math.PI / 180);
            const x2 = cx + r * Math.cos(angle);
            const y2 = cy + r * Math.sin(angle);
            return (
              <line
                key={`l-${i}`}
                x1={cx}
                y1={cy}
                x2={x2}
                y2={y2}
                stroke="#c4b5fd"
                strokeWidth="1.5"
                strokeOpacity="0.95"
              />
            );
          })}
          <circle cx={cx} cy={cy} r={36} fill="#7c3aed" stroke="#6d28d9" strokeWidth="1.5" />
          <text x={cx} y={cy + 3} textAnchor="middle" fill="#faf5ff" fontSize="9" className="select-none">
            {center.length > 26 ? `${center.slice(0, 26)}…` : center}
          </text>
          {branches.map((label, i) => {
            const angle = (-90 + (360 / n) * i) * (Math.PI / 180);
            const x2 = cx + r * Math.cos(angle);
            const y2 = cy + r * Math.sin(angle);
            const tx = x2 + (x2 > cx ? 6 : x2 < cx ? -6 : 0);
            const anchor = x2 > cx ? 'start' : x2 < cx ? 'end' : 'middle';
            return (
              <text
                key={`t-${i}`}
                x={tx}
                y={y2 + 4}
                textAnchor={anchor}
                fill="#5b21b6"
                fontSize="9"
                className="select-none"
              >
                {label.length > 14 ? `${label.slice(0, 14)}…` : label}
              </text>
            );
          })}
        </svg>
        {clusterLabel && (
          <div className="mt-2 text-center text-[11px] text-violet-600">主题簇：{clusterLabel}</div>
        )}
        {snippets.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="text-[11px] text-violet-700 font-medium">摘要要点</div>
            {snippets.map((s, i) => (
              <div key={`sn-${i}`} className="text-[11px] text-violet-700 leading-relaxed border-l-2 border-violet-300 pl-2">
                {s}
                {/[。．]$/.test(s) ? '' : '。'}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function PaperNotesPanel(props: {
  noteKey: string;
  noteText: string;
  onChange: (text: string) => void;
  paperTitle: string;
}) {
  const { noteKey, noteText, onChange, paperTitle } = props;
  if (!noteKey) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
          请先在左侧知识图谱中选中一篇论文，或通过阅读助手打开文献链接，以便为「该篇」保存笔记。
        </div>
      </div>
    );
  }
  return (
    <div className="h-full flex flex-col min-h-0 p-4">
      <div className="text-[11px] text-violet-600 mb-2 shrink-0">
        关联文献：{paperTitle || '（未命名）'}
      </div>
      <textarea
        className="flex-1 min-h-[200px] w-full rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2 text-xs text-violet-900 leading-relaxed outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300 resize-none placeholder:text-violet-400"
        placeholder="在此记录要点、质疑、复现备忘……将按文献自动保存到本地浏览器。"
        value={noteText}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      <div className="mt-2 text-[10px] text-violet-500 shrink-0">仅保存在本机 localStorage，清除站点数据会丢失。</div>
    </div>
  );
}
