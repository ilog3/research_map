import type { McpToolExecutionDebug, ToolTraceItem } from '../types';

/** MCP CallToolResult 子集 + 调试载荷 */
export interface McpInvokeResponse {
  isError: boolean;
  content: Array<{ type: string; text: string }>;
  /** 服务端返回的结构化调试信息（搜索关键词、原始 JSON/HTML 片段等） */
  debug?: McpToolExecutionDebug;
}

const INVOKE_PATH = '/api/mcp-tools/invoke';

export async function invokeMcpTool(
  name:
    | 'web_search'
    | 'web_fetch'
    | 'academic_search'
    | 'research_feasibility_score'
    | 'chart_generate'
    | 'knowledge_graph_build'
    | 'document_export',
  args: Record<string, unknown>
): Promise<McpInvokeResponse> {
  const res = await fetch(INVOKE_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  });
  const raw = await res.text();
  let parsed: McpInvokeResponse;
  try {
    parsed = JSON.parse(raw) as McpInvokeResponse;
  } catch {
    throw new Error(`MCP 调用返回非 JSON：HTTP ${res.status} ${raw.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = parsed?.content?.[0]?.text || raw.slice(0, 300);
    throw new Error(`MCP HTTP ${res.status}: ${msg}`);
  }
  return parsed;
}

export function mcpResponseToText(r: McpInvokeResponse): string {
  return r.content?.map((c) => c.text).join('\n') || '';
}

export type WebMcpPlanDecision = {
  run: boolean;
  /** 当 run 为 false 时供界面展示的中文说明 */
  skipReason: string;
};

/**
 * VITE_WEB_MCP_MODE: off | auto | always（默认 auto）
 * - off 或 VITE_WEB_MCP_TOOLS=false：永不规划 MCP
 * - always：每轮规划
 * - auto：含 URL、显式检索用语、或「无摘要 + 较长问题 + 方法/数据类词」时规划
 */
export function getWebMcpPlanDecision(
  userQuestion: string,
  opts: { hasPaperAbstract: boolean }
): WebMcpPlanDecision {
  const q = userQuestion.trim();
  const off =
    String(import.meta.env.VITE_WEB_MCP_TOOLS ?? 'true').toLowerCase() === 'false' ||
    String(import.meta.env.VITE_WEB_MCP_MODE ?? 'auto').toLowerCase() === 'off';
  if (off) {
    return {
      run: false,
      skipReason:
        '已关闭：环境变量 VITE_WEB_MCP_TOOLS=false 或 VITE_WEB_MCP_MODE=off，本轮不调用联网工具。',
    };
  }
  const mode = String(import.meta.env.VITE_WEB_MCP_MODE ?? 'auto').toLowerCase();
  if (mode === 'always') {
    return { run: true, skipReason: '' };
  }
  if (/https?:\/\/\S+/i.test(q)) {
    return { run: true, skipReason: '' };
  }
  if (/(搜索|检索|web\s*search|在线查|查一下|网页|全文|外链|打不开|pdf\s*链接|doi\s*链接)/i.test(q)) {
    return { run: true, skipReason: '' };
  }
  if (
    !opts.hasPaperAbstract &&
    /(方法|数据|指标|实验|样本|问卷|局限|假设|量表|访谈|显著)/i.test(q) &&
    q.length > 12
  ) {
    return { run: true, skipReason: '' };
  }
  const hasAbs = opts.hasPaperAbstract;
  return {
    run: false,
    skipReason: hasAbs
      ? 'auto 模式：当前已有论文摘要，且问题中无 URL/显式检索词，故本轮不联网（仅基于摘要作答）。若需检索，请在问题里写明「搜索/检索/网页」等或贴上链接。'
      : 'auto 模式：问题较短或未命中方法/数据等触发词，且未含 URL/检索用语，故本轮不联网。可将 VITE_WEB_MCP_MODE=always 改为每轮启用。',
  };
}

export function shouldPlanWebTools(
  userQuestion: string,
  opts: { hasPaperAbstract: boolean }
): boolean {
  return getWebMcpPlanDecision(userQuestion, opts).run;
}

export function toolTraceFromMcp(
  idPrefix: string,
  name: string,
  summary: string,
  ok: boolean,
  debug?: McpToolExecutionDebug
): ToolTraceItem {
  return {
    id: `${idPrefix}-${name}-${Date.now()}`,
    tool: name,
    status: ok ? 'completed' : 'failed',
    summary,
    debug,
  };
}
