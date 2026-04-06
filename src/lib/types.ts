export type LocusId = `L${string}`

export type TemplateId = 'dust2_blockout_v2' | 'dust2like_v1'

/** Multi-palace: palace id is no longer fixed to 'current'. */
export type PalaceId = string

export type BlobId = string

export interface PalaceRecord {
  id: PalaceId
  title: string
  templateId: TemplateId
  customMap?: {
    blobId: BlobId
    fileName: string
    mime: string
    size: number
    importedAt: string
  }
  createdAt: string
  updatedAt: string
}

export interface CardRecord {
  palaceId: PalaceId
  locusId: LocusId
  routeIndex: number
  prompt: string
  answer: string
  note?: string
  imageIds: BlobId[]
  modelId?: BlobId
  modelScale?: number
  confidence?: 0 | 1 | 2
  lastReviewedAt?: string
  reviewCount?: number
  nextReviewAt?: string
  revealedCount: number
  updatedAt: string
}

export interface BlobRecord {
  id: BlobId
  mime: string
  data: Blob
  createdAt: string
}

export interface MpFileV1 {
  formatVersion: 1
  exportedAt: string
  templateId: TemplateId
  palace: {
    title: string
  }
  cards: Array<{
    locusId: LocusId
    routeIndex: number
    prompt: string
    answer: string
    note?: string
    revealedCount?: number
    confidence?: 0 | 1 | 2
    lastReviewedAt?: string
    reviewCount?: number
    nextReviewAt?: string
    images: Array<{
      id: BlobId
      file: string
      mime: string
    }>
    /** Optional 3D attachment (.glb) stored in zip under `models/`. */
    model?: {
      id: BlobId
      file: string
      mime: string
      scale?: number
    }
  }>
}
