import { useState, useRef, useEffect } from 'react';

interface Props {
  allKeywords: string[];
  onSelect: (kw: string) => void;
  centerKeyword: string | null;
  onReset: () => void;
}

export default function CowordSearch({ allKeywords, onSelect, centerKeyword, onReset }: Props) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = input.trim()
    ? allKeywords
        .filter((k) => k.toLowerCase().includes(input.toLowerCase()))
        .slice(0, 10)
    : [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="flex items-center gap-4 px-6 py-3 border-b border-[#1a1a3a] shrink-0">
      <div ref={ref} className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => input.trim() && setOpen(true)}
          placeholder="搜索关键词..."
          className="bg-[#1a1a3a] border border-[#333366] rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 outline-none w-56"
        />
        {open && filtered.length > 0 && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-[#1a1a3a] border border-[#333366] rounded-lg overflow-hidden z-20 shadow-lg">
            {filtered.map((kw) => (
              <button
                key={kw}
                onClick={() => { onSelect(kw); setInput(''); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-[#2a2a4a] transition-colors"
              >
                {kw}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="text-xs text-gray-500">
        当前: {centerKeyword ? (
          <span className="text-[#8888ff] font-medium">{centerKeyword}</span>
        ) : (
          <span className="text-gray-400">全局视图 (Top 50)</span>
        )}
      </div>
      {centerKeyword && (
        <button
          onClick={onReset}
          className="text-xs text-[#6666cc] hover:text-[#8888ff] transition-colors"
        >
          返回全局视图
        </button>
      )}
    </div>
  );
}
