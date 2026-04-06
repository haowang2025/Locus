import { openDB } from 'idb'

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
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains('palace')) {
          db.createObjectStore('palace', { keyPath: 'id' })
        }

        if (!db.objectStoreNames.contains('cards')) {
          const store = db.createObjectStore('cards', { keyPath: ['palaceId', 'locusId'] })
          store.createIndex('byPalace', 'palaceId')
          store.createIndex('byRoute', ['palaceId', 'routeIndex'])
        }

        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs', { keyPath: 'id' })
        }
      }

      if (oldVersion >= 1 && oldVersion < 2) {
        // MVP migration: drop and recreate cards store (existing cards will be lost).
        if (db.objectStoreNames.contains('cards')) {
          db.deleteObjectStore('cards')
        }
        const store = db.createObjectStore('cards', { keyPath: ['palaceId', 'locusId'] })
        store.createIndex('byPalace', 'palaceId')
        store.createIndex('byRoute', ['palaceId', 'routeIndex'])
      }
    },
  })
}

export async function tx<T>(
  mode: IDBTransactionMode,
  storeNames: StoreName[] | StoreName,
  fn: (stores: { palace: any; cards: any; blobs: any }) => Promise<T>,
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

  const result = await fn(stores)
  await transaction.done
  return result
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
