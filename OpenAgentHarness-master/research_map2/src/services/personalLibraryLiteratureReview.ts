import { getPersonalPdfBlob } from '../utils/personalLibraryStorage';
import { parseDocumentSource } from './llm';
import type { ParsedDocumentResult } from './llm';
import type { DiscoveryCandidateItem, PersonalLibraryParsedDocumentForReview } from '../types';

const MAX_EXCERPT_PER_PDF = 14_000;
const MAX_TOTAL_CHARS = 52_000;

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n…（以下截断）`;
}

function scaleDownTotal(docs: PersonalLibraryParsedDocumentForReview[]): PersonalLibraryParsedDocumentForReview[] {
  let total = docs.reduce((a, d) => a + d.excerptText.length, 0);
  if (total <= MAX_TOTAL_CHARS) return docs;
  const ratio = MAX_TOTAL_CHARS / total;
  return docs.map((d) => ({
    ...d,
    excerptText: truncate(d.excerptText, Math.max(800, Math.floor(d.excerptText.length * ratio))),
  }));
}

/** 将 parseDocumentSource 结果拼成送入综述模型的摘录（远程或浏览器 PDF.js 已在 llm 内统一处理） */
function buildMergedExcerpt(parsed: ParsedDocumentResult, label: string): string {
  const meta = parsed.meta;
  const title = meta.title?.trim() || parsed.title || label;
  const abstract = meta.abstract?.trim() ?? '';
  const kw = meta.keywords?.length ? meta.keywords.join('；') : '';
  const authors = meta.authors?.length ? meta.authors.join('，') : '';

  const parts: string[] = [];
  if (abstract) parts.push(`【摘要】\n${abstract}`);
  if (kw) parts.push(`【关键词】${kw}`);
  if (authors) parts.push(`【作者】${authors}`);
  const bodyFromEvidence = parsed.evidenceRefs
    .map((e) => {
      const head = e.label ? `【${e.label}】` : '';
      const pg = typeof e.page === 'number' ? `（p.${e.page}）` : '';
      return `${head}${pg}\n${e.snippet}`.trim();
    })
    .filter(Boolean)
    .join('\n\n');
  if (bodyFromEvidence) parts.push(`【正文片段】\n${bodyFromEvidence}`);

  const merged = parts.join('\n\n').trim() || title;
  return truncate(merged, MAX_EXCERPT_PER_PDF);
}

function pushFromParsed(
  out: PersonalLibraryParsedDocumentForReview[],
  parsed: ParsedDocumentResult,
  label: string,
  excerptText: string
): void {
  const meta = parsed.meta;
  const title = meta.title?.trim() || parsed.title || label;
  out.push({
    fileLabel: label,
    title,
    abstract: meta.abstract?.trim() || undefined,
    keywords: meta.keywords?.length ? meta.keywords : undefined,
    authors: meta.authors?.length ? meta.authors : undefined,
    year: meta.year,
    excerptText,
  });
}

/**
 * 从个人知识库拉取 PDF，经 `parseDocumentSource`（远程失败则浏览器 PDF.js）得到摘录，供文献综述使用。
 */
export async function parsePersonalLibraryPdfsForLiteratureReview(
  candidates: DiscoveryCandidateItem[],
  onProgress?: (done: number, total: number, label: string) => void
): Promise<PersonalLibraryParsedDocumentForReview[]> {
  const out: PersonalLibraryParsedDocumentForReview[] = [];
  const total = candidates.length;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    const label = c.title?.trim() || '未命名';
    onProgress?.(i, total, label);

    if (!c.localPdfId) {
      out.push({
        fileLabel: label,
        excerptText: '',
        parseError: '未绑定本地 PDF（请从个人知识库多选后使用「文献综述」）',
      });
      continue;
    }

    const blob = await getPersonalPdfBlob(c.localPdfId);
    if (!blob) {
      out.push({
        fileLabel: label,
        excerptText: '',
        parseError: '本地文件不存在或已被删除',
      });
      continue;
    }

    const fileName = `${label.replace(/[/\\?%*:|"<>]/g, '_')}.pdf`;
    const file = new File([blob], fileName, { type: 'application/pdf' });

    try {
      const parsed = await parseDocumentSource({ type: 'file', value: file });
      pushFromParsed(out, parsed, label, buildMergedExcerpt(parsed, label));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.push({
        fileLabel: label,
        excerptText: '',
        parseError: msg,
      });
    }
  }

  return scaleDownTotal(out);
}
