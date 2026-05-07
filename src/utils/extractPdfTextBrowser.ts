/**
 * 在浏览器内用 PDF.js 从 PDF 二进制抽取文本层（不经过远程服务）。
 * 由 `parseDocumentSource`（llm.ts）在远程文献解析失败或显式关闭时调用，供阅读助手与个人知识库综述共用。
 */
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let workerReady = false;
function ensurePdfWorker(): void {
  if (workerReady) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
  workerReady = true;
}

function itemText(item: unknown): string {
  if (item && typeof item === 'object' && 'str' in item && typeof (item as { str: unknown }).str === 'string') {
    return (item as { str: string }).str;
  }
  return '';
}

/**
 * @param maxChars 单篇上限，避免超大 PDF 撑爆上下文
 */
export async function extractPdfTextInBrowser(blob: Blob, maxChars = 120_000): Promise<string> {
  ensurePdfWorker();
  const buf = await blob.arrayBuffer();
  const data = new Uint8Array(buf);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  let out = '';
  const pages = pdf.numPages;
  for (let p = 1; p <= pages; p++) {
    if (out.length >= maxChars) break;
    const page = await pdf.getPage(p);
    const textContent = await page.getTextContent();
    const line = textContent.items.map(itemText).filter(Boolean).join(' ');
    out += (out ? '\n\n' : '') + `[第${p}页]\n${line}`;
    if (out.length >= maxChars) break;
  }
  return out.slice(0, maxChars).trim();
}
