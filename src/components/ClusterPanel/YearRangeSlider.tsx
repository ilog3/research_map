import { useStore } from '../../store';

export default function YearRangeSlider() {
  const yearRange = useStore((s) => s.yearRange);
  const setYearRange = useStore((s) => s.setYearRange);

  return (
    <div className="mb-3">
      <div className="text-xs text-violet-600 mb-2">年份范围</div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1977}
          max={yearRange[1]}
          value={yearRange[0]}
          onChange={(e) => setYearRange([Number(e.target.value), yearRange[1]])}
          className="flex-1 bg-violet-50 text-center text-xs text-violet-950 rounded-lg px-2 py-1.5 border border-violet-200 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-violet-400">—</span>
        <input
          type="number"
          min={yearRange[0]}
          max={2025}
          value={yearRange[1]}
          onChange={(e) => setYearRange([yearRange[0], Number(e.target.value)])}
          className="flex-1 bg-violet-50 text-center text-xs text-violet-950 rounded-lg px-2 py-1.5 border border-violet-200 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
    </div>
  );
}
