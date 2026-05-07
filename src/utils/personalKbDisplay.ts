/**
 * 将个人知识库助手正文按 ## 标题拆成侧栏结构化展示用区块。
 */
export function parsePersonalKbStructuredSections(text: string): { heading: string; body: string }[] {
  const t = text.trim();
  if (!t) return [];
  const re = /^##\s+(.+)$/;
  const sections: { heading: string; body: string }[] = [];
  let cur: { heading: string; body: string } | null = null;
  for (const line of t.split('\n')) {
    const m = line.match(re);
    if (m) {
      if (cur) sections.push(cur);
      cur = { heading: m[1].trim(), body: '' };
    } else {
      if (!cur) cur = { heading: '要点', body: '' };
      cur.body += (cur.body ? '\n' : '') + line;
    }
  }
  if (cur) sections.push(cur);
  for (const s of sections) s.body = s.body.trim();
  return sections.filter((s) => s.heading.length > 0 || s.body.length > 0);
}
