import{writeFileSync}from'node:fs'
import{PerspectiveCamera,Vector3}from'three'
import{listSceneDefinitions}from'../src/lib/sceneRegistry'
import{fitAnchorFieldOfView}from'../src/three/anchorCamera'
const report=[]
for(const aspect of [16/9,4/3,1,9/16,390/844,360/800])for(const scene of listSceneDefinitions())for(const a of scene.anchors){
 const framing=fitAnchorFieldOfView(a,aspect),cam=new PerspectiveCamera(framing.fov,aspect,.05,250),e=a.approach.eye,l=a.approach.lookAt;cam.position.set(e.x,e.y,e.z);cam.lookAt(l.x,l.y,l.z);cam.updateMatrixWorld(true)
 const points:Vector3[]=[],c=a.cueVolume.center,s=a.cueVolume.size
 for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])points.push(new Vector3(c.x+x*s.x/2,c.y+y*s.y/2,c.z+z*s.z/2))
 const cue=points.map(p=>p.clone().project(cam)),feature:Vector3[]=[],b=a.landmark.framingBounds
 if(b){for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])feature.push(new Vector3(x,y,z).project(cam))}
 else {const p=a.landmark.focusPoint??l;feature.push(new Vector3(p.x,p.y,p.z).project(cam))}
 const fits=(ps:Vector3[])=>ps.every(p=>Math.abs(p.x)<=1+1e-6&&Math.abs(p.y)<=1+1e-6&&p.z>=-1&&p.z<=1)
 report.push({scene:scene.id,sceneVersion:scene.version,id:a.id,label:a.label,aspect,...framing,cueFitsViewport:fits(cue),featureBoundsChecked:!!b,featureFitsViewport:fits(feature),maxCueNdcX:Math.max(...cue.map(p=>Math.abs(p.x))),maxCueNdcY:Math.max(...cue.map(p=>Math.abs(p.y)))})
}
const summary={cases:report.length,cueClipped:report.filter(r=>!r.cueFitsViewport).length,featureClipped:report.filter(r=>!r.featureFitsViewport).length,withoutRequestedMargins:report.filter(r=>!r.fits).length,maxFov:Math.max(...report.map(a=>a.fov))}
writeFileSync('../scene-inspection/responsive_framing.json',JSON.stringify({method:'CPU projection; actual UI/device rendering not verified. Linear floor landmarks use a representative focus point; object landmarks use measured full bounds.',summary,report},null,2));console.log(summary);console.log('clipped features',report.filter(r=>!r.featureFitsViewport).map(r=>({id:r.id,aspect:r.aspect,fov:r.fov})));if(summary.cueClipped)process.exitCode=1
