import { openDB, type IDBPObjectStore } from 'idb'

import { newId } from './id'
import type { BlobId, BlobRecord, CardRecord, LocusId, PalaceRecord, TemplateId } from './types'

const DB_NAME = 'memory-palace-mvp'
const DB_VERSION = 2

const LEGACY_CUSTOM_MAP_BLOB_ID: BlobId = 'custom_map_glb_v1'

function customMapBlobIdForPalace(palaceId: string): BlobId {
  if (palaceId === 'current') return LEGACY_CUSTOM_MAP_BLOB_ID
  return `custom_map_glb_v1_${palaceId}`
}

type StoreName = 'palace' | 'cards' | 'blobs'
const ALL_STORES: StoreName[] = ['palace', 'cards', 'blobs']

export async function getDb() {
  let migrationFailure: Error | undefined
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      void transaction.done.catch(() => undefined) // openDB reports migration failure; consume the transaction rejection too.
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains('palace')) db.createObjectStore('palace', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('cards')) {
          const store = db.createObjectStore('cards', { keyPath: ['palaceId', 'locusId'] })
          store.createIndex('byPalace', 'palaceId')
          store.createIndex('byRoute', ['palaceId', 'routeIndex'])
        }
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' })
      }
      if (oldVersion >= 1 && oldVersion < 2) {
        // Read all legacy records before replacing the key path. The entire copy runs
        // inside the versionchange transaction: any failure restores the original v1 DB.
        void (async () => {
          const oldStore = transaction.objectStore('cards')
          const rows = await oldStore.getAll() as Array<Record<string, unknown>>
          const keys = await oldStore.getAllKeys()
          const palaceStore = transaction.objectStore('palace')
          const palaces = await palaceStore.getAll() as PalaceRecord[]
          const fallbackId = palaces.some(p => p.id === 'current') ? 'current' : palaces.length === 1 ? palaces[0].id : palaces.length === 0 ? 'current' : null
          const seen = new Set<string>()
          const migrated = rows.map((row, i) => {
            const locusId = typeof row.locusId === 'string' ? row.locusId : typeof keys[i] === 'string' ? keys[i] as string : ''
            const palaceId = typeof row.palaceId === 'string' && row.palaceId ? row.palaceId : fallbackId
            const routeIndex = typeof row.routeIndex === 'number' ? row.routeIndex : /^L\d+$/.test(locusId) ? Number(locusId.slice(1)) : NaN
            if (!palaceId || !/^L(?:0[1-9]|[1-5][0-9]|60)$/.test(locusId) || !Number.isSafeInteger(routeIndex) || routeIndex < 1 || routeIndex > 60) throw new Error('旧版卡片缺少可确定的宫殿或地标标识。')
            const key = JSON.stringify([palaceId, locusId])
            if (seen.has(key)) throw new Error('旧版卡片存在重复目标键，不能安全合并。')
            seen.add(key)
            return { ...row, palaceId, locusId, routeIndex, prompt: row.prompt ?? '', answer: row.answer ?? '', imageIds: row.imageIds ?? [], revealedCount: row.revealedCount ?? 0, updatedAt: row.updatedAt ?? nowIso() }
          })
          // Preserve orphaned cards by making their existing palace ID visible again.
          const knownPalaces = new Set(palaces.map(p => p.id))
          for (const card of migrated) if (!knownPalaces.has(card.palaceId)) {
            const time = nowIso()
            await palaceStore.put({ id: card.palaceId, title: '恢复的旧版宫殿', templateId: 'dust2_blockout_v2', createdAt: time, updatedAt: time })
            knownPalaces.add(card.palaceId)
          }
          db.deleteObjectStore('cards')
          const next = db.createObjectStore('cards', { keyPath: ['palaceId', 'locusId'] })
          next.createIndex('byPalace', 'palaceId')
          next.createIndex('byRoute', ['palaceId', 'routeIndex'])
          for (const card of migrated) await next.put(card)
        })().catch(error => {
          migrationFailure = new Error(`旧版数据升级已停止，原数据库保持未修改。请保留原应用数据并先导出备份，再处理此问题：${error instanceof Error ? error.message : String(error)}`)
          try { transaction.abort() } catch { /* Request failure may already have aborted it. */ }
        })
      }
    },
  }).catch(error => { throw migrationFailure ?? error })
}

export async function tx<T, Mode extends IDBTransactionMode>(
  mode: Mode,
  storeNames: StoreName[] | StoreName,
  fn: (stores: { [Name in StoreName]: IDBPObjectStore<unknown, StoreName[], Name, Mode> }) => Promise<T>,
): Promise<T> {
  const db = await getDb()
  // For this MVP we always include all stores in each transaction, so helper
  // functions can freely access any store without accidentally omitting it.
  // This avoids runtime errors like: "objectStore was not found".
  void storeNames
  const transaction = db.transaction(ALL_STORES, mode)

  const stores = {
    palace: transaction.objectStore('palace'),
    cards: transaction.objectStore('cards'),
    blobs: transaction.objectStore('blobs'),
  }

  try {
    const result = await fn(stores)
    await transaction.done
    return result
  } catch (error) {
    // A JavaScript exception after a successful request must abort too.
    // Keep transaction callbacks limited to IDB work (no network/timers).
    try { transaction.abort() } catch { /* Already finished or aborted. */ }
    await transaction.done.catch(() => undefined)
    throw error
  }
}

export function nowIso() {
  return new Date().toISOString()
}

export async function listPalaces(): Promise<PalaceRecord[]> {
  return tx('readonly', 'palace', async ({ palace }) => {
    const all = (await palace.getAll()) as PalaceRecord[]
    return all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  })
}

export async function getPalace(id: string): Promise<PalaceRecord | undefined> {
  return tx('readonly', 'palace', async ({ palace }) => {
    return (await palace.get(id)) as PalaceRecord | undefined
  })
}

export async function createPalace(title: string, templateId: TemplateId = 'dust2_blockout_v2'): Promise<PalaceRecord> {
  const t = nowIso()
  const trimmedTitle = title.trim() || '未命名宫殿'
  const record: PalaceRecord = {
    id: newId('palace'),
    title: trimmedTitle,
    templateId,
    createdAt: t,
    updatedAt: t,
  }

  await tx('readwrite', 'palace', async ({ palace }) => {
    await palace.put(record)
  })

  return record
}

export async function deletePalace(id: string): Promise<void> {
  await tx('readwrite', ['palace', 'cards'], async ({ palace, cards }) => {
    await palace.delete(id)

    const index = cards.index('byPalace')
    const keys = (await index.getAllKeys(id)) as IDBValidKey[]
    for (const key of keys) {
      await cards.delete(key)
    }
  })
}

export async function setPalaceTitle(id: string, title: string): Promise<void> {
  const t = nowIso()
  const trimmedTitle = title.trim() || '未命名宫殿'
  await tx('readwrite', 'palace', async ({ palace }) => {
    const existing = (await palace.get(id)) as PalaceRecord | undefined
    if (!existing) throw new Error('宫殿不存在')
    await palace.put({ ...existing, title: trimmedTitle, updatedAt: t })
  })
}

export async function replaceCards(palaceId: string, newCards: CardRecord[]): Promise<void> {
  const t = nowIso()
  await tx('readwrite', ['cards', 'palace'], async ({ cards, palace }) => {
    const current = (await palace.get(palaceId)) as PalaceRecord | undefined
    if (!current) throw new Error('宫殿不存在')

    const index = cards.index('byPalace')
    const keys = (await index.getAllKeys(palaceId)) as IDBValidKey[]
    for (const key of keys) {
      await cards.delete(key)
    }

    for (const card of newCards) {
      await cards.put({ ...card, palaceId })
    }

    await palace.put({ ...current, updatedAt: t })
  })
}

export async function getCards(palaceId: string): Promise<CardRecord[]> {
  return tx('readonly', 'cards', async ({ cards }) => {
    const index = cards.index('byPalace')
    const all = (await index.getAll(palaceId)) as CardRecord[]
    return all.sort((a, b) => a.routeIndex - b.routeIndex)
  })
}

export async function getCard(palaceId: string, locusId: LocusId): Promise<CardRecord | undefined> {
  return tx('readonly', 'cards', async ({ cards }) => {
    return (await cards.get([palaceId, locusId])) as CardRecord | undefined
  })
}

export async function upsertCard(card: CardRecord): Promise<void> {
  const t = nowIso()
  await tx('readwrite', ['cards', 'palace'], async ({ cards, palace }) => {
    await cards.put(card)
    const current = (await palace.get(card.palaceId)) as PalaceRecord | undefined
    if (current) {
      await palace.put({ ...current, updatedAt: t })
    }
  })
}

export async function putBlob(record: BlobRecord) {
  await tx('readwrite', 'blobs', async ({ blobs }) => {
    await blobs.put(record)
  })
}

export async function getBlob(id: BlobId): Promise<BlobRecord | undefined> {
  return tx('readonly', 'blobs', async ({ blobs }) => {
    return (await blobs.get(id)) as BlobRecord | undefined
  })
}

export async function getBlobs(ids: BlobId[]): Promise<BlobRecord[]> {
  return tx('readonly', 'blobs', async ({ blobs }) => {
    const results: BlobRecord[] = []
    for (const id of ids) {
      const value = (await blobs.get(id)) as BlobRecord | undefined
      if (value) results.push(value)
    }
    return results
  })
}

export async function setCustomMapFromFile(palaceId: string, file: File): Promise<void> {
  const importedAt = nowIso()
  const mime = file.type || 'model/gltf-binary'
  await tx('readwrite', ['blobs', 'palace'], async ({ blobs, palace }) => {
    const current = (await palace.get(palaceId)) as PalaceRecord | undefined
    if (!current) throw new Error('宫殿不存在')

    const blobId = current.customMap?.blobId ?? customMapBlobIdForPalace(palaceId)
    const record: BlobRecord = { id: blobId, mime, data: file, createdAt: importedAt }
    await blobs.put(record)

    await palace.put({
      ...current,
      customMap: {
        blobId,
        fileName: file.name || 'map.glb',
        mime,
        size: file.size,
        importedAt,
      },
      updatedAt: importedAt,
    })
  })
}

export async function clearCustomMap(palaceId: string): Promise<void> {
  const t = nowIso()
  await tx('readwrite', ['blobs', 'palace'], async ({ blobs, palace }) => {
    const current = (await palace.get(palaceId)) as PalaceRecord | undefined
    if (!current?.customMap) return

    await blobs.delete(current.customMap.blobId)

    const next = { ...current }
    delete next.customMap
    await palace.put({ ...next, updatedAt: t })
  })
}
