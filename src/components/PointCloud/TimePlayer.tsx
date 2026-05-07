import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../store';

const MIN_YEAR = 1977;
const MAX_YEAR = 2025;
const INTERVAL_MS = 150; // speed per year tick

export default function TimePlayer() {
  const setYearRange = useStore((s) => s.setYearRange);
  const yearRange = useStore((s) => s.yearRange);
  const [playing, setPlaying] = useState(false);
  const [currentYear, setCurrentYear] = useState(MAX_YEAR);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    setPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const play = useCallback(() => {
    stop();
    setPlaying(true);
    setCurrentYear(MIN_YEAR);
    setYearRange([MIN_YEAR, MIN_YEAR]);

    intervalRef.current = setInterval(() => {
      setCurrentYear((prev) => {
        const next = prev + 1;
        if (next > MAX_YEAR) {
          stop();
          setYearRange([MIN_YEAR, MAX_YEAR]);
          return MAX_YEAR;
        }
        setYearRange([MIN_YEAR, next]);
        return next;
      });
    }, INTERVAL_MS);
  }, [setYearRange, stop]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Sync display year with store when not playing
  const displayYear = playing ? currentYear : yearRange[1];

  return (
    <div className="absolute bottom-3 right-3 flex items-center gap-3">
      <button
        onClick={playing ? stop : play}
        className="bg-[#1a1a3a] border border-[#333366] hover:border-[#4444aa] rounded-lg px-3 py-1.5 text-xs text-gray-300 transition-colors flex items-center gap-1.5"
      >
        {playing ? (
          <>
            <span className="text-[10px]">⏸</span> 暂停
          </>
        ) : (
          <>
            <span className="text-[10px]">▶</span> 时间演进
          </>
        )}
      </button>
      {playing && (
        <div className="bg-[#1a1a3a] border border-[#333366] rounded-lg px-3 py-1.5">
          <span className="text-sm font-mono font-bold text-white tabular-nums">
            {displayYear}
          </span>
          <div className="w-24 h-1 bg-[#0a0a1a] rounded-full mt-1 overflow-hidden">
            <div
              className="h-full bg-[#4444aa] rounded-full transition-all duration-100"
              style={{ width: `${((displayYear - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
