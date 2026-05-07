import { useState, useRef, useEffect } from 'react';

interface Props {
  allKeywords: string[];
  selectedKeywords: string[];
  onAdd: (kw: string) => void;
  onRemove: (kw: string) => void;
}

export default function KeywordSearch({
  allKeywords,
  selectedKeywords,
  onAdd,
  onRemove,
}: Props) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = input.trim()
    ? allKeywords
        .filter(
          (k) =>
            k.toLowerCase().includes(input.toLowerCase()) &&
            !selectedKeywords.includes(k)
        )
        .slice(0, 10)
    : [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 flex-wrap">
        {selectedKeywords.map((kw) => (
          <span
            key={kw}
            className="bg-[#2a2a4a] text-[#8888ff] px-3 py-1 rounded-full text-xs flex items-center gap-1.5"
          >
            {kw}
            <button
              onClick={() => onRemove(kw)}
              className="text-gray-500 hover:text-white text-[10px]"
            >
              ✕
            </button>
          </span>
        ))}
        {selectedKeywords.length < 5 && (
          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setOpen(true);
              }}
              onFocus={() => input.trim() && setOpen(true)}
              placeholder="搜索关键词..."
              className="bg-[#1a1a3a] border border-[#333366] rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 outline-none w-48"
            />
            {open && filtered.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-[#1a1a3a] border border-[#333366] rounded-lg overflow-hidden z-20 shadow-lg">
                {filtered.map((kw) => (
                  <button
                    key={kw}
                    onClick={() => {
                      onAdd(kw);
                      setInput('');
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-[#2a2a4a] transition-colors"
                  >
                    {kw}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
