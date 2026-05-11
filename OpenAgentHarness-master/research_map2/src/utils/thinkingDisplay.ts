/** 移除协议标签与任务卡 JSON 块，供「对用户可见」的思考摘要使用 */
const TASK_CARD_BLOCK = /<TASK_CARD_JSON>[\s\S]*?<\/TASK_CARD_JSON>/gi;

/**
 * 从**成稿正文**中剥离误混入的推理块（不禁止模型思考；思考应出现在系统的思考区/调试台，而非综述成稿）。
 * 兼容常见 XML 风格标签与空白。
 */
export function stripInferenceAndThinkingFromProse(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let s = text;
  s = s.replace(/<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi, '');
  s = s.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  s = s.replace(/\x60think\n[\s\S]*?\x60/gi, '');
  s = s.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
  s = s.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '');
  /** Kimi 等网关可能将工具调用块透传到正文 */
  s = s.replace(/<\|redacted_tool_calls_section_begin\|>[\s\S]*?<\|redacted_tool_calls_section_end\|>/gi, '');
  s = s.replace(/<\|redacted[^|]*\|>/gi, '');
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

export function stripProtocolTags(text: string): string {
  return text
    .replace(TASK_CARD_BLOCK, '')
    .replace(/<\/?[A-Z][A-Z0-9_]*>/g, '')
    .trim();
}

/**
 * 将内部推理轨迹过滤为短句列表：去掉 JSON 块、标签行、重复诊断行。
 * 用于对话气泡与侧栏展示（侧栏可作兜底）。
 */
export function sanitizeThoughtLinesForUser(lines: string[]): string[] {
  if (!lines?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  let planDiagAdded = false;
  let searchDiagAdded = false;

  for (const raw of lines) {
    if (!raw || typeof raw !== 'string') continue;
    const segments = raw.includes('\n\n') ? raw.split(/\n\n+/) : [raw];
    for (const seg of segments) {
      const cleaned = stripProtocolTags(seg);
      if (!cleaned) continue;
      const splitLines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);
      for (let line of splitLines) {
        line = line.replace(/^\d+[.)]\s*/, '').trim();
        if (!line) continue;

        if (/^(Framing|Plan|任务卡) 输出回执[：:]/i.test(line)) {
          const rest = line.replace(/^(Framing|Plan|任务卡) 输出回执[：:]\s*/i, '').trim();
          if (rest && rest.length < 220 && !/^\{/.test(rest)) {
            pushUnique(out, seen, rest);
          }
          continue;
        }
        if (/^(Discovery|Search|检索规划) 输出回执[：:]/i.test(line)) {
          const rest = line.replace(/^(Discovery|Search|检索规划) 输出回执[：:]\s*/i, '').trim();
          if (rest && rest.length < 280 && !/^\{/.test(rest)) {
            pushUnique(out, seen, rest);
          }
          continue;
        }
        if (/^(Framing|Plan|任务卡) 诊断[：:]/i.test(line)) {
          if (!planDiagAdded) {
            planDiagAdded = true;
            pushUnique(out, seen, '已完成任务卡格式校验。');
          }
          continue;
        }
        if (/^(Discovery|Search|检索) 诊断[：:]/i.test(line)) {
          if (!searchDiagAdded) {
            searchDiagAdded = true;
            pushUnique(out, seen, '已完成检索输出校验。');
          }
          continue;
        }

        if (/^\{[\s\S]*\}$/.test(line) && line.length > 80) continue;
        if (/^[\[{]\s*"/.test(line) && line.length > 40) continue;
        if (/^"?(problemStatement|rqList|scopeInclude|keywordPlan|constraints)"?\s*:/i.test(line)) continue;

        if (line.length > 480) line = `${line.slice(0, 477)}…`;
        pushUnique(out, seen, line);
        if (out.length >= 20) return out;
      }
    }
  }
  return out;
}

function pushUnique(out: string[], seen: Set<string>, line: string) {
  if (seen.has(line)) return;
  seen.add(line);
  out.push(line);
}

/** 流式/进行中的单行步骤：去掉意外混入的标签片段 */
export function sanitizeThinkingStepLine(line: string): string {
  const s = stripProtocolTags(line).replace(/\s+/g, ' ').trim();
  if (s.length > 200) return `${s.slice(0, 197)}…`;
  return s;
}
