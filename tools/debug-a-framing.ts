import{DUST2_SCENE}from'../src/lib/sceneRegistry'
import{fitAnchorFieldOfView}from'../src/three/anchorCamera'
import{loadDustGeometryForInspection}from'./scene-geometry'
import{Octree}from'three/examples/jsm/math/Octree.js'
import{Capsule}from'three/examples/jsm/math/Capsule.js'
import{Vector3,Raycaster}from'three'
const root=await loadDustGeometryForInspection(),o=new Octree().fromGraphNode(root),a=DUST2_SCENE.anchors.find(a=>a.id==='dust2-a-mark')!,b=a.landmark.framingBounds!,focus=new Vector3((b.min.x+b.max.x)/2,(b.min.y+b.max.y)/2,(b.min.z+b.max.z)/2),c=a.cueVolume.center,away=new Vector3(a.approach.position.x-focus.x,0,a.approach.position.z-focus.z).normalize()
console.log('BASE',a.approach,a.cueVolume,b,fitAnchorFieldOfView(a,16/9))
for(const back of [0,.4,.8,1.2,1.6,2,2.4,2.8,3.2,4,5]){
 const feet=new Vector3(a.approach.position.x,a.approach.position.y,a.approach.position.z).addScaledVector(away,back)
 const floor=new Raycaster(feet.clone().add(new Vector3(0,.8,0)),new Vector3(0,-1,0),0,1.7).intersectObject(root,true).filter(h=>h.face&&h.face.normal.clone().transformDirection(h.object.matrixWorld).y>.6).sort((x,y)=>Math.abs(x.point.y-feet.y)-Math.abs(y.point.y-feet.y))[0]
 if(!floor){console.log(back,'no floor');continue}feet.y=floor.point.y+.02
 const cap=new Capsule(feet.clone().add(new Vector3(0,.28,0)),feet.clone().add(new Vector3(0,1.4,0)),.28),hit=o.capsuleIntersect(cap),eye=feet.clone().add(new Vector3(0,1.6,0)),delta=new Vector3(c.x,c.y,c.z).sub(eye),occlude=new Raycaster(eye,delta.clone().normalize(),0,delta.length()-.02).intersectObject(root,true)
 const fs=[];for(const weight of [0,.1,.2,.3,.4,.5,.6,.7,.8,.9,1]){const t=focus.clone().lerp(new Vector3(c.x,c.y,c.z),weight);fs.push([weight,fitAnchorFieldOfView({...a,approach:{...a.approach,eye,lookAt:t}},16/9).requiredFov])}
 console.log(back,{feet,collision:hit?hit.depth:0,occlude:occlude.map(x=>x.object.name),best:fs.sort((x,y)=>x[1]!-y[1]!)[0]})
}
