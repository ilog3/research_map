/**
 * Dev-server middleware: MCP 风格工具执行（web_search / web_fetch / academic_search 等）。
 * 可选接入 Open-WebSearch 本地 daemon（https://github.com/Aas-ee/open-webSearch）：
 *   VITE_OPEN_WEBSEARCH_URL=http://127.0.0.1:3210
 * 需先在本机执行 `open-websearch serve`（或 npm run serve，默认端口见该项目文档）。
 * 生产静态部署需另行提供等价 HTTP 端点。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { loadEnv } from 'vite'

/** 与 src/types McpToolExecutionDebug 对齐；供 /api/mcp-tools/invoke 调试字段 */
type ToolDebug = {
  tool: string
  provider: string
  request: Record<string, unknown>
  rawResponsePreview?: string
  notes?: string[]
  comparableBrowserSearchUrls?: string[]
  resultHitUrls?: string[]
}

const DEBUG_PREVIEW_MAX = 48_000

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}\n…(truncated, total ${s.length} chars)`
}

function redactGoogleCseUrl(url: string): string {
  return url.replace(/([?&])key=[^&]*/i, '$1key=REDACTED')
}

/** Open-WebSearch 失败后回退到 Google/直连时，合并两段调试信息 */
function mergeOwsFallbackDebug(
  owsFail: ToolDebug | undefined,
  primary: ToolDebug | undefined,
  toolLabel: string
): ToolDebug | undefined {
  if (!owsFail) return primary
  if (!primary) return owsFail
  return {
    ...primary,
    request: {
      ...primary.request,
      openWebSearchAttempt: owsFail.request,
    },
    notes: [
      ...(primary.notes ?? []),
      `Open-WebSearch 先尝试未成功，已回退。rawResponsePreview 前半为 OWS 信封，后半为回退（${toolLabel}）。`,
    ],
    rawResponsePreview: truncate(
      `--- Open-WebSearch ---\n${owsFail.rawResponsePreview ?? ''}\n\n--- Fallback ---\n${primary.rawResponsePreview ?? ''}`,
      DEBUG_PREVIEW_MAX
    ),
  }
}

type ToolHandlerResult = { isError: boolean; text: string; debug?: ToolDebug }

function toSafeLine(v: unknown, max = 240): string {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  return s.length > max ? `${s.slice(0, max)}…` : s
}

type OpenWebSearchEnvelope<T> = {
  status: 'ok' | 'error'
  data: T | null
  error: { code?: string; message?: string } | null
  hint?: string | null
}

type OwsSearchResult = {
  query: string
  engines: string[]
  totalResults: number
  results: Array<{ title: string; url: string; description: string; source: string; engine: string }>
  partialFailures?: Array<{ engine: string; message: string }>
}

function normalizeOwsBase(url: string): string {
  return url.replace(/\/+$/, '')
}

async function postOpenWebSearch<T>(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<OpenWebSearchEnvelope<T>> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(`${normalizeOwsBase(baseUrl)}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    })
    const parsed = (await res.json()) as OpenWebSearchEnvelope<T>
    return parsed
  } finally {
    clearTimeout(t)
  }
}

function formatOpenWebSearchSearch(data: OwsSearchResult): { isError: boolean; text: string } {
  if (!data.results?.length) {
    const fails = data.partialFailures?.map((f) => `${f.engine}: ${f.message}`).join('; ') || ''
    return {
      isError: false,
      text: `web_search（Open-WebSearch，引擎 ${data.engines.join(', ')}）：无命中结果。${fails ? ` 部分失败：${fails}` : ''}`,
    }
  }
  const lines = data.results.map((r, i) => {
    const title = (r.title || '').trim()
    const url = (r.url || '').trim()
    const desc = (r.description || '').trim()
    return `${i + 1}. ${title}\n   URL: ${url}\n   ${desc}\n   （${r.engine} / ${r.source}）`
  })
  const failBlock =
    data.partialFailures && data.partialFailures.length > 0
      ? `\n\n部分引擎失败：\n${data.partialFailures.map((f) => `- ${f.engine}: ${f.message}`).join('\n')}`
      : ''
  return {
    isError: false,
    text: `web_search（Open-WebSearch，query=${JSON.stringify(data.query)}，引擎 ${data.engines.join(', ')}，${data.totalResults} 条）：\n\n${lines.join('\n\n')}${failBlock}`,
  }
}

async function handleWebSearchOpenWebSearch(
  baseUrl: string,
  args: Record<string, unknown>
): Promise<ToolHandlerResult> {
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  if (!query) return { isError: true, text: 'web_search: missing query' }
  const num =
    typeof args.num_results === 'number' && args.num_results > 0
      ? Math.min(Math.floor(args.num_results), 50)
      : 10
  const payload: Record<string, unknown> = { query, limit: num }
  const engines = args.engines
  if (Array.isArray(engines) && engines.every((x) => typeof x === 'string')) {
    payload.engines = engines
  }
  const searchMode = args.search_mode ?? args.searchMode
  if (searchMode === 'request' || searchMode === 'auto' || searchMode === 'playwright') {
    payload.searchMode = searchMode
  }
  const env = await postOpenWebSearch<OwsSearchResult>(baseUrl, '/search', payload, 90_000)
  const debug: ToolDebug = {
    tool: 'web_search',
    provider: 'open_websearch',
    request: {
      openWebSearchBase: normalizeOwsBase(baseUrl),
      path: '/search',
      /** 与模型/插件约定：搜索关键词与条数 */
      query,
      limit: num,
      engines: payload.engines,
      searchMode: payload.searchMode,
    },
    rawResponsePreview: truncate(JSON.stringify(env, null, 2), DEBUG_PREVIEW_MAX),
    notes: ['POST /search 返回的完整 JSON 信封（含 query、engines、results 等）'],
  }
  if (env.status !== 'ok' || !env.data) {
    const msg = env.error?.message || env.hint || 'Open-WebSearch /search 失败'
    return { isError: true, text: `web_search（Open-WebSearch）: ${msg}`, debug }
  }
  const formatted = formatOpenWebSearchSearch(env.data)
  const hitUrls = (env.data.results ?? [])
    .map((r) => r.url)
    .filter((u): u is string => Boolean(u && typeof u === 'string'))
    .slice(0, 24)
  const bingComparable = `https://www.bing.com/search?q=${encodeURIComponent(query)}`
  debug.comparableBrowserSearchUrls = [bingComparable]
  debug.resultHitUrls = hitUrls
  debug.notes = [
    ...(debug.notes ?? []),
    'Open-WebSearch 的 Bing 通道多为服务端抓取/API，与浏览器访问 bing.com 的排序、地域、登录态、安全拦截可能不一致；可用 comparableBrowserSearchUrls 对照。',
  ]
  return { ...formatted, debug }
}

async function handleWebFetchOpenWebSearch(
  baseUrl: string,
  args: Record<string, unknown>
): Promise<ToolHandlerResult> {
  const urlRaw = typeof args.url === 'string' ? args.url.trim() : ''
  if (!urlRaw) return { isError: true, text: 'web_fetch: missing url' }
  let maxChars =
    typeof args.max_chars === 'number' && args.max_chars >= 1000
      ? Math.min(Math.floor(args.max_chars), 200_000)
      : 24_000
  maxChars = Math.max(1000, maxChars)
  const readability = args.readability === true
  const includeLinks = args.include_links === true || args.includeLinks === true
  const payload: Record<string, unknown> = { url: urlRaw, maxChars }
  if (readability) payload.readability = true
  if (includeLinks) payload.includeLinks = true

  type FetchData = {
    url?: string
    finalUrl?: string
    title?: string
    contentType?: string
    content?: string
    truncated?: boolean
    retrievalMethod?: string
  }
  const env = await postOpenWebSearch<FetchData>(baseUrl, '/fetch-web', payload, 120_000)
  const debug: ToolDebug = {
    tool: 'web_fetch',
    provider: 'open_websearch',
    request: {
      openWebSearchBase: normalizeOwsBase(baseUrl),
      path: '/fetch-web',
      url: urlRaw,
      maxChars,
      readability,
      includeLinks,
    },
    rawResponsePreview: truncate(JSON.stringify(env, null, 2), DEBUG_PREVIEW_MAX),
    notes: ['POST /fetch-web 完整 JSON（data.content 常为正文或 HTML 片段）'],
  }
  if (env.status !== 'ok' || !env.data) {
    const msg = env.error?.message || env.hint || 'Open-WebSearch /fetch-web 失败'
    return { isError: true, text: `web_fetch（Open-WebSearch）: ${msg}`, debug }
  }
  const d = env.data
  const title = (d.title || '').trim()
  const content = String(d.content || '')
  const finalU = (d.finalUrl || d.url || urlRaw).trim()
  const head = `web_fetch（Open-WebSearch）\n标题: ${title || '（无）'}\nURL: ${finalU}\n类型: ${d.contentType || '—'}\n抓取: ${d.retrievalMethod || '—'}${d.truncated ? '（已截断）' : ''}\n\n`
  return { isError: false, text: `${head}${content}`, debug }
}

function readJsonBody(req: IncomingMessage, maxBytes = 256_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (c: Buffer) => {
      total += c.length
      if (total > maxBytes) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function assertSafeFetchUrl(urlStr: string): URL {
  let u: URL
  try {
    u = new URL(urlStr)
  } catch {
    throw new Error('invalid URL')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('only http/https allowed')
  }
  const host = u.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  ) {
    throw new Error('local hosts are not allowed')
  }
  if (
    /^127\.\d+\.\d+\.\d+$/.test(host) ||
    /^10\.\d+\.\d+\.\d+$/.test(host) ||
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host) ||
    /^169\.254\.\d+\.\d+$/.test(host) ||
    /^100\.(64|6[5-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(host)
  ) {
    throw new Error('private/reserved address blocked')
  }
  return u
}

function htmlToPlainText(html: string, maxChars: number): string {
  let t = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
  t = t.replace(/<\/(p|div|br|tr|h[1-6]|li)\b>/gi, '\n')
  t = t.replace(/<[^>]+>/g, ' ')
  t = t.replace(/&nbsp;/gi, ' ')
  t = t.replace(/&amp;/gi, '&')
  t = t.replace(/&lt;/gi, '<')
  t = t.replace(/&gt;/gi, '>')
  t = t.replace(/&quot;/gi, '"')
  t = t.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  t = t.replace(/[ \t]{2,}/g, ' ').trim()
  if (t.length > maxChars) t = `${t.slice(0, maxChars)}\n…(truncated)`
  return t
}

async function fetchWithLimits(
  url: string,
  opts: { maxBytes: number; timeoutMs: number }
): Promise<{ status: number; contentType: string; text: string }> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'PedascopeWebMcp/1.0 (+https://localhost; research_map2 dev tool fetch)',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
      },
    })
    const ct = res.headers.get('content-type') || ''
    const reader = res.body?.getReader()
    if (!reader) {
      const buf = await res.arrayBuffer()
      const slice = buf.byteLength > opts.maxBytes ? buf.slice(0, opts.maxBytes) : buf
      const text = new TextDecoder('utf-8', { fatal: false }).decode(slice)
      return { status: res.status, contentType: ct, text }
    }
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total > opts.maxBytes) {
          chunks.push(value.slice(0, Math.max(0, opts.maxBytes - (total - value.byteLength))))
          break
        }
        chunks.push(value)
      }
    }
    const all = new Uint8Array(Math.min(total, opts.maxBytes))
    let off = 0
    for (const c of chunks) {
      all.set(c, off)
      off += c.byteLength
      if (off >= opts.maxBytes) break
    }
    const text = new TextDecoder('utf-8', { fatal: false }).decode(all)
    return { status: res.status, contentType: ct, text }
  } finally {
    clearTimeout(timer)
  }
}

async function handleWebSearch(
  args: Record<string, unknown>,
  googleKey: string,
  googleCx: string
): Promise<ToolHandlerResult> {
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  const num = typeof args.num_results === 'number' && args.num_results > 0 ? Math.min(args.num_results, 10) : 8
  if (!query) return { isError: true, text: 'web_search: missing query' }
  if (!googleKey || !googleCx) {
    return {
      isError: true,
      text:
        'web_search: 未配置 Google Programmable Search。请在 .env 设置 VITE_GOOGLE_CSE_API_KEY 与 VITE_GOOGLE_CSE_CX（与前端检索共用同一套密钥）。',
    }
  }
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(googleKey)}&cx=${encodeURIComponent(googleCx)}&q=${encodeURIComponent(query)}&num=${num}`
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 20_000)
  try {
    const res = await fetch(url, { signal: ac.signal })
    const rawText = await res.text()
    const debug: ToolDebug = {
      tool: 'web_search',
      provider: 'google_cse',
      request: {
        query,
        num,
        /** 请求 URL（key 已脱敏） */
        apiUrl: redactGoogleCseUrl(url),
      },
      rawResponsePreview: truncate(rawText, DEBUG_PREVIEW_MAX),
      notes: ['Google Custom Search JSON API 原始响应体'],
      comparableBrowserSearchUrls: [
        `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      ],
    }
    let data: {
      items?: Array<{ title?: string; link?: string; snippet?: string }>
      error?: { message?: string }
    }
    try {
      data = JSON.parse(rawText) as typeof data
    } catch {
      return {
        isError: true,
        text: `web_search: Google API 返回非 JSON（HTTP ${res.status}）`,
        debug,
      }
    }
    if (!res.ok) {
      return {
        isError: true,
        text: `web_search: Google API ${res.status} ${data?.error?.message || ''}`.trim(),
        debug,
      }
    }
    const items = data.items ?? []
    if (!items.length) {
      return { isError: false, text: `web_search: 无结果 query=${JSON.stringify(query)}`, debug }
    }
    const lines = items.map((it, i) => {
      const title = (it.title || '').trim()
      const link = (it.link || '').trim()
      const sn = (it.snippet || '').trim()
      return `${i + 1}. ${title}\n   URL: ${link}\n   ${sn}`
    })
    debug.resultHitUrls = items.map((it) => it.link).filter((u): u is string => Boolean(u && typeof u === 'string'))
    debug.notes = [
      ...(debug.notes ?? []),
      'CSE API 结果与「Google 网页搜索」不一定相同；可用 comparableBrowserSearchUrls 对照。',
    ]
    return {
      isError: false,
      text: `web_search 结果（Google CSE，${items.length} 条）：\n${lines.join('\n\n')}`,
      debug,
    }
  } finally {
    clearTimeout(t)
  }
}

async function handleWebFetch(args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const urlRaw = typeof args.url === 'string' ? args.url.trim() : ''
  const maxChars =
    typeof args.max_chars === 'number' && args.max_chars > 500
      ? Math.min(args.max_chars, 120_000)
      : 24_000
  if (!urlRaw) return { isError: true, text: 'web_fetch: missing url' }
  let u: URL
  try {
    u = assertSafeFetchUrl(urlRaw)
  } catch (e) {
    return { isError: true, text: `web_fetch: ${e instanceof Error ? e.message : 'blocked URL'}` }
  }
  try {
    const { status, contentType, text } = await fetchWithLimits(u.toString(), {
      maxBytes: 1_500_000,
      timeoutMs: 25_000,
    })
    const lowerCt = contentType.toLowerCase()
    const debug: ToolDebug = {
      tool: 'web_fetch',
      provider: 'direct_fetch',
      request: {
        url: u.toString(),
        maxChars,
        maxBytesRead: 1_500_000,
        httpStatus: status,
        contentType,
      },
      rawResponsePreview: truncate(text, DEBUG_PREVIEW_MAX),
      notes: [
        lowerCt.includes('html') || /<html[\s>]/i.test(text.slice(0, 500))
          ? '原始 HTML/文本字节（UTF-8）；上方 MCP 正文已做 htmlToPlainText'
          : '原始响应正文片段；若过长已截断于 rawResponsePreview',
      ],
    }
    let body = text
    if (lowerCt.includes('html') || /<html[\s>]/i.test(text.slice(0, 500))) {
      body = htmlToPlainText(text, maxChars)
    } else if (body.length > maxChars) {
      body = `${body.slice(0, maxChars)}\n…(truncated)`
    }
    return {
      isError: false,
      text: `web_fetch: HTTP ${status} ${contentType}\nURL: ${u.toString()}\n\n${body}`,
      debug,
    }
  } catch (e) {
    return {
      isError: true,
      text: `web_fetch failed: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

async function handleAcademicSearch(
  args: Record<string, unknown>,
  googleKey: string,
  googleCx: string,
  openWebSearchUrl: string
): Promise<ToolHandlerResult> {
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  if (!query) return { isError: true, text: 'academic_search: missing query' }
  const years = typeof args.years === 'number' && args.years > 0 ? Math.min(Math.floor(args.years), 10) : 5
  const role = toSafeLine(args.user_role ?? '')
  const field = toSafeLine(args.research_field ?? '')
  const q = `${query} 教育 研究 近${years}年 ${field} ${role}`.trim()
  const innerArgs = {
    query: q,
    num_results:
      typeof args.num_results === 'number' && args.num_results > 0
        ? Math.min(Math.floor(args.num_results), 20)
        : 12,
  }

  let inner: ToolHandlerResult
  let owsSearchFail: ToolDebug | undefined
  if (openWebSearchUrl) {
    try {
      inner = await handleWebSearchOpenWebSearch(openWebSearchUrl, innerArgs)
      if (inner.isError) {
        owsSearchFail = inner.debug
        inner = await handleWebSearch(innerArgs, googleKey, googleCx)
      }
    } catch {
      owsSearchFail = {
        tool: 'web_search',
        provider: 'open_websearch',
        request: { openWebSearchBase: normalizeOwsBase(openWebSearchUrl), query: q },
        notes: ['Open-WebSearch 调用异常，已回退 Google CSE'],
      }
      inner = await handleWebSearch(innerArgs, googleKey, googleCx)
    }
  } else {
    inner = await handleWebSearch(innerArgs, googleKey, googleCx)
  }
  if (inner.isError) return { isError: true, text: `academic_search failed: ${inner.text}`, debug: inner.debug }
  const mergedDebug = mergeOwsFallbackDebug(owsSearchFail, inner.debug, 'academic_search fallback')
  const text = [
    `academic_search（近${years}年学术检索）`,
    `用户意图: ${query}`,
    field ? `研究领域: ${field}` : '',
    role ? `用户身份: ${role}` : '',
    '',
    inner.text,
  ]
    .filter(Boolean)
    .join('\n')
  const debug: ToolDebug | undefined = mergedDebug
    ? { ...mergedDebug, tool: 'academic_search', notes: [...(mergedDebug.notes ?? []), '由学术检索包装 web_search 生成'] }
    : undefined
  return { isError: false, text, debug }
}

async function handleResearchFeasibilityScore(args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const title = toSafeLine(args.title ?? args.topic ?? '')
  if (!title) return { isError: true, text: 'research_feasibility_score: missing title/topic' }
  const role = toSafeLine(args.user_role ?? '')
  const timeLimit = toSafeLine(args.time_limit ?? '')
  const innovationHint = toSafeLine(args.innovation_hint ?? '')
  const dataHint = toSafeLine(args.data_hint ?? '')

  let feasibility = 7
  let innovation = 6
  let rigor = 7

  if (/本科/.test(role)) feasibility -= 1
  if (/博士/.test(role)) rigor += 1
  if (/1\s*个月|一个月/.test(timeLimit)) feasibility -= 1
  if (/半年/.test(timeLimit)) feasibility += 1
  if (/创新|前沿|机制|因果|跨学科/.test(innovationHint + title)) innovation += 1
  if (/问卷|访谈|课堂|学校|公开数据|可获取/.test(dataHint + title)) feasibility += 1
  if (/实验|随机|追踪|纵向/.test(title)) rigor += 1

  feasibility = Math.max(1, Math.min(10, feasibility))
  innovation = Math.max(1, Math.min(10, innovation))
  rigor = Math.max(1, Math.min(10, rigor))
  const total = Number(((feasibility + innovation + rigor) / 3).toFixed(1))

  const payload = {
    title,
    userRole: role || '未提供',
    timeLimit: timeLimit || '未提供',
    scores: {
      feasibility,
      innovation,
      rigor,
      total,
    },
    note:
      total >= 8
        ? '综合可行性高，建议进入开题细化。'
        : total >= 6
          ? '综合可行性中等，建议优化样本可得性与研究边界。'
          : '综合可行性偏低，建议缩小题目范围并补充可获取数据来源。',
  }
  return {
    isError: false,
    text: `research_feasibility_score\n${JSON.stringify(payload, null, 2)}`,
    debug: {
      tool: 'research_feasibility_score',
      provider: 'local_rule_engine',
      request: { title, role, timeLimit, innovationHint, dataHint },
      rawResponsePreview: JSON.stringify(payload, null, 2),
      notes: ['本地规则评分（演示实现）；可替换为真实评分服务。'],
    },
  }
}

async function handleChartGenerate(args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const topic = toSafeLine(args.topic ?? args.query ?? '')
  const years = typeof args.years === 'number' && args.years > 0 ? Math.min(Math.floor(args.years), 10) : 5
  if (!topic) return { isError: true, text: 'chart_generate: missing topic/query' }
  const out = {
    chartType: 'line',
    title: `${topic} 近${years}年发文趋势（示意）`,
    x: Array.from({ length: years }, (_, i) => `${new Date().getFullYear() - (years - 1 - i)}`),
    y: Array.from({ length: years }, (_, i) => 12 + i * 3),
    note: '当前为本地示意数据，建议后续接入真实 bibliometric 数据源。',
  }
  return { isError: false, text: `chart_generate\n${JSON.stringify(out, null, 2)}` }
}

async function handleKnowledgeGraphBuild(args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const topic = toSafeLine(args.topic ?? args.query ?? '')
  if (!topic) return { isError: true, text: 'knowledge_graph_build: missing topic/query' }
  const out = {
    topic,
    nodes: [
      { id: 'root', label: topic, type: 'topic' },
      { id: 'branch-1', label: '研究对象细分', type: 'branch' },
      { id: 'branch-2', label: '方法路径细分', type: 'branch' },
      { id: 'gap-1', label: '研究缺口候选', type: 'gap' },
    ],
    edges: [
      { from: 'root', to: 'branch-1' },
      { from: 'root', to: 'branch-2' },
      { from: 'branch-2', to: 'gap-1' },
    ],
  }
  return { isError: false, text: `knowledge_graph_build\n${JSON.stringify(out, null, 2)}` }
}

async function handleDocumentExport(args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const title = toSafeLine(args.title ?? '教育研究选题论证报告')
  const fmt = toSafeLine(args.format ?? 'pdf').toLowerCase()
  const out = {
    status: 'queued',
    title,
    format: fmt === 'word' ? 'word' : 'pdf',
    note: '当前为占位导出结果。可在后续接入实际文档服务并返回下载链接。',
  }
  return { isError: false, text: `document_export\n${JSON.stringify(out, null, 2)}` }
}

export function webMcpToolsPlugin(): Plugin {
  let googleKey = ''
  let googleCx = ''
  /** 非空时优先走 Open-WebSearch HTTP daemon（/search、/fetch-web） */
  let openWebSearchUrl = ''
  return {
    name: 'web-mcp-tools',
    configResolved(config) {
      const env = loadEnv(config.mode, process.cwd(), '')
      googleKey = env.VITE_GOOGLE_CSE_API_KEY || ''
      googleCx = env.VITE_GOOGLE_CSE_CX || ''
      openWebSearchUrl = (env.VITE_OPEN_WEBSEARCH_URL || '').trim()
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/mcp-tools/invoke') || req.method !== 'POST') {
          next()
          return
        }
        const httpReq = req as IncomingMessage
        const httpRes = res as ServerResponse
        let raw: string
        try {
          raw = await readJsonBody(httpReq)
        } catch {
          sendJson(httpRes, 400, { isError: true, content: [{ type: 'text', text: 'invalid body' }] })
          return
        }
        let body: { name?: string; arguments?: Record<string, unknown> }
        try {
          body = JSON.parse(raw) as { name?: string; arguments?: Record<string, unknown> }
        } catch {
          sendJson(httpRes, 400, { isError: true, content: [{ type: 'text', text: 'JSON parse error' }] })
          return
        }
        const name = body.name
        const args = body.arguments && typeof body.arguments === 'object' ? body.arguments : {}
        try {
          if (name === 'web_search') {
            let owsSearchFail: ToolDebug | undefined
            if (openWebSearchUrl) {
              try {
                const ows = await handleWebSearchOpenWebSearch(openWebSearchUrl, args)
                if (!ows.isError) {
                  sendJson(httpRes, 200, {
                    isError: false,
                    content: [{ type: 'text', text: ows.text }],
                    debug: ows.debug,
                  })
                  return
                }
                owsSearchFail = ows.debug
              } catch {
                // 守护进程不可用或网络错误：回退 Google CSE
              }
            }
            const r = await handleWebSearch(args, googleKey, googleCx)
            sendJson(httpRes, 200, {
              isError: r.isError,
              content: [{ type: 'text', text: r.text }],
              debug: mergeOwsFallbackDebug(owsSearchFail, r.debug, 'Google CSE'),
            })
            return
          }
          if (name === 'web_fetch') {
            let owsFetchFail: ToolDebug | undefined
            if (openWebSearchUrl) {
              try {
                const ows = await handleWebFetchOpenWebSearch(openWebSearchUrl, args)
                if (!ows.isError) {
                  sendJson(httpRes, 200, {
                    isError: false,
                    content: [{ type: 'text', text: ows.text }],
                    debug: ows.debug,
                  })
                  return
                }
                owsFetchFail = ows.debug
              } catch {
                // 回退内置抓取
              }
            }
            const r = await handleWebFetch(args)
            sendJson(httpRes, 200, {
              isError: r.isError,
              content: [{ type: 'text', text: r.text }],
              debug: mergeOwsFallbackDebug(owsFetchFail, r.debug, 'direct fetch'),
            })
            return
          }
          if (name === 'academic_search') {
            const r = await handleAcademicSearch(args, googleKey, googleCx, openWebSearchUrl)
            sendJson(httpRes, 200, {
              isError: r.isError,
              content: [{ type: 'text', text: r.text }],
              debug: r.debug,
            })
            return
          }
          if (name === 'research_feasibility_score') {
            const r = await handleResearchFeasibilityScore(args)
            sendJson(httpRes, 200, {
              isError: r.isError,
              content: [{ type: 'text', text: r.text }],
              debug: r.debug,
            })
            return
          }
          if (name === 'chart_generate') {
            const r = await handleChartGenerate(args)
            sendJson(httpRes, 200, {
              isError: r.isError,
              content: [{ type: 'text', text: r.text }],
              debug: r.debug,
            })
            return
          }
          if (name === 'knowledge_graph_build') {
            const r = await handleKnowledgeGraphBuild(args)
            sendJson(httpRes, 200, {
              isError: r.isError,
              content: [{ type: 'text', text: r.text }],
              debug: r.debug,
            })
            return
          }
          if (name === 'document_export') {
            const r = await handleDocumentExport(args)
            sendJson(httpRes, 200, {
              isError: r.isError,
              content: [{ type: 'text', text: r.text }],
              debug: r.debug,
            })
            return
          }
          sendJson(httpRes, 400, {
            isError: true,
            content: [{ type: 'text', text: `unknown tool: ${String(name)}` }],
          })
        } catch (e) {
          sendJson(httpRes, 500, {
            isError: true,
            content: [{ type: 'text', text: e instanceof Error ? e.message : 'tool error' }],
          })
        }
      })
    },
  }
}
