import { materializeChapter, partitionMaterial, parseChapterCollection, type ChapterCollection } from '../lib/palaceChapters'
import { newId } from '../lib/id'
import type { StudioProject } from './core'
export interface StudioChapters { collection: ChapterCollection; activeId: string | null; confirmedDownloads: { chapterId: string; exportedAt: string }[] }
export function startStudioChapters(project: StudioProject, maxUnits: number): StudioProject {
  if (project.plan || project.chapters) throw new Error('请先备份并回到完整材料，再创建分章建议。')
  const collection = partitionMaterial({ title: project.title.trim() || '我的材料', text: project.text }, { maxUnits })
  return { ...project, title: collection.source.title, chapters: { collection, activeId: null, confirmedDownloads: [] } }
}
export function selectStudioChapter(project: StudioProject, chapterId: string | null): StudioProject {
  if (!project.chapters) throw new Error('没有分章建议')
  const source = chapterId === null ? project.chapters.collection.source : materializeChapter(project.chapters.collection, chapterId).source
  return { ...project, id: newId('studio'), title: source.title, text: source.text, palaceTitle: undefined, plan: null, assets: [], media: [], chapters: { ...project.chapters, activeId: chapterId } }
}
export function parseStudioChapters(raw: unknown, title: string, text: string): StudioChapters {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('章节工作区无效')
  const value = raw as Record<string, unknown>, collection = parseChapterCollection(value.collection)
  if (value.activeId !== null && typeof value.activeId !== 'string') throw new Error('当前章节无效')
  const activeId = value.activeId as string | null
  const source = activeId === null ? collection.source : materializeChapter(collection, activeId).source
  if (source.text !== text || source.title !== title) throw new Error('当前材料与完整原文章节范围不一致')
  if (!Array.isArray(value.confirmedDownloads) || value.confirmedDownloads.length > collection.chapters.length) throw new Error('章节保存确认列表无效')
  const seen = new Set<string>()
  const confirmedDownloads = value.confirmedDownloads.map(v => {
    if (!v || typeof v !== 'object') throw new Error('章节保存确认无效')
    const item = v as Record<string, unknown>
    if (typeof item.chapterId !== 'string' || !collection.chapters.some(c => c.id === item.chapterId) || seen.has(item.chapterId) || typeof item.exportedAt !== 'string' || !Number.isFinite(Date.parse(item.exportedAt))) throw new Error('章节保存确认无效')
    seen.add(item.chapterId); return { chapterId: item.chapterId, exportedAt: new Date(item.exportedAt).toISOString() }
  })
  return { collection, activeId, confirmedDownloads }
}
