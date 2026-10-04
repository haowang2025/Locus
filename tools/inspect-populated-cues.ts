import {writeFileSync} from 'node:fs'
import {Box3,PerspectiveCamera,Raycaster,Vector2,Vector3} from 'three'
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js'
import {createReadingHallWorld} from '../src/three/readingHall'
import {loadDustGeometryForInspection} from './scene-geometry'
import {buildMnemonicCueGroup,animateMnemonicCueGroup} from '../src/three/mnemonicCues'
import {getSceneDefinition,EXECUTABLE_CUE_RELATIONS} from '../src/lib/sceneRegistry'
import type {MnemonicCardData} from '../src/lib/palaceTypes'
class NodeFileReader{result:ArrayBuffer|string|null=null;onloadend?:()=>void;readAsArrayBuffer(b:Blob){b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.()})}readAsDataURL(b:Blob){b.arrayBuffer().then(r=>{this.result=`data:${b.type};base64,${Buffer.from(r).toString('base64')}`;this.onloadend?.()})}}
Object.assign(globalThis,{FileReader:NodeFileReader})
const hall=createReadingHallWorld().group,dust=await loadDustGeometryForInspection();hall.updateMatrixWorld(true);dust.updateMatrixWorld(true)
const output=[]
for(const id of ['hall-clock','hall-atlas','hall-cabinet','dust2-a-mark']){
 const sid=id.startsWith('hall')?'reading-hall':'dust2',a=getSceneDefinition(sid).anchors.find(a=>a.id===id)!,root=sid==='reading-hall'?hall:dust
 const cam=new PerspectiveCamera(70,16/9,.05,250),p=a.approach.eye,t=a.approach.lookAt;cam.position.set(p.x,p.y,p.z);cam.lookAt(t.x,t.y,t.z);cam.updateMatrixWorld(true)
 const b=a.landmark.framingBounds!,bbox=new Box3(new Vector3(b.min.x,b.min.y,b.min.z),new Vector3(b.max.x,b.max.y,b.max.z)),rays:{ray:Raycaster;distance:number;key:boolean}[]=[]
 for(let y=0;y<45;y++)for(let x=0;x<80;x++){
  const ray=new Raycaster();ray.setFromCamera(new Vector2((x+.5)/80*2-1,1-(y+.5)/45*2),cam);const hit=ray.intersectObject(root,true)[0];if(!hit)continue
  const owned=sid==='reading-hall'?hit.object.userData.anchorId===id:bbox.containsPoint(hit.point)
  if(!owned)continue
  const key=id==='hall-clock'?hit.object.name.includes('clock face')||hit.object.name.includes('clock long')||hit.object.name.includes('clock short'):id==='hall-atlas'?hit.object.name.includes('atlas ivory')||hit.object.name.includes('atlas red')||hit.object.name.includes('atlas map'):id==='hall-cabinet'?hit.point.y>1&&hit.point.y<1.7:true
  rays.push({ray,distance:hit.distance,key})
 }
 for(const mode of ['ordered-row','frame'] as const){
  const cues:MnemonicCardData['cues']=Array.from({length:3},(_,i)=>({unitId:'stress-'+i,volumeId:a.cueVolume.id,object:'Opaque stress-test cube '+i,relationId:mode,visual:{shape:'box',color:['#e4a442','#cb664e','#528eab'][i]!,motion:mode==='frame'?'pulse':'none'},action:'Opaque diagnostic arrangement',spatialRelation:EXECUTABLE_CUE_RELATIONS[mode],rationale:'Visual clearance test; no source claims'}))
  const group=buildMnemonicCueGroup({cues},a);let worst={all:0,key:0,time:0}
  for(let phase=0;phase<=30;phase++){
   animateMnemonicCueGroup(group,phase*.2);group.updateMatrixWorld(true);let all=0,key=0
   for(const r of rays){const hit=r.ray.intersectObject(group,true)[0];if(hit&&hit.distance<r.distance-.02){all++;if(r.key)key++}}
   if(key>worst.key||(key===worst.key&&all>worst.all))worst={all,key,time:phase*.2}
  }
  animateMnemonicCueGroup(group,worst.time);group.updateMatrixWorld(true)
  const glb=await new GLTFExporter().parseAsync(group,{binary:true});writeFileSync('../scene-inspection/stress_'+id+'_'+mode+'.glb',Buffer.from(glb as ArrayBuffer))
  output.push({anchorId:id,mode,landmarkPixels:rays.length,keyFeaturePixels:rays.filter(r=>r.key).length,occludedPixels:worst.all,keyFeatureOccludedPixels:worst.key,worstPhaseSeconds:worst.time,eye:p,lookAt:t,verticalFov:70,aspect:16/9})
 }
}
writeFileSync('../scene-inspection/populated_cue_occlusion.json',JSON.stringify({method:'Sampled actual world first-hit rays compared with shared opaque cue geometry; not browser rendering',imageGrid:[80,45],animationPhases:31,results:output},null,2));console.log(JSON.stringify(output,null,2))
