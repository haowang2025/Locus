import { PerspectiveCamera, Vector3 } from 'three'
import type { SceneAnchor } from '../lib/sceneRegistry'

/** Fixed safe eye, adaptive lens only. Never moves the player through geometry. */
export interface AnchorCameraSpec { approach: Pick<SceneAnchor['approach'],'eye'|'lookAt'>; cueVolume: Pick<SceneAnchor['cueVolume'],'center'|'size'>; landmark?: Pick<SceneAnchor['landmark'],'focusPoint'|'framingBounds'> }
export function fitAnchorFieldOfView(anchor: AnchorCameraSpec, aspect: number, baseFov=70, maxFov=110): { fov:number; fits:boolean; requiredFov:number } {
  const a=Math.max(.1,aspect),eye=anchor.approach.eye,look=anchor.approach.lookAt
  const camera=new PerspectiveCamera(baseFov,a,.05,250)
  camera.position.set(eye.x,eye.y,eye.z);camera.lookAt(look.x,look.y,look.z);camera.updateMatrixWorld(true)
  const c=anchor.cueVolume.center,s=anchor.cueVolume.size,points:Vector3[]=[]
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])points.push(new Vector3(c.x+x*s.x/2,c.y+y*s.y/2,c.z+z*s.z/2))
  const bounds=anchor.landmark?.framingBounds
  if(bounds){for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])points.push(new Vector3(x,y,z))}
  else {const focus=anchor.landmark?.focusPoint??look;for(const y of [-.35,0,.35])points.push(new Vector3(focus.x,focus.y+y,focus.z))}
  let tangent=0
  for(const point of points){
    const local=point.clone().applyMatrix4(camera.matrixWorldInverse),depth=-local.z
    if(depth<=.05)return {fov:maxFov,fits:false,requiredFov:180}
    tangent=Math.max(tangent,Math.abs(local.y)/(depth*.76),Math.abs(local.x)/(depth*a*.8))
  }
  const requiredFov=2*Math.atan(tangent)*180/Math.PI
  const fov=Math.min(maxFov,Math.max(baseFov,requiredFov+.25))
  return {fov,fits:requiredFov<=maxFov,requiredFov}
}
