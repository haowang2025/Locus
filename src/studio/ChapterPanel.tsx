import type { StudioChapters } from './chapters'
export default function ChapterPanel({ chapters, onSelect, onDownload }: { chapters: StudioChapters; onSelect: (id: string | null) => void; onDownload: () => void }) {
  const { collection, activeId, confirmedDownloads } = chapters
  const active = collection.chapters.find(c => c.id === activeId)
  return <section className="studio-card chapter-panel"><p className="eyebrow">CHAPTERS / 完整来源保留</p><h2>{active ? `当前：${active.title}` : '先选择一章，再制作一个宫殿'}</h2>
    <p>完整原文 {collection.source.text.length.toLocaleString()} 字符 · {collection.chapters.length} 章 · 已由你确认保存 {confirmedDownloads.length} 章 · 剩余 {collection.chapters.length - confirmedDownloads.length} 章</p>
    <p className="muted">{collection.notice} 当前工作台只编辑一章。切换前请保存本章工作台备份；切换会清除当前规划与附件，但完整原文、所有章节范围和保存确认清单仍保留。清单不包含其他章的编辑草稿。</p>
    {active && <p>原文范围 [{active.span.start}, {active.span.end}) / {collection.source.text.length}，按 UTF-16 字符位置记录。单元内的位置加上 {active.span.start} 即为完整原文位置。</p>}
    <div className="row"><button onClick={onDownload}>下载全原文与章节清单 JSON</button>{activeId && <button onClick={() => onSelect(null)}>返回完整原文概览</button>}</div>
    <ol className="chapter-list">{collection.chapters.map((chapter, i) => <li key={chapter.id}><button aria-current={chapter.id === activeId ? 'true' : undefined} disabled={chapter.id === activeId} onClick={() => onSelect(chapter.id)}>{String(i + 1).padStart(2, '0')} · {chapter.title}</button><span>{chapter.span.start}–{chapter.span.end} · 约 {chapter.candidateUnits} 个候选单元 · {confirmedDownloads.some(c => c.chapterId === chapter.id) ? '你已确认保存过独立 HTML' : '尚未确认保存'}</span>{chapter.warnings.map(w => <p className="error" key={w}>{w}</p>)}</li>)}</ol>
    <details><summary>查看完整原文（包括尚未制作的章节）</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 300, overflow: 'auto' }}>{collection.source.text}</pre></details>
  </section>
}
