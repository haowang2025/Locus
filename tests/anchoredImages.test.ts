import test from 'node:test'
import assert from 'node:assert/strict'
import {Box3,Scene,Texture,Vector3} from 'three'
import {AnchoredImages,type DecodedLocusImage} from '../src/three/anchoredImages'
import {READING_HALL,DUST2_SCENE} from '../src/lib/sceneRegistry'
function fakeImage(width=512,height=256){const texture=new Texture();let closed=0,disposed=0;texture.addEventListener('dispose',()=>disposed++);return{value:{width,height,texture,close:()=>{closed++}},counts:()=>({closed,disposed})}}
test('anchored image fitting matches both scenes and displays one selected image only',async()=>{
 const scene=new Scene(),made:ReturnType<typeof fakeImage>[]=[],manager=new AnchoredImages(scene,async()=>{const image=fakeImage();made.push(image);return image.value})
 const blobs=[new Blob(['a']),new Blob(['b'])]
 for(const anchor of [...READING_HALL.anchors,...DUST2_SCENE.anchors]){
  await manager.set(anchor.id,[{id:'a',blob:blobs[0]!},{id:'b',blob:blobs[1]!}],anchor,'b')
  assert.equal(scene.children.length,1);const mesh=scene.children[0]!;assert.equal(mesh.userData.assetId,'b')
  const bounds=new Box3().setFromObject(mesh),c=anchor.cueVolume.center,s=anchor.cueVolume.size
  assert.ok(bounds.min.x>=c.x-s.x/2&&bounds.max.x<=c.x+s.x/2);assert.ok(bounds.min.y>=c.y-s.y/2&&bounds.max.y<=c.y+s.y/2);assert.ok(bounds.min.z>=c.z-s.z/2&&bounds.max.z<=c.z+s.z/2)
  const normal=new Vector3(0,0,1).applyQuaternion(mesh.quaternion),eye=anchor.approach.eye;assert.ok(normal.dot(new Vector3(eye.x-c.x,eye.y-c.y,eye.z-c.z).normalize())>.999)
  manager.clear(anchor.id);assert.equal(scene.children.length,0)
 }
 assert.equal(made.length,1,'same blob texture cache reused');manager.dispose();manager.dispose();assert.deepEqual(made[0]!.counts(),{closed:1,disposed:1})
})
test('clear/dispose during decode never adds late image or leaks bitmap',async()=>{
 for(const dispose of [false,true]){
  const scene=new Scene(),image=fakeImage();let finish!:(v:DecodedLocusImage)=>void
  const manager=new AnchoredImages(scene,()=>new Promise(resolve=>{finish=resolve}))
  const pending=manager.set('L01',[{id:'a',blob:new Blob(['a'])}],READING_HALL.anchors[0]!);await Promise.resolve();if(dispose)manager.dispose();else manager.clear('L01');finish(image.value);await pending;assert.equal(scene.children.length,0);assert.deepEqual(image.counts(),{closed:1,disposed:1})
 }
})
test('cache eviction preserves visible textures, and live budget failure is explicit',async()=>{
 const images:ReturnType<typeof fakeImage>[]=[],manager=new AnchoredImages(new Scene(),async()=>{const image=fakeImage(2048,2048);images.push(image);return image.value},16*1024*1024),anchor=READING_HALL.anchors[0]!
 await manager.set('one',[{id:'a',blob:new Blob(['a'])}],anchor)
 await assert.rejects(manager.set('two',[{id:'b',blob:new Blob(['b'])}],anchor),/预算/);assert.deepEqual(images[0]!.counts(),{closed:0,disposed:0})
 manager.clear('one');await manager.set('two',[{id:'b',blob:new Blob(['b'])}],anchor);assert.deepEqual(images[0]!.counts(),{closed:1,disposed:1});manager.dispose();assert.deepEqual(images[1]!.counts(),{closed:1,disposed:1})
})
