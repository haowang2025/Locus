import type { CueRelationId } from './sceneRegistry'
/** Portable, provider-neutral data. Source offsets use JavaScript UTF-16 indices. */
export const CUE_SHAPES = ['box', 'sphere', 'cone', 'ring', 'book', 'key', 'scale', 'chain', 'bridge', 'shield', 'clock', 'water', 'cart', 'force-pair'] as const
export type CueShape = typeof CUE_SHAPES[number]
export interface SourceSpan { start: number; end: number; quote: string }
export interface MeaningUnit {
  id: string
  spans: SourceSpan[]
  title: string
  question: string
  /** Verbatim evidence only. Never replace facts with generated imagery. */
  facts: string
  protectedTokens: string[]
  reviewed: boolean
}
export interface SemanticSourceCheck { id: string; spans: SourceSpan[]; quote: string; kinds: string[]; explanation: string; checked: boolean }
export interface CueSemanticReview { sourceChecks: SemanticSourceCheck[]; notEncoded: string; renderedConfirmed: boolean; limitationsConfirmed: boolean }
export interface MnemonicCue {
  unitId: string
  anchorId: string
  volumeId: string
  object: string
  visual: { shape: CueShape; color: string; motion: 'pulse' | 'spin' | 'bounce' | 'none' }
  action: string
  /** Legacy action stays an alias of this explicitly imaginative narrative. */
  imaginedAction?: string
  /** Derived from executable enums, never trusted from a model. */
  renderedDescription?: string
  semanticReview?: CueSemanticReview
  spatialRelation: string
  relationId?: CueRelationId
  rationale: string
  reviewed: boolean
}
export interface PalaceSource { text: string; title: string; references?: { title: string; url: string }[] }
export interface PalacePlan {
  schemaVersion: 1
  source: PalaceSource
  sceneId: string
  sceneVersion?: string
  ordering?: 'source' | 'semantic'
  generation: { mode: 'offline-rule-based' | 'model-assisted' | 'authored-demo' | 'structured-import'; model?: string }
  units: MeaningUnit[]
  cues: MnemonicCue[]
  createdAt: string
}
export interface MnemonicCardData {
  sourceFingerprint?: string
  schemaVersion: 1
  anchorId: string
  unitIds: string[]
  cues: Pick<MnemonicCue, 'unitId' | 'volumeId' | 'object' | 'visual' | 'action' | 'imaginedAction' | 'renderedDescription' | 'semanticReview' | 'spatialRelation' | 'relationId' | 'rationale'>[]
}
export interface PlanIssue { code: string; message: string; unitId?: string }
/** Deliberately excludes tokens, passwords, SDK-specific credentials and persistence. */
export interface ProviderSettings { endpoint: string; model: string }
