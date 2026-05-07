import { useMemo, useState } from 'react';
import type { ModelDebugEntry, ModelDebugKind } from '../../types';

const KIND_LABEL: Record<ModelDebugKind, string> = {
  raw_llm: '模型原始输出',
  user_thinking: '对用户展示的思考',
  final_answer: '最终答复（气泡正文）',
  meta: '元信息 / 路由 / 解析',
};

const KIND_CLASS: Record<ModelDebugKind, string> = {
  raw_llm: 'border-amber-700/60 bg-amber-950/25',
  user_thinking: 'border-sky-700/50 bg-sky-950/20',
  final_answer: 'border-emerald-800/50 bg-emerald-950/20',
  meta: 'border-zinc-600/60 bg-zinc-900/40',
};

interface Props {
  threadId: string;
  entries: ModelDebugEntry[];
  onClear: () => void;
}

export default function ModelDebugPanel({ threadId, entries, onClear }: Props) {
  const filtered = useMemo(
    () => entries.filter((e) => e.threadId === threadId).sort((a, b) => a.ts - b.ts),
    [entries, threadId]
  );

  return (
    <div className="flex flex-col min-h-0 border-t border-[#1e2a40] bg-[#0a1018] shrink-0 max-h-[42vh]">
      <div className="px-3 py-2 border-b border-[#1e2a40] shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[#c5d2e8]">模型调试台</span>
          <button
            type="button"
            className="text-[11px] px-2 py-0.5 rounded bg-[#2a1f1f] text-[#f0b4b4] hover:bg-[#3a2424]"
            onClick={onClear}
          >
            清空本会话
          </button>
        </div>
        <p className="text-[10px] text-[#7d8ca3] leading-relaxed">
          <span className="text-amber-200/90">原始输出</span>：接口返回的完整字符串（可含 &lt;TASK_CARD_JSON&gt;、JSON、链式思考）。
          <span className="text-sky-200/90 ml-1">对用户思考</span>：经{' '}
          <code className="text-[#9eb0cc]">sanitizeThoughtLinesForUser</code> 或业务摘要后的条目，用于折叠块。
          <span className="text-emerald-200/90 ml-1">最终答复</span>：经{' '}
          <code className="text-[#9eb0cc]">sanitizeFinalAnswer</code> / 结构化解析后写入气泡的正文。
          <span className="text-zinc-300 ml-1">元信息</span>：意图路由、解析结果、未调模型时的规则说明。
        </p>
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          {(Object.keys(KIND_LABEL) as ModelDebugKind[]).map((k) => (
            <span
              key={k}
              className={`px-1.5 py-0.5 rounded border ${KIND_CLASS[k]} text-[#b8c5db]`}
            >
              {KIND_LABEL[k]}
            </span>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-[11px] text-[#6f82a3] text-center py-6">当前会话暂无调试记录。发送消息后在此查看各阶段输出。</div>
        ) : (
          filtered.map((e) => <DebugEntryRow key={e.id} entry={e} />)
        )}
      </div>
    </div>
  );
}

function DebugEntryRow({ entry: e }: { entry: ModelDebugEntry }) {
  const [open, setOpen] = useState(true);
  const time = new Date(e.ts).toLocaleTimeString();
  return (
    <div className={`rounded-md border text-left overflow-hidden ${KIND_CLASS[e.kind]}`}>
      <button
        type="button"
        className="w-full flex items-start justify-between gap-2 px-2 py-1.5 text-left hover:bg-black/15"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[10px] text-[#8fa5ca]">
            {time} · <span className="text-[#d0dce8]">{KIND_LABEL[e.kind]}</span> ·{' '}
            <span className="text-[#b9cff2]">{e.phase}</span>
            {e.runId ? <span className="text-[#6f82a3]"> · {e.runId.slice(0, 24)}…</span> : null}
          </div>
          <div className="text-[11px] text-[#e8eef8] font-medium mt-0.5 truncate">{e.label}</div>
        </div>
        <span className="text-[#8fa5ca] shrink-0">{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <pre className="text-[10px] leading-relaxed text-[#c0d0e8] px-2 pb-2 whitespace-pre-wrap break-words max-h-64 overflow-y-auto border-t border-black/20 bg-black/20">
          {e.content || '（空）'}
        </pre>
      )}
    </div>
  );
}
