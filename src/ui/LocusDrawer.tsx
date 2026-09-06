import { LOCUS_COUNT, locusIdFromRouteIndex } from '../lib/loci'
import type { LocusId, PalaceRecord } from '../lib/types'

export default function LocusDrawer(props: {
  open: boolean
  palace: PalaceRecord | null
  promptHudMode: 'off' | 'compact' | 'full'
  onPromptHudModeChange: (mode: 'off' | 'compact' | 'full') => void
  mapBusy: string | null
  mapError: string | null
  filledLoci: Set<LocusId>
  onImportGlb: (file: File) => void
  onClearCustomMap: () => void
  onJumpToLocus: (locusId: LocusId) => void
  onClose: () => void
}) {
  if (!props.open) return null

  return (
    <div className="drawer-overlay">
      <div className="drawer-overlay__header">
        <div className="drawer__title">点位（60）</div>
        <button className="btn" onClick={props.onClose}>
          关闭
        </button>
      </div>
      <div className="drawer-overlay__settings">
        <span className="chip">提示卡</span>
        <button
          className={`btn ${props.promptHudMode === 'off' ? 'primary' : ''}`}
          onClick={() => props.onPromptHudModeChange('off')}
        >
          关
        </button>
        <button
          className={`btn ${props.promptHudMode === 'compact' ? 'primary' : ''}`}
          onClick={() => props.onPromptHudModeChange('compact')}
        >
          简
        </button>
        <button
          className={`btn ${props.promptHudMode === 'full' ? 'primary' : ''}`}
          onClick={() => props.onPromptHudModeChange('full')}
        >
          全
        </button>
        <span className="hint" style={{ margin: 0 }}>
          站定靠近点位后显示，移动时自动隐藏
        </span>
      </div>

      <div className="cardbox" style={{ marginBottom: 10 }}>
        <h3 className="cardbox__title">离线地图</h3>
        <p className="hint" style={{ marginTop: 0, marginBottom: 0 }}>
          小红书版本固定使用包内 Dust2 地图，不提供运行时文件导入，避免触发宿主文件能力限制。
        </p>
      </div>

      <div className="loci-grid">
        {Array.from({ length: LOCUS_COUNT }, (_, i) => {
          const routeIndex = i + 1
          const locusId = locusIdFromRouteIndex(routeIndex)
          const filled = props.filledLoci.has(locusId)
          return (
            <button
              key={locusId}
              className={`locus-chip ${filled ? 'locus-chip--filled' : ''}`}
              onClick={() => props.onJumpToLocus(locusId)}
            >
              {locusId} {filled ? '●' : '○'}
            </button>
          )
        })}
      </div>
    </div>
  )
}
