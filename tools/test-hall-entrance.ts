import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {Vector3} from 'three'
import {createReadingHallWorld} from '../src/three/readingHall'
import {PortableWalker} from '../src/offline/walkController'
import {READING_HALL} from '../src/lib/sceneRegistry'
const results=[]
for(const batchStatic of [false,true])for(const x of [-1.3,-.74,0,.74,1.3])for(const speed of [1,3]){
 const root=createReadingHallWorld({batchStatic}).group,walker=new PortableWalker(root.getObjectByName('COLLISION')!)
 let teleports=0;const original=walker.teleportEye.bind(walker);walker.teleportEye=(p:Vector3)=>{teleports++;original(p)}
 walker.teleportEye(new Vector3(x,1.62,8));for(let i=0;i<600;i++)walker.step(1/120,1,0,Math.PI,speed)
 const eye=walker.eye();assert.equal(teleports,1,'closed door must block without fall recovery');assert.ok(eye.z<8.7&&eye.z>8.2);assert.ok(eye.y>1.5&&eye.y<1.7)
 results.push({batchStatic,x,speed,teleports,end:eye.toArray()})
}
writeFileSync('../scene-inspection/hall_entrance_validation.json',JSON.stringify({sceneVersion:READING_HALL.version,method:'Actual capsule controller walking outward for5seconds at normal and3x speed, raw and batched visible-door geometry',pass:true,results},null,2));console.log('20 entrance cases pass')
