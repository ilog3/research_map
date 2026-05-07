import { type ReactNode, useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

interface LayoutProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}

const LS_LEFT = 'research_map2_layout_left_w';
const LS_RIGHT = 'research_map2_layout_right_w';

function readStoredWidth(key: string, fallback: number): number {
  try {
    const n = Number(localStorage.getItem(key));
    if (Number.isFinite(n) && n >= 160) return n;
  } catch {
    // ignore
  }
  return fallback;
}

export default function Layout({ left, center, right }: LayoutProps) {
  const [leftW, setLeftW] = useState(() => readStoredWidth(LS_LEFT, 288));
  const [rightW, setRightW] = useState(() => readStoredWidth(LS_RIGHT, 400));
  const leftWRef = useRef(leftW);
  const rightWRef = useRef(rightW);
  leftWRef.current = leftW;
  rightWRef.current = rightW;
  const dragRef = useRef<'left' | 'right' | null>(null);
  const startXRef = useRef(0);
  const startLeftRef = useRef(0);
  const startRightRef = useRef(0);

  const onMove = useCallback((e: globalThis.MouseEvent) => {
    const kind = dragRef.current;
    if (!kind) return;
    const dx = e.clientX - startXRef.current;
    if (kind === 'left') {
      const next = Math.min(Math.max(200, startLeftRef.current + dx), 520);
      leftWRef.current = next;
      setLeftW(next);
    } else {
      const next = Math.min(Math.max(280, startRightRef.current - dx), 640);
      rightWRef.current = next;
      setRightW(next);
    }
  }, []);

  const onUp = useCallback(() => {
    if (dragRef.current) {
      try {
        localStorage.setItem(LS_LEFT, String(leftWRef.current));
        localStorage.setItem(LS_RIGHT, String(rightWRef.current));
      } catch {
        // ignore
      }
    }
    dragRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onMove, onUp]);

  const startDragLeft = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = 'left';
    startXRef.current = e.clientX;
    startLeftRef.current = leftW;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const startDragRight = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = 'right';
    startXRef.current = e.clientX;
    startRightRef.current = rightW;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleStyle =
    'w-1.5 shrink-0 cursor-col-resize group flex items-stretch justify-center bg-[#faf9ff] hover:bg-violet-50 border-x border-violet-100';

  return (
    <div className="flex flex-1 overflow-hidden min-h-0 bg-[#faf9ff]">
      <aside
        style={{ width: leftW }}
        className="shrink-0 bg-[#faf9ff] border-r border-violet-100 overflow-y-auto overflow-x-hidden"
      >
        {left}
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        className={handleStyle}
        onMouseDown={startDragLeft}
        title="拖动调整左栏宽度"
      >
        <span className="w-px h-8 self-center rounded-full bg-violet-300/90 opacity-0 group-hover:opacity-100" />
      </div>
      <main className="min-w-0 flex-1 relative bg-[#faf9ff] border-x border-violet-100">
        {center}
      </main>
      <div
        role="separator"
        aria-orientation="vertical"
        className={handleStyle}
        onMouseDown={startDragRight}
        title="拖动调整右栏宽度"
      >
        <span className="w-px h-8 self-center rounded-full bg-violet-300/90 opacity-0 group-hover:opacity-100" />
      </div>
      <aside
        style={{ width: rightW }}
        className="shrink-0 min-w-[260px] max-w-[55vw] bg-[#faf9ff] flex flex-col overflow-hidden border-l border-violet-100"
      >
        {right}
      </aside>
    </div>
  );
}
