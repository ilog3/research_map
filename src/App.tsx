import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import TopNav from './components/TopNav/TopNav';
import KnowledgeGraph from './pages/KnowledgeGraph';
import { useStore } from './store';
import TrendsPage from './pages/TrendsPage';
import CowordPage from './pages/CowordPage';
import TopicsPage from './pages/TopicsPage';

function AppRoutes() {
  const location = useLocation();
  const isAgentWorkspace = location.pathname === '/';

  /** 刷新/关闭前落盘当前会话的工作区快照，避免未切换会话时丢失阅读侧栏态 */
  useEffect(() => {
    const flush = () => useStore.getState().persistWorkspaceNow();
    window.addEventListener('beforeunload', flush);
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  return (
    <div className="h-screen w-screen bg-[#faf9ff] text-violet-950 flex flex-col">
      {!isAgentWorkspace && <TopNav />}
      <Routes>
        <Route path="/" element={<KnowledgeGraph />} />
        <Route path="/trends" element={<TrendsPage />} />
        <Route path="/coword" element={<CowordPage />} />
        <Route path="/topics" element={<TopicsPage />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
