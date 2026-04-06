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
    <>
      <div className="hud-right">
        {props.vrSupported ? (
          props.vrActive ? (
            <button className="btn" onClick={props.onExitVr}>
              退出 VR
            </button>
          ) : (
            <button className="btn primary" onClick={props.onEnterVr}>
              进入 VR
            </button>
          )
        ) : null}
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
          {props.modeToggleDisabled ? '复习中' : props.mode === 'train' ? '训练' : '探索'}
        </button>
        <div className="hud-right__hint">
          {props.filledCount}/{props.locusCount}
        </div>
      </div>

      {props.vrUiError ? <div className="vr-toast">{props.vrUiError}</div> : null}
      {props.vrActive ? (
        <div className="vr-hint" aria-label="VR 手势提示">
          右手捏合=交互｜左手捏合=自由瞬移（仅地面）｜左手握拳=点位瞬移（需瞄到点位）
        </div>
      ) : null}
    </>
  )
}
