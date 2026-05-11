import type { McpToolExecutionDebug, ToolTraceItem } from '../types';

const PDF_RE = /https?:\/\/[^\s\])"'<>]+\.pdf(?:\?[^\s]*)?/gi;

/** 将常见论文页转为可 iframe 的 PDF（如 arXiv abstract → pdf） */
export function toLikelyPdfUrl(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  if (/\.pdf(\?|$)/i.test(u)) return u;
  const arxivAbs = u.match(/^https?:\/\/arxiv\.org\/abs\/([^/?#]+)/i);
  if (arxivAbs) return `https://arxiv.org/pdf/${arxivAbs[1]}.pdf`;
  return null;
}

/** 从 MCP 工具轨迹中提取可预览的 PDF URL */
export function extractPdfUrlsFromToolTrace(trace: ToolTraceItem[]): string[] {
  const out = new Set<string>();
  for (const t of trace) {
    const blob = `${t.summary}\n${JSON.stringify(t.debug ?? {})}`;
    let m: RegExpExecArray | null;
    const re = new RegExp(PDF_RE.source, 'gi');
    while ((m = re.exec(blob)) !== null) {
      const raw = m[0].replace(/[),.;]+$/, '');
      const pdf = toLikelyPdfUrl(raw) ?? raw;
      if (/\.pdf(\?|$)/i.test(pdf)) out.add(pdf);
    }
    const dbg = t.debug as McpToolExecutionDebug | undefined;
    if (dbg?.resultHitUrls) {
      for (const u of dbg.resultHitUrls) {
        const pdf = toLikelyPdfUrl(u) ?? (/\.pdf(\?|$)/i.test(u) ? u : null);
        if (pdf) out.add(pdf);
      }
    }
    const req = dbg?.request as { url?: string } | undefined;
    if (req?.url) {
      const pdf = toLikelyPdfUrl(req.url) ?? (/\.pdf(\?|$)/i.test(req.url) ? req.url : null);
      if (pdf) out.add(pdf);
    }
  }
  return [...out];
}
