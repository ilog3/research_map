/** 辅导员式「反问用户偏好」句式，不应作为可点击追问（芯片应是用户口吻的下一条提问） */
const COACH_LIKE_CHIP =
  /^您(希望|是否|更想|需要|打算|想要|偏好|愿意)|^请问您|^能否请您|聚焦哪类|哪类.{0,16}(情境|场景|领域)|您想聚焦|您更关注|从哪(一)?个角度切入|您指的是哪|能否先说明.*需求/;

export function stripCoachLikeChips(chips: string[]): string[] {
  return chips.filter((c) => {
    const s = c.trim();
    if (s.length < 6) return false;
    return !COACH_LIKE_CHIP.test(s);
  });
}

/**
 * **仅作兜底**：在 `generateFollowUpSuggestions` 已尝试模型且解析结果仍为空（或请求失败）时调用。
 * 用用户原问抽主题生成「用户口吻」的追问，不替代模型优先策略。
 */
export function buildFallbackFollowUpChips(userQuestion: string): string[] {
  const raw = userQuestion.trim().replace(/\s+/g, ' ');
  if (raw.length < 2) return [];

  let topic = raw.replace(/[？?！!。.；;]+$/g, '').trim();
  const howRest = topic.match(/^(?:如何|怎么|怎样)(?:才能|更好地)?\s*(.+)$/);
  const doRest = topic.match(/^(?:怎么|如何)做\s*(.+)$/);
  if (howRest?.[1]?.trim()) topic = howRest[1].trim();
  else if (doRest?.[1]?.trim()) topic = doRest[1].trim();

  if (topic.length < 2) topic = raw.slice(0, 48);
  if (topic.length > 44) topic = `${topic.slice(0, 42)}…`;

  const chips: string[] = [];
  const q = userQuestion;

  if (/(阅读|读懂|精读|泛读|读完|啃)/.test(q)) {
    chips.push(`「${topic}」先抓结构还是先抓论点更合适？`);
    chips.push(`读完「${topic}」用什么办法自测有没有真懂？`);
  } else if (/(数据|收集|访谈|问卷|编码|分析|清洗|统计)/.test(q)) {
    chips.push(`「${topic}」最小可行样本量/时长怎么定比较稳？`);
    chips.push(`做「${topic}」时最怕哪类偏差，怎么提前规避？`);
  } else if (/(如何|怎么|怎样)/.test(q)) {
    chips.push(`「${topic}」要落地的话，第一步最小动作是什么？`);
    chips.push(`做「${topic}」最常见的坑在哪？`);
  } else {
    chips.push(`能把「${topic}」再拆细一点讲吗？`);
    chips.push(`怎么判断「${topic}」这一步做得好不好？`);
  }

  chips.push(`有没有针对「${topic.length > 18 ? `${topic.slice(0, 18)}…` : topic}」的简易检查清单？`);

  return stripCoachLikeChips(chips.filter((c) => c.length >= 8 && c.length <= 52)).slice(0, 4);
}

/**
 * 将模型返回的「下一步引导」拆成若干条可点击短句（与市面 Agent 的 follow-up chips 类似）。
 * 会去掉「您希望聚焦哪类…」等元问题，保留像用户自己会接着问的下一句。
 */
export function parseFollowUpChips(
  raw: string | undefined | null,
  max = 5,
  _opts?: { userQuestion?: string }
): string[] {
  const t = raw?.trim();
  if (!t) return [];
  const bySemi = t
    .split(/[；;]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);
  if (bySemi.length >= 2) return stripCoachLikeChips(dedupe(bySemi).slice(0, max));
  const lines = t
    .split(/\n+/)
    .map((s) => s.replace(/^\d+[\.、\)]\s*/, '').trim())
    .filter((s) => s.length >= 6);
  if (lines.length >= 2) return stripCoachLikeChips(dedupe(lines).slice(0, max));
  if (t.length >= 6) {
    const one = t.length > 200 ? `${t.slice(0, 197)}…` : t;
    const o = stripCoachLikeChips([one]);
    return o;
  }
  return [];
}

function dedupe(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const k = x.slice(0, 80);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}
