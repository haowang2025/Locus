import {readFileSync,writeFileSync} from 'node:fs'
import {Box3,Group,Mesh,PerspectiveCamera,Raycaster,Triangle,Vector3} from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {Octree} from 'three/examples/jsm/math/Octree.js'
import {Capsule} from 'three/examples/jsm/math/Capsule.js'
import {createReadingHallWorld} from '../src/three/readingHall'
import {READING_HALL,DUST2_SCENE,type SceneDefinition} from '../src/lib/sceneRegistry'
async function dust(){
 const b=readFileSync('public/maps/dust2/de_dust2_cs_map.glb'),n=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+n).toString())
 j.materials=[];j.textures=[];j.images=[];for(const mesh of j.meshes)for(const p of mesh.primitives)delete p.material
 const json=Buffer.from(JSON.stringify(j)),pad=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);json.copy(pad)
 const tail=b.subarray(20+n),out=Buffer.alloc(20+pad.length+tail.length);b.copy(out,0,0,12);out.writeUInt32LE(out.length,8);out.writeUInt32LE(pad.length,12);out.writeUInt32LE(0x4e4f534a,16);pad.copy(out,20);tail.copy(out,20+pad.length)
 const gltf=await new GLTFLoader().parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength),'')
 const root=new Group();root.add(gltf.scene);root.updateMatrixWorld(true);let box=new Box3().setFromObject(root);const size=box.getSize(new Vector3());const scale=DUST2_SCENE.worldTransform!.targetSpan/Math.max(size.x,size.z);root.scale.setScalar(scale);root.updateMatrixWorld(true);box=new Box3().setFromObject(root);const center=box.getCenter(new Vector3());root.position.set(-center.x,-box.min.y,-center.z);root.updateMatrixWorld(true)
 return {root,scale,bounds:new Box3().setFromObject(root)}
}
function validate(root:Group,scene:SceneDefinition){
 root.updateMatrixWorld(true);const octree=new Octree().fromGraphNode(root)
 const anchors=scene.anchors.map(a=>{
  const p=a.approach.position;const capsule=new Capsule(new Vector3(p.x,p.y+.35,p.z),new Vector3(p.x,p.y+1.6,p.z),.35)
  const collision=octree.capsuleIntersect(capsule)
  const center=new Vector3(a.cueVolume.center.x,a.cueVolume.center.y,a.cueVolume.center.z),eye=new Vector3(a.approach.eye.x,a.approach.eye.y,a.approach.eye.z),delta=center.clone().sub(eye)
  const ray=new Raycaster(eye,delta.clone().normalize(),0,delta.length()-.02),hits=ray.intersectObject(root,true)
  return {id:a.id,capsuleFree:!collision || collision.depth<.015,collision:collision?{depth:collision.depth,normal:collision.normal.toArray()}:null,cueCenterVisible:hits.length===0,occluders:hits.slice(0,3).map(h=>h.object.name)}
 })
 const volumeIntersections = scene.anchors.map(a=>{
  const c=a.cueVolume.center,s=a.cueVolume.size,box=new Box3(new Vector3(c.x-s.x/2,c.y-s.y/2,c.z-s.z/2),new Vector3(c.x+s.x/2,c.y+s.y/2,c.z+s.z/2))
  const objects=new Map<string,number>(), tri=new Triangle()
  root.traverse(object=>{
   if(!(object instanceof Mesh))return
   if(!box.intersectsBox(new Box3().setFromObject(object)))return
   const g=object.geometry,pos=g.attributes.position,index=g.index,n=index?index.count:pos.count
   for(let i=0;i<n;i+=3){
    tri.a.fromBufferAttribute(pos,index?index.getX(i):i).applyMatrix4(object.matrixWorld)
    tri.b.fromBufferAttribute(pos,index?index.getX(i+1):i+1).applyMatrix4(object.matrixWorld)
    tri.c.fromBufferAttribute(pos,index?index.getX(i+2):i+2).applyMatrix4(object.matrixWorld)
    if(box.intersectsTriangle(tri))objects.set(object.name,(objects.get(object.name)??0)+1)
   }
  })
  const eye=new Vector3(a.approach.eye.x,a.approach.eye.y,a.approach.eye.z),occludedSamples=[]
  for(const x of [-1,0,1])for(const y of [-1,0,1])for(const z of [-1,0,1]){
   const target=new Vector3(c.x+x*s.x/2,c.y+y*s.y/2,c.z+z*s.z/2),delta=target.clone().sub(eye),hits=new Raycaster(eye,delta.clone().normalize(),0,delta.length()-.02).intersectObject(root,true)
   if(hits.length)occludedSamples.push({sample:[x,y,z],object:hits[0]!.object.name})
  }
  return {id:a.id,clear:objects.size===0,intersections:Object.fromEntries(objects),visibilitySamples:27,occludedSamples}
 })
 return {sceneId:scene.id,anchors,volumeIntersections}
}
const d=await dust();const result={method:'Three.js CPU geometric check; not browser gameplay verification',dustTransform:{scale:d.scale,bounds:{min:d.bounds.min.toArray(),max:d.bounds.max.toArray()}},scenes:[validate(createReadingHallWorld().group,READING_HALL),validate(d.root,DUST2_SCENE)]}
writeFileSync('../scene-inspection/three_geometry_validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))

if(process.argv.includes('--repair-volumes')){
 const triangles:Triangle[]=[];d.root.traverse(object=>{if(!(object instanceof Mesh))return;const g=object.geometry,p=g.attributes.position,idx=g.index,n=idx?idx.count:p.count;for(let i=0;i<n;i+=3){const t=new Triangle();t.a.fromBufferAttribute(p,idx?idx.getX(i):i).applyMatrix4(object.matrixWorld);t.b.fromBufferAttribute(p,idx?idx.getX(i+1):i+1).applyMatrix4(object.matrixWorld);t.c.fromBufferAttribute(p,idx?idx.getX(i+2):i+2).applyMatrix4(object.matrixWorld);triangles.push(t)}})
 const bounds=triangles.map(t=>new Box3().setFromPoints([t.a,t.b,t.c]))
 const anchors=structuredClone(DUST2_SCENE.anchors)
 for(const a of anchors){
  const c=a.cueVolume.center,size=a.cueVolume.size,eye=new Vector3(a.approach.eye.x,a.approach.eye.y,a.approach.eye.z),feet=a.approach.position
  const dx=c.x-feet.x,dz=c.z-feet.z,len=Math.hypot(dx,dz);let found=false
  search: for(const lateral of [0,.35,-.35,.7,-.7,1,-1]) for(const shift of [0,-.2,-.4,-.6,-.8,-1,.2]){
   for(const raise of [0,.08,.16,.24,.4,.6]){
    const next=new Vector3(c.x+dx/len*shift-dz/len*lateral,c.y+raise,c.z+dz/len*shift+dx/len*lateral),half=new Vector3(size.x,size.y,size.z).multiplyScalar(.5),box=new Box3(next.clone().sub(half),next.clone().add(half))
    if(triangles.some((t,i)=>box.intersectsBox(bounds[i]!)&&box.intersectsTriangle(t)))continue
    const delta=next.clone().sub(eye),ray=new Raycaster(eye,delta.clone().normalize(),0,delta.length()-.02)
    if(ray.intersectObject(d.root,true).length)continue
    a.cueVolume.center={x:next.x,y:next.y,z:next.z};a.verification.evidence+='；线索完整体积通过 Three.js 三角形相交排除检查。';found=true;break search
   }
   if(found)break
  }
  if(!found)throw new Error('No clear volume found: '+a.id)
 }
 writeFileSync('../scene-inspection/dust2_anchors_clear.json',JSON.stringify(anchors,null,2))
}


if(process.argv.includes('--fit-views')){
 const outputs=[]
 for(const definition of [READING_HALL,DUST2_SCENE]){
  const root=definition.id==='reading-hall'?createReadingHallWorld().group:d.root;root.updateMatrixWorld(true)
  const octree=new Octree().fromGraphNode(root),anchors=structuredClone(definition.anchors), proofs=[]
  for(const anchor of anchors){
   const old=anchor.approach,landmark=new Vector3(old.lookAt.x,old.lookAt.y,old.lookAt.z),c=anchor.cueVolume.center,s=anchor.cueVolume.size,center=new Vector3(c.x,c.y,c.z),points:Vector3[]=[]
   for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])points.push(new Vector3(c.x+x*s.x/2,c.y+y*s.y/2,c.z+z*s.z/2))
   const framed=[...points],feature=anchor.landmark.framingBounds
   if(feature){for(const x of [feature.min.x,feature.max.x])for(const y of [feature.min.y,feature.max.y])for(const z of [feature.min.z,feature.max.z])framed.push(new Vector3(x,y,z));landmark.set((feature.min.x+feature.max.x)/2,(feature.min.y+feature.max.y)/2,(feature.min.z+feature.max.z)/2)}
   else framed.push(landmark,landmark.clone().add(new Vector3(0,.35,0)),landmark.clone().add(new Vector3(0,-.35,0)))
   const away=new Vector3(old.position.x-landmark.x,0,old.position.z-landmark.z).normalize()
   let found=false
   const origin=new Vector3(old.position.x,old.position.y,old.position.z)
   const candidates=[0,.2,.4,.6,.8,1,1.2,1.6,2,2.4,2.8,3.2].map(back=>origin.clone().addScaledVector(away,back))
   if(definition.id==='dust2'){
    const nav=JSON.parse(readFileSync('../scene-inspection/dust2_nav_components.json','utf8'))
    const alternatives=(nav.nodes as number[][]).filter(n=>n[3]===0&&Math.abs(n[1]!-origin.y)<.5&&Math.hypot(n[0]!-origin.x,n[2]!-origin.z)<5).map(n=>new Vector3(n[0]!,n[1]!,n[2]!)).sort((a,b)=>a.distanceToSquared(origin)-b.distanceToSquared(origin))
    candidates.push(...alternatives)
   }
   search:for(const candidate of candidates){
    const feet=candidate.clone(),back=feet.distanceTo(origin)
    const floorHits=new Raycaster(feet.clone().add(new Vector3(0,.8,0)),new Vector3(0,-1,0),0,1.7).intersectObject(root,true)
    const floor=floorHits.filter(h=>h.face&&h.face.normal.clone().transformDirection(h.object.matrixWorld).y>.6).sort((a,b)=>Math.abs(a.point.y-feet.y)-Math.abs(b.point.y-feet.y))[0]
    if(!floor)continue
    feet.y=floor.point.y+.02
    const capsule=new Capsule(feet.clone().add(new Vector3(0,.35,0)),feet.clone().add(new Vector3(0,1.6,0)),.35),collision=octree.capsuleIntersect(capsule)
    if(collision&&collision.depth>.015)continue
    const eye=feet.clone().add(new Vector3(0,1.6,0)),delta=center.clone().sub(eye)
    if(new Raycaster(eye,delta.clone().normalize(),0,delta.length()-.02).intersectObject(root,true).length)continue
    for(const weight of [.5,.6,.7,.65,.8,.9,1,.35,.4,.25,0]){
     const target=landmark.clone().lerp(center,weight),camera=new PerspectiveCamera(70,16/9,.05,250);camera.position.copy(eye);camera.lookAt(target);camera.updateMatrixWorld(true)
     const projected=framed.map(p=>p.clone().project(camera))
     if(projected.some(p=>Math.abs(p.x)>.8||Math.abs(p.y)>.76||p.z<-1||p.z>1))continue
     const pt=(p:Vector3)=>({x:p.x,y:p.y,z:p.z})
     anchor.approach={position:pt(feet),eye:pt(eye),lookAt:pt(target),yaw:Math.atan2(eye.x-target.x,eye.z-target.z),pitch:Math.atan2(target.y-eye.y,Math.hypot(target.x-eye.x,target.z-eye.z))}
     proofs.push({id:anchor.id,back,weight,maxAbsX:Math.max(...projected.map(p=>Math.abs(p.x))),maxAbsY:Math.max(...projected.map(p=>Math.abs(p.y))),cueCornersInFrame:true,landmarkCenterInFrame:true,fullFeatureBoundsInFrame:!!feature})
     found=true;break search
    }
   }
   if(!found)throw new Error('No framed safe approach: '+anchor.id)
  }
  outputs.push({sceneId:definition.id,anchors,proofs})
 }
 writeFileSync('../scene-inspection/view_fitting.json',JSON.stringify({method:'Three.js CPU camera projection, not browser rendering',verticalFov:70,aspect:16/9,safeInsets:{horizontal:.1,vertical:.12},scenes:outputs},null,2))
}
