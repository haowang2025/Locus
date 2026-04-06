import type { CardRecord, LocusId } from '../lib/types'

export default function TrainPanel(props: {
  locusId: LocusId
  card: CardRecord
  stage: 'front' | 'back'
  progress?: { current: number; total: number } | null
  showRating?: boolean
  ratingBusy?: boolean
  onRate?: (confidence: 0 | 1 | 2) => void
  onReveal: () => void
  onEdit: () => void
  onClose: () => void
}) {
  const title = props.progress
    ? `${props.locusId} · ${props.progress.current}/${props.progress.total}`
    : `${props.locusId} · 已揭示 ${props.card.revealedCount ?? 0} 次`

  return (
    <div className="train-panel" role="dialog" aria-modal="false">
      <div className="train-panel__header">
        <div className="train-panel__title">{title}</div>
        <button className="btn" onClick={props.onClose}>
          {props.showRating ? '退出复习' : '关闭'}
        </button>
      </div>

      <div className="train-panel__body">
        <div className="train-front">
          <div className="train-front__label">正面（线索）</div>
          <div className="train-front__text">{props.card.prompt || '（未设置 Prompt）'}</div>
        </div>

        {props.stage === 'back' ? (
          <div className="train-back">
            <div className="train-back__label">反面（答案）</div>
            <div className="train-back__text">{props.card.answer || '（未设置 Answer）'}</div>
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
          <button className="btn primary" onClick={props.onReveal}>
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
        <button className="btn" onClick={props.onEdit}>
          编辑
        </button>
      </div>
    </div>
  )
}
