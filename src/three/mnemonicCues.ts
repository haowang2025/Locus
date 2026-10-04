import { Box3, BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import type { MnemonicCardData } from '../lib/palaceTypes'
import type { CueRelationId, SceneAnchor } from '../lib/sceneRegistry'
import { createMnemonicProp } from './mnemonicProps'

export type CueLayout = 'orbit' | 'steps' | 'connected' | 'framed' | 'row'
/** Legacy diagnostics only. Approved plans bind explicit relation IDs. */
export function inferCueLayout(relations: string): CueLayout {
  if (/环绕|旋转|涟漪|围桌|经纬/.test(relations)) return 'orbit'
  if (/递增|台阶|阶递|按步骤|高低|排序/.test(relations)) return 'steps'
  if (/连接|汇聚|聚集/.test(relations)) return 'connected'
  if (/框住|框中|画布/.test(relations)) return 'framed'
  return 'row'
}

/** Shared app/export renderer. Each cue executes its own relation; mixed relations never
 * silently override one another. Entire motion envelope fits its disjoint legal slot. */
export function buildMnemonicCueGroup(data: Pick<MnemonicCardData, 'cues'>, anchor: Pick<SceneAnchor, 'id' | 'cueVolume'> & {approach?: Pick<SceneAnchor['approach'],'eye'>}): Group {
  const group = new Group(); group.name = `mnemonic_${anchor.id}`
  const volume = anchor.cueVolume; group.position.set(volume.center.x,volume.center.y,volume.center.z)
  if (data.cues.length > volume.maxObjects) throw new Error(`点位 ${anchor.id} 超出线索容量；请先重新分配。`)
  const count = data.cues.length
  const eye=anchor.approach?.eye
  const baseYaw=eye?Math.atan2(eye.x-volume.center.x,eye.z-volume.center.z):0
  const rightX=Math.cos(baseYaw),rightZ=-Math.sin(baseYaw),halfSlots=Math.max(0,count-1)/2
  // Disjoint circular slots laid out left-to-right in the canonical view. Their
  // entire rotated/orbital envelopes remain within the world-aligned cue box.
  const cellWidth=Math.min((volume.size.x/2)/(Math.abs(rightX)*halfSlots+.45),(volume.size.z/2)/(Math.abs(rightZ)*halfSlots+.45))*.94
  group.userData.slotAxis={x:rightX,z:rightZ};group.userData.slotWidth=cellWidth
  data.cues.forEach((cue,index)=>{
    const relationId=(cue as typeof cue & {relationId?:CueRelationId}).relationId
    const inferred=inferCueLayout(cue.spatialRelation)
    const layout=relationId==='orbit'?'orbit':relationId==='frame'?'framed':relationId?'row':inferred==='orbit'||inferred==='framed'?inferred:'row'
    const rise=relationId==='rise'||(!relationId&&/在线索区(?:周期起伏|向上升起)/.test(cue.spatialRelation))
    const root = new Group(); root.name=cue.object
    const color = /^#[0-9a-f]{6}$/i.test(cue.visual.color) ? cue.visual.color : '#d8ab55'
    const body = createMnemonicProp(cue.visual.shape,color)
    if(layout==='framed'){
      const frame=new MeshStandardMaterial({color:'#d4ae68',roughness:.45,metalness:.4})
      for(const x of [-.45,.45]){const bar=new Mesh(new BoxGeometry(.025,.8,.025),frame);bar.position.set(x,0,-.25);body.add(bar)}
      for(const y of [-.4,.4]){const bar=new Mesh(new BoxGeometry(.925,.025,.025),frame);bar.position.set(0,y,-.25);body.add(bar)}
    }
    const box=new Box3().setFromObject(body), size=box.getSize(new Vector3()), center=box.getCenter(new Vector3())
    body.position.sub(center)
    const motion=rise?'bounce':cue.visual.motion, pulse=motion==='pulse'?1.06:1
    const orbitRadius=layout==='orbit'?cellWidth*.18:0
    const diameter=Math.hypot(size.x,size.z)
    const usableWidth=cellWidth*.9-orbitRadius*2, usableDepth=cellWidth*.9-orbitRadius*2
    const scale=Math.min(usableWidth/(diameter*pulse),usableDepth/(diameter*pulse),(volume.size.y*.5)/(size.y*pulse),1.5)
    const fitted = new Group(); fitted.add(body); fitted.scale.setScalar(scale); root.add(fitted)
    const halfHeight=size.y*scale*pulse/2, slot=(index-(count-1)/2)*cellWidth,slotX=rightX*slot,slotZ=rightZ*slot
    root.position.set(slotX+orbitRadius,-volume.size.y/2+halfHeight+.04,slotZ);root.rotation.y=baseYaw
    root.userData.bounce=Math.max(0,Math.min(.16,volume.size.y-halfHeight*2-.08))
    root.userData.motion=motion;root.userData.baseY=root.position.y;root.userData.phase=index*1.7
    root.userData.baseX=root.position.x;root.userData.baseZ=root.position.z
    root.userData.orbitRadius=orbitRadius;root.userData.orbitCenterX=slotX;root.userData.orbitCenterZ=slotZ;root.userData.baseYaw=baseYaw;root.userData.slotIndex=index;root.userData.slotCenter={x:slotX,z:slotZ}
    root.userData.unitId=cue.unitId;root.userData.relationId=relationId??'legacy-fallback'
    root.userData.creativeDescription=`${cue.object}；${cue.action}；${cue.spatialRelation}`
    root.userData.realization=relationId??(layout==='row'?'顺序陈列；其他动作未实现':layout)
    group.add(root)
  })
  group.userData.realization='按每条线索的 relationId 独立执行；地标动作语境仅用于联想，不声称物理穿窗、跨页或附着。'
  return group
}
export function animateMnemonicCueGroup(group: Group, seconds: number, reducedMotion = false): void {
  for(const root of group.children){
    const phase=seconds+(root.userData.phase as number || 0)
    root.position.set(root.userData.baseX as number || 0,root.userData.baseY as number || 0,root.userData.baseZ as number || 0);root.scale.setScalar(1)
    if(reducedMotion){root.rotation.y=root.userData.baseYaw as number || 0;continue}
    const radius=root.userData.orbitRadius as number || 0
    if(radius){const angle=seconds*.55;root.position.x=(root.userData.orbitCenterX as number || 0)+Math.cos(angle)*radius;root.position.z=(root.userData.orbitCenterZ as number || 0)+Math.sin(angle)*radius}
    root.rotation.y=(root.userData.baseYaw as number || 0)+(root.userData.motion==='spin'?phase*.55:0)
    if(root.userData.motion==='bounce')root.position.y+=Math.abs(Math.sin(phase*1.3))*(root.userData.bounce as number || 0)
    if(root.userData.motion==='pulse')root.scale.setScalar(1+Math.sin(phase*1.7)*.055)
  }
}

interface CueMaterialBaseline { color: Color; emissive: Color; emissiveIntensity: number }
const cueMaterialBaselines = new WeakMap<MeshStandardMaterial, CueMaterialBaseline>()
/** Focus uses existing cue-owned materials only: no answer labels, geometry changes,
 * transparency, new GPU resources on repeat calls, or changes to the motion envelope. */
export function setMnemonicCueFocus(group: Group, unitId: string | null): void {
  const selected = unitId !== null && group.children.some(root => root.userData.unitId === unitId)
  group.userData.focusedUnitId = selected ? unitId : null
  for (const root of group.children) {
    const active = selected && root.userData.unitId === unitId
    root.userData.focusState = selected ? active ? 'active' : 'context' : 'normal'
    root.userData.ordinal = Number(root.userData.slotIndex ?? 0) + 1
    root.traverse(object => {
      if (!(object instanceof Mesh)) return
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof MeshStandardMaterial)) continue
        let base = cueMaterialBaselines.get(material)
        if (!base) {
          base = { color: material.color.clone(), emissive: material.emissive.clone(), emissiveIntensity: material.emissiveIntensity }
          cueMaterialBaselines.set(material, base)
        }
        material.color.copy(base.color); material.emissive.copy(base.emissive); material.emissiveIntensity = base.emissiveIntensity
        if (active) { material.emissive.set('#ffcc66'); material.emissiveIntensity = .38 }
        else if (selected) { material.color.multiplyScalar(.24); material.emissive.multiplyScalar(.12) }
      }
    })
  }
}
