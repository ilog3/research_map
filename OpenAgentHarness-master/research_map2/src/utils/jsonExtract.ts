/** 从模型回复中取出 Markdown ```json ... ``` 内层，若无则原样返回 */
export function unwrapMarkdownJsonBlocks(raw: string): string {
  const t = raw.trim();
  const re = /```(?:json)?\s*([\s\S]*?)```/g;
  let lastInner: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) lastInner = m[1];
  if (lastInner) return lastInner.trim();
  return t;
}

export type ExtractJsonMode = 'generic' | 'preferAnswerLast';

/**
 * 从混有自然语言的回复中提取第一个可解析的 JSON 对象字符串。
 * 支持括号平衡扫描，避免贪婪正则吞掉后续文本。
 */
export function extractJsonObject(raw: string, mode: ExtractJsonMode = 'generic'): string | null {
  const trimmed = unwrapMarkdownJsonBlocks(raw);
  if (!trimmed) return null;
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      // continue to balanced scan
    }
  }
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        candidates.push(trimmed.slice(start, i + 1));
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
  const parsedCandidates = candidates.filter((c) => {
    try {
      JSON.parse(c);
      return true;
    } catch {
      return false;
    }
  });
  if (!parsedCandidates.length) return null;
  const preferredTaskCard = parsedCandidates.find((c) =>
    /"problemStatement"|"rqList"|"scopeInclude"|"successCriteria"/.test(c)
  );
  if (preferredTaskCard) return preferredTaskCard;

  if (mode === 'preferAnswerLast') {
    const withAnswer = parsedCandidates.filter((c) => {
      try {
        const o = JSON.parse(c) as Record<string, unknown>;
        return typeof o.answer === 'string';
      } catch {
        return false;
      }
    });
    if (withAnswer.length) return withAnswer[withAnswer.length - 1];
    return parsedCandidates[parsedCandidates.length - 1];
  }

  return parsedCandidates[0];
}
