import RecallImages from './RecallImages'
import { attachmentRole } from '../lib/attachmentBindings'
import type { semanticRecallView } from '../lib/palaceRecall'
import type { CardRecord, LocusId } from '../lib/types'

export default function TrainPanel(props: {
  locusId: LocusId
  card: CardRecord
  stage: 'front' | 'back'
  semantic?: NonNullable<ReturnType<typeof semanticRecallView>> | null
  onSelectUnit?: (index: number) => void
  onSelectModel?: () => void
  onSelectImage?: (id: string) => void
  onEditAttachments?: () => void
  hasModelAttachment?: boolean
  attachmentVisible?: boolean
  onToggleAttachment?: () => void
  progress?: { current: number; total: number } | null
  showRating?: boolean
  ratingBusy?: boolean
  onRate?: (confidence: 0 | 1 | 2) => void
  onReveal: () => void
  onEdit: () => void
  onClose: () => void
}) {
  const unitId = props.semantic?.unitId
  const cueImages = props.card.imageIds.filter(id => attachmentRole(props.card, id, unitId) === 'cue')
  const references = props.card.imageIds.filter(id => attachmentRole(props.card, id, unitId) === 'reference')
  const title = props.progress
    ? `${props.locusId} · ${props.progress.current}/${props.progress.total}`
    : `${props.locusId} · 已揭示 ${props.card.revealedCount ?? 0} 次`

  return (
    <div className="train-panel" role="dialog" aria-modal="false">
      <div className="train-panel__header">
        <div className="train-panel__title">{title}</div>
        <button className="btn" onClick={props.onClose} disabled={props.ratingBusy}>
          {props.showRating ? '退出复习' : '关闭'}
        </button>
      </div>

      <div className="train-panel__body">
        <div className="train-front">
          <div className="train-front__label">正面（线索）</div>
          <div className="train-front__text">{props.semantic ? `请回忆此处第 ${props.semantic.index + 1}/${props.semantic.total} 个含义单元，特别注意数字、关系、条件和否定。` : props.card.prompt || '（未设置 Prompt）'}</div>
          {props.semantic && props.onSelectUnit && <label className="hint">选择单元（每个单元单独评分）<select aria-label="选择要回忆的含义单元" value={props.semantic.index} disabled={props.ratingBusy} onChange={e => props.onSelectUnit?.(Number(e.target.value))}>{Array.from({ length: props.semantic.total }, (_, i) => <option key={i} value={i}>单元 {i + 1} / {props.semantic!.total}</option>)}</select></label>}
        </div>

        {props.card.modelId && attachmentRole(props.card, props.card.modelId, unitId) === 'cue' && props.onSelectModel && <button className="btn" type="button" onClick={props.onSelectModel}>在地标中显示你指定的线索模型</button>}
        <RecallImages onSelect={props.onSelectImage} ids={cueImages} label="你指定的记忆线索图片（答题前可见）" />
        {props.stage === 'back' ? (
          <div className="train-back">
            <div className="train-back__label">反面（答案）</div>
            <RecallImages onSelect={props.onSelectImage} ids={references} label="答案参考图片（旧版未分配附件可能含其他单元内容）" />
            <div className="train-back__text">{props.semantic?.facts ?? (props.card.answer || '（未设置 Answer）')}</div>
            {props.hasModelAttachment && props.onToggleAttachment && <button className="btn" type="button" onClick={props.onToggleAttachment} disabled={props.ratingBusy}>{props.attachmentVisible ? '隐藏地标模型附件' : '显示地标模型附件（可能含其他单元答案）'}</button>}
            {props.semantic && <><p className="hint">回忆问题：{props.semantic.question}</p><p className="hint">重点核对：{props.semantic.protectedTokens.join(' · ') || '概念与关系'}</p><p className="hint" style={{ whiteSpace: 'pre-wrap' }}>{props.semantic.cueText}</p></>}
          </div>
        ) : (
          <div className="train-back train-back--locked">
            <div className="train-back__label">反面（答案）</div>
            <div className="train-back__text">先在脑中回忆，再点“显示答案”。</div>
          </div>
        )}
      </div>

      <div className="train-panel__footer">
        {props.stage === 'front' ? (
          <button className="btn primary" onClick={props.onReveal} disabled={props.ratingBusy}>
            显示答案
          </button>
        ) : null}
        {props.stage === 'back' && props.showRating && props.onRate ? (
          <>
            <button className="btn danger" onClick={() => props.onRate?.(0)} disabled={props.ratingBusy}>
              没记住
            </button>
            <button className="btn" onClick={() => props.onRate?.(1)} disabled={props.ratingBusy}>
              模糊
            </button>
            <button className="btn primary" onClick={() => props.onRate?.(2)} disabled={props.ratingBusy}>
              记住了
            </button>
          </>
        ) : null}
        {props.onEditAttachments && <button className="btn" onClick={props.onEditAttachments} disabled={props.ratingBusy}>管理线索附件</button>}
        <button className="btn" onClick={props.onEdit} disabled={props.ratingBusy}>
          编辑
        </button>
      </div>
    </div>
  )
}
