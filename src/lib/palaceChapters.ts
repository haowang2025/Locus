import type { PalaceSource, SourceSpan } from './palaceTypes'
import { segmentSource, sourceSpan } from './palaceSegmentation'
import { sourceFingerprint } from './palaceModelProposal'

export interface ChapterBudget { maxCharacters: number; maxUnits: number; maxChapters: number }
export interface MaterialChapter { id: string; title: string; span: SourceSpan; candidateUnits: number; ready: boolean; warnings: string[] }
export interface ChapterCollection {
  schemaVersion: 1
  source: PalaceSource
  sourceFingerprint: string
  collectionFingerprint: string
  budget: ChapterBudget
  chapters: MaterialChapter[]
  notice: string
}
const DEFAULT_BUDGET: ChapterBudget = { maxCharacters: 12_000, maxUnits: 36, maxChapters: 120 }

function chapterTitle(title: string, part: number): string {
  const suffix = part > 1 ? ` · 续 ${part}` : ''
  const limit = 240 - suffix.length
  let prefix = title.slice(0, limit)
  if (/[\uD800-\uDBFF]$/.test(prefix)) prefix = prefix.slice(0, -1)
  return prefix + suffix
}

function headings(text: string): Array<{ start: number; title: string }> {
  const results: Array<{ start: number; title: string }> = []
  const pattern = /^(?:[ \t]*#{1,6}[ \t]+(.+)|[ \t]*(第[一二三四五六七八九十百零\d]+[章篇部][^\r\n]*|Chapter[ \t]+\d+[^\r\n]*))[ \t]*$/gmi
  for (const match of text.matchAll(pattern)) results.push({ start: match.index, title: (match[1] ?? match[2]).trim().slice(0, 200) })
  return results
}

/** Pure local planning only: creates no palace, changes no source and invokes no model. */
export function partitionMaterial(source: PalaceSource, overrides: Partial<ChapterBudget> = {}): ChapterCollection {
  source = parseChapterSource(source)
  if (!source.text.trim()) throw new Error('请输入需要分章的完整材料。')
  if (source.text.length > 200_000) throw new Error('本地分章预览最多处理 200,000 字符，请先按文档分开。原文未被截断。')
  const budget = { ...DEFAULT_BUDGET, ...overrides }
  if (!Number.isSafeInteger(budget.maxCharacters) || budget.maxCharacters < 100 || budget.maxCharacters > 200_000 || !Number.isSafeInteger(budget.maxUnits) || budget.maxUnits < 1 || budget.maxUnits > 240 || !Number.isSafeInteger(budget.maxChapters) || budget.maxChapters < 1 || budget.maxChapters > 120) throw new Error('分章预算无效。')
  const found = headings(source.text)
  const sections = found[0]?.start === 0 ? found : [{ start: 0, title: source.title || '材料' }, ...found]
  const chapters: MaterialChapter[] = []
  let totalCandidates = 0
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    const section = sections[sectionIndex], sectionEnd = sections[sectionIndex + 1]?.start ?? source.text.length
    const raw = source.text.slice(section.start, sectionEnd)
    if (!raw.trim()) continue
    const candidates = segmentSource(raw, budget.maxUnits * budget.maxChapters)
    totalCandidates += candidates.length
    if (totalCandidates > budget.maxUnits * budget.maxChapters) throw new Error('材料候选单元过多，超出本地分章预览预算。请拆成多个文档；原文未被截断。')
    let groupStart = section.start, groupEnd = section.start, count = 0, part = 1
    const flush = (end: number) => {
      if (end <= groupStart || !source.text.slice(groupStart, end).trim()) return
      if (chapters.length >= budget.maxChapters) throw new Error(`需要超过 ${budget.maxChapters} 个章节，超出本地预览预算。请先按文档分开；原文未被截断。`)
      const warnings: string[] = []
      if (end - groupStart > budget.maxCharacters) warnings.push('这个完整候选单元超过单章字符预算，需要人工选择安全边界；没有截断公式或原句。')
      if (part > 1 && /(?:^|\n)\s*(?:\d+[.)、]|第[一二三四五六七八九十\d]+步)/.test(raw)) warnings.push('该章节包含跨章步骤，请先浏览完整顺序，再分开练习。')
      chapters.push({ id: `chapter-${String(chapters.length + 1).padStart(3, '0')}`, title: chapterTitle(section.title, part), span: sourceSpan(source.text, groupStart, end), candidateUnits: count, ready: warnings.every(w => !w.includes('超过单章字符预算')), warnings })
      groupStart = end; groupEnd = end; count = 0; part++
    }
    for (const unit of candidates) {
      const start = section.start + unit.spans[0].start, end = section.start + unit.spans.at(-1)!.end
      if (count && (count >= budget.maxUnits || end - groupStart > budget.maxCharacters)) flush(groupEnd)
      // Whitespace between candidates belongs to the next chapter, preserving all offsets.
      if (!count && groupStart > start) throw new Error('分章边界不连续。')
      groupEnd = end; count++
    }
    flush(sectionEnd)
  }
  // Whitespace-only prefix/suffix belongs to the nearest chapter, never silently omitted.
  if (chapters.length) {
    chapters[0].span = sourceSpan(source.text, 0, chapters[0].span.end)
    for (let i = 1; i < chapters.length; i++) chapters[i].span = sourceSpan(source.text, chapters[i - 1].span.end, chapters[i].span.end)
    chapters[chapters.length - 1].span = sourceSpan(source.text, chapters[chapters.length - 1].span.start, source.text.length)
  }
  for (const chapter of chapters) if (chapter.span.quote.length > budget.maxCharacters && chapter.ready) { chapter.ready = false; chapter.warnings.push('包含保留的原文空白后超出单章字符预算，请人工调整边界。') }
  const collectionFingerprint = sourceFingerprint({ title: 'locus-chapter-layout-v1', text: JSON.stringify({ source: sourceFingerprint(source), budget, spans: chapters.map(c => [c.id, c.span.start, c.span.end]) }) })
  const collection: ChapterCollection = { schemaVersion: 1, source: structuredClone(source), sourceFingerprint: sourceFingerprint(source), collectionFingerprint, budget, chapters, notice: '这是基于标题、相邻原句与预算的本地分章建议，不是语义模型结论。每章需要独立核对；复用场景时应分开练习，避免把多章同时叠在同一地标。' }
  return collection
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} 必须是对象。`)
  return value as Record<string, unknown>
}
function boundedText(value: unknown, field: string, max: number, nonempty = false): string {
  if (typeof value !== 'string' || value.length > max || (nonempty && !value.trim())) throw new Error(`${field} 文本无效或超过长度限制。`)
  return value
}
function integer(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${field} 必须是范围内的安全整数。`)
  return value
}

function parseChapterSource(value: unknown): PalaceSource {
  const sourceRaw = record(value, '完整原文')
  const source: PalaceSource = {
    title: boundedText(sourceRaw.title, '材料标题', 500),
    text: boundedText(sourceRaw.text, '完整原文', 200_000, true),
  }
  if (sourceRaw.references !== undefined) {
    if (!Array.isArray(sourceRaw.references) || sourceRaw.references.length > 50) throw new Error('来源链接数量无效。')
    source.references = sourceRaw.references.map((value, index) => {
      const reference = record(value, `来源 ${index + 1}`)
      const title = boundedText(reference.title, '来源标题', 500, true)
      const url = boundedText(reference.url, '来源链接', 2048, true)
      let parsed: URL
      try { parsed = new URL(url) } catch { throw new Error('来源链接必须是完整的 HTTP(S) 地址。') }
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('来源链接协议或凭据无效。')
      return { title, url }
    })
  }
  return source
}

/** Import boundary. v1 accepts only the reproducible local partition layout, not arbitrary edited boundaries.
 * Fingerprints detect consistency; they are not authentication or a substitute for schema checks. */
export function parseChapterCollection(value: unknown): ChapterCollection {
  const raw = record(value, '章节集合')
  if (raw.schemaVersion !== 1) throw new Error('分章版本无效。')
  const source = parseChapterSource(raw.source)
  const budgetRaw = record(raw.budget, '分章预算')
  const budget: ChapterBudget = {
    maxCharacters: integer(budgetRaw.maxCharacters, '单章字符预算', 100, 200_000),
    maxUnits: integer(budgetRaw.maxUnits, '单章候选数量', 1, 240),
    maxChapters: integer(budgetRaw.maxChapters, '章节数量预算', 1, 120),
  }
  if (!Array.isArray(raw.chapters) || !raw.chapters.length || raw.chapters.length > budget.maxChapters) throw new Error('章节列表数量无效。')
  const chapters = raw.chapters.map((value, index) => {
    const chapter = record(value, `章节 ${index + 1}`), span = record(chapter.span, '章节原文范围')
    const id = boundedText(chapter.id, '章节 ID', 80, true)
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) throw new Error('章节 ID 格式无效。')
    const title = boundedText(chapter.title, '章节标题', 520, true)
    const start = integer(span.start, '原文起点', 0, source.text.length)
    const end = integer(span.end, '原文终点', start + 1, source.text.length)
    const quote = boundedText(span.quote, '章节原文', 200_000, true)
    const candidateUnits = integer(chapter.candidateUnits, '候选数量', 1, 28_800)
    if (typeof chapter.ready !== 'boolean' || !Array.isArray(chapter.warnings) || chapter.warnings.length > 10) throw new Error('章节状态或警告无效。')
    const warnings = chapter.warnings.map(w => boundedText(w, '章节警告', 1000, true))
    return { id, title, span: { start, end, quote }, candidateUnits, ready: chapter.ready, warnings }
  })
  // Rebuild all derived fields from bounded, exact source. This also verifies full coverage,
  // sequence, UTF-16 boundaries and IDs without trusting a publicly recomputable hash.
  const canonical = partitionMaterial(source, budget)
  if (raw.sourceFingerprint !== canonical.sourceFingerprint || raw.collectionFingerprint !== canonical.collectionFingerprint) throw new Error('分章来源或布局版本不匹配。')
  if (JSON.stringify(chapters) !== JSON.stringify(canonical.chapters)) throw new Error('分章存在缺口、重叠、改写或非规范的边界、标题和派生状态，请从完整原文重新分章。')
  return canonical
}

export function validateChapterCollection(collection: ChapterCollection): void {
  parseChapterCollection(collection)
}

export function materializeChapter(collection: ChapterCollection, chapterId: string): { source: PalaceSource; origin: { sourceFingerprint: string; collectionFingerprint: string; chapterId: string; chapterCount: number; start: number; end: number; totalCharacters: number } } {
  validateChapterCollection(collection)
  const chapter = collection.chapters.find(c => c.id === chapterId)
  if (!chapter) throw new Error('未知章节。')
  return { source: { text: chapter.span.quote, title: chapter.title, ...(collection.source.references ? { references: structuredClone(collection.source.references) } : {}) }, origin: { sourceFingerprint: collection.sourceFingerprint, collectionFingerprint: collection.collectionFingerprint, chapterId, chapterCount: collection.chapters.length, start: chapter.span.start, end: chapter.span.end, totalCharacters: collection.source.text.length } }
}
