import type { CueShape } from './palaceTypes'
/** Human-facing labels, shared across authoring surfaces; stable IDs remain the protocol. */
export const CUE_SHAPE_LABELS: Record<CueShape, string> = {
  box: '方块 / 石板', sphere: '球体', cone: '圆锥', ring: '圆环', book: '书本', key: '钥匙',
  scale: '双盘天平', chain: '相扣链条', bridge: '带栏杆的小桥', shield: '盾牌', clock: '时钟',
  water: '水滴浅盆', cart: '四轮小车', 'force-pair': '两个物体与相反力箭头',
}
