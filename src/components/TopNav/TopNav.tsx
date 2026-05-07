import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../../store';

export default function TopNav() {
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const location = useLocation();

  const isGraph = location.pathname === '/';
  const isTrends = location.pathname === '/trends';
  const isCoword = location.pathname === '/coword';
  const isTopics = location.pathname === '/topics';

  return (
    <nav className="h-12 bg-white border-b border-violet-100 flex items-center px-5 gap-4 shrink-0 shadow-sm">
      <span className="text-base font-bold text-violet-950 tracking-wide">
        📚 教育论文知识图谱
      </span>
      <Link
        to="/"
        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
          isGraph ? 'bg-violet-100 text-violet-900 border border-violet-200' : 'text-violet-600 hover:text-violet-950 hover:bg-violet-50'
        }`}
      >
        知识图谱
      </Link>
      <Link
        to="/trends"
        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
          isTrends ? 'bg-violet-100 text-violet-900 border border-violet-200' : 'text-violet-600 hover:text-violet-950 hover:bg-violet-50'
        }`}
      >
        统计分析
      </Link>
      <Link
        to="/coword"
        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
          isCoword ? 'bg-violet-100 text-violet-900 border border-violet-200' : 'text-violet-600 hover:text-violet-950 hover:bg-violet-50'
        }`}
      >
        共词网络
      </Link>
      <Link
        to="/topics"
        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
          isTopics ? 'bg-violet-100 text-violet-900 border border-violet-200' : 'text-violet-600 hover:text-violet-950 hover:bg-violet-50'
        }`}
      >
        主题演化
      </Link>
      <div className="ml-auto flex items-center gap-2 text-xs text-violet-700">
        <span className="text-violet-500">视图</span>
        <button
          type="button"
          className={`px-2 py-0.5 rounded border ${viewMode === '3d' ? 'bg-violet-600 text-white border-violet-600' : 'border-violet-200 bg-white hover:bg-violet-50'}`}
          onClick={() => setViewMode('3d')}
        >
          3D
        </button>
        <button
          type="button"
          className={`px-2 py-0.5 rounded border ${viewMode === '2d' ? 'bg-violet-600 text-white border-violet-600' : 'border-violet-200 bg-white hover:bg-violet-50'}`}
          onClick={() => setViewMode('2d')}
        >
          2D
        </button>
      </div>
    </nav>
  );
}
