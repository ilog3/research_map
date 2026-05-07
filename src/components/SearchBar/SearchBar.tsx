import { useState, useEffect } from 'react';
import { useStore } from '../../store';

interface SearchBarProps {
  embedded?: boolean;
}

export default function SearchBar({ embedded = false }: SearchBarProps) {
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const searchResults = useStore((s) => s.searchResults);
  const papers = useStore((s) => s.papers);
  const [input, setInput] = useState(searchQuery);

  useEffect(() => {
    setInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(input), 300);
    return () => clearTimeout(timer);
  }, [input, setSearchQuery]);

  return (
    <div
      className={
        embedded
          ? 'w-full'
          : 'absolute top-3 left-1/2 -translate-x-1/2 z-10 w-[360px]'
      }
    >
      <div className="bg-white border border-violet-200 rounded-lg flex items-center px-3 py-2 gap-2 shadow-sm">
        <span className="text-violet-400 text-sm" aria-hidden>
          🔍
        </span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="搜索论文标题、关键词、作者..."
          className="flex-1 bg-transparent text-sm text-violet-950 placeholder-violet-300 outline-none"
        />
        {searchResults && (
          <span className="text-[10px] text-violet-500 shrink-0">
            {searchResults.size}/{papers.length}
          </span>
        )}
      </div>
    </div>
  );
}
