const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/**
 * Classify a diary H2 section heading into a visual timeline category.
 * @param {string} text
 * @returns {'patrol' | 'bounty' | 'summary' | 'mood' | 'other'}
 */
export function classifyHeading(text) {
  const s = String(text || '').trim();
  if (/make\.fun|赏金|封面赛/i.test(s)) return 'bounty';
  if (/当日小结|小结/.test(s)) return 'summary';
  if (/^心情/.test(s)) return 'mood';
  if (/巡游|^\d{1,2}:\d{2}/.test(s)) return 'patrol';
  return 'other';
}

/**
 * Strip common inline Markdown syntax into clean plain text.
 * @param {string} text
 * @returns {string}
 */
export function stripMarkdown(text) {
  return String(text || '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_`~>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Remove YAML frontmatter block if present.
 * @param {string} raw
 * @returns {string}
 */
function stripFrontmatter(raw) {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/^---\n[\s\S]*?\n---\n?/, '');
}

/**
 * Split markdown body (without frontmatter) into H2 sections.
 * @param {string} body
 */
function parseH2Sections(body) {
  const lines = stripFrontmatter(body).split('\n');
  const sections = [];
  let current = { heading: '', lines: [] };
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) {
      if (current.heading || current.lines.length) sections.push(current);
      current = { heading: m[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.heading || current.lines.length) sections.push(current);
  return sections;
}

/**
 * Extract the last "鱼的心情一句话" line, or fall back to a "## 心情" section.
 * @param {string} body
 * @returns {string | null}
 */
export function extractMoodQuote(body) {
  const cleanBody = stripFrontmatter(body);
  const lines = cleanBody.split('\n');
  let lastQuote = null;

  for (const line of lines) {
    const m = line.match(/鱼的心情一句话[：:]\s*(.+)$/);
    if (m) {
      const cleaned = stripMarkdown(m[1]);
      if (cleaned) lastQuote = cleaned;
    }
  }
  if (lastQuote) return lastQuote;

  const sections = parseH2Sections(cleanBody).filter(
    (s) => classifyHeading(s.heading) === 'mood'
  );
  if (sections.length) {
    const lastMood = sections[sections.length - 1];
    const joined = stripMarkdown(lastMood.lines.join(' '));
    if (joined) return joined;
  }

  return null;
}

/**
 * Build a readable excerpt preferring "## 当日小结", then mood quote, then clean prose.
 * @param {string} body
 * @param {number} [maxLen=110]
 * @returns {string}
 */
export function smartExcerpt(body, maxLen = 110) {
  const cleanBody = stripFrontmatter(body);
  const sections = parseH2Sections(cleanBody);

  const summarySec = [...sections]
    .reverse()
    .find((s) => classifyHeading(s.heading) === 'summary');
  if (summarySec) {
    const summaryLines = summarySec.lines
      .filter((l) => l.trim() && !/鱼的心情一句话[：:]/.test(l))
      .map((l) => stripMarkdown(l))
      .filter(Boolean);
    const candidate = summaryLines.join(' ').trim();
    if (candidate) {
      return candidate.length > maxLen ? `${candidate.slice(0, maxLen)}…` : candidate;
    }
  }

  const mood = extractMoodQuote(cleanBody);
  if (mood) {
    return mood.length > maxLen ? `${mood.slice(0, maxLen)}…` : mood;
  }

  const fallback = cleanBody
    .split('\n')
    .filter((l) => !/^##\s+/.test(l.trim()))
    .map((l) => stripMarkdown(l))
    .filter(Boolean)
    .join(' ')
    .trim();

  if (!fallback) return '';
  return fallback.length > maxLen ? `${fallback.slice(0, maxLen)}…` : fallback;
}

/**
 * Compute structured metadata & badges for a diary entry.
 * @param {string} body
 * @param {{ date?: string, audio?: string }} [data]
 */
export function extractDiaryStats(body, data = {}) {
  const cleanBody = stripFrontmatter(body);
  const sections = parseH2Sections(cleanBody);

  let weekday = '';
  if (data && typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    const dt = new Date(`${data.date}T00:00:00+08:00`);
    if (!Number.isNaN(dt.getTime())) {
      const utcDay = new Date(dt.getTime() + 8 * 60 * 60 * 1000).getUTCDay();
      weekday = WEEKDAYS[utcDay] || '';
    }
  }

  const patrolCount = sections.filter(
    (s) => s.heading && classifyHeading(s.heading) === 'patrol'
  ).length;

  const bvMatches = cleanBody.match(/\bBV[0-9A-Za-z]{6,}\b/g) || [];
  const videoCount = new Set(bvMatches).size;

  const hasBounty = /make\.fun|赏金|封面赛/i.test(cleanBody);
  const hasAudio = Boolean(data && data.audio);

  const topics = [];
  if (/单机游戏|独立游戏|3A|Steam|新游评测|GTA/i.test(cleanBody)) topics.push('单机游戏');
  if (/\bAI\b|大模型|Agent|DeepSeek|Qwen|Claude|Gemini|GPT/i.test(cleanBody)) topics.push('AI');
  if (/大肥鱼|鲸鱼娘/.test(cleanBody)) topics.push('大肥鱼');
  if (hasBounty) topics.push('赏金');

  const plainChars = stripMarkdown(cleanBody).replace(/\s+/g, '').length;
  const readingMinutes = Math.max(1, Math.round(plainChars / 420));

  return {
    weekday,
    patrolCount,
    videoCount,
    hasBounty,
    hasAudio,
    readingMinutes,
    topics,
    moodQuote: extractMoodQuote(cleanBody),
    summaryExcerpt: smartExcerpt(cleanBody),
  };
}
