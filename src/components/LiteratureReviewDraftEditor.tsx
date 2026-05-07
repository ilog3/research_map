import { useRef, useState, useCallback, useEffect } from 'react';
import {
  chatCompletion,
  buildLiteratureSelectionPolishPrompt,
  stripLiteratureModelPlainText,
  resolveOahAgentName,
} from '../services/llm';

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  /** 侧栏较窄时用略小字号 */
  compact?: boolean;
};

export default function LiteratureReviewDraftEditor({
  value,
  onChange,
  placeholder = '在此编辑综述成稿…',
  className = '',
  compact = false,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const prevValueLenRef = useRef(0);
  const [busy, setBusy] = useState<'polish' | 'rewrite' | null>(null);
  const [error, setError] = useState('');

  /** 流式/分节追加正文时自动滚到底部，便于看到最新一节（单次增长较大时触发，避免逐字输入乱跳） */
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    if (value.length > prevValueLenRef.current + 40) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
    prevValueLenRef.current = value.length;
  }, [value]);

  const replaceSelection = useCallback(
    (newSlice: string) => {
      const el = taRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (start === end) return;
      const next = value.slice(0, start) + newSlice + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        const t = taRef.current;
        if (!t) return;
        const pos = start + newSlice.length;
        t.focus();
        t.setSelectionRange(pos, pos);
      });
    },
    [onChange, value]
  );

  const runPolish = useCallback(
    async (mode: 'polish' | 'rewrite') => {
      const el = taRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = value.slice(start, end).trim();
      if (selected.length < 6) {
        setError('请先选中一段至少 6 个字的文本。');
        return;
      }
      setError('');
      setBusy(mode);
      try {
        const ctxStart = Math.max(0, start - 1200);
        const ctxEnd = Math.min(value.length, end + 1200);
        const surrounding = value.slice(ctxStart, ctxEnd);
        const raw = await chatCompletion(
          buildLiteratureSelectionPolishPrompt({
            selectedText: selected,
            surroundingContext: surrounding,
            mode,
          }),
          undefined,
          {
            agentName: resolveOahAgentName('general'),
            sessionScope: 'literature_polish',
            finalOnly: true,
          }
        );
        const out = stripLiteratureModelPlainText(raw);
        if (!out.trim()) {
          setError('模型未返回可用文本，请重试或缩短选区。');
          return;
        }
        replaceSelection(out.trim());
      } catch (e) {
        setError(e instanceof Error ? e.message : '润色失败');
      } finally {
        setBusy(null);
      }
    },
    [replaceSelection, value]
  );

  return (
    <div className={`flex flex-col min-h-0 gap-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void runPolish('polish')}
          className="text-[11px] px-2.5 py-1 rounded-md border border-violet-200 bg-white text-violet-900 hover:bg-violet-50 disabled:opacity-50"
        >
          {busy === 'polish' ? '润色中…' : '润色选中'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void runPolish('rewrite')}
          className="text-[11px] px-2.5 py-1 rounded-md border border-violet-200 bg-white text-violet-900 hover:bg-violet-50 disabled:opacity-50"
        >
          {busy === 'rewrite' ? '重写中…' : '重写选中'}
        </button>
        <span className="text-[10px] text-violet-500">在下方框内选中段落后再点按钮</span>
      </div>
      {error ? <div className="text-[11px] text-red-600 shrink-0">{error}</div> : null}
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => {
          setError('');
          onChange(e.target.value);
        }}
        placeholder={placeholder}
        spellCheck
        className={`flex-1 min-h-[200px] w-full rounded-lg bg-white border border-violet-200 px-3 py-2 text-violet-950 leading-relaxed outline-none focus:ring-2 focus:ring-violet-300/60 resize-none ${
          compact ? 'text-[11px]' : 'text-xs'
        }`}
      />
    </div>
  );
}
