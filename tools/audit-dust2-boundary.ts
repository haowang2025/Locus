import {readFileSync,writeFileSync} from 'node:fs'
import {Capsule} from 'three/examples/jsm/math/Capsule.js'
import {Octree} from 'three/examples/jsm/math/Octree.js'
import {Box3,Ray,Vector3} from 'three'
import {loadDustGeometryForInspection} from './scene-geometry'
import {PortableWalker} from '../src/offline/walkController'
const root=await loadDustGeometryForInspection(),octree=new Octree().fromGraphNode(root),bounds=new Box3().setFromObject(root)
const nav=JSON.parse(readFileSync('../scene-inspection/dust2_nav_components.json','utf8')) as {nodes:[number,number,number,number][]}
const candidates:{x:number;y:number;z:number;dx:number;dz:number;direction:number}[]=[],bins=new Set<string>(),normal=new Vector3()
let openSamples=0,blockedSamples=0
const capsule=new Capsule(new Vector3(),new Vector3(),.28)
for(const n of nav.nodes){
 if(n[3]!==0)continue
 for(let direction=0;direction<8;direction++){
  const angle=direction*Math.PI/4,dx=Math.cos(angle),dz=Math.sin(angle),x=n[0]+dx*.7,z=n[2]+dz*.7
  const floor=octree.rayIntersect(new Ray(new Vector3(x,n[1]+.12,z),new Vector3(0,-1,0)))
  if(floor&&floor.position.y>=bounds.min.y-.1&&floor.triangle.getNormal(normal).y>.5)continue
  openSamples++
  capsule.start.set(x,n[1]+.28,z);capsule.end.set(x,n[1]+1.4,z)
  if(octree.capsuleIntersect(capsule)){blockedSamples++;continue}
  // A body-width sweep prevents rays from declaring a wall merely because the
  // endpoint happens to lie inside a different mesh after a thin wall.
  let wall=false
  for(const t of [.2,.4,.6]){capsule.start.set(n[0]+dx*t,n[1]+.28,n[2]+dz*t);capsule.end.set(n[0]+dx*t,n[1]+1.4,n[2]+dz*t);const hit=octree.capsuleIntersect(capsule);if(hit&&hit.normal.y<.45){wall=true;break}}
  if(wall){blockedSamples++;continue}
  const key=Math.floor(n[0])+':'+Math.floor(n[2])+':'+Math.round(n[1])+':'+direction
  if(bins.has(key))continue;bins.add(key);candidates.push({x:n[0],y:n[1],z:n[2],dx,dz,direction})
 }
}
console.log('potential unsupported boundary probes',candidates.length,'from',openSamples,'open endpoint samples; blocked',blockedSamples)
const results=[]
for(const p of candidates){
 const walker=new PortableWalker(root);let teleports=0,firstRecovery:number|null=null,elapsed=0
 const original=walker.teleportEye.bind(walker);walker.teleportEye=eye=>{teleports++;if(teleports>1&&firstRecovery===null)firstRecovery=elapsed;original(eye)}
 walker.teleportEye(new Vector3(p.x,p.y+1.6,p.z));for(let i=0;i<60;i++)walker.step(1/120,0,0,0)
 const yaw=Math.atan2(-p.dx,-p.dz)
 for(let i=0;i<300;i++){elapsed=i/60;walker.step(1/60,1,0,yaw);if(teleports>1)break}
 const e=walker.eye();results.push({...p,recoveryTriggered:teleports>1,teleports,firstRecovery,end:{x:e.x,y:e.y,z:e.z}})
}
const report={method:'Sampled outward free-walk audit on the main0.2m ground component;8directions,0.7m support probe,1m start bins,actual controller for up to5s. Not browser playtesting or proof of every possible trajectory.',openSamples,blockedSamples,probes:results.length,falls:results.filter(r=>r.recoveryTriggered).length,results}
writeFileSync('../scene-inspection/dust2_boundary_audit.json',JSON.stringify(report,null,2));console.log('falls',report.falls)
