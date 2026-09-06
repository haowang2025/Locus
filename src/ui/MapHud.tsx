import { Link } from 'react-router-dom'

export default function MapHud(props: {
  vrSupported: boolean | null
  vrActive: boolean
  vrUiError: string | null
  filledCount: number
  locusCount: number
  run: boolean
  mode: 'explore' | 'train'
  modeToggleDisabled?: boolean
  onEnterVr: () => void
  onExitVr: () => void
  onOpenDrawer: () => void
  onToggleRun: () => void
  onToggleMode: () => void
}) {
  return (
    <div className="hud-right xhs-hud">
      <Link className="btn" to="/">
        返回
      </Link>
      <button className="btn" onClick={props.onOpenDrawer}>
        点位
      </button>
      <button className="btn" onClick={props.onToggleRun}>
        {props.run ? '跑：开' : '跑：关'}
      </button>
      <button className="btn" onClick={props.onToggleMode} disabled={props.modeToggleDisabled}>
        {props.modeToggleDisabled ? '背诵中' : props.mode === 'train' ? '训练' : '探索'}
      </button>
      <div className="hud-right__hint">
        {props.filledCount}/{props.locusCount}
      </div>
    </div>
  )
}
