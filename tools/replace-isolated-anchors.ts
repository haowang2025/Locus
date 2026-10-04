import {readFileSync,writeFileSync} from 'node:fs'
import {Box3,Mesh,Raycaster,Triangle,Vector3} from 'three'
import {DUST2_SCENE,type SceneAnchor} from '../src/lib/sceneRegistry'
import {loadDustGeometryForInspection} from './scene-geometry'
import {fitAnchorFieldOfView} from '../src/three/anchorCamera'
const root=await loadDustGeometryForInspection(),nav=JSON.parse(readFileSync('../scene-inspection/dust2_nav_components.json','utf8'))
const tris:Triangle[]=[],boxes:Box3[]=[]
root.traverse(o=>{if(!(o instanceof Mesh))return;const p=o.geometry.attributes.position,idx=o.geometry.index,n=idx?idx.count:p.count;for(let i=0;i<n;i+=3){const t=new Triangle();t.a.fromBufferAttribute(p,idx?idx.getX(i):i).applyMatrix4(o.matrixWorld);t.b.fromBufferAttribute(p,idx?idx.getX(i+1):i+1).applyMatrix4(o.matrixWorld);t.c.fromBufferAttribute(p,idx?idx.getX(i+2):i+2).applyMatrix4(o.matrixWorld);tris.push(t);boxes.push(new Box3().setFromPoints([t.a,t.b,t.c]))}})
const specs=[{index:3,id:'dust2-west-gate',label:'西院禁入拱门',zone:'西院',focus:{x:-20.48195,y:5.1205,z:13.85545},preferred:{x:-25,y:3.64,z:13.85},axis:'x',description:'浅褐石墙中的双扇拱形木门，门板带有 STAY OUT 字样；门前是西院的平坦砂土地面',tags:['边界','禁止','条件','准入']},{index:5,id:'dust2-north-gate',label:'北院宽拱木门',zone:'北院',focus:{x:-24.6988,y:5.1205,z:-33.43365},preferred:{x:-24.7,y:3.64,z:-28.9},axis:'z',description:'北院尽端的宽拱双扇木门，浅色石块包围深色竖木板，门前可见红色地面标记',tags:['入口','门槛','筛选','阶段']}]
const anchors=structuredClone(DUST2_SCENE.anchors),changes=[]
for(const spec of specs){
 const base=anchors[spec.index]!,candidates=(nav.nodes as number[][]).filter(n=>n[3]===0&&Math.abs(n[1]!-spec.preferred.y)<.35&&Math.hypot(n[0]!-spec.preferred.x,n[2]!-spec.preferred.z)<2.5).sort((a,b)=>Math.hypot(a[0]!-spec.preferred.x,a[2]!-spec.preferred.z)-Math.hypot(b[0]!-spec.preferred.x,b[2]!-spec.preferred.z))
 let chosen:SceneAnchor|null=null
 search:for(const n of candidates){
  const feet={x:n[0]!,y:n[1]!,z:n[2]!},eye=new Vector3(feet.x,feet.y+1.6,feet.z),focus=new Vector3(spec.focus.x,spec.focus.y,spec.focus.z),delta=focus.clone().sub(eye),len=Math.hypot(delta.x,delta.z)
  if(len<3.8||len>6)continue
  if(spec.axis==='x'&&feet.x>spec.focus.x-3)continue
  if(spec.axis==='z'&&feet.z<spec.focus.z+3)continue
  if(new Raycaster(eye,delta.clone().normalize(),0,delta.length()-.04).intersectObject(root,true).length)continue
  for(const cueDistance of [2.4,2.2,2.6,2.8])for(const raise of [0,.1,.2]){
   const center={x:feet.x+delta.x/len*cueDistance,y:feet.y+.84+raise,z:feet.z+delta.z/len*cueDistance},size=base.cueVolume.size,box=new Box3(new Vector3(center.x-size.x/2,center.y-size.y/2,center.z-size.z/2),new Vector3(center.x+size.x/2,center.y+size.y/2,center.z+size.z/2))
   if(tris.some((t,i)=>box.intersectsBox(boxes[i]!)&&box.intersectsTriangle(t)))continue
   for(const weight of [.5,.65,.8,1]){
    const target=focus.clone().lerp(new Vector3(center.x,center.y,center.z),weight),eyePoint={x:eye.x,y:eye.y,z:eye.z}
    const anchor:SceneAnchor={...base,id:spec.id,label:spec.label,zone:spec.zone,position:{...center,y:center.y-.86},landmark:{description:spec.description,shape:'拱形双扇木门',material:'深色木板、浅色石块',colors:['深褐','砂褐'],visibleFeatures:spec.description.split('，'),focusPoint:spec.focus},semanticTags:spec.tags,affordances:['把门想成边界或筛选条件（联想说明；不实现开门动作）'],approach:{position:feet,eye:eyePoint,lookAt:{x:target.x,y:target.y,z:target.z},yaw:Math.atan2(eye.x-target.x,eye.z-target.z),pitch:Math.atan2(target.y-eye.y,Math.hypot(target.x-eye.x,target.z-eye.z))},cueVolume:{...base.cueVolume,id:spec.id+'-cue',center},verification:{method:'blender-raycast',reachable:null,visible:true,sceneVersion:'dust2-vrchris-08f7ab9c-v3',evidence:'实际 GLB 中 material_23/material_7 门板连通分量实测；观看点属于主步行连通区；完整线索体积无三角形相交；眼到门板与线索无遮挡；未验收浏览器交互。'}}
    if(fitAnchorFieldOfView(anchor,16/9).requiredFov>70)continue
    chosen=anchor;break search
   }
  }
 }
 if(!chosen)throw new Error('No safe gate approach '+spec.id)
 anchors[spec.index]=chosen;changes.push({oldId:base.id,newId:chosen.id,approach:chosen.approach,cueVolume:chosen.cueVolume})
}
anchors.forEach((a,i)=>{a.neighbors=[i>0?anchors[i-1]!.id:'',i<anchors.length-1?anchors[i+1]!.id:''].filter(Boolean);a.verification.sceneVersion='dust2-vrchris-08f7ab9c-v3'})
writeFileSync('../scene-inspection/dust2_v3_anchors.json',JSON.stringify(anchors,null,2));writeFileSync('../scene-inspection/isolated_anchor_replacements.json',JSON.stringify({reason:'Two isolated regions replaced by measured door landmarks in the main connected region; no collider deletion or enlarged step height',changes},null,2));console.log(JSON.stringify(changes,null,2))
