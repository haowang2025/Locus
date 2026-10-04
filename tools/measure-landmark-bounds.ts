import {writeFileSync,readFileSync} from 'node:fs'
import{Box3,Mesh,Vector3}from'three'
import{createReadingHallWorld}from'../src/three/readingHall'
import{READING_HALL,DUST2_SCENE}from'../src/lib/sceneRegistry'
const root=createReadingHallWorld().group;root.updateMatrixWorld(true)
const bounds:Record<string,{min:{x:number;y:number;z:number};max:{x:number;y:number;z:number};evidence:string}>={}
const pt=(p:Vector3)=>({x:p.x,y:p.y,z:p.z})
for(const a of READING_HALL.anchors){const b=new Box3();root.traverse(o=>{if(o instanceof Mesh&&o.userData.anchorId===a.id)b.union(new Box3().setFromObject(o))});if(b.isEmpty())throw new Error(a.id);bounds[a.id]={min:pt(b.min),max:pt(b.max),evidence:'Exact world bounds of all authored meshes tagged with this anchorId; includes supporting base.'}}
type MeshComponent={min:[number,number,number];max:[number,number,number]}
const parts=JSON.parse(readFileSync('../scene-inspection/dust2_scale_evidence.json','utf8')) as {material:string[];components:MeshComponent[]}[]
function componentBox(c:MeshComponent){return new Box3(new Vector3(c.min[0]/2,c.min[2]/2,-c.max[1]/2),new Vector3(c.max[0]/2,c.max[2]/2,-c.min[1]/2))}
for(const a of DUST2_SCENE.anchors){
 const focus=a.landmark.focusPoint??a.approach.lookAt,p=new Vector3(focus.x,focus.y,focus.z)
 const candidates:{box:Box3;distance:number}[]=[]
 const wood=['dust2-west-crate','dust2-south-crates','dust2-south-turn','dust2-east-crates'].includes(a.id),green=['dust2-a-mark','dust2-b-mark','dust2-middle-crate'].includes(a.id),door=a.id.endsWith('-gate')
 if(!wood&&!green&&!door)continue
 for(const part of parts){
  const m=part.material[0],matches=wood?m==='material_12':green?m==='material_31':['material_7','material_23'].includes(m)
  if(!matches)continue
  for(const c of part.components){const box=componentBox(c),center=box.getCenter(new Vector3());candidates.push({box,distance:Math.hypot(center.x-p.x,center.z-p.z)})}
 }
 candidates.sort((a,b)=>a.distance-b.distance)
 const b=new Box3();const chosen=a.id==='dust2-a-mark'?candidates.slice(0,3):a.id==='dust2-b-mark'?candidates.filter(c=>c.distance<4):a.id==='dust2-middle-crate'?candidates.slice(0,2):candidates.slice(0,1)
 for(const c of chosen)b.union(c.box)
 if(b.isEmpty())throw new Error(a.id)
 bounds[a.id]={min:pt(b.min),max:pt(b.max),evidence:'Measured connected mesh components of the original GLB, normalized to100span. '+(green?'Selected visible green-box group.':wood?'Closest wooden-crate component.':'Selected arched door panel.')}
}
writeFileSync('../scene-inspection/landmark_feature_bounds.json',JSON.stringify(bounds,null,2));console.log('Measured',Object.keys(bounds).length,'feature bounds')
