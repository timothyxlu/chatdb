// Chinese word segmentation using Intl.Segmenter.
// Works in Node.js 16+, Cloudflare Workers, and all modern browsers.
// Falls back to no-op (character-level FTS5 tokenization) if unavailable.

const CJK_RANGE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u2f800-\u2fa1f]/;

/** True if the text contains any CJK characters. */
export function containsCJK(text: string): boolean {
  return CJK_RANGE.test(text);
}

/**
 * Segment text for FTS5 indexing.
 * CJK portions are split into words (via Intl.Segmenter);
 * non-CJK text passes through unchanged.
 *
 * Example: "我在使用React框架" → "我 在 使用 React 框架"
 */
export function segmentText(text: string): string {
  if (!containsCJK(text)) return text;
  if (typeof Intl === 'undefined' || !('Segmenter' in Intl)) return text;

  const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
  const parts: string[] = [];

  for (const seg of segmenter.segment(text)) {
    // Skip whitespace-only segments to avoid double spaces
    if (/^\s+$/.test(seg.segment)) {
      parts.push(' ');
      continue;
    }
    parts.push(seg.segment);
  }

  // Join with spaces, then collapse multiple spaces
  return parts.join(' ').replace(/ {2,}/g, ' ').trim();
}

/**
 * Segment a search query for FTS5 MATCH.
 * Handles CJK word segmentation and escapes FTS5 special characters.
 */
export function segmentQuery(query: string): string {
  // Strip FTS5 operators that could break the query
  const cleaned = query.replace(/['"(){}[\]*:^~]/g, ' ').trim();
  if (!cleaned) return '';

  if (!containsCJK(cleaned)) return cleaned;

  return segmentText(cleaned);
}

/**
 * Clean up FTS5 snippet HTML: remove extra spaces between CJK tokens
 * that were introduced by segmentation, while preserving <mark> tags.
 */
export function cleanSnippet(html: string): string {
  if (!containsCJK(html)) return html;

  // Remove spaces between CJK characters (including across <mark> tags)
  // Pattern: CJK char → optional closing/opening mark tags → space → optional mark tags → CJK char
  let result = html;

  // Simple case: space between two CJK chars
  result = result.replace(
    /([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]) ([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff])/g,
    '$1$2',
  );
  // Apply twice to catch overlapping matches (e.g. "你 好 世 界")
  result = result.replace(
    /([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]) ([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff])/g,
    '$1$2',
  );

  // Space between CJK and mark tag boundary:  "学</mark> 很" → "学</mark>很"
  result = result.replace(
    /([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]<\/mark>) ([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff])/g,
    '$1$2',
  );
  result = result.replace(
    /([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]) (<mark>[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff])/g,
    '$1$2',
  );
  result = result.replace(
    /([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]<\/mark>) (<mark>[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff])/g,
    '$1$2',
  );

  return result;
}
