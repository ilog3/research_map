import { useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../components/Layout/Layout';
import ClusterPanel from '../components/ClusterPanel/ClusterPanel';
import PointCloud from '../components/PointCloud/PointCloud';
import DetailPanel from '../components/DetailPanel/DetailPanel';
import AIChat from '../components/AIChat/AIChat';
import LiteratureReviewDraftEditor from '../components/LiteratureReviewDraftEditor';
import { useStore, READING_RIGHT_PANEL_FULL, LITERATURE_REVIEW_PANELS, PERSONAL_KB_RIGHT_PANELS } from '../store';
import type { AssistantAgent, DiscoveryCandidateItem, RightPanelCard } from '../types';
import { parseDocumentSource } from '../services/llm';
import { getPaperNoteStorageKey } from '../utils/paperNoteKey';
import { sanitizeThoughtLinesForUser } from '../utils/thinkingDisplay';
import { PaperNotesPanel, ReadingMindmapPanel } from '../components/RightPanel/ReadingExtras';
import { loadFavorites, removeFavorite, type FavoriteEntry } from '../utils/favoritesStorage';
import {
  listPersonalPdfs,
  getPersonalPdfBlob,
  addPersonalPdfs,
  removePersonalPdf,
  formatBytes,
  PERSONAL_PDFS_CHANGED_EVENT,
  type PersonalPdfMeta,
} from '../utils/personalLibraryStorage';
import { planRightPanelCards, type PlannerPanelCard } from '../utils/panelPlanner';
import { parseFollowUpChips } from '../utils/followUpSuggestions';

/** 阅读标签全部直出，不再放入「更多」 */
const READING_TAB_PRIMARY = READING_RIGHT_PANEL_FULL;
const READING_TAB_MORE: RightPanelCard[] = [];

type PanelCard = PlannerPanelCard;
type RightInfoSection = 'graph' | 'retrieval' | 'docs';

function stageLabel(stage: string): string {
  if (stage === 'queued') return '排队';
  if (stage === 'searching') return '检索';
  if (stage === 'deduping') return '去重';
  if (stage === 'scoring') return '评分';
  if (stage === 'clustering') return '聚类';
  if (stage === 'summarized') return '汇总';
  if (stage === 'reading_plan') return '阅读·Plan';
  if (stage === 'reading_mcp') return '阅读·MCP';
  if (stage === 'reading_code') return '阅读·Code';
  if (stage === 'reading_synth') return '阅读·综合';
  if (stage === 'reading_critic') return '阅读·审阅';
  return stage;
}

function resolveUrl(source?: string, url?: string): string | null {
  if (url && /^https?:\/\//.test(url)) return url;
  if (source && /^https?:\/\//.test(source)) return source;
  return null;
}

function buildSearchUrl(title?: string, source?: string): string {
  const q = [title, source].filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(q || 'research paper')}`;
}

function parseHttpMeta(message: string): { url?: string; status?: number } {
  const urlMatch = message.match(/url=([^\s]+)/);
  const statusMatch = message.match(/请求失败\((\d+)\)/);
  return {
    url: urlMatch?.[1],
    status: statusMatch ? Number(statusMatch[1]) : undefined,
  };
}

function AgentSidebar() {
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const [sidebarQuery, setSidebarQuery] = useState(searchQuery);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const navItems = ['资产', '画廊', 'Skills', '用户'] as const;
  const [favModalOpen, setFavModalOpen] = useState(false);
  const [favDetail, setFavDetail] = useState<FavoriteEntry | null>(null);
  const [favoritesTick, setFavoritesTick] = useState(0);
  const libraryPdfInputRef = useRef<HTMLInputElement>(null);
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [libraryDetail, setLibraryDetail] = useState<PersonalPdfMeta | null>(null);
  const [libraryList, setLibraryList] = useState<PersonalPdfMeta[]>([]);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [librarySelectedIds, setLibrarySelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onChange = () => setFavoritesTick((x) => x + 1);
    window.addEventListener('research_map2-favorites-changed', onChange);
    return () => window.removeEventListener('research_map2-favorites-changed', onChange);
  }, []);

  const favoritesList = useMemo(() => loadFavorites(), [favoritesTick]);

  const refreshPersonalLibrary = () => {
    void listPersonalPdfs().then(setLibraryList);
  };

  useEffect(() => {
    refreshPersonalLibrary();
    const onLib = () => refreshPersonalLibrary();
    window.addEventListener(PERSONAL_PDFS_CHANGED_EVENT, onLib);
    return () => window.removeEventListener(PERSONAL_PDFS_CHANGED_EVENT, onLib);
  }, []);

  useEffect(() => {
    if (!libraryDetail) {
      setPdfPreviewUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return null;
      });
      return;
    }
    let cancelled = false;
    void getPersonalPdfBlob(libraryDetail.id).then((blob) => {
      if (cancelled || !blob) return;
      const u = URL.createObjectURL(blob);
      setPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return u;
      });
    });
    return () => {
      cancelled = true;
      setPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [libraryDetail]);

  useEffect(() => {
    setSidebarQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchQuery(sidebarQuery), 320);
    return () => window.clearTimeout(t);
  }, [sidebarQuery, setSearchQuery]);

  const startReadingByUpload = useStore((s) => s.startReadingByUpload);
  const setReadingOutput = useStore((s) => s.setReadingOutput);
  const setReadingPreviewUrl = useStore((s) => s.setReadingPreviewUrl);
  const setReadingParsing = useStore((s) => s.setReadingParsing);
  const setReadingPaperMeta = useStore((s) => s.setReadingPaperMeta);
  const setParsedPaperMeta = useStore((s) => s.setParsedPaperMeta);
  const chatThreads = useStore((s) => s.chatThreads);
  const activeThreadId = useStore((s) => s.activeThreadId);
  const activeAgent = useStore((s) => s.activeAgent);
  const setActiveAgent = useStore((s) => s.setActiveAgent);
  const setRightPanelCards = useStore((s) => s.setRightPanelCards);
  const setLiteratureReviewLocalCandidates = useStore((s) => s.setLiteratureReviewLocalCandidates);
  const setPendingAutoAsk = useStore((s) => s.setPendingAutoAsk);
  const createChatThread = useStore((s) => s.createChatThread);
  const switchChatThread = useStore((s) => s.switchChatThread);
  const renameChatThread = useStore((s) => s.renameChatThread);
  const deleteChatThread = useStore((s) => s.deleteChatThread);
  const writingTask = useStore((s) => s.writingTask);
  const writingMaterial = useStore((s) => s.writingMaterial);
  const setWritingTask = useStore((s) => s.setWritingTask);
  const setWritingMaterial = useStore((s) => s.setWritingMaterial);
  const setAgentRunState = useStore((s) => s.setAgentRunState);
  const papers = useStore((s) => s.papers);
  const selectPaper = useStore((s) => s.selectPaper);
  const searchResults = useStore((s) => s.searchResults);

  const matchedPapers = useMemo(() => {
    const qq = sidebarQuery.trim().toLowerCase();
    if (!qq) return [];
    return papers
      .filter((p) => {
        if (p.title.toLowerCase().includes(qq) || p.titleEn.toLowerCase().includes(qq)) return true;
        if (p.authors.some((a) => a.toLowerCase().includes(qq))) return true;
        if (p.keywords.some((k) => k.toLowerCase().includes(qq))) return true;
        if (p.keywordsEn.some((k) => k.toLowerCase().includes(qq))) return true;
        return false;
      })
      .slice(0, 12);
  }, [papers, sidebarQuery]);

  const filteredThreads = useMemo(() => {
    const qq = sidebarQuery.trim().toLowerCase();
    if (!qq) return chatThreads;
    return chatThreads.filter((t) => {
      if (t.title.toLowerCase().includes(qq)) return true;
      return t.messages.some((m) => m.content.toLowerCase().includes(qq));
    });
  }, [chatThreads, sidebarQuery]);

  const handleFilePick = async (file?: File) => {
    if (!file) return;
    if (activeAgent !== 'reading') setActiveAgent('reading');
    setReadingParsing(true, '');
    try {
      const parsed = await parseDocumentSource({ type: 'file', value: file });
      startReadingByUpload(file.name);
      setReadingPaperMeta({ paperTitle: parsed.title || file.name, sourceValue: file.name });
      setParsedPaperMeta(parsed.meta);
      setReadingPreviewUrl(parsed.previewUrl);
      setReadingOutput({ evidenceRefs: parsed.evidenceRefs });
      setReadingParsing(false, '');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '未知错误';
      const meta = parseHttpMeta(errorMessage);
      startReadingByUpload(file.name);
      setReadingPaperMeta({ paperTitle: file.name, sourceValue: file.name });
      setParsedPaperMeta({
        title: file.name,
        authors: [],
        keywords: [],
      });
      setReadingPreviewUrl(URL.createObjectURL(file));
      setReadingOutput({ evidenceRefs: [] });
      setReadingParsing(false, `解析失败（${errorMessage}），已切换为基础阅读模式（可预览PDF与对话）。`);
      setAgentRunState({
        lastHttpUrl: meta.url ?? '',
        lastHttpStatus: meta.status ?? null,
        error: errorMessage,
      });
    }
  };

  return (
    <div className="h-full flex flex-col text-violet-950 bg-white">
      <div className="px-4 py-3 border-b border-violet-100">
        <div className="text-sm font-semibold text-violet-950">pedascope beta</div>
      </div>

      <div className="px-3 py-2.5 border-b border-violet-100 space-y-1.5">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-violet-400 text-xs" aria-hidden>
            🔍
          </span>
          <input
            value={sidebarQuery}
            onChange={(e) => setSidebarQuery(e.target.value)}
            placeholder="搜索会话、论文资源…"
            className="w-full bg-white border border-violet-200 pl-8 pr-3 py-1.5 text-xs text-violet-950 placeholder:text-violet-400 outline-none focus:ring-1 focus:ring-violet-300"
          />
        </div>
        <p className="text-[10px] text-violet-500 leading-snug">
          同步筛选左侧对话列表，并检索知识图谱中的论文（与右侧「知识图谱」联动）。
        </p>
        {sidebarQuery.trim() && (
          <div className="border-t border-violet-100 pt-2 space-y-1.5">
            <div className="text-[10px] text-violet-600 flex flex-wrap gap-x-3 gap-y-1">
              <span>
                图谱筛选命中：
                {searchResults == null ? '—' : `${searchResults.size} 篇`}
              </span>
              <span>论文匹配：{matchedPapers.length} 条（最多展示 12 条）</span>
            </div>
            {matchedPapers.length > 0 && (
              <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                {matchedPapers.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full text-left text-[11px] text-violet-950 hover:bg-violet-50 rounded-lg px-2 py-1 truncate border border-transparent hover:border-violet-100"
                      onClick={() => selectPaper(p.id)}
                    >
                      {p.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {activeAgent !== 'general' && (
          <button
            type="button"
            className="w-full text-xs px-2 py-1 border border-violet-200 bg-white text-violet-800 hover:bg-violet-50"
            onClick={() => setActiveAgent('general')}
          >
            返回研究助手主入口
          </button>
        )}
      </div>

      {activeAgent === 'writing' && (
        <div className="px-3 py-2.5 border-b border-violet-100 space-y-1.5">
          <div className="text-[11px] text-violet-700">写作任务</div>
          <input
            value={writingTask}
            onChange={(e) => setWritingTask(e.target.value)}
            placeholder="例如：写一段相关工作综述"
            className="w-full rounded-lg bg-violet-50/90 border border-violet-200 px-2 py-1.5 text-[11px] text-violet-950 outline-none"
          />
          <textarea
            value={writingMaterial}
            onChange={(e) => setWritingMaterial(e.target.value)}
            placeholder="粘贴参考材料、要点、文献摘要..."
            rows={3}
            className="w-full rounded-lg bg-violet-50/90 border border-violet-200 px-2 py-1.5 text-[11px] text-violet-950 outline-none resize-none"
          />
        </div>
      )}

      <div className="px-3 py-2.5 border-b border-violet-100">
        <div className="border border-violet-100 bg-white p-2.5 text-violet-950">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-violet-950">对话历史</div>
            <button
              type="button"
              className="text-[11px] px-2 py-0.5 bg-white text-violet-900 border border-violet-200 hover:bg-violet-50"
              onClick={() => {
                createChatThread();
              }}
            >
              新建
            </button>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filteredThreads.map((thread) => (
              <div
                key={thread.id}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors border ${
                  thread.id === activeThreadId
                    ? 'bg-violet-100 border-violet-300 text-violet-950'
                    : 'border-transparent text-violet-800 hover:bg-violet-50/90'
                }`}
              >
                {editingThreadId === thread.id ? (
                  <div className="flex gap-1">
                    <input
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      className="flex-1 rounded-lg bg-white border border-violet-200 px-2 py-1 text-[11px] text-violet-950 outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          renameChatThread(thread.id, editingTitle);
                          setEditingThreadId(null);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="px-1.5 py-0.5 text-[10px] rounded-lg bg-violet-600 text-white"
                      onClick={() => {
                        renameChatThread(thread.id, editingTitle);
                        setEditingThreadId(null);
                      }}
                    >
                      保存
                    </button>
                  </div>
                ) : (
                  <button type="button" className="w-full text-left" onClick={() => switchChatThread(thread.id)}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="truncate flex-1">{thread.title || '新对话'}</div>
                      {thread.agent === 'personal_kb' && (
                        <span className="shrink-0 text-[9px] px-1 py-0 rounded bg-emerald-100 text-emerald-900 border border-emerald-200">
                          知识库
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-violet-500 mt-0.5">
                      {new Date(thread.updatedAt).toLocaleString()}
                    </div>
                  </button>
                )}
                <div className="flex gap-1 mt-1">
                  <button
                    type="button"
                    className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-900 border border-violet-200"
                    onClick={() => {
                      setEditingThreadId(thread.id);
                      setEditingTitle(thread.title);
                    }}
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200"
                    onClick={() => deleteChatThread(thread.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
            {filteredThreads.length === 0 && (
              <div className="text-[11px] text-violet-500 px-1">没有匹配的对话。可调整顶部搜索词。</div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 min-h-0 flex flex-col">
        <button
          type="button"
          onClick={() => {
            // 进入「个人知识库」三栏工作视图：专属 personal_kb 助手，右栏知识资产 + 图谱
            setActiveAgent('personal_kb');
            setRightPanelCards([...PERSONAL_KB_RIGHT_PANELS]);
          }}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
            activeAgent === 'personal_kb'
              ? 'border-violet-600 bg-violet-600 text-white hover:bg-violet-700'
              : 'border-violet-200 bg-violet-50/80 text-violet-950 hover:bg-violet-100'
          }`}
        >
          个人知识库 ({libraryList.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setLibraryModalOpen(true);
            setLibraryDetail(libraryList[0] ?? null);
            setLibrarySelectedIds(new Set());
          }}
          className="w-full text-left px-3 py-1 text-[11px] border border-violet-100 bg-white text-violet-700 hover:bg-violet-50 transition-colors"
        >
          管理个人库文件
        </button>
        <input
          ref={libraryPdfInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={async (e) => {
            const files = e.target.files;
            if (files?.length) {
              await addPersonalPdfs(Array.from(files));
              refreshPersonalLibrary();
            }
            e.target.value = '';
          }}
        />

        {navItems.map((item) => (
          <button
            key={item}
            type="button"
            className="w-full text-left px-3 py-1.5 text-sm text-violet-800 hover:bg-violet-50 border border-transparent hover:border-violet-100 transition-colors"
          >
            {item}
          </button>
        ))}
      </div>

      {favModalOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6 bg-violet-950/40 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="favorites-modal-title"
          onClick={() => {
            setFavModalOpen(false);
            setFavDetail(null);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-violet-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-violet-100 shrink-0">
              <h2 id="favorites-modal-title" className="text-sm font-semibold text-violet-950">
                收藏
              </h2>
              <button
                type="button"
                className="text-xs px-2 py-1 rounded-lg text-violet-700 hover:bg-violet-50 border border-violet-200"
                onClick={() => {
                  setFavModalOpen(false);
                  setFavDetail(null);
                }}
              >
                关闭
              </button>
            </div>
            <div className="flex flex-1 min-h-0 flex-col md:flex-row">
              <div className="w-full md:w-[280px] border-b md:border-b-0 md:border-r border-violet-100 overflow-y-auto max-h-[40vh] md:max-h-none shrink-0 p-2 space-y-1.5">
                {favoritesList.length === 0 && (
                  <div className="text-[11px] text-violet-500 px-2 py-3">
                    暂无收藏。在助手回复下可收藏单条；在对话区顶部可收藏整个会话。
                  </div>
                )}
                {favoritesList.map((fav: FavoriteEntry) => (
                  <button
                    key={fav.id}
                    type="button"
                    onClick={() => setFavDetail(fav)}
                    className={`w-full text-left rounded-lg px-2.5 py-2 text-[11px] border transition-colors ${
                      favDetail?.id === fav.id
                        ? 'bg-violet-100 border-violet-300 text-violet-950'
                        : 'border-violet-100 hover:bg-violet-50 text-violet-900'
                    }`}
                  >
                    <div className="text-[10px] text-violet-500 mb-0.5">
                      {fav.kind === 'message' ? '回复' : '会话'} · {new Date(fav.createdAt).toLocaleString()}
                    </div>
                    <div className="line-clamp-2 text-violet-950">
                      {fav.kind === 'message' ? fav.preview : fav.title}
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex-1 min-h-0 flex flex-col bg-violet-50/50">
                <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-violet-100 shrink-0">
                  {favDetail && (
                    <>
                      <button
                        type="button"
                        className="text-[11px] px-2 py-1 rounded-lg bg-violet-600 text-white hover:bg-violet-700"
                        onClick={() => {
                          switchChatThread(favDetail.threadId);
                          setFavModalOpen(false);
                        }}
                      >
                        打开会话
                      </button>
                      <button
                        type="button"
                        className="text-[11px] px-2 py-1 rounded-lg text-red-600 hover:bg-red-50 border border-red-200"
                        onClick={() => {
                          if (!favDetail) return;
                          removeFavorite(favDetail.id);
                          setFavoritesTick((x) => x + 1);
                          setFavDetail(null);
                        }}
                      >
                        删除
                      </button>
                      {favDetail.kind === 'message' && (
                        <button
                          type="button"
                          className="text-[11px] px-2 py-1 rounded-lg border border-violet-200 bg-white text-violet-800 hover:bg-violet-50"
                          onClick={() => void navigator.clipboard.writeText(favDetail.content)}
                        >
                          复制全文
                        </button>
                      )}
                    </>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-4 md:p-6 text-sm text-violet-950 leading-relaxed">
                  {!favDetail && (
                    <div className="text-violet-500 text-center py-12">请从左侧选择一条收藏查看完整内容。</div>
                  )}
                  {favDetail?.kind === 'message' && (
                    <pre className="rounded-xl border border-violet-100 bg-white p-6 shadow-sm min-h-[240px] whitespace-pre-wrap break-words font-sans text-base md:text-lg leading-relaxed text-violet-950">
                      {favDetail.content}
                    </pre>
                  )}
                  {favDetail?.kind === 'thread' && (
                    <div className="rounded-xl border border-violet-100 bg-white p-4 shadow-sm">
                      <div className="text-lg font-medium text-violet-950">{favDetail.title}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {libraryModalOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6 bg-violet-950/40 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="personal-library-modal-title"
          onClick={() => {
            setLibraryModalOpen(false);
            setLibraryDetail(null);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-violet-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-violet-100 shrink-0 gap-2 flex-wrap">
              <h2 id="personal-library-modal-title" className="text-sm font-semibold text-violet-950">
                个人知识库
              </h2>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <button
                  type="button"
                  disabled={librarySelectedIds.size === 0}
                  className="text-xs px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:pointer-events-none"
                  title="文献综述：本机读取 PDF → 优先远程解析服务；失败或内容过少时，在浏览器内用 PDF.js 抽取文本层作为正文（扫描版 PDF 可能仍无字）"
                  onClick={() => {
                    const ids = [...librarySelectedIds];
                    const metas = libraryList.filter((x) => ids.includes(x.id));
                    if (!metas.length) return;
                    const candidates: DiscoveryCandidateItem[] = metas.map((m) => ({
                      title: m.name.replace(/\.pdf$/i, ''),
                      type: 'paper',
                      source: '个人知识库',
                      credibility: 0.88,
                      reason: '用户从个人知识库勾选，用于文献综述 Agent',
                      localPdfId: m.id,
                    }));
                    setLiteratureReviewLocalCandidates(candidates);
                    setActiveAgent('literature_review');
                    setRightPanelCards([...LITERATURE_REVIEW_PANELS]);
                    setPendingAutoAsk(
                      `请为已选中的 ${metas.length} 篇个人知识库 PDF（仅文件名、无摘要）生成文献综述：输出主题归类、横向对比、研究空白与写作提纲；无全文处各字段填「待读全文确认」，勿拒答。`
                    );
                    setLibraryModalOpen(false);
                    setLibraryDetail(null);
                    setLibrarySelectedIds(new Set());
                  }}
                >
                  文献综述 ({librarySelectedIds.size})
                </button>
                <button
                  type="button"
                  className="text-xs px-2.5 py-1 rounded-lg bg-violet-600 text-white hover:bg-violet-700"
                  onClick={() => libraryPdfInputRef.current?.click()}
                >
                  上传 PDF
                </button>
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded-lg text-violet-700 hover:bg-violet-50 border border-violet-200"
                  onClick={() => {
                    setLibraryModalOpen(false);
                    setLibraryDetail(null);
                  }}
                >
                  关闭
                </button>
              </div>
            </div>
            <div className="flex flex-1 min-h-0 flex-col md:flex-row">
              <div className="w-full md:w-[280px] border-b md:border-b-0 md:border-r border-violet-100 overflow-y-auto max-h-[40vh] md:max-h-none shrink-0 p-2 space-y-1.5">
                {libraryList.length === 0 && (
                  <div className="text-[11px] text-violet-500 px-2 py-3">
                    暂无本地论文。点击右上角「上传 PDF」添加，文件仅保存在本机浏览器。
                  </div>
                )}
                {libraryList.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-start gap-2 rounded-lg px-1.5 py-1.5 border transition-colors ${
                      libraryDetail?.id === item.id
                        ? 'bg-violet-100 border-violet-300'
                        : 'border-violet-100 hover:bg-violet-50/80'
                    }`}
                  >
                    <label className="shrink-0 pt-0.5 cursor-pointer" title="加入文献综述候选">
                      <input
                        type="checkbox"
                        checked={librarySelectedIds.has(item.id)}
                        onChange={() => {
                          setLibrarySelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          });
                        }}
                        className="rounded border-violet-300 text-violet-600 focus:ring-violet-400"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setLibraryDetail(item)}
                      className="flex-1 min-w-0 text-left text-[11px] text-violet-900"
                    >
                      <div className="text-[10px] text-violet-500 mb-0.5">
                        {formatBytes(item.size)} · {new Date(item.createdAt).toLocaleString()}
                      </div>
                      <div className="line-clamp-2 text-violet-950">{item.name}</div>
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex-1 min-h-0 flex flex-col bg-violet-50/50">
                <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-violet-100 shrink-0">
                  {libraryDetail && (
                    <>
                      <button
                        type="button"
                        className="text-[11px] px-2 py-1 rounded-lg bg-violet-600 text-white hover:bg-violet-700"
                        onClick={async () => {
                          if (!libraryDetail) return;
                          const blob = await getPersonalPdfBlob(libraryDetail.id);
                          if (!blob) return;
                          const file = new File([blob], libraryDetail.name, {
                            type: 'application/pdf',
                          });
                          await handleFilePick(file);
                          setLibraryModalOpen(false);
                          setLibraryDetail(null);
                        }}
                      >
                        在阅读中打开
                      </button>
                      <button
                        type="button"
                        className="text-[11px] px-2 py-1 rounded-lg text-red-600 hover:bg-red-50 border border-red-200"
                        onClick={async () => {
                          if (!libraryDetail) return;
                          const id = libraryDetail.id;
                          await removePersonalPdf(id);
                          refreshPersonalLibrary();
                          setLibraryDetail(null);
                        }}
                      >
                        删除
                      </button>
                    </>
                  )}
                </div>
                <div className="flex-1 min-h-0 p-2 md:p-4 flex flex-col">
                  {!libraryDetail && (
                    <div className="text-violet-500 text-center py-12 text-sm">
                      请从左侧选择一篇论文，或上传新 PDF。
                    </div>
                  )}
                  {libraryDetail && pdfPreviewUrl && (
                    <iframe
                      title={libraryDetail.name}
                      src={pdfPreviewUrl}
                      className="w-full flex-1 min-h-[280px] rounded-xl border border-violet-200 bg-white shadow-sm"
                    />
                  )}
                  {libraryDetail && !pdfPreviewUrl && (
                    <div className="text-violet-500 text-center py-12 text-sm">预览加载中…</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConversationPanel() {
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 min-h-0 px-3 py-2 bg-white">
        <AIChat />
      </div>
    </div>
  );
}

type PreviewWindowState = {
  x: number;
  y: number;
  w: number;
  h: number;
  collapsed: boolean;
  fullscreen: boolean;
};

function DraggablePreviewWindow(props: {
  title: string;
  url: string;
  state: PreviewWindowState;
  onChange: (next: PreviewWindowState) => void;
  zIndex: number;
  onFocus: () => void;
}) {
  const { title, url, state, onChange, zIndex, onFocus } = props;
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; ow: number; oh: number } | null>(null);

  const onHeaderMouseDown = (e: { clientX: number; clientY: number }) => {
    if (state.fullscreen) return;
    onFocus();
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: state.x, oy: state.y };
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      onChange({
        ...state,
        x: Math.max(0, d.ox + (ev.clientX - d.startX)),
        y: Math.max(0, d.oy + (ev.clientY - d.startY)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onResizeMouseDown = (e: { clientX: number; clientY: number; stopPropagation: () => void }) => {
    if (state.fullscreen) return;
    e.stopPropagation();
    onFocus();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, ow: state.w, oh: state.h };
    const onMove = (ev: MouseEvent) => {
      const d = resizeRef.current;
      if (!d) return;
      onChange({
        ...state,
        w: Math.max(320, d.ow + (ev.clientX - d.startX)),
        h: Math.max(220, d.oh + (ev.clientY - d.startY)),
      });
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      className={`absolute border border-violet-200 bg-white ${state.fullscreen ? 'inset-0' : ''}`}
      style={
        state.fullscreen
          ? { zIndex }
          : { left: state.x, top: state.y, width: state.w, height: state.h, zIndex }
      }
      onMouseDown={onFocus}
    >
      <div
        className="flex items-center justify-between gap-2 border-b border-violet-100 px-2 py-1 bg-violet-50/40 cursor-move"
        onMouseDown={onHeaderMouseDown}
      >
        <div className="text-[11px] text-violet-800 truncate">{title}</div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="text-[10px] px-1.5 py-0.5 border border-violet-200 bg-white hover:bg-violet-50"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ ...state, collapsed: !state.collapsed });
            }}
          >
            {state.collapsed ? '展开' : '收起'}
          </button>
          <button
            type="button"
            className="text-[10px] px-1.5 py-0.5 border border-violet-200 bg-white hover:bg-violet-50"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ ...state, fullscreen: !state.fullscreen, collapsed: false });
            }}
          >
            {state.fullscreen ? '退出全屏' : '全屏'}
          </button>
        </div>
      </div>
      {!state.collapsed && (
        <iframe src={url} title={title} className="w-full h-[calc(100%-31px)] bg-white" />
      )}
      {!state.fullscreen && !state.collapsed && (
        <div
          className="absolute right-0 bottom-0 w-3 h-3 cursor-se-resize bg-violet-200"
          onMouseDown={onResizeMouseDown}
        />
      )}
    </div>
  );
}

function RightInfoPanel() {
  const [activeCard, setActiveCard] = useState<PanelCard>('graph');
  const [activeSection, setActiveSection] = useState<RightInfoSection>('graph');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreWrapRef = useRef<HTMLDivElement>(null);
  const prevAgentForPanelRef = useRef<AssistantAgent>('general');
  const [processTab, setProcessTab] = useState<'progress' | 'files'>('progress');
  const [selectedStageDetail, setSelectedStageDetail] = useState<'Plan' | 'Search' | 'Code' | 'Synthesize' | 'Critic' | null>(null);
  const [kbFavoritesTick, setKbFavoritesTick] = useState(0);
  const [kbLibraryList, setKbLibraryList] = useState<PersonalPdfMeta[]>([]);
  const [kbAssetGroup, setKbAssetGroup] = useState<'all' | 'favorites' | 'pdf' | 'assistant' | 'retrieval'>('all');
  const [editingTaskCard, setEditingTaskCard] = useState(false);
  /** 知识图谱视图左上角「研究筛选」面板是否展开 */
  const [researchFilterExpanded, setResearchFilterExpanded] = useState(true);
  /** 问题图谱（local_graph）SVG 缩放，1 = 默认 */
  const [localGraphZoom, setLocalGraphZoom] = useState(1);
  const [searchPreviewEngine, setSearchPreviewEngine] = useState<'scholar' | 'web'>('scholar');
  const [searchPreviewLayout, setSearchPreviewLayout] = useState<Record<string, PreviewWindowState>>({});
  const [searchPreviewZOrder, setSearchPreviewZOrder] = useState<string[]>([]);
  const clampLocalGraphZoom = (z: number) =>
    Math.min(2.5, Math.max(0.5, Math.round(z * 100) / 100));
  const [taskDraft, setTaskDraft] = useState({
    problemStatement: '',
    rqList: '',
    scopeInclude: '',
    scopeExclude: '',
    constraints: '',
    successCriteria: '',
  });
  const papers = useStore((s) => s.papers);
  const clusters = useStore((s) => s.clusters);
  const activeAgent = useStore((s) => s.activeAgent);
  const paperNotes = useStore((s) => s.paperNotes);
  const setPaperNote = useStore((s) => s.setPaperNote);
  const selectedPaperId = useStore((s) => s.selectedPaperId);
  const rightPanelCards = useStore((s) => s.rightPanelCards);
  const chatThreads = useStore((s) => s.chatThreads);
  const activeThreadId = useStore((s) => s.activeThreadId);
  const agentMode = useStore((s) => s.agentMode);
  const readingSession = useStore((s) => s.readingSession);
  const switchReadingStyle = useStore((s) => s.switchReadingStyle);
  const startReadingByIntent = useStore((s) => s.startReadingByIntent);
  const setReadingPaperMeta = useStore((s) => s.setReadingPaperMeta);
  const setActiveAgent = useStore((s) => s.setActiveAgent);
  const setRightPanelCards = useStore((s) => s.setRightPanelCards);
  const setPendingAutoAsk = useStore((s) => s.setPendingAutoAsk);
  const startPersonalKbTask = useStore((s) => s.startPersonalKbTask);
  const personalKbWorkbench = useStore((s) => s.personalKbWorkbench);
  const switchChatThread = useStore((s) => s.switchChatThread);
  const exitReadingToGeneral = useStore((s) => s.exitReadingToGeneral);
  const resumeSuspendedReading = useStore((s) => s.resumeSuspendedReading);
  const readingSuspendedSnapshot = useStore((s) => s.readingSuspendedSnapshot);
  const selectedAssistantMessageId = useStore((s) => s.selectedAssistantMessageId);
  const setActiveEvidence = useStore((s) => s.setActiveEvidence);
  const rightPanelFocusCard = useStore((s) => s.rightPanelFocusCard);
  const clearRightPanelFocus = useStore((s) => s.clearRightPanelFocus);
  const rightPanelFocusStage = useStore((s) => s.rightPanelFocusStage);
  const focusRightPanelStage = useStore((s) => s.focusRightPanelStage);
  const retrievalMeta = useStore((s) => s.retrievalPreviewMeta);
  const selectedPaper = useMemo(
    () => (selectedPaperId ? papers.find((p) => p.id === selectedPaperId) : null),
    [papers, selectedPaperId]
  );
  const writingOutline = useStore((s) => s.writingOutline);
  const writingDraft = useStore((s) => s.writingDraft);
  const setWritingOutput = useStore((s) => s.setWritingOutput);
  const writingTask = useStore((s) => s.writingTask);
  const writingMaterial = useStore((s) => s.writingMaterial);
  const literatureReviewDraft = useStore((s) => s.literatureReviewDraft);
  const setLiteratureReviewDraft = useStore((s) => s.setLiteratureReviewDraft);
  const agentRunState = useStore((s) => s.agentRunState);
  const researchTaskCard = useStore((s) => s.researchTaskCard);
  const setResearchTaskCard = useStore((s) => s.setResearchTaskCard);
  const setTaskCardLocked = useStore((s) => s.setTaskCardLocked);
  const discoveryCandidatePool = useStore((s) => s.discoveryCandidatePool);
  const discoveryEvidenceList = useStore((s) => s.discoveryEvidenceList);
  const discoveryTopicClusters = useStore((s) => s.discoveryTopicClusters);
  const relatedWork = useStore((s) => s.relatedWork);
  const kbFavorites = useMemo(() => loadFavorites(), [kbFavoritesTick]);
  const kbNotesCount = useMemo(() => Object.keys(paperNotes).length, [paperNotes]);
  const kbLibraryTotalBytes = useMemo(
    () => kbLibraryList.reduce((sum, x) => sum + (x.size || 0), 0),
    [kbLibraryList]
  );
  const kbGrowthSummary = useMemo(() => {
    const now = Date.now();
    const inDays = (ts: number, d: number) => now - ts <= d * 24 * 60 * 60 * 1000;
    const fav7 = kbFavorites.filter((x) => inDays(x.createdAt, 7)).length;
    const fav30 = kbFavorites.filter((x) => inDays(x.createdAt, 30)).length;
    const pdf7 = kbLibraryList.filter((x) => inDays(x.createdAt, 7)).length;
    const pdf30 = kbLibraryList.filter((x) => inDays(x.createdAt, 30)).length;
    return { fav7, fav30, pdf7, pdf30 };
  }, [kbFavorites, kbLibraryList]);
  const hasMessages = (chatThreads.find((t) => t.id === activeThreadId)?.messages.length ?? 0) > 0;
  const lastAssistantMessage = useMemo(
    () =>
      [...(chatThreads.find((t) => t.id === activeThreadId)?.messages ?? [])]
        .reverse()
        .find((m) => m.role === 'assistant' && m.content.trim())?.content ?? '',
    [chatThreads, activeThreadId]
  );
  const focusedAssistantMessage = useMemo(
    () =>
      (chatThreads.find((t) => t.id === activeThreadId)?.messages ?? []).find(
        (m) => m.role === 'assistant' && m.id === selectedAssistantMessageId
      ) ?? null,
    [chatThreads, activeThreadId, selectedAssistantMessageId]
  );
  /** 当前线程最后一条助手气泡（不要求已有思考内容，避免流式初期仍绑定上一条消息） */
  const lastAssistantBubble = useMemo(
    () =>
      [...(chatThreads.find((t) => t.id === activeThreadId)?.messages ?? [])]
        .reverse()
        .find((m) => m.role === 'assistant') ?? null,
    [chatThreads, activeThreadId]
  );
  const panelAssistantMessage = focusedAssistantMessage ?? lastAssistantBubble;
  const panelSnap = focusedAssistantMessage?.panelSnapshot ?? null;

  const effectiveReadingSession = useMemo(() => {
    if (!panelSnap?.reading) return readingSession;
    const r = panelSnap.reading;
    return {
      ...readingSession,
      goal: r.goal,
      nextQuestion: r.nextQuestion,
      lastAnswer: r.lastAnswer,
      evidenceRefs: r.evidenceRefs,
      toolTrace: r.toolTrace,
      reasoningTrace: r.reasoningTrace,
    };
  }, [panelSnap, readingSession]);

  const effectiveAgentRunState = useMemo(() => {
    if (!panelSnap?.agentRun) return agentRunState;
    const p = panelSnap.agentRun;
    return {
      ...agentRunState,
      ...p,
      thoughtTrace: p.thoughtTrace ?? agentRunState.thoughtTrace,
      toolTrace: p.toolTrace ?? agentRunState.toolTrace,
      stageDetails: p.stageDetails ?? agentRunState.stageDetails,
      timeline: p.timeline ?? agentRunState.timeline,
      thinkingNarrative: p.thinkingNarrative ?? agentRunState.thinkingNarrative,
    };
  }, [panelSnap, agentRunState]);

  const rightPanelCardsForPlan = useMemo(
    () => (panelSnap?.rightPanelCards?.length ? panelSnap.rightPanelCards : rightPanelCards),
    [panelSnap, rightPanelCards]
  );

  const effectiveDiscoveryCandidatePool = panelSnap?.discovery?.candidatePool ?? discoveryCandidatePool;
  const effectiveDiscoveryEvidenceList = panelSnap?.discovery?.evidenceList ?? discoveryEvidenceList;
  const effectiveDiscoveryTopicClusters = panelSnap?.discovery?.topicClusters ?? discoveryTopicClusters;
  const effectiveRelatedWork = panelSnap?.relatedWork ?? relatedWork;
  const effectiveResearchTaskCard = panelSnap?.researchTaskCard ?? researchTaskCard;
  const effectiveRetrievalMeta = panelSnap?.retrievalMeta ?? retrievalMeta;
  const effectiveWritingOutline = panelSnap?.writingOutline ?? writingOutline;
  const effectiveWritingDraft = panelSnap?.writingDraft ?? writingDraft;
  const effectiveLiteratureReviewDraft = panelSnap?.literatureReviewDraft ?? literatureReviewDraft;
  const effectivePersonalKbWorkbench = panelSnap?.personalKbWorkbench ?? personalKbWorkbench;

  const kbAssistantOutputs = useMemo(() => {
    const rows: Array<{ id: string; title: string; preview: string; updatedAt: number }> = [];
    if (effectiveLiteratureReviewDraft.trim()) {
      rows.push({
        id: 'lit-draft',
        title: '综述成稿',
        preview: effectiveLiteratureReviewDraft.replace(/\s+/g, ' ').slice(0, 160),
        updatedAt: effectiveRelatedWork.updatedAt || Date.now(),
      });
    }
    if (effectiveWritingDraft.trim()) {
      rows.push({
        id: 'writing-draft',
        title: '写作草稿',
        preview: effectiveWritingDraft.replace(/\s+/g, ' ').slice(0, 160),
        updatedAt: effectiveAgentRunState.endedAt || Date.now(),
      });
    }
    if (effectiveRelatedWork.summary.trim()) {
      rows.push({
        id: 'related-summary',
        title: 'Related Work 摘要',
        preview: effectiveRelatedWork.summary.replace(/\s+/g, ' ').slice(0, 160),
        updatedAt: effectiveRelatedWork.updatedAt || Date.now(),
      });
    }
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [
    effectiveLiteratureReviewDraft,
    effectiveWritingDraft,
    effectiveRelatedWork.summary,
    effectiveRelatedWork.updatedAt,
    effectiveAgentRunState.endedAt,
  ]);
  const kbRetrievalAssets = useMemo(
    () =>
      effectiveDiscoveryCandidatePool.map((x, i) => ({
        id: `${i}-${x.title}`,
        title: x.title,
        source: x.source,
        credibility: x.credibility,
      })),
    [effectiveDiscoveryCandidatePool]
  );
  const kbRecentFocus = useMemo(() => {
    const fromClusters = effectiveDiscoveryTopicClusters.slice(0, 6);
    const fromRelated = effectiveRelatedWork.items
      .slice(0, 4)
      .map((x) => x.title)
      .filter(Boolean);
    const merged = [...fromClusters, ...fromRelated];
    return [...new Set(merged)].slice(0, 8);
  }, [effectiveDiscoveryTopicClusters, effectiveRelatedWork.items]);

  const visibleCards: PanelCard[] = useMemo(() => {
    const base: PanelCard[] = hasMessages
      ? (rightPanelCardsForPlan as PanelCard[])
      : activeAgent === 'personal_kb'
        ? ([...PERSONAL_KB_RIGHT_PANELS] as PanelCard[])
        : (['graph'] as PanelCard[]);
    return planRightPanelCards({
      uiComplexity: 'minimal',
      baseCards: base,
      hasMessages,
      activeAgent,
      generalAssistantRunning:
        activeAgent === 'general' &&
        effectiveAgentRunState.agent === 'general' &&
        effectiveAgentRunState.status === 'running',
      orchestratorStageDetailCount: effectiveAgentRunState.stageDetails?.length ?? 0,
      selectedPaperId,
      readingSession: effectiveReadingSession,
      researchTaskCard: effectiveResearchTaskCard,
      discoveryCandidateCount: effectiveDiscoveryCandidatePool.length,
      discoveryTopicClusterCount: effectiveDiscoveryTopicClusters.length,
      relatedWork: effectiveRelatedWork,
      literatureReviewDraft: effectiveLiteratureReviewDraft,
      writingTask,
      writingMaterial,
      writingOutlineCount: effectiveWritingOutline.length,
      writingDraft: effectiveWritingDraft,
      personalKbWorkbench: effectivePersonalKbWorkbench,
      activeThreadId,
      hasSearchPreview: Boolean(
        effectiveRetrievalMeta?.queries?.length || effectiveRetrievalMeta?.keywords?.length
      ),
    });
  }, [
    hasMessages,
    rightPanelCardsForPlan,
    activeAgent,
    effectiveAgentRunState.agent,
    effectiveAgentRunState.status,
    effectiveAgentRunState.stageDetails?.length,
    selectedPaperId,
    effectiveReadingSession,
    effectiveResearchTaskCard,
    effectiveDiscoveryCandidatePool.length,
    effectiveDiscoveryTopicClusters.length,
    effectiveRelatedWork,
    effectiveLiteratureReviewDraft,
    writingTask,
    writingMaterial,
    effectiveWritingOutline.length,
    effectiveWritingDraft,
    effectivePersonalKbWorkbench,
    activeThreadId,
    effectiveRetrievalMeta?.queries?.length,
    effectiveRetrievalMeta?.keywords?.length,
  ]);
  const displayedCard = visibleCards.includes(activeCard)
    ? activeCard
    : (visibleCards[0] ?? 'graph');
  const sectionCards = useMemo(() => {
    const graph = visibleCards.filter((c) => c === 'graph');
    /** 检索与执行过程：文献候选、相关工作、搜索预览、子 Agent / 推理轨迹（不出现在「文档产物」分组） */
    const retrieval = visibleCards.filter(
      (c) =>
        c === 'candidate' ||
        c === 'related_work' ||
        c === 'web_search' ||
        c === 'tools' ||
        c === 'reasoning'
    );
    const docs = visibleCards.filter(
      (c) =>
        c !== 'graph' &&
        c !== 'candidate' &&
        c !== 'related_work' &&
        c !== 'web_search' &&
        c !== 'tools' &&
        c !== 'reasoning'
    );
    return {
      graph,
      retrieval,
      docs,
    } as Record<RightInfoSection, PanelCard[]>;
  }, [visibleCards]);
  const isReadingSideLayout = agentMode.startsWith('reading') || activeAgent === 'reading';
  const showRightReadingToolbar = agentMode.startsWith('reading');
  const showRightSuspendedReading =
    Boolean(
      readingSuspendedSnapshot &&
        readingSuspendedSnapshot.threadId === activeThreadId &&
        !agentMode.startsWith('reading')
    );
  const readingPrimaryVisible = useMemo(
    () => READING_TAB_PRIMARY.filter((id) => (visibleCards as string[]).includes(id)),
    [visibleCards]
  );
  const readingMoreVisible = useMemo(
    () => READING_TAB_MORE.filter((id) => (visibleCards as string[]).includes(id)),
    [visibleCards]
  );
  const moreContainsActive =
    isReadingSideLayout &&
    readingMoreVisible.includes(displayedCard as RightPanelCard);
  const noteStorageKey = getPaperNoteStorageKey(selectedPaperId, effectiveReadingSession);
  const noteBody = noteStorageKey ? paperNotes[noteStorageKey] ?? '' : '';
  const clusterLabelForMind =
    selectedPaper && clusters.length
      ? clusters.find((c) => c.id === selectedPaper.clusterId)?.name
      : undefined;

  /** tools 侧栏卡：优先显示「当前选中回复」的思考；若无则回退到 run 快照 / readingSession */
  const reasoningDisplayLines = useMemo(() => {
    const msgTrace = panelAssistantMessage?.thinkingTrace ?? [];
    if (msgTrace.length > 0) return sanitizeThoughtLinesForUser(msgTrace);
    if (panelSnap?.agentRun?.thoughtTrace?.length) {
      return sanitizeThoughtLinesForUser(panelSnap.agentRun.thoughtTrace);
    }
    if (panelSnap?.reading?.reasoningTrace?.length) {
      return sanitizeThoughtLinesForUser(panelSnap.reading.reasoningTrace);
    }
    const th = agentRunState.thoughtTrace;
    const raw =
      th && th.length > 0
        ? th
        : readingSession.reasoningTrace?.length
          ? readingSession.reasoningTrace
          : [];
    return sanitizeThoughtLinesForUser(raw);
  }, [panelAssistantMessage, panelSnap, agentRunState.thoughtTrace, readingSession.reasoningTrace]);
  const prioritizedReasoningLines = useMemo(() => {
    const debugLike: string[] = [];
    const core: string[] = [];
    for (const line of reasoningDisplayLines) {
      if (/(debug|诊断|raw|json|http|tool|trace|fallback|output)/i.test(line)) debugLike.push(line);
      else core.push(line);
    }
    return { core, debugLike };
  }, [reasoningDisplayLines]);
  const stageDetails = effectiveAgentRunState.stageDetails ?? [];
  // 统一弱化卡片边框，改为分割线分组，减少“气泡框”感
  const panelCardCls = 'border-t border-violet-200/70 pt-2';
  const panelGapCls = 'p-3 space-y-2';

  const mergedToolTraceForPanel = useMemo(() => {
    if (panelSnap) {
      if (panelSnap.agentRun?.toolTrace && panelSnap.agentRun.toolTrace.length > 0) {
        return panelSnap.agentRun.toolTrace;
      }
      if (panelSnap.reading?.toolTrace && panelSnap.reading.toolTrace.length > 0) {
        return panelSnap.reading.toolTrace;
      }
      /* 快照里尚未写入工具轨迹时，仍跟随后台 store（避免侧栏空白） */
    }
    if (agentRunState.toolTrace && agentRunState.toolTrace.length > 0) return agentRunState.toolTrace;
    return readingSession.toolTrace ?? [];
  }, [panelSnap, agentRunState.toolTrace, readingSession.toolTrace]);

  /** 阅读助手 MCP 产生的可点击链接（用于「文件」页签；与 Discovery 候选池独立） */
  const readingSidecarFiles = useMemo(() => {
    if (effectiveAgentRunState.agent !== 'reading') return [];
    const rows: { title: string; url: string }[] = [];
    for (const t of mergedToolTraceForPanel) {
      const dbg = t.debug;
      const req = dbg?.request as { url?: string } | undefined;
      if (t.tool === 'web_fetch' && req?.url) {
        rows.push({
          title: `抓取 ${req.url.slice(0, 72)}${req.url.length > 72 ? '…' : ''}`,
          url: req.url,
        });
      }
      if (dbg?.resultHitUrls?.length) {
        dbg.resultHitUrls.slice(0, 14).forEach((u, i) => {
          rows.push({ title: `检索命中 ${i + 1}`, url: u });
        });
      }
    }
    return rows;
  }, [effectiveAgentRunState.agent, mergedToolTraceForPanel]);

  /** 与气泡内 suggestedFollowUps 一致；无则回退阅读会话的 nextQuestion（拆条） */
  const unifiedSuggestedFollowUps = useMemo(() => {
    const fromMsg = panelAssistantMessage?.suggestedFollowUps;
    if (fromMsg?.length) return fromMsg;
    if (effectiveReadingSession.nextQuestion?.trim()) {
      return parseFollowUpChips(effectiveReadingSession.nextQuestion);
    }
    return [];
  }, [panelAssistantMessage?.suggestedFollowUps, effectiveReadingSession.nextQuestion]);

  const followUpChipCls =
    'text-left max-w-full px-2.5 py-1 rounded-full text-[12px] border border-violet-200 bg-white text-violet-800 hover:bg-violet-50 hover:border-violet-300 transition-colors';

  const toolsPanelReplyExcerpt = useMemo(
    () =>
      (focusedAssistantMessage?.content?.trim()
        ? focusedAssistantMessage.content
        : lastAssistantMessage) || '',
    [focusedAssistantMessage, lastAssistantMessage]
  );

  useEffect(() => {
    const onFav = () => setKbFavoritesTick((x) => x + 1);
    window.addEventListener('research_map2-favorites-changed', onFav);
    return () => window.removeEventListener('research_map2-favorites-changed', onFav);
  }, []);

  useEffect(() => {
    void listPersonalPdfs().then(setKbLibraryList);
    const onLib = () => void listPersonalPdfs().then(setKbLibraryList);
    window.addEventListener(PERSONAL_PDFS_CHANGED_EVENT, onLib);
    return () => window.removeEventListener(PERSONAL_PDFS_CHANGED_EVENT, onLib);
  }, []);

  useEffect(() => {
    const first = (visibleCards[0] as PanelCard | undefined) ?? 'graph';
    setActiveCard((prev) => (visibleCards.includes(prev) ? prev : first));
  }, [activeThreadId, visibleCards]);

  useEffect(() => {
    const inSection = (card: PanelCard, s: RightInfoSection) => sectionCards[s].includes(card);
    const nextSection: RightInfoSection = inSection(displayedCard, 'graph')
      ? 'graph'
      : inSection(displayedCard, 'retrieval')
        ? 'retrieval'
        : 'docs';
    if (nextSection !== activeSection) setActiveSection(nextSection);
  }, [displayedCard, sectionCards, activeSection]);

  useEffect(() => {
    if (!rightPanelFocusCard) return;
    if (!visibleCards.includes(rightPanelFocusCard as PanelCard)) {
      clearRightPanelFocus();
      return;
    }
    setActiveCard(rightPanelFocusCard as PanelCard);
    setActiveSection(
      rightPanelFocusCard === 'graph'
        ? 'graph'
        : rightPanelFocusCard === 'candidate' ||
            rightPanelFocusCard === 'related_work' ||
            rightPanelFocusCard === 'web_search' ||
            rightPanelFocusCard === 'tools' ||
            rightPanelFocusCard === 'reasoning'
          ? 'retrieval'
          : 'docs'
    );
    clearRightPanelFocus();
  }, [rightPanelFocusCard, visibleCards, clearRightPanelFocus]);

  useEffect(() => {
    if (!rightPanelFocusStage) return;
    setSelectedStageDetail(rightPanelFocusStage);
    focusRightPanelStage(null);
  }, [rightPanelFocusStage, focusRightPanelStage]);

  useEffect(() => {
    setSelectedStageDetail(null);
  }, [selectedAssistantMessageId]);

  /** 从自由研究/写作切回阅读助手时，避免仍停留在「知识图谱」标签导致看不到论文/证据等 */
  useEffect(() => {
    if (prevAgentForPanelRef.current !== 'reading' && activeAgent === 'reading') {
      const first =
        READING_TAB_PRIMARY.find((c) => (visibleCards as string[]).includes(c)) ?? 'graph';
      setActiveCard(first);
    }
    if (prevAgentForPanelRef.current !== 'literature_review' && activeAgent === 'literature_review') {
      const first =
        LITERATURE_REVIEW_PANELS.find((c) => (visibleCards as string[]).includes(c)) ?? 'graph';
      setActiveCard(first);
    }
    if (prevAgentForPanelRef.current !== 'personal_kb' && activeAgent === 'personal_kb') {
      const first =
        (PERSONAL_KB_RIGHT_PANELS as string[]).find((c) => (visibleCards as string[]).includes(c)) ??
        'graph';
      setActiveCard(first as PanelCard);
    }
    prevAgentForPanelRef.current = activeAgent;
  }, [activeAgent, visibleCards]);

  // 不再自动抢占用户手动选择的卡片（如从检索切到文档产物）

  useEffect(() => {
    if (!personalKbWorkbench || personalKbWorkbench.threadId !== activeThreadId) return;
    if (activeAgent !== 'personal_kb') return;
    const cards = useStore.getState().rightPanelCards;
    if (!cards.includes('kb_result')) return;
    setActiveCard('kb_result');
  }, [personalKbWorkbench?.updatedAt, personalKbWorkbench?.threadId, activeThreadId, activeAgent]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreWrapRef.current && !moreWrapRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [moreMenuOpen]);

  const tabButtonClass = (id: PanelCard) =>
    `px-2.5 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 border ${
      displayedCard === id
        ? 'bg-violet-600 text-white border-violet-600'
        : 'text-violet-800 border-transparent hover:bg-violet-100 hover:border-violet-100'
    }`;

  const cardLabels: Record<PanelCard, string> = {
    paper: '论文展示',
    guide: '学习引导',
    evidence: '证据回链',
    kb_assets: '知识资产',
    kb_result: '任务结果',
    tools: '思考过程',
    reasoning: '思考过程',
    graph: '知识图谱',
    mindmap: '思维导图',
    notes: '笔记',
    candidate: '候选文献池',
    web_search: 'Web 搜索预览',
    local_graph: '问题图谱',
    related_work: '相关工作',
    task: '任务卡',
    material: '写作素材',
    outline: '写作提纲',
    draft: '写作草稿',
    lit_main: '综述成稿',
    lit_citations: '引用追踪',
    lit_evidence: '证据追踪',
    lit_outline: '大纲与框架',
    lit_edit: '修改与润色',
  };

  const openCandidateInReading = (item: { title?: string; url?: string; source?: string }) => {
    const target = resolveUrl(item.source, item.url);
    if (!target) return;
    setActiveAgent('reading');
    startReadingByIntent(target);
    setReadingPaperMeta({ paperTitle: item.title || '候选文献', sourceValue: target });
    setRightPanelCards([...READING_RIGHT_PANEL_FULL]);
    setActiveCard('paper');
    setPendingAutoAsk(`请详细解读该文的方法、数据、指标与局限：${item.title || '这篇文献'}。`);
  };
  const searchPreviewQuery = (
    effectiveRetrievalMeta?.queries?.[0] || effectiveRetrievalMeta?.keywords?.join(' ') || ''
  ).trim();
  const searchPreviewUrl = searchPreviewQuery
    ? searchPreviewEngine === 'scholar'
      ? `https://scholar.google.com/scholar?q=${encodeURIComponent(searchPreviewQuery)}`
      : `https://www.google.com/search?q=${encodeURIComponent(searchPreviewQuery)}`
    : '';
  const previewWindows = useMemo(() => {
    const rows: Array<{ key: string; title: string; url: string }> = [];
    if (searchPreviewUrl) {
      rows.push({
        key: searchPreviewEngine === 'scholar' ? 'scholar' : 'web',
        title: searchPreviewEngine === 'scholar' ? 'Scholar 预览' : 'Web 预览',
        url: searchPreviewUrl,
      });
    }
    const seen = new Set<string>(rows.map((r) => r.url));
    for (const item of mergedToolTraceForPanel) {
      const links = item.debug?.comparableBrowserSearchUrls ?? [];
      for (const u of links) {
        if (!u || seen.has(u)) continue;
        seen.add(u);
        rows.push({ key: `open-${rows.length}`, title: 'OpenSearch 预览', url: u });
      }
      const hit = item.debug?.resultHitUrls?.[0];
      if (hit && !seen.has(hit)) {
        seen.add(hit);
        rows.push({ key: `hit-${rows.length}`, title: '命中文章预览', url: hit });
      }
      if (rows.length >= 4) break;
    }
    return rows;
  }, [searchPreviewUrl, searchPreviewEngine, mergedToolTraceForPanel]);

  useEffect(() => {
    if (previewWindows.length === 0) {
      setSearchPreviewLayout({});
      setSearchPreviewZOrder([]);
      return;
    }
    setSearchPreviewLayout((prev) => {
      const next: Record<string, PreviewWindowState> = {};
      previewWindows.forEach((w, i) => {
        next[w.key] =
          prev[w.key] ?? {
            x: i * 18,
            y: i * 18,
            w: 720,
            h: 520,
            collapsed: false,
            fullscreen: i === 0,
          };
      });
      return next;
    });
    setSearchPreviewZOrder((prev) => {
      const kept = prev.filter((k) => previewWindows.some((w) => w.key === k));
      const missing = previewWindows.map((w) => w.key).filter((k) => !kept.includes(k));
      return [...kept, ...missing];
    });
  }, [previewWindows]);

  const localGraph = useMemo(() => {
    const center = {
      id: 'center',
      label: effectiveResearchTaskCard.problemStatement || '当前研究问题',
      type: 'center' as const,
      x: 420,
      y: 230,
    };
    const rqs = effectiveResearchTaskCard.rqList.slice(0, 4).map((rq, i) => {
      const angle =
        (-90 + i * (360 / Math.max(1, effectiveResearchTaskCard.rqList.slice(0, 4).length))) * Math.PI / 180;
      return {
        id: `rq-${i}`,
        label: `RQ${i + 1}`,
        full: rq,
        type: 'rq' as const,
        x: center.x + 170 * Math.cos(angle),
        y: center.y + 120 * Math.sin(angle),
      };
    });
    const clusters = effectiveDiscoveryTopicClusters.slice(0, 6).map((name, i) => {
      const angle =
        (-90 + i * (360 / Math.max(1, effectiveDiscoveryTopicClusters.slice(0, 6).length))) * Math.PI / 180;
      return {
        id: `cluster-${i}`,
        label: `C${i + 1}`,
        full: name,
        type: 'cluster' as const,
        x: center.x + 290 * Math.cos(angle),
        y: center.y + 180 * Math.sin(angle),
      };
    });
    const papers = effectiveDiscoveryCandidatePool.slice(0, 10).map((p, i) => {
      const angle =
        (-90 + i * (360 / Math.max(1, effectiveDiscoveryCandidatePool.slice(0, 10).length))) * Math.PI / 180;
      return {
        id: `paper-${i}`,
        label: `${i + 1}`,
        full: p.title,
        item: p,
        type: 'paper' as const,
        x: center.x + 390 * Math.cos(angle),
        y: center.y + 230 * Math.sin(angle),
      };
    });
    const links: Array<{ from: string; to: string }> = [];
    for (const rq of rqs) links.push({ from: center.id, to: rq.id });
    for (let i = 0; i < clusters.length; i++) {
      const rq = rqs[i % Math.max(1, rqs.length)];
      if (rq) links.push({ from: rq.id, to: clusters[i].id });
    }
    for (let i = 0; i < papers.length; i++) {
      const c = clusters[i % Math.max(1, clusters.length)];
      if (c) links.push({ from: c.id, to: papers[i].id });
    }
    const nodes = [center, ...rqs, ...clusters, ...papers];
    return { nodes, links };
  }, [
    effectiveResearchTaskCard.problemStatement,
    effectiveResearchTaskCard.rqList,
    effectiveDiscoveryTopicClusters,
    effectiveDiscoveryCandidatePool,
  ]);


  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-violet-100 bg-white/90">
        {agentMode.startsWith('reading') && (
          <div className="flex flex-wrap items-center justify-end gap-1">
            <button
              className="px-2 py-1 rounded text-[11px] border border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
              onClick={() => exitReadingToGeneral()}
            >
              返回通用
            </button>
            <button
              className={`px-2 py-1 rounded text-[11px] border ${
                readingSession.style === 'guided'
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50'
              }`}
              onClick={() => switchReadingStyle('guided')}
            >
              引导
            </button>
            <button
              className={`px-2 py-1 rounded text-[11px] border ${
                readingSession.style === 'direct'
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50'
              }`}
              onClick={() => switchReadingStyle('direct')}
            >
              直答
            </button>
          </div>
        )}
        {readingSuspendedSnapshot &&
          readingSuspendedSnapshot.threadId === activeThreadId &&
          !agentMode.startsWith('reading') && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-2">
              <span className="text-[11px] text-violet-700 min-w-0 truncate">
                已暂存阅读视图：
                <span className="text-violet-950 font-medium">
                  {readingSuspendedSnapshot.readingSession.paperTitle?.trim() || '当前会话'}
                </span>
              </span>
              <button
                type="button"
                className="shrink-0 px-2.5 py-1 rounded text-[11px] bg-violet-600 text-white hover:bg-violet-700"
                onClick={() => resumeSuspendedReading()}
              >
                恢复阅读
              </button>
            </div>
          )}
        {/* 单行标签：按侧栏规划顺序展示全部可见卡片，避免「分区 + 子 Tab」两行导航 */}
        <div
          className={`flex items-center gap-1.5 min-w-0 ${showRightReadingToolbar || showRightSuspendedReading ? 'mt-2' : 'mt-0'}`}
        >
          {hasMessages && isReadingSideLayout && readingPrimaryVisible.length > 0 ? (
            <>
              <div className="flex min-w-0 flex-1 flex-nowrap gap-1.5 overflow-x-auto whitespace-nowrap items-center">
                {readingPrimaryVisible.map((card) => (
                  <button
                    key={card}
                    className={tabButtonClass(card)}
                    onClick={() => {
                      setActiveCard(card);
                      setMoreMenuOpen(false);
                    }}
                  >
                    {cardLabels[card]}
                  </button>
                ))}
              </div>
              {readingMoreVisible.length > 0 && (
                <div className="relative shrink-0 self-center" ref={moreWrapRef}>
                  <button
                    type="button"
                    className={`px-2.5 py-1.5 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                      moreContainsActive
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'text-violet-700 border-violet-200 bg-white hover:bg-violet-50'
                    }`}
                    onClick={() => setMoreMenuOpen((v) => !v)}
                  >
                    更多{moreMenuOpen ? ' ▲' : ' ▼'}
                  </button>
                  {moreMenuOpen && (
                    <div className="absolute right-0 top-full z-[100] mt-1 min-w-[10rem] rounded-md border border-violet-200 bg-white py-1 shadow-lg">
                      {readingMoreVisible.map((card) => (
                        <button
                          key={card}
                          type="button"
                          className={`w-full text-left px-3 py-2 text-xs ${
                            displayedCard === card
                              ? 'bg-violet-100 text-violet-950'
                              : 'text-violet-800 hover:bg-violet-50'
                          }`}
                          onClick={() => {
                            setActiveCard(card);
                            setMoreMenuOpen(false);
                          }}
                        >
                          {cardLabels[card]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex w-full flex-nowrap gap-1.5 overflow-x-auto whitespace-nowrap items-center">
              {visibleCards.map((card) => (
                <button
                  key={card}
                  className={tabButtonClass(card)}
                  onClick={() => setActiveCard(card)}
                >
                  {cardLabels[card]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden bg-violet-50/50">
        {(hasMessages ? displayedCard : 'graph') === 'paper' && (
          <div className="h-full flex flex-col min-h-0">
            <div className="px-4 py-2 text-[11px] text-violet-600 border-b border-violet-100 bg-white/80">
              {selectedPaper
                ? '已选择论文，支持继续追问与摘要拆解。'
                : '请在侧栏「更多 → 知识图谱」中点击节点，或从阅读助手打开文献。'}
            </div>
            <DetailPanel />
          </div>
        )}

        {(hasMessages ? displayedCard : 'graph') === 'guide' && (
          <div className={`h-full overflow-y-auto ${panelGapCls}`}>
            <section className={panelCardCls}>
              <div className="text-xs font-medium text-violet-900">阅读目标</div>
              <div className="mt-2 text-xs text-violet-700 leading-relaxed">
                {effectiveReadingSession.goal || '尚未明确。建议先说明你要重点理解：研究问题、方法、实验，还是复现路径。'}
              </div>
            </section>
            <section className={panelCardCls}>
              <div className="text-xs font-medium text-violet-900">下一步提问建议</div>
              <div className="text-[11px] text-violet-500 mt-0.5">与对话气泡下方一致，点击即发送</div>
              {unifiedSuggestedFollowUps.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {unifiedSuggestedFollowUps.map((s, i) => (
                    <button
                      key={`guide-fu-${i}-${s.slice(0, 20)}`}
                      type="button"
                      className={followUpChipCls}
                      onClick={() => setPendingAutoAsk(s)}
                    >
                      {s.length > 100 ? `${s.slice(0, 97)}…` : s}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-xs text-violet-700 leading-relaxed">
                  等待本轮助手给出建议；通用/综述/知识库答复后也会显示在这里。
                </div>
              )}
            </section>
          </div>
        )}

        {(hasMessages ? displayedCard : 'graph') === 'evidence' && (
          <div className={`h-full overflow-y-auto ${panelGapCls}`}>
            {effectiveReadingSession.evidenceRefs.length === 0 ? (
              <div className="text-xs text-violet-700">暂无证据锚点，发送问题后会展示可追溯片段。</div>
            ) : (
              effectiveReadingSession.evidenceRefs.map((ev) => (
                <button
                  type="button"
                  key={ev.id}
                  className={`w-full text-left ${panelCardCls} hover:bg-violet-50 transition-colors`}
                  onClick={() => {
                    setActiveEvidence(ev.id);
                    setActiveCard('paper');
                  }}
                >
                  <div className="text-xs font-medium text-violet-900">{ev.label}</div>
                  <div className="mt-2 text-xs text-violet-700 leading-relaxed">{ev.snippet}</div>
                  {typeof ev.page === 'number' && (
                    <div className="mt-2 text-[11px] text-violet-500">跳转页码: {ev.page}</div>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {(hasMessages ? displayedCard : 'graph') === 'graph' && (
          <div className="h-full flex flex-col min-h-0">
            <div className="px-4 py-2 border-b border-violet-100 bg-violet-50/50 shrink-0">
              <div className="text-[11px] text-violet-700">
                知识图谱 · 全库论文 3D 分布；左上「研究筛选」可收起，展开后可调年份与聚类；顶栏搜索与右上角检索框联动。
              </div>
            </div>
            <div className="relative flex-1 min-h-0">
              {researchFilterExpanded ? (
                <div className="absolute top-3 left-3 z-20 w-[min(92%,300px)] max-h-[min(88%,460px)] overflow-y-auto rounded-xl border border-violet-200 bg-white/95 shadow-lg backdrop-blur-sm">
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-violet-50 border-b border-violet-100 px-3 py-2">
                    <span className="text-xs font-semibold text-violet-800">研究筛选</span>
                    <button
                      type="button"
                      className="text-[11px] px-2 py-0.5 rounded-md border border-violet-200 bg-white text-violet-700 hover:bg-violet-100 shrink-0"
                      onClick={() => setResearchFilterExpanded(false)}
                    >
                      收起
                    </button>
                  </div>
                  <ClusterPanel />
                </div>
              ) : (
                <button
                  type="button"
                  className="absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-xl border border-violet-200 bg-white/95 px-3 py-2 text-xs font-semibold text-violet-800 shadow-lg backdrop-blur-sm hover:bg-violet-50"
                  onClick={() => setResearchFilterExpanded(true)}
                  title="展开研究筛选"
                >
                  <span>研究筛选</span>
                  <span className="text-violet-500" aria-hidden>
                    ▼
                  </span>
                </button>
              )}
              <PointCloud />
            </div>
          </div>
        )}

        {(hasMessages ? displayedCard : 'graph') === 'mindmap' && (
          <ReadingMindmapPanel
            paper={selectedPaper ?? null}
            readingSession={effectiveReadingSession}
            clusterLabel={clusterLabelForMind}
          />
        )}

        {(hasMessages ? displayedCard : 'graph') === 'notes' && (
          <PaperNotesPanel
            noteKey={noteStorageKey}
            noteText={noteBody}
            onChange={(text) => !panelSnap && noteStorageKey && setPaperNote(noteStorageKey, text)}
            paperTitle={selectedPaper?.title || effectiveReadingSession.paperTitle || ''}
          />
        )}

        {(hasMessages ? displayedCard : 'graph') === 'tools' && (
          <div className={`h-full overflow-y-auto ${panelGapCls}`}>
            {unifiedSuggestedFollowUps.length > 0 && (
              <details open className={panelCardCls}>
                <summary className="cursor-pointer text-xs font-medium text-violet-900">下一步提问建议</summary>
                <div className="text-[11px] text-violet-500 mt-0.5">与主对话气泡下方芯片同源，点击填入并发送</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {unifiedSuggestedFollowUps.map((s, i) => (
                    <button
                      key={`tools-fu-${i}-${s.slice(0, 20)}`}
                      type="button"
                      className={followUpChipCls}
                      onClick={() => setPendingAutoAsk(s)}
                    >
                      {s.length > 100 ? `${s.slice(0, 97)}…` : s}
                    </button>
                  ))}
                </div>
              </details>
            )}
            {(panelAssistantMessage?.thinkingNarrative?.trim() ||
              effectiveAgentRunState.thinkingNarrative?.trim()) && (
              <details open className={`${panelCardCls} border-violet-300 bg-violet-50/80`}>
                <summary className="cursor-pointer text-xs font-medium text-violet-800">长文规划思考</summary>
                <div className="mt-2 text-xs text-violet-700 leading-relaxed space-y-3 whitespace-pre-wrap">
                  {(panelAssistantMessage?.thinkingNarrative || effectiveAgentRunState.thinkingNarrative || '')
                    .trim()
                    .split(/\n{2,}/)
                    .filter(Boolean)
                    .map((p, i) => (
                      <p key={i}>{p.trim()}</p>
                    ))}
                </div>
              </details>
            )}
            <details open className={panelCardCls}>
              <summary className="cursor-pointer text-xs font-medium text-violet-900">推理步骤（高优先）</summary>
              <div className="mt-2 space-y-1">
                {prioritizedReasoningLines.core.length > 0 ? (
                  prioritizedReasoningLines.core.map((x, i) => (
                    <div key={`${i}-${x}`} className="text-xs text-violet-700">{i + 1}. {x}</div>
                  ))
                ) : (
                  <div className="text-xs text-violet-700">
                    {mergedToolTraceForPanel.length > 0
                      ? '本轮未返回分步推理文案；详见下方工具轨迹或主对话答复。'
                      : '暂无推理记录。发送问题后，模型返回的 reasoningTrace 会显示在这里。'}
                  </div>
                )}
              </div>
            </details>
            {(mergedToolTraceForPanel.length > 0 || prioritizedReasoningLines.debugLike.length > 0) && (
              <details className={panelCardCls}>
                <summary className="cursor-pointer text-xs font-medium text-violet-900">
                  高级信息（调试思考与工具轨迹）
                </summary>
                {prioritizedReasoningLines.debugLike.length > 0 && (
                  <div className="mt-2 space-y-1 border-b border-violet-100 pb-2">
                    <div className="text-[11px] font-medium text-violet-800">调试类思考</div>
                    {prioritizedReasoningLines.debugLike.map((x, i) => (
                      <div key={`${i}-${x}`} className="text-xs text-violet-700">
                        {i + 1}. {x}
                      </div>
                    ))}
                  </div>
                )}
                {effectiveAgentRunState.agent ? (
                  <div className="text-[11px] text-violet-600 mt-1">
                    当前进程：{effectiveAgentRunState.agent} · {effectiveAgentRunState.status}
                    {effectiveAgentRunState.status === 'running' ? '（生成中时可刷新下方轨迹）' : ''}
                  </div>
                ) : null}
                <div className="mt-2 space-y-2">
                  {mergedToolTraceForPanel.map((item) => (
                    <div key={item.id} className="text-xs text-violet-700 rounded border border-violet-100 p-2">
                      <div className="text-violet-900 font-medium">{item.tool} · {item.status}</div>
                      <div className="mt-1 leading-relaxed">{item.summary}</div>
                      {item.debug && (
                        <details className="mt-2 border-t border-violet-100 pt-2">
                          <summary className="cursor-pointer text-violet-800 font-medium select-none">
                            调试：{item.debug.provider} · 请求与原始响应片段
                          </summary>
                          <div className="mt-1 space-y-1">
                            {item.debug.notes && item.debug.notes.length > 0 && (
                              <ul className="list-disc pl-4 text-[11px] text-violet-600">
                                {item.debug.notes.map((n, j) => (
                                  <li key={j}>{n}</li>
                                ))}
                              </ul>
                            )}
                            <div className="text-[11px] text-violet-800 font-medium">request（已脱敏）</div>
                            <pre className="text-[10px] leading-snug whitespace-pre-wrap break-all max-h-40 overflow-y-auto bg-violet-50/80 rounded p-1.5 border border-violet-100">
                              {JSON.stringify(item.debug.request, null, 2)}
                            </pre>
                            {item.debug.comparableBrowserSearchUrls && item.debug.comparableBrowserSearchUrls.length > 0 && (
                              <div className="mt-1">
                                <div className="text-[11px] text-violet-800 font-medium">浏览器对照（网页版搜索，排序可能与工具不一致）</div>
                                <ul className="list-disc pl-4 text-[10px] space-y-0.5">
                                  {item.debug.comparableBrowserSearchUrls.map((u, j) => (
                                    <li key={j}>
                                      <a href={u} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline break-all">
                                        {u}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {item.debug.resultHitUrls && item.debug.resultHitUrls.length > 0 && (
                              <div className="mt-1">
                                <div className="text-[11px] text-violet-800 font-medium">本次返回的落地页 URL</div>
                                <ul className="list-disc pl-4 text-[10px] max-h-32 overflow-y-auto space-y-0.5">
                                  {item.debug.resultHitUrls.map((u, j) => (
                                    <li key={j}>
                                      <a href={u} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline break-all">
                                        {u}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {item.debug.rawResponsePreview && (
                              <>
                                <div className="text-[11px] text-violet-800 font-medium mt-1">rawResponsePreview</div>
                                <pre className="text-[10px] leading-snug whitespace-pre-wrap break-all max-h-64 overflow-y-auto bg-slate-50 rounded p-1.5 border border-slate-200">
                                  {item.debug.rawResponsePreview}
                                </pre>
                              </>
                            )}
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
            <details open className={panelCardCls}>
              <summary className="cursor-pointer text-xs font-medium text-violet-900">子 Agent 详细产出</summary>
              {effectiveAgentRunState.agent === 'general' && effectiveAgentRunState.status === 'running' && (
                <div className="text-[11px] text-violet-600 mt-1">
                  研究规划或 Orchestrator 执行中，各阶段完成后会点亮下方标签。
                </div>
              )}
              {effectiveAgentRunState.agent === 'reading' && effectiveAgentRunState.status === 'running' && (
                <div className="text-[11px] text-violet-600 mt-1">阅读编排进行中：Plan → MCP → Code → Synthesize → Critic，完成后可点选各阶段查看明细。</div>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(['Plan', 'Search', 'Code', 'Synthesize', 'Critic'] as const).map((stage) => {
                  const active = selectedStageDetail === stage;
                  const has = stageDetails.some((x) => x.stage === stage);
                  return (
                    <button
                      key={stage}
                      type="button"
                      disabled={!has}
                      className={`px-2 py-0.5 rounded text-[11px] border ${active ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-700 border-violet-200'} disabled:opacity-40`}
                      onClick={() => setSelectedStageDetail(stage)}
                    >
                      {stage}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 space-y-2">
                {stageDetails.length ? (
                  (() => {
                    const pickedList =
                      selectedStageDetail
                        ? stageDetails.filter((x) => x.stage === selectedStageDetail)
                        : stageDetails;
                    const rows = pickedList.length ? pickedList : [stageDetails[stageDetails.length - 1]];
                    return rows.map((picked) => (
                      <div key={picked.id} className="text-xs text-violet-700 border border-violet-100 rounded p-2 whitespace-pre-wrap leading-relaxed">
                        <div className="font-medium text-violet-900 mb-1">
                          第 {picked.cycle} 轮 · {picked.stage} · {picked.status} · {picked.summary}
                        </div>
                        {picked.detail || '暂无详细内容。'}
                      </div>
                    ));
                  })()
                ) : (
                  <div className="text-xs text-violet-700">暂无子 Agent 详细产出。</div>
                )}
              </div>
            </details>
            <details open className={panelCardCls}>
              <summary className="cursor-pointer text-xs font-medium text-violet-900">运行态与进度（回复 / 状态 / 进程文件）</summary>
              <div className="mt-2 text-xs text-violet-700 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto border-b border-violet-100 pb-2">
                {toolsPanelReplyExcerpt || '暂无最终回复。'}
              </div>
              <div className="mt-2 text-xs text-violet-700 leading-relaxed space-y-1 border-b border-violet-100 pb-2">
                <div>Agent: {effectiveAgentRunState.agent}</div>
                <div>Status: {effectiveAgentRunState.status}</div>
                <div>RunId: {effectiveAgentRunState.runId || '-'}</div>
                <div>
                  Started:{' '}
                  {effectiveAgentRunState.startedAt
                    ? new Date(effectiveAgentRunState.startedAt).toLocaleTimeString()
                    : '-'}
                </div>
                <div>
                  Ended:{' '}
                  {effectiveAgentRunState.endedAt
                    ? new Date(effectiveAgentRunState.endedAt).toLocaleTimeString()
                    : '-'}
                </div>
                <div>Last HTTP URL: {effectiveAgentRunState.lastHttpUrl || '-'}</div>
                <div>Last HTTP Status: {effectiveAgentRunState.lastHttpStatus ?? '-'}</div>
                {effectiveAgentRunState.error && (
                  <div className="text-red-600">Error: {effectiveAgentRunState.error}</div>
                )}
              </div>
              <div className="flex gap-1.5 mb-2 mt-2">
                <button
                  className={`px-2 py-1 rounded text-[11px] border ${processTab === 'progress' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50'}`}
                  onClick={() => setProcessTab('progress')}
                >
                  当前进程
                </button>
                <button
                  className={`px-2 py-1 rounded text-[11px] border ${processTab === 'files' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50'}`}
                  onClick={() => setProcessTab('files')}
                >
                  文件
                </button>
              </div>
              {processTab === 'progress' ? (
                <div className="space-y-2">
                  {effectiveAgentRunState.timeline && effectiveAgentRunState.timeline.length > 0 ? (
                    effectiveAgentRunState.timeline.map((x, i) => (
                      <div key={`${i}-${x.stage}-${x.message}`} className="text-xs text-violet-700 rounded border border-violet-100 p-2">
                        <div className="text-violet-900 font-medium">{i + 1}. [{stageLabel(x.stage)}] {x.status}</div>
                        <div className="mt-1">{x.message}</div>
                        {(typeof x.addedCount === 'number' || typeof x.dedupedCount === 'number') && (
                          <div className="mt-1 text-[11px]">
                            新增文献数：{x.addedCount ?? '-'} · 去重数：{x.dedupedCount ?? '-'}
                          </div>
                        )}
                        {x.dropReasons && x.dropReasons.length > 0 && (
                          <div className="mt-1 text-[11px]">淘汰原因：{x.dropReasons.join('；')}</div>
                        )}
                        {x.currentTitle && (
                          <div className="mt-1 text-[11px]">
                            当前文献：
                            {resolveUrl(undefined, x.currentUrl) ? (
                              <a className="text-violet-600 hover:underline" href={resolveUrl(undefined, x.currentUrl) || '#'} target="_blank" rel="noreferrer">
                                {x.currentTitle}
                              </a>
                            ) : (
                              <a className="text-violet-600 hover:underline" href={buildSearchUrl(x.currentTitle)} target="_blank" rel="noreferrer">
                                {x.currentTitle}（搜索打开）
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  ) : effectiveAgentRunState.agent === 'reading' ? (
                    <div className="text-xs text-violet-700">
                      {effectiveAgentRunState.status === 'running'
                        ? '阅读编排进行中：各步时间线见上方列表；完成后将显示 Plan→Critic 各阶段记录。'
                        : '本轮阅读无 Discovery 式时间线；若已完成，见上方「子 Agent 详细产出」与工具轨迹。'}
                    </div>
                  ) : (
                    <div className="text-xs text-violet-700">等待进程数据...</div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {effectiveAgentRunState.agent === 'reading' ? (
                    readingSidecarFiles.length > 0 ? (
                      readingSidecarFiles.map((x, i) => (
                        <div key={`${i}-${x.url}`} className="text-xs text-violet-700">
                          <a className="text-violet-900 font-medium text-violet-600 hover:underline break-all" href={x.url} target="_blank" rel="noreferrer">
                            {x.title}
                          </a>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-violet-700">本轮阅读未从 MCP 产生可展示链接；若图谱论文含 PDF，左侧详情将预览。</div>
                    )
                  ) : effectiveDiscoveryCandidatePool.length > 0 ? (
                    effectiveDiscoveryCandidatePool.slice(0, 12).map((x, i) => (
                    <div key={`${i}-${x.title}`} className="text-xs text-violet-700">
                      <div className="text-violet-900 font-medium">
                        {resolveUrl(x.source, x.url) ? (
                          <a className="text-violet-600 hover:underline" href={resolveUrl(x.source, x.url) || '#'} target="_blank" rel="noreferrer">
                            {x.title}
                          </a>
                        ) : (
                          <a className="text-violet-600 hover:underline" href={buildSearchUrl(x.title, x.source)} target="_blank" rel="noreferrer">
                            {x.title}（搜索打开）
                          </a>
                        )}
                      </div>
                      <div className="mt-0.5">{x.source} · 可信度 {x.credibility}</div>
                      {resolveUrl(x.source, x.url) && (
                        <button
                          className="mt-1 text-[11px] px-1.5 py-0.5 rounded bg-violet-600 text-white hover:bg-violet-700"
                          onClick={() => openCandidateInReading({ title: x.title, url: x.url, source: x.source })}
                        >
                          跳转阅读助手解读
                        </button>
                      )}
                    </div>
                  ))
                  ) : (
                    <div className="text-xs text-violet-700">暂无检索文件/文章。</div>
                  )}
                </div>
              )}
            </details>
          </div>
        )}
        {(hasMessages ? displayedCard : 'graph') === 'candidate' && (
          <div className={`h-full overflow-y-auto ${panelGapCls}`}>
            <section className={panelCardCls}>
              <div className="text-xs font-medium text-violet-900">候选文献池</div>
              <div className="mt-2 space-y-2">
                {effectiveDiscoveryCandidatePool.length ? effectiveDiscoveryCandidatePool.map((x, i) => (
                  <div key={`${i}-${x.title}`} className="text-xs text-violet-700">
                    <div className="text-violet-900 font-medium">
                      {i + 1}. {resolveUrl(x.source, x.url) ? (
                        <a className="text-violet-600 hover:underline" href={resolveUrl(x.source, x.url) || '#'} target="_blank" rel="noreferrer">
                          {x.title}
                        </a>
                      ) : (
                        <a className="text-violet-600 hover:underline" href={buildSearchUrl(x.title, x.source)} target="_blank" rel="noreferrer">
                          {x.title}（搜索打开）
                        </a>
                      )}
                    </div>
                    <div className="mt-0.5">{x.type} · {x.source} · 可信度 {x.credibility}</div>
                    <div className="mt-1">{x.reason}</div>
                    {resolveUrl(x.source, x.url) && (
                      <button
                        className="mt-1 text-[11px] px-1.5 py-0.5 rounded bg-violet-600 text-white hover:bg-violet-700"
                        onClick={() => openCandidateInReading({ title: x.title, url: x.url, source: x.source })}
                      >
                        跳转阅读助手解读
                      </button>
                    )}
                  </div>
                )) : <div>暂无候选文献。</div>}
              </div>
            </section>
            <section className={panelCardCls}>
              <div className="text-xs font-medium text-violet-900">证据清单</div>
              <div className="mt-2 space-y-1">
                {effectiveDiscoveryEvidenceList.length ? effectiveDiscoveryEvidenceList.map((x, i) => (
                  <div key={`${i}-${x}`} className="text-xs text-violet-700">{i + 1}. {x}</div>
                )) : <div className="text-xs text-violet-700">暂无证据。</div>}
              </div>
            </section>
            <section className={panelCardCls}>
              <div className="text-xs font-medium text-violet-900">主题聚类</div>
              <div className="mt-2 space-y-1">
                {effectiveDiscoveryTopicClusters.length ? effectiveDiscoveryTopicClusters.map((x, i) => (
                  <div key={`${i}-${x}`} className="text-xs text-violet-700">{i + 1}. {x}</div>
                )) : <div className="text-xs text-violet-700">暂无主题簇。</div>}
              </div>
            </section>
          </div>
        )}

        {(hasMessages ? displayedCard : 'graph') === 'web_search' && (
          <div className={`h-full overflow-y-auto ${panelGapCls}`}>
            <section className={`${panelCardCls} space-y-2`}>
              <div className="text-xs font-medium text-violet-900">Web 搜索网页预览</div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className={`px-2 py-0.5 rounded text-[11px] border ${
                    searchPreviewEngine === 'scholar'
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50'
                  }`}
                  onClick={() => setSearchPreviewEngine('scholar')}
                >
                  Scholar
                </button>
                <button
                  type="button"
                  className={`px-2 py-0.5 rounded text-[11px] border ${
                    searchPreviewEngine === 'web'
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50'
                  }`}
                  onClick={() => setSearchPreviewEngine('web')}
                >
                  Web
                </button>
              </div>
              <div className="text-[11px] text-violet-700 break-all">
                检索式：{searchPreviewQuery || '暂无可用检索式'}
              </div>
              {previewWindows.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[11px] text-violet-700">
                    支持 OpenSearch / Open-WebSearch / Scholar / 通用 Web。窗口可拖拽、缩放、收起、全屏。
                  </div>
                  <div className="relative h-[76vh] min-h-[560px] border border-violet-200 bg-violet-50/20 overflow-hidden">
                    {previewWindows.map((windowInfo) => {
                      const state = searchPreviewLayout[windowInfo.key];
                      if (!state) return null;
                      const zIndex = Math.max(10, searchPreviewZOrder.indexOf(windowInfo.key) + 10);
                      return (
                        <DraggablePreviewWindow
                          key={windowInfo.key}
                          title={windowInfo.title}
                          url={windowInfo.url}
                          state={state}
                          zIndex={zIndex}
                          onFocus={() =>
                            setSearchPreviewZOrder((prev) => [
                              ...prev.filter((k) => k !== windowInfo.key),
                              windowInfo.key,
                            ])
                          }
                          onChange={(next) =>
                            setSearchPreviewLayout((prev) => ({
                              ...prev,
                              [windowInfo.key]: next,
                            }))
                          }
                        />
                      );
                    })}
                  </div>
                  <div className="space-y-1">
                    {previewWindows.map((w) => (
                      <div key={`url-${w.key}`} className="text-[11px] text-violet-700 break-all">
                        {w.title}：<a className="underline text-violet-600" href={w.url} target="_blank" rel="noreferrer">{w.url}</a>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-violet-600">
                  当前尚未生成检索式。先在中间对话发起一次检索后，此处会展示搜索结果页预览。
                </div>
              )}
              <div className="text-[10px] text-violet-500">
                若页面因目标站点策略无法嵌入，可点击上方 URL 在新标签打开。
              </div>
            </section>
          </div>
        )}

        {(hasMessages ? displayedCard : 'graph') === 'local_graph' && (
          <div className={`h-full overflow-y-auto ${panelGapCls}`}>
            <section className={panelCardCls}>
              <div className="text-xs font-medium text-violet-900">当前问题局部知识图谱</div>
              <div className="mt-2 text-xs text-violet-700 leading-relaxed">
                Force-like 关系图：中心问题 → RQ → 主题簇 → 候选文献（点击文献节点可一键解读）。
              </div>
            </section>
            <section className="rounded-lg border border-violet-200 bg-white shadow-sm p-3 overflow-auto">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="text-[11px] text-violet-600">缩放 {Math.round(localGraphZoom * 100)}%</div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="px-2 py-0.5 text-[11px] rounded border border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100"
                    onClick={() => setLocalGraphZoom((z) => clampLocalGraphZoom(z - 0.15))}
                    aria-label="缩小问题图谱"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="px-2 py-0.5 text-[11px] rounded border border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100"
                    onClick={() => setLocalGraphZoom(1)}
                    aria-label="重置问题图谱缩放"
                  >
                    重置
                  </button>
                  <button
                    type="button"
                    className="px-2 py-0.5 text-[11px] rounded border border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100"
                    onClick={() => setLocalGraphZoom((z) => clampLocalGraphZoom(z + 0.15))}
                    aria-label="放大问题图谱"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="overflow-auto max-h-[min(70vh,560px)] rounded border border-violet-100 bg-violet-50/20">
              <svg
                viewBox="0 0 840 460"
                width={780 * localGraphZoom}
                height={460 * localGraphZoom}
                className="block min-w-0"
                preserveAspectRatio="xMidYMid meet"
              >
                {localGraph.links.map((link, idx) => {
                  const from = localGraph.nodes.find((n) => n.id === link.from);
                  const to = localGraph.nodes.find((n) => n.id === link.to);
                  if (!from || !to) return null;
                  return (
                    <line
                      key={`link-${idx}-${link.from}-${link.to}`}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke="#c4b5fd"
                      strokeWidth="1.5"
                      strokeOpacity="0.95"
                    />
                  );
                })}
                {localGraph.nodes.map((node) => {
                  const isPaper = node.type === 'paper';
                  const fill =
                    node.type === 'center'
                      ? '#7c3aed'
                      : node.type === 'rq'
                        ? '#8b5cf6'
                        : node.type === 'cluster'
                          ? '#a78bfa'
                          : '#c4b5fd';
                  const r = node.type === 'center' ? 20 : node.type === 'rq' ? 14 : 11;
                  return (
                    <g
                      key={node.id}
                      style={{ cursor: isPaper ? 'pointer' : 'default' }}
                      onClick={() => {
                        if (isPaper && 'item' in node) {
                          openCandidateInReading({
                            title: node.item.title,
                            url: node.item.url,
                            source: node.item.source,
                          });
                        }
                      }}
                    >
                      <circle cx={node.x} cy={node.y} r={r} fill={fill} stroke="#6d28d9" strokeWidth="1" />
                      <text x={node.x + r + 5} y={node.y + 4} fill="#5b21b6" fontSize="10">
                        {node.label}
                      </text>
                      <title>{'full' in node ? node.full : node.label}</title>
                    </g>
                  );
                })}
              </svg>
              </div>
              <div className="mt-2 text-[11px] text-violet-600">
                蓝色中心节点=问题陈述，RQ=研究问题，C=主题簇，数字节点=候选文献序号。
              </div>
            </section>
          </div>
        )}

        {(hasMessages ? displayedCard : activeAgent === 'personal_kb' ? displayedCard : 'graph') ===
          'kb_assets' && (
          <div className={`h-full overflow-y-auto ${panelGapCls}`}>
            <section className={panelCardCls}>
              <div className="text-xs font-medium text-violet-900">知识资产总览</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-violet-700">
                <div className="rounded border border-violet-100 bg-violet-50/50 p-2">收藏：{kbFavorites.length}</div>
                <div className="rounded border border-violet-100 bg-violet-50/50 p-2">个人 PDF：{kbLibraryList.length}</div>
                <div className="rounded border border-violet-100 bg-violet-50/50 p-2">笔记：{kbNotesCount}</div>
                <div className="rounded border border-violet-100 bg-violet-50/50 p-2">
                  PDF 体量：{formatBytes(kbLibraryTotalBytes)}
                </div>
              </div>
              <p className="mt-2 text-[11px] text-violet-500">
                支持展开查看具体条目；收藏与个人知识库已在此聚合。
              </p>
            </section>

            <section className={`${panelCardCls} space-y-2`}>
              <div className="text-xs font-medium text-violet-900">让个人助手帮你管理（低成本）</div>
              <p className="text-[10px] text-violet-500 leading-snug">
                默认在当前「个人知识库」会话中连续执行；按住 <kbd className="px-1 rounded bg-violet-100">Shift</kbd>{' '}
                再点按钮可<strong>新建</strong>一条知识库会话。结构化结果在侧栏「任务结果」标签查看。
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="text-[11px] px-2 py-1 rounded border border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100"
                  onClick={(e) =>
                    startPersonalKbTask(
                      `请基于我的个人知识资产进行自动分类：收藏 ${kbFavorites.length} 条、个人 PDF ${kbLibraryList.length} 篇、助手产出 ${kbAssistantOutputs.length} 条、检索结果 ${kbRetrievalAssets.length} 条。输出分类结构、每类代表项、以及我下一步该先做什么。`,
                      { forceNewThread: e.shiftKey }
                    )
                  }
                >
                  自动分类
                </button>
                <button
                  type="button"
                  className="text-[11px] px-2 py-1 rounded border border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100"
                  onClick={(e) =>
                    startPersonalKbTask(
                      '请基于我的个人知识库做一次总结：最近关注主题、核心证据、阶段性成长轨迹（近7天/30天），并给出3条可执行建议。',
                      { forceNewThread: e.shiftKey }
                    )
                  }
                >
                  个人总结
                </button>
                <button
                  type="button"
                  className="text-[11px] px-2 py-1 rounded border border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100"
                  onClick={(e) =>
                    startPersonalKbTask(
                      '请基于我的个人知识资产给出最近关注、下一步阅读推荐（3-5 篇/主题）和理由，并标注与我已有资产的关联。',
                      { forceNewThread: e.shiftKey }
                    )
                  }
                >
                  关注与推荐
                </button>
                <button
                  type="button"
                  className="text-[11px] px-2 py-1 rounded border border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100"
                  onClick={(e) =>
                    startPersonalKbTask(
                      '请基于我的个人知识资产生成个人知识图谱草案：核心主题、子主题、关键文献、薄弱环节，并给出图谱更新策略。',
                      { forceNewThread: e.shiftKey }
                    )
                  }
                >
                  个人知识图谱
                </button>
              </div>
            </section>

            <section className={panelCardCls}>
              <div className="text-xs font-medium text-violet-900">成长轨迹与最近关注</div>
              <div className="mt-2 text-[11px] text-violet-700 space-y-1">
                <div>近 7 天：新增收藏 {kbGrowthSummary.fav7} 条，新增 PDF {kbGrowthSummary.pdf7} 篇。</div>
                <div>近 30 天：新增收藏 {kbGrowthSummary.fav30} 条，新增 PDF {kbGrowthSummary.pdf30} 篇。</div>
                <div>
                  最近关注：{kbRecentFocus.length ? kbRecentFocus.join('、') : '暂无，建议先做一次自动分类以形成主题脉络。'}
                </div>
              </div>
            </section>

            <section className={`${panelCardCls} space-y-2`}>
              <div className="text-xs font-medium text-violet-900">资产分组管理</div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['all', '全部'],
                    ['favorites', '收藏'],
                    ['pdf', 'PDF'],
                    ['assistant', '助手产出'],
                    ['retrieval', '检索结果'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`text-[11px] px-2 py-1 rounded border ${
                      kbAssetGroup === id
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-white text-violet-800 border-violet-200 hover:bg-violet-50'
                    }`}
                    onClick={() => setKbAssetGroup(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            {(kbAssetGroup === 'all' || kbAssetGroup === 'favorites') && (
            <section className={panelCardCls}>
              <details open>
                <summary className="cursor-pointer text-xs font-medium text-violet-900">
                  收藏条目（{kbFavorites.length}）
                </summary>
                <div className="mt-2 space-y-2">
                  {kbFavorites.length ? (
                    kbFavorites.slice(0, 50).map((fav) => (
                      <div key={fav.id} className="rounded border border-violet-100 p-2 text-xs text-violet-700">
                        <div className="font-medium text-violet-900">
                          {fav.kind === 'thread' ? `会话 · ${fav.title}` : `消息 · ${fav.preview}`}
                        </div>
                        <div className="mt-1 text-[11px] text-violet-500">
                          {new Date(fav.createdAt).toLocaleString()}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            className="text-[11px] px-2 py-0.5 rounded border border-violet-200 bg-white text-violet-800 hover:bg-violet-50"
                            onClick={() => {
                              switchChatThread(fav.threadId);
                            }}
                          >
                            打开会话
                          </button>
                          {fav.kind === 'message' && (
                            <button
                              type="button"
                              className="text-[11px] px-2 py-0.5 rounded border border-violet-200 bg-white text-violet-800 hover:bg-violet-50"
                              onClick={() => void navigator.clipboard.writeText(fav.content)}
                            >
                              复制
                            </button>
                          )}
                          <button
                            type="button"
                            className="text-[11px] px-2 py-0.5 rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                            onClick={() => {
                              removeFavorite(fav.id);
                              setKbFavoritesTick((x) => x + 1);
                            }}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-violet-700">暂无收藏。可在对话中收藏消息或会话。</div>
                  )}
                </div>
              </details>
            </section>
            )}

            {(kbAssetGroup === 'all' || kbAssetGroup === 'pdf') && (
            <section className={panelCardCls}>
              <details open>
                <summary className="cursor-pointer text-xs font-medium text-violet-900">
                  个人 PDF 资产（{kbLibraryList.length}）
                </summary>
                <div className="mt-2 space-y-2">
                  {kbLibraryList.length ? (
                    kbLibraryList.slice(0, 50).map((x) => (
                      <div key={x.id} className="rounded border border-violet-100 p-2 text-xs text-violet-700">
                        <div className="font-medium text-violet-900 truncate">{x.name}</div>
                        <div className="mt-1 text-[11px] text-violet-500">
                          {formatBytes(x.size)} · {new Date(x.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-violet-700">暂无个人 PDF。可在左栏“个人知识库”中上传。</div>
                  )}
                </div>
              </details>
            </section>
            )}

            {(kbAssetGroup === 'all' || kbAssetGroup === 'assistant') && (
            <section className={panelCardCls}>
              <details open>
                <summary className="cursor-pointer text-xs font-medium text-violet-900">
                  助手产出（{kbAssistantOutputs.length}）
                </summary>
                <div className="mt-2 space-y-2">
                  {kbAssistantOutputs.length ? (
                    kbAssistantOutputs.map((x) => (
                      <div key={x.id} className="rounded border border-violet-100 p-2 text-xs text-violet-700">
                        <div className="font-medium text-violet-900">{x.title}</div>
                        <div className="mt-1 line-clamp-3">{x.preview}</div>
                        <div className="mt-1 text-[11px] text-violet-500">{new Date(x.updatedAt).toLocaleString()}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-violet-700">暂无助手产出。可先让助手生成综述或草稿。</div>
                  )}
                </div>
              </details>
            </section>
            )}

            {(kbAssetGroup === 'all' || kbAssetGroup === 'retrieval') && (
            <section className={panelCardCls}>
              <details open>
                <summary className="cursor-pointer text-xs font-medium text-violet-900">
                  检索结果资产（{kbRetrievalAssets.length}）
                </summary>
                <div className="mt-2 space-y-2">
                  {kbRetrievalAssets.length ? (
                    kbRetrievalAssets.slice(0, 40).map((x) => (
                      <div key={x.id} className="rounded border border-violet-100 p-2 text-xs text-violet-700">
                        <div className="font-medium text-violet-900">{x.title}</div>
                        <div className="mt-1 text-[11px] text-violet-500">
                          {x.source} · 可信度 {x.credibility}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-violet-700">暂无检索结果资产。先在中间对话框发起检索即可自动沉淀。</div>
                  )}
                </div>
              </details>
            </section>
            )}
          </div>
        )}

        {(hasMessages ? displayedCard : activeAgent === 'personal_kb' ? displayedCard : 'graph') ===
          'kb_result' && (
          <div className={`h-full overflow-y-auto ${panelGapCls}`}>
            {effectivePersonalKbWorkbench &&
            effectivePersonalKbWorkbench.threadId === activeThreadId ? (
              <>
                <section className={panelCardCls}>
                  <div className="text-xs font-medium text-violet-900">本次提问</div>
                  <p className="mt-2 text-[11px] text-violet-800 leading-relaxed whitespace-pre-wrap">
                    {effectivePersonalKbWorkbench.userQuery}
                  </p>
                  <div className="mt-2 text-[10px] text-violet-500">
                    {new Date(effectivePersonalKbWorkbench.updatedAt).toLocaleString()}
                  </div>
                </section>
                {effectivePersonalKbWorkbench.sections && effectivePersonalKbWorkbench.sections.length > 0 ? (
                  effectivePersonalKbWorkbench.sections.map((sec, idx) => (
                    <section
                      key={`${sec.heading}-${idx}`}
                      className={panelCardCls}
                    >
                      <div className="text-xs font-semibold text-violet-950 border-b border-violet-100 pb-2">
                        {sec.heading}
                      </div>
                      <div className="mt-2 text-[11px] text-violet-800 leading-relaxed whitespace-pre-wrap">
                        {sec.body}
                      </div>
                    </section>
                  ))
                ) : (
                  <section className={panelCardCls}>
                    <div className="text-xs font-medium text-violet-900">输出</div>
                    <div className="mt-2 text-[11px] text-violet-800 leading-relaxed whitespace-pre-wrap">
                      {effectivePersonalKbWorkbench.assistantText}
                    </div>
                  </section>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-violet-200 bg-violet-50/50 p-6 text-center text-[11px] text-violet-600">
                暂无任务结果。请在中间对话中向个人知识库助手提问，或在「知识资产」中使用快捷按钮发起任务；完成后将自动切换到本标签。
              </div>
            )}
          </div>
        )}

        {(hasMessages ? displayedCard : 'graph') === 'related_work' && (
          <div className={`h-full overflow-y-auto ${panelGapCls}`}>
            <section className={panelCardCls}>
              <div className="text-xs font-medium text-violet-900">Related Work 摘要</div>
              <div className="mt-2 text-xs text-violet-700 leading-relaxed">
                {effectiveRelatedWork.summary || '暂无摘要。在对话中提出相关工作对比、related work、研究空白或横向对比类问题后将自动生成。'}
              </div>
            </section>
            <section className={`${panelCardCls} overflow-x-auto`}>
              <div className="text-xs font-medium text-violet-900 mb-2">结构化对比表</div>
              {effectiveRelatedWork.items.length ? (
                <table className="min-w-full text-[11px] text-violet-600">
                  <thead>
                    <tr className="text-violet-800">
                      <th className="text-left pr-3 pb-1">工作</th>
                      <th className="text-left pr-3 pb-1">方法</th>
                      <th className="text-left pr-3 pb-1">数据</th>
                      <th className="text-left pr-3 pb-1">指标</th>
                      <th className="text-left pb-1">局限</th>
                    </tr>
                  </thead>
                  <tbody>
                    {effectiveRelatedWork.items.map((x, i) => (
                      <tr key={`${i}-${x.title}`} className="align-top border-t border-violet-100">
                        <td className="pr-3 py-1.5 text-violet-900 font-medium">{x.title}</td>
                        <td className="pr-3 py-1.5">{x.method}</td>
                        <td className="pr-3 py-1.5">{x.data}</td>
                        <td className="pr-3 py-1.5">{x.metric}</td>
                        <td className="py-1.5">{x.limitation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-xs text-violet-700">暂无结构化条目。</div>
              )}
            </section>
            <section className={panelCardCls}>
              <div className="text-xs font-medium text-violet-900">研究空白（Gap）</div>
              <div className="mt-2 space-y-1">
                {effectiveRelatedWork.gaps.length ? effectiveRelatedWork.gaps.map((x, i) => (
                  <div key={`${i}-${x}`} className="text-xs text-violet-700">{i + 1}. {x}</div>
                )) : <div className="text-xs text-violet-700">暂无 gap。</div>}
              </div>
            </section>
          </div>
        )}

        {(hasMessages ? displayedCard : 'graph') === 'task' && (
          <div className="h-full overflow-y-auto p-4 space-y-3 text-xs text-violet-700 leading-relaxed">
            <section className={panelCardCls}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-violet-900">任务卡控制</div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!!panelSnap}
                    className={`px-2 py-1 rounded text-[11px] border ${
                      effectiveResearchTaskCard.locked
                        ? 'bg-red-50 text-red-800 border-red-200'
                        : 'bg-violet-100 text-violet-900 border-violet-200'
                    } ${panelSnap ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => {
                      if (panelSnap) return;
                      setTaskCardLocked(!researchTaskCard.locked);
                    }}
                  >
                    {effectiveResearchTaskCard.locked ? '已锁定' : '未锁定'}
                  </button>
                  <button
                    type="button"
                    disabled={!!panelSnap}
                    className={`px-2 py-1 rounded text-[11px] border border-violet-200 bg-white text-violet-800 hover:bg-violet-50 ${panelSnap ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => {
                      if (panelSnap) return;
                      setTaskDraft({
                        problemStatement: effectiveResearchTaskCard.problemStatement || '',
                        rqList: effectiveResearchTaskCard.rqList.join('\n'),
                        scopeInclude: effectiveResearchTaskCard.scopeInclude.join('\n'),
                        scopeExclude: effectiveResearchTaskCard.scopeExclude.join('\n'),
                        constraints: effectiveResearchTaskCard.constraints.join('\n'),
                        successCriteria: effectiveResearchTaskCard.successCriteria.join('\n'),
                      });
                      setEditingTaskCard((v) => !v);
                    }}
                  >
                    {editingTaskCard ? '取消编辑' : '编辑任务卡'}
                  </button>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-violet-500">
                来源：{effectiveResearchTaskCard.source || 'auto'} · 最近更新：
                {effectiveResearchTaskCard.updatedAt
                  ? ` ${new Date(effectiveResearchTaskCard.updatedAt).toLocaleString()}`
                  : ' -'}
              </div>
            </section>
            {editingTaskCard && !panelSnap && (
              <section className={`${panelCardCls} space-y-2`}>
                <div className="text-xs font-medium text-violet-900">手动编辑（每行一项）</div>
                <textarea value={taskDraft.problemStatement} onChange={(e) => setTaskDraft((d) => ({ ...d, problemStatement: e.target.value }))} rows={2} placeholder="问题陈述" className="w-full rounded bg-violet-50/90 border border-violet-200 px-2 py-1.5 text-[11px] text-violet-950 outline-none resize-none placeholder:text-violet-400" />
                <textarea value={taskDraft.rqList} onChange={(e) => setTaskDraft((d) => ({ ...d, rqList: e.target.value }))} rows={3} placeholder="RQ 列表（每行一条）" className="w-full rounded bg-violet-50/90 border border-violet-200 px-2 py-1.5 text-[11px] text-violet-950 outline-none resize-none placeholder:text-violet-400" />
                <textarea value={taskDraft.scopeInclude} onChange={(e) => setTaskDraft((d) => ({ ...d, scopeInclude: e.target.value }))} rows={2} placeholder="包含范围（每行一条）" className="w-full rounded bg-violet-50/90 border border-violet-200 px-2 py-1.5 text-[11px] text-violet-950 outline-none resize-none placeholder:text-violet-400" />
                <textarea value={taskDraft.scopeExclude} onChange={(e) => setTaskDraft((d) => ({ ...d, scopeExclude: e.target.value }))} rows={2} placeholder="排除范围（每行一条）" className="w-full rounded bg-violet-50/90 border border-violet-200 px-2 py-1.5 text-[11px] text-violet-950 outline-none resize-none placeholder:text-violet-400" />
                <textarea value={taskDraft.constraints} onChange={(e) => setTaskDraft((d) => ({ ...d, constraints: e.target.value }))} rows={2} placeholder="约束（每行一条）" className="w-full rounded bg-violet-50/90 border border-violet-200 px-2 py-1.5 text-[11px] text-violet-950 outline-none resize-none placeholder:text-violet-400" />
                <textarea value={taskDraft.successCriteria} onChange={(e) => setTaskDraft((d) => ({ ...d, successCriteria: e.target.value }))} rows={2} placeholder="成功标准（每行一条）" className="w-full rounded bg-violet-50/90 border border-violet-200 px-2 py-1.5 text-[11px] text-violet-950 outline-none resize-none placeholder:text-violet-400" />
                <button
                  className="px-2.5 py-1.5 rounded text-[11px] bg-violet-600 text-white hover:bg-violet-700"
                  onClick={() => {
                    const toList = (x: string) => x.split('\n').map((s) => s.trim()).filter(Boolean);
                    setResearchTaskCard({
                      problemStatement: taskDraft.problemStatement.trim(),
                      rqList: toList(taskDraft.rqList),
                      scopeInclude: toList(taskDraft.scopeInclude),
                      scopeExclude: toList(taskDraft.scopeExclude),
                      constraints: toList(taskDraft.constraints),
                      successCriteria: toList(taskDraft.successCriteria),
                      source: 'manual',
                    });
                    setEditingTaskCard(false);
                  }}
                >
                  保存为手动任务卡
                </button>
              </section>
            )}
            <section className={panelCardCls}>
              <div className="text-xs font-medium text-violet-900">问题陈述</div>
              <div className="mt-2">
                {effectiveResearchTaskCard.problemStatement ||
                  '尚未生成。发送消息后将自动由研究助手规划步骤更新。'}
              </div>
            </section>
            <section className={`${panelCardCls} space-y-2`}>
              <div className="text-xs font-medium text-violet-900">本轮识别场景</div>
              {effectiveResearchTaskCard.intentTags?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {effectiveResearchTaskCard.intentTags.map((tag, i) => (
                    <span
                      key={`${i}-${tag}`}
                      className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-800"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <div>尚未识别具体场景。</div>
              )}
              <div className="pt-1">
                <div className="text-xs font-medium text-violet-900">建议工作流</div>
                <div className="mt-1 space-y-1">
                  {effectiveResearchTaskCard.recommendedWorkflow?.length ? (
                    effectiveResearchTaskCard.recommendedWorkflow.map((step, i) => (
                      <div key={`${i}-${step}`}>{i + 1}. {step}</div>
                    ))
                  ) : (
                    <div>暂无建议，发送问题后将自动生成。</div>
                  )}
                </div>
              </div>
            </section>
            <section className={`${panelCardCls} space-y-2`}>
              <div className="text-xs font-medium text-violet-900">研究问题（RQ）</div>
              {effectiveResearchTaskCard.rqList.length ? effectiveResearchTaskCard.rqList.map((x, i) => (
                <div key={`${i}-${x}`}>{i + 1}. {x}</div>
              )) : <div>暂无 RQ。</div>}
            </section>
            <section className={`${panelCardCls} space-y-2`}>
              <div className="text-xs font-medium text-violet-900">范围与约束</div>
              <div>包含：{effectiveResearchTaskCard.scopeInclude.join('；') || '暂无'}</div>
              <div>排除：{effectiveResearchTaskCard.scopeExclude.join('；') || '暂无'}</div>
              <div>约束：{effectiveResearchTaskCard.constraints.join('；') || '暂无'}</div>
            </section>
            <section className={`${panelCardCls} space-y-2`}>
              <div className="text-xs font-medium text-violet-900">成功标准</div>
              {effectiveResearchTaskCard.successCriteria.length ? effectiveResearchTaskCard.successCriteria.map((x, i) => (
                <div key={`${i}-${x}`}>{i + 1}. {x}</div>
              )) : <div>暂无。</div>}
            </section>
            <section className={panelCardCls}>
              <div className="text-xs font-medium text-violet-900">研究助手规划产出（可交付草案）</div>
              <div className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-violet-700">
                {effectiveResearchTaskCard.framingOutput?.trim()
                  ? effectiveResearchTaskCard.framingOutput
                  : '暂无可交付草案。若本轮包含访谈提纲/研究方案，会展示在这里。'}
              </div>
            </section>
            <section className={panelCardCls}>
              <div className="text-xs font-medium text-violet-900">写作任务（可选）</div>
              <div className="mt-2">{writingTask || '尚未设定写作任务，请在左栏填写。'}</div>
            </section>
          </div>
        )}
        {(hasMessages ? displayedCard : 'graph') === 'material' && (
          <div className="p-4 text-xs text-violet-700 leading-relaxed whitespace-pre-wrap bg-violet-50/30 min-h-full">
            {writingMaterial || '暂无写作素材。'}
          </div>
        )}
        {(hasMessages ? displayedCard : 'graph') === 'outline' && (
          <div className="p-4 space-y-2 bg-violet-50/30 min-h-full">
            {effectiveWritingOutline.length ? effectiveWritingOutline.map((x, i) => (
              <div key={`${i}-${x}`} className="text-xs text-violet-700">{i + 1}. {x}</div>
            )) : <div className="text-xs text-violet-700">暂无提纲。</div>}
          </div>
        )}
        {(hasMessages ? displayedCard : 'graph') === 'lit_main' && (
          <div className="h-full flex flex-col min-h-0 overflow-hidden p-4">
            <section className={`${panelCardCls} flex-1 flex flex-col min-h-0`}>
              <div className="text-xs font-medium text-violet-900 shrink-0">综述成稿（可编辑，与对话同步）</div>
              <p className="mt-1 text-[11px] text-violet-600 shrink-0">
                正文按写作大纲分节生成；可直接修改，或选中片段后「润色选中 / 重写选中」。
              </p>
              <div className="mt-2 flex-1 min-h-0 flex flex-col">
                <LiteratureReviewDraftEditor
                  value={effectiveLiteratureReviewDraft}
                  onChange={panelSnap ? () => {} : setLiteratureReviewDraft}
                  placeholder={
                    effectiveRelatedWork.summary.trim()
                      ? `尚无完整成稿。摘要线索：\n${effectiveRelatedWork.summary.slice(0, 800)}${effectiveRelatedWork.summary.length > 800 ? '…' : ''}\n\n在对话中发起文献综述后将填入全文。`
                      : '尚无成稿。在对话中提出「文献综述 / Related Work / 研究空白」类问题，或从个人知识库勾选 PDF 后发起综述。'
                  }
                  className="flex-1 min-h-0"
                />
              </div>
            </section>
          </div>
        )}
        {(hasMessages ? displayedCard : 'graph') === 'lit_citations' && (
          <div className={`h-full overflow-y-auto ${panelGapCls}`}>
            <section className={panelCardCls}>
              <div className="text-xs font-medium text-violet-900">引用与文献条目</div>
              <p className="mt-1 text-[11px] text-violet-600">
                对应结构化 Related Work 表中的工作，便于核对综述中的引用与排序。
              </p>
              <div className="mt-2 space-y-2">
                {effectiveRelatedWork.items.length ? (
                  effectiveRelatedWork.items.map((x, i) => (
                    <div key={`${i}-${x.title}`} className="text-xs text-violet-800 rounded border border-violet-100 p-2">
                      <div className="font-medium text-violet-950">
                        [{i + 1}] {x.title}
                      </div>
                      <div className="mt-1 text-violet-700">
                        方法：{x.method || '—'} · 数据：{x.data || '—'} · 指标：{x.metric || '—'}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-violet-700">暂无条目；完成一轮文献综述后将在此列出。</div>
                )}
              </div>
            </section>
          </div>
        )}
        {(hasMessages ? displayedCard : 'graph') === 'lit_evidence' && (
          <div className={`h-full overflow-y-auto ${panelGapCls}`}>
            <section className={panelCardCls}>
              <div className="text-xs font-medium text-violet-900">证据与检索链</div>
              <p className="mt-1 text-[11px] text-violet-600">
                展示本轮 Discovery 证据句与推理摘要，用于对照综述中的论断是否「有据可查」。
              </p>
              <div className="mt-2 space-y-1">
                {effectiveDiscoveryEvidenceList.length ? (
                  effectiveDiscoveryEvidenceList.map((x, i) => (
                    <div key={`${i}-${x}`} className="text-xs text-violet-700 border border-violet-100 rounded p-2">
                      {i + 1}. {x}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-violet-700">暂无独立证据句；若从自由研究链路透传检索，将在此显示。</div>
                )}
              </div>
            </section>
            <section className={panelCardCls}>
              <div className="text-xs font-medium text-violet-900">推理要点</div>
              <div className="mt-2 space-y-1">
                {reasoningDisplayLines.length ? (
                  reasoningDisplayLines.map((x, i) => (
                    <div key={`${i}-${x}`} className="text-xs text-violet-700">
                      {i + 1}. {x}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-violet-700">暂无分步推理摘要。</div>
                )}
              </div>
            </section>
          </div>
        )}
        {(hasMessages ? displayedCard : 'graph') === 'lit_outline' && (
          <div className={`h-full overflow-y-auto ${panelGapCls}`}>
            <section className={panelCardCls}>
              <div className="text-xs font-medium text-violet-900">论文框架与 RQ</div>
              <div className="mt-2 text-xs text-violet-700 space-y-2">
                <div>
                  <span className="font-medium text-violet-900">问题陈述：</span>
                  {effectiveResearchTaskCard.problemStatement || '（尚未由研究助手规划步骤生成）'}
                </div>
                {effectiveResearchTaskCard.rqList.length > 0 && (
                  <ul className="list-decimal pl-4 space-y-1">
                    {effectiveResearchTaskCard.rqList.map((rq, i) => (
                      <li key={`${i}-${rq}`}>{rq}</li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
            <section className={panelCardCls}>
              <div className="text-xs font-medium text-violet-900">研究空白（Gaps）</div>
              <div className="mt-2 space-y-1">
                {effectiveRelatedWork.gaps.length ? (
                  effectiveRelatedWork.gaps.map((g, i) => (
                    <div key={`${i}-${g}`} className="text-xs text-violet-700">
                      {i + 1}. {g}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-violet-700">暂无 gap；完成综述后将列出。</div>
                )}
              </div>
            </section>
            <section className={`${panelCardCls} overflow-x-auto`}>
              <div className="text-xs font-medium text-violet-900 mb-2">横向对比（速览）</div>
              {effectiveRelatedWork.items.length ? (
                <table className="min-w-full text-[11px] text-violet-600">
                  <thead>
                    <tr className="text-violet-800">
                      <th className="text-left pr-3 pb-1">工作</th>
                      <th className="text-left pr-3 pb-1">方法</th>
                      <th className="text-left pb-1">局限</th>
                    </tr>
                  </thead>
                  <tbody>
                    {effectiveRelatedWork.items.map((x, i) => (
                      <tr key={`${i}-${x.title}`} className="align-top border-t border-violet-100">
                        <td className="pr-3 py-1.5 text-violet-900 font-medium">{x.title}</td>
                        <td className="pr-3 py-1.5">{x.method}</td>
                        <td className="py-1.5">{x.limitation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-xs text-violet-700">暂无对比表数据。</div>
              )}
            </section>
          </div>
        )}
        {(hasMessages ? displayedCard : 'graph') === 'lit_edit' && (
          <div className="h-full flex flex-col min-h-0 p-4">
            <p className="text-[11px] text-violet-600 shrink-0 mb-2">
              与「综述成稿」同一内容；支持选中片段润色/重写。保存于当前会话。
            </p>
            <LiteratureReviewDraftEditor
              value={effectiveLiteratureReviewDraft}
              onChange={panelSnap ? () => {} : setLiteratureReviewDraft}
              placeholder="在此编辑、删减或合并段落…"
              className="flex-1 min-h-0"
              compact
            />
          </div>
        )}
        {(hasMessages ? displayedCard : 'graph') === 'draft' && (
          <div className="h-full flex flex-col min-h-0 p-4">
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                disabled={!!panelSnap}
                className="text-[11px] px-2.5 py-1 rounded-md border border-violet-200 bg-white text-violet-900 hover:bg-violet-50 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => {
                  if (panelSnap) return;
                  const draft = effectiveWritingDraft.trim();
                  if (!draft) return;
                  setPendingAutoAsk(
                    `请基于我当前文档产物继续迭代，先给出修改点再输出修订稿：\n\n${draft.slice(0, 12000)}`
                  );
                }}
              >
                基于当前文档继续交互
              </button>
              <span className="text-[11px] text-violet-500">可编辑，支持选中润色/重写</span>
            </div>
            <LiteratureReviewDraftEditor
              value={effectiveWritingDraft}
              onChange={panelSnap ? () => {} : (next) => setWritingOutput({ draft: next })}
              placeholder="这里是最终文档产物。你可以直接改，再点击上方按钮将其回传模型做下一轮。"
              className="flex-1 min-h-0"
              compact
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function KnowledgeGraph() {
  return (
    <Layout
      left={<AgentSidebar />}
      center={<ConversationPanel />}
      right={<RightInfoPanel />}
    />
  );
}
