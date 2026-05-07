import { useMemo, useState } from 'react';
import { useStore } from '../../store';

export default function PaperDetail() {
  const [tab, setTab] = useState<'meta' | 'pdf' | 'ai'>('meta');
  const selectedPaperId = useStore((s) => s.selectedPaperId);
  const papers = useStore((s) => s.papers);
  const clusters = useStore((s) => s.clusters);
  const readingSession = useStore((s) => s.readingSession);
  const parsedMeta = readingSession.parsedMeta;
  const paper = selectedPaperId ? papers.find((p) => p.id === selectedPaperId) ?? null : null;
  const cluster = paper ? clusters.find((c) => c.id === paper.clusterId) : null;
  const previewUrl = useMemo(() => {
    if (!readingSession.previewUrl) return '';
    const targetEv = readingSession.evidenceRefs.find((x) => x.id === readingSession.activeEvidenceId);
    if (targetEv?.page && !readingSession.previewUrl.includes('#page=')) {
      return `${readingSession.previewUrl}#page=${targetEv.page}`;
    }
    return readingSession.previewUrl;
  }, [readingSession.activeEvidenceId, readingSession.evidenceRefs, readingSession.previewUrl]);
  const tabCls = (id: 'meta' | 'pdf' | 'ai') =>
    `text-xs pb-1 border-b-2 ${tab === id ? 'text-violet-700 border-violet-500 font-medium' : 'text-violet-500 border-transparent hover:text-violet-700'}`;
  const sourceDisplay = useMemo(() => {
    if (paper?.journal) return paper.journal;
    if (parsedMeta?.journal) return parsedMeta.journal;
    if (readingSession.sourceType === 'upload') return '本地 PDF';
    if (readingSession.sourceType === 'url') return 'URL 文献';
    if (readingSession.sourceType === 'intent') return '阅读会话';
    if (readingSession.sourceType === 'paper_graph') return '图谱论文';
    return '待解析';
  }, [paper?.journal, parsedMeta?.journal, readingSession.sourceType]);

  if (!paper && !readingSession.active) {
    return (
      <div className="flex-1 flex items-center justify-center text-violet-600 text-sm px-4 text-center">
        点击知识图谱中的节点查看论文详情，或在左栏上传 PDF。
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex gap-3 mb-4">
        <button className={tabCls('meta')} onClick={() => setTab('meta')}>论文信息</button>
        <button className={tabCls('pdf')} onClick={() => setTab('pdf')}>PDF预览</button>
        <button className={tabCls('ai')} onClick={() => setTab('ai')}>AI分析</button>
      </div>
      {tab === 'meta' && (
        <>
          <h3 className="text-[15px] font-semibold text-violet-950 leading-relaxed mb-2">
            {paper?.title || readingSession.paperTitle || readingSession.sourceValue || '未命名文献'}
          </h3>
          {!!paper?.titleEn && <p className="text-[11px] text-gray-500 leading-relaxed mb-3 italic">{paper.titleEn}</p>}
          <div className="grid grid-cols-[60px_1fr] gap-x-3 gap-y-1.5 text-xs mb-4">
            <span className="text-violet-600">作者</span><span className="text-violet-800">{paper ? paper.authors.join('; ') : (parsedMeta?.authors?.join('; ') || '待解析')}</span>
            <span className="text-violet-600">机构</span><span className="text-violet-800">{paper?.institution || parsedMeta?.institution || '待解析'}</span>
            <span className="text-violet-600">日期</span><span className="text-violet-800">{paper?.year ?? parsedMeta?.year ?? '待解析'}</span>
            <span className="text-violet-600">来源</span>
            <span className="flex items-center gap-1.5">
              <span className="text-violet-700">{sourceDisplay}</span>
              {!!paper?.coreJournal && <span className="bg-red-50 text-red-700 border border-red-200 px-1.5 py-0 rounded text-[9px] font-medium">核心</span>}
            </span>
            <span className="text-violet-600">DOI</span><span className="text-violet-800 break-all">{parsedMeta?.doi || '待解析'}</span>
          </div>
          {(paper?.keywords?.length || parsedMeta?.keywords?.length) ? (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {(paper?.keywords?.length ? paper.keywords : (parsedMeta?.keywords ?? [])).map((kw) => (
                <span key={kw} className="bg-violet-100 text-violet-800 px-2.5 py-0.5 rounded-full text-[11px]">{kw}</span>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-violet-500 mb-4">关键词待文献解析后补全。</div>
          )}
          {cluster && <div className="flex items-center gap-2 mb-4 text-xs"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: cluster.color }} /><span className="text-violet-700">{cluster.name}</span></div>}
          <div className="text-[11px] text-violet-600 mb-1.5">摘要</div>
          <p className="text-xs text-violet-800 leading-relaxed">{paper?.abstract || parsedMeta?.abstract || '摘要待解析。你可以先在中间对话区提问，助手会边解析边引导。'}</p>
        </>
      )}

      {tab === 'pdf' && (
        <div className="h-[65vh] rounded-lg border border-violet-200 overflow-hidden bg-violet-50/50">
          {previewUrl ? (
            <iframe title="pdf-preview" src={previewUrl} className="w-full h-full" />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-violet-600">
              还没有可预览的 PDF，请先在左栏上传 PDF 或导入 URL。
            </div>
          )}
        </div>
      )}

      {tab === 'ai' && (
        <div className="space-y-3">
          <section className="rounded-lg border border-violet-200 bg-white shadow-sm p-3">
            <div className="text-xs font-medium text-violet-900">最近一次 AI 结论</div>
            <div className="mt-2 text-xs text-violet-700 leading-relaxed">
              {readingSession.lastAnswer || '暂未生成 AI 分析。'}
            </div>
          </section>
          <section className="rounded-lg border border-violet-200 bg-white shadow-sm p-3">
            <div className="text-xs font-medium text-violet-900">下一步提问建议</div>
            <div className="mt-2 text-xs text-violet-700 leading-relaxed">
              {readingSession.nextQuestion || '发送一个阅读问题后，这里会出现引导问题。'}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
