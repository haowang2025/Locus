import assert from 'node:assert/strict'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { PortableWalker } from '../src/offline/walkController'
import { createReadingHallWorld } from '../src/three/readingHall'
import { READING_HALL } from '../src/lib/sceneRegistry'
const root = new Group(), material = new MeshBasicMaterial()
function box(x:number,y:number,z:number,w:number,h:number,d:number){ const m = new Mesh(new BoxGeometry(w,h,d),material);m.position.set(x,y,z);root.add(m) }
box(0,-.1,0,20,.2,20); box(0,1.5,-2,20,3,.2);box(3,.12,1,2,.24,2)
const walker = new PortableWalker(root)
walker.teleportEye(new Vector3(0,1.62,0));for(let i=0;i<600;i++)walker.step(1/60,1,0,0)
assert(walker.eye().z >= -1.621, 'solid wall must block forward motion')
assert(Math.abs(walker.eye().y-1.62)<.01,'floor must support eye height')
walker.teleportEye(new Vector3(3,1.62,3));for(let i=0;i<40;i++)walker.step(1/60,1,0,0)
assert(walker.eye().y > 1.8,'low step should raise floor-following height')
assert(walker.eye().z < 2.2,'step should not trap movement')
const hall = createReadingHallWorld(), hallWalker = new PortableWalker(hall.group.getObjectByName('COLLISION')!)
for(const anchor of READING_HALL.anchors){ const p=anchor.approach.eye;hallWalker.teleportEye(new Vector3(p.x,p.y,p.z));for(let i=0;i<120;i++)hallWalker.step(1/60,0,0,0);const eye=hallWalker.eye();assert(eye.toArray().every(Number.isFinite),anchor.id);assert(Math.abs(eye.y-1.62)<.03,anchor.id+' stands on floor');assert(Math.hypot(eye.x-p.x,eye.z-p.z)<.08,anchor.id+' spawn unobstructed') }
console.log('PASS: wall collision, floor support, low-step traversal, 12 reading-hall spawn viewpoints')
