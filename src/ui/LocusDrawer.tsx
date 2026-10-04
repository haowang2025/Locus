import { LOCUS_COUNT, locusIdFromRouteIndex } from '../lib/loci'
import type { LocusId, PalaceRecord } from '../lib/types'
import type { SceneDefinition } from '../lib/sceneRegistry'
import SceneRouteMap from './SceneRouteMap'

export default function LocusDrawer(props: {
  open: boolean
  palace: PalaceRecord | null
  scene?: SceneDefinition | null
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
        <div className="drawer__title">{props.scene?.title ?? '点位'}（{props.scene?.anchors.length ?? LOCUS_COUNT}）</div>
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
        <h3 className="cardbox__title">地图（自定义 GLB）</h3>
        {props.palace?.customMap ? (
          <p className="hint" style={{ marginTop: 0 }}>
            已导入：{props.palace.customMap.fileName} · {Math.round((props.palace.customMap.size / 1024 / 1024) * 10) / 10}MB
          </p>
        ) : (
          <p className="hint" style={{ marginTop: 0 }}>
            当前：{props.scene?.title ?? '内置 Dust2（GLB）'}
          </p>
        )}
        {!props.palace?.mnemonicPlan ? <div className="row" style={{ marginTop: 8 }}>
          <label className="btn file">
            导入 GLB
            <input
              type="file"
              accept=".glb,model/gltf-binary"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.currentTarget.value = ''
                if (!f) return
                props.onImportGlb(f)
              }}
            />
          </label>
          {props.palace?.customMap ? (
            <button
              className="btn danger"
              onClick={() => {
                const ok = confirm('清除自定义地图并恢复内置地图，确定？')
                if (!ok) return
                props.onClearCustomMap()
              }}
            >
              清除
            </button>
          ) : null}
        </div> : <p className="hint">此宫殿的内容已绑定经过选择的地标。更换场景请返回内容规划重新分配，避免地标与记忆错位。</p>}
        {props.mapBusy ? (
          <p className="hint" style={{ marginTop: 8 }}>
            {props.mapBusy}
          </p>
        ) : null}
        {props.mapError ? (
          <p className="hint danger-text" style={{ marginTop: 8 }}>
            {props.mapError}
          </p>
        ) : null}
        {!props.palace?.mnemonicPlan && <p className="hint">传统自定义地图要求：GLB 内包含 60 个锚点节点，命名 L01..L60（建议 Blender Empty）。可选：COLLISION 简化碰撞网格。</p>}
      </div>

      {props.scene?.attribution && <p className="hint">场景：<a href={props.scene.attribution.url} target="_blank" rel="noopener noreferrer">{props.scene.attribution.title} · {props.scene.attribution.creator}</a> · {props.scene.attribution.license}；本项目添加地标、路线和记忆线索。</p>}
      {props.scene && <SceneRouteMap scene={props.scene} onSelect={props.onJumpToLocus} />}
      <div className="loci-grid">
        {Array.from({ length: props.scene?.anchors.length ?? LOCUS_COUNT }, (_, i) => {
          const routeIndex = i + 1
          const locusId = locusIdFromRouteIndex(routeIndex)
          const filled = props.filledLoci.has(locusId)
          return (
            <button
              key={locusId}
              className={`locus-chip ${filled ? 'locus-chip--filled' : ''}`}
              onClick={() => props.onJumpToLocus(locusId)}
            >
              {locusId} {props.scene?.anchors[i]?.label} {filled ? '●' : '○'}
            </button>
          )
        })}
      </div>
    </div>
  )
}
