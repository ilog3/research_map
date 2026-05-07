import type { ReadingSession } from '../types';

/** 笔记存储键：优先图谱论文 id，其次阅读源 URL/标识，再次文献标题。 */
export function getPaperNoteStorageKey(
  selectedPaperId: string | null,
  rs: Pick<ReadingSession, 'sourceValue' | 'paperTitle'>
): string {
  if (selectedPaperId) return `paper:${selectedPaperId}`;
  const v = rs.sourceValue?.trim();
  if (v) return `src:${v}`;
  const t = rs.paperTitle?.trim();
  if (t) return `title:${t.slice(0, 240)}`;
  return '';
}
