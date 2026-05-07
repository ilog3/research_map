import { useEffect, useState } from 'react';
import { useStore } from '../../store';

export default function Tooltip() {
  const hoveredPaperId = useStore((s) => s.hoveredPaperId);
  const papers = useStore((s) => s.papers);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  if (!hoveredPaperId) return null;

  const paper = papers.find((p) => p.id === hoveredPaperId);
  if (!paper) return null;

  return (
    <div
      className="fixed z-50 pointer-events-none bg-[#1a1a3a] border border-[#333366] rounded-lg px-3 py-2 max-w-xs"
      style={{ left: pos.x + 12, top: pos.y - 8 }}
    >
      <div className="text-xs text-white font-medium leading-snug">
        {paper.title}
      </div>
      <div className="text-[10px] text-gray-500 mt-1">
        {paper.authors.join('; ')} · {paper.year}
      </div>
    </div>
  );
}
