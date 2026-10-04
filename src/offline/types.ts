import type { AttachmentBinding } from '../lib/types'
import type { materializeChapter } from '../lib/palaceChapters'
import type { CueSemanticReview } from '../lib/palaceTypes'
import type { ProgressEntry } from './progress'
import type { SceneAnchor, SceneDefinition } from '../lib/sceneRegistry'
export type Vec3 = [number, number, number]
export interface OfflineAsset { id: string; mime: string; base64: string; bytes: number; imageWidth?: number; imageHeight?: number; texturePixels?: number }
export interface OfflineAnchor { zone?: string; calloutAliases?: string[]; framingBounds?: SceneAnchor['landmark']['framingBounds']; focusPoint?: Vec3; cueVolume?: SceneAnchor['cueVolume']; id: string; label: string; context: string; position: Vec3; eye: Vec3; lookAt: Vec3 }
export interface OfflineCard {
  attachmentBindings?: AttachmentBinding[];
  id: string; unitIds: string[]; units?: { id: string; question: string; facts: string }[]; anchorId: string; prompt: string; answer: string; cue: string; action: string;
  imageIds: string[]; modelId?: string; modelScale?: number;
  prop?: { shape: string; color: string; count?: number }; provenance: string; cues?: { imaginedAction?: string; renderedDescription?: string; semanticReview?: CueSemanticReview; relationId?: string; unitId?: string; object: string; action: string; relation: string; rationale: string; shape: string; color: string; motion: string }[];
}
export interface OfflinePalace {
  unassignedAttachmentCount?: number;
  chapterOrigin?: ReturnType<typeof materializeChapter>['origin'] & { sourceTitle: string };
  sceneTour?: boolean; initialProgress?: Record<string, ProgressEntry>; previewSelection?: { anchorId: string; assetId?: string; unitId?: string }; draftPreview?: boolean; version: 1; contentFingerprint: string; id: string; title: string; exportedAt: string; sceneTitle: string; sceneId: string; sceneVersion?: string; walkingRoute?: SceneDefinition['route']['walking'];
  anchors: OfflineAnchor[]; cards: OfflineCard[]; assets: OfflineAsset[];
  sceneTargetSpan?: number; sceneAssetId?: string; sceneTransform?: { position: Vec3; rotation: Vec3; scale: Vec3 };
  attribution: string[]; sourceDocuments?: unknown; plan?: unknown;
}
