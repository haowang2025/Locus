import { Box3, Object3D, Vector3 } from 'three'
export interface VolumeSize { x: number; y: number; z: number }
export function imagePlaneSize(aspect: number, volume: VolumeSize): { width: number; height: number } {
  if (!Number.isFinite(aspect) || aspect <= 0) throw new Error('图片宽高比无效')
  const diameter = Math.min(volume.x, volume.y, volume.z) * .88
  const height = diameter / Math.sqrt(1 + aspect * aspect)
  return { width: aspect * height, height }
}
/** Preserve file content and proportions; bound only its displayed size, with disclosure in the viewer. */
export function fitAttachmentModel(model: Object3D, volume: VolumeSize, userScale = 1): void {
  if (!Number.isFinite(userScale) || userScale <= 0) throw new Error('模型缩放无效')
  model.scale.multiplyScalar(userScale)
  const box = new Box3().setFromObject(model), size = box.getSize(new Vector3())
  if (box.isEmpty() || ![...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)) throw new Error('模型没有可显示的有效几何')
  const fit = Math.min(1, Math.min(volume.x, volume.z) * .88 / Math.max(Math.hypot(size.x, size.z), .01), volume.y * .88 / Math.max(size.y, .01))
  model.scale.multiplyScalar(fit)
  const fitted = new Box3().setFromObject(model), center = fitted.getCenter(new Vector3())
  model.position.add(new Vector3(-center.x, -fitted.min.y - volume.y / 2 + .04, -center.z))
}
