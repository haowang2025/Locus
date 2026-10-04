import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {writeFileSync} from 'node:fs'
import {Box3,BoxGeometry,Group,Matrix3,Mesh,MeshStandardMaterial,Texture,Vector2,Vector3} from 'three'
import {createReadingHallWorld} from '../src/three/readingHall'
import {batchStaticDecor} from '../src/three/batchStaticDecor'
import {SceneResourceDisposer} from '../src/three/resourceDisposer'
import {READING_HALL} from '../src/lib/sceneRegistry'
import {PortableWalker} from '../src/offline/walkController'
const raw=createReadingHallWorld().group,batched=createReadingHallWorld({batchStatic:true}).group
function signature(root:Group){
 root.updateWorldMatrix(true,true);const triangles:string[]=[],landmarks=new Map<string,number>();let meshes=0
 root.traverse(o=>{if(!(o instanceof Mesh))return;meshes++;if(o.userData.anchorId)landmarks.set(o.userData.anchorId,(landmarks.get(o.userData.anchorId)??0)+1)
  const m=o.material as MeshStandardMaterial,key=[m.type,m.color?.getHexString(),m.roughness,m.metalness,m.opacity,m.transparent,m.side,m.emissive?.getHexString(),m.emissiveIntensity,m.alphaTest,m.depthTest].join('|'),p=o.geometry.attributes.position,idx=o.geometry.index,count=idx?idx.count:p.count
  for(let i=0;i<count;i+=3){const normalMatrix=new Matrix3().getNormalMatrix(o.matrixWorld);const v=[0,1,2].map(j=>{const vertex=idx?idx.getX(i+j):i+j;const pos=new Vector3().fromBufferAttribute(p,vertex).applyMatrix4(o.matrixWorld).toArray();const normal=new Vector3().fromBufferAttribute(o.geometry.attributes.normal,vertex).applyNormalMatrix(normalMatrix).toArray();const uv=new Vector2().fromBufferAttribute(o.geometry.attributes.uv,vertex).toArray();return [...pos,...normal,...uv].map(n=>Math.round(n*1e4)).join(',')});const cyclic=[v.join(';'),[v[1],v[2],v[0]].join(';'),[v[2],v[0],v[1]].join(';')].sort()[0]!;triangles.push(key+';'+cyclic)}
 })
 triangles.sort();return{meshes,triangles:triangles.length,hash:createHash('sha256').update(triangles.join('\n')).digest('hex'),landmarks:Object.fromEntries(landmarks),bounds:new Box3().setFromObject(root)}
}
const a=signature(raw),b=signature(batched);assert.equal(a.triangles,b.triangles);assert.equal(a.hash,b.hash);assert.deepEqual(a.landmarks,b.landmarks);assert.ok(a.bounds.min.distanceTo(b.bounds.min)<1e-5&&a.bounds.max.distanceTo(b.bounds.max)<1e-5)
const ca=signature(raw.getObjectByName('COLLISION') as Group),cb=signature(batched.getObjectByName('COLLISION') as Group);assert.equal(ca.hash,cb.hash)
// Sharing fixture: batching must not dispose a material or a geometry still used by a landmark.
const fixture=new Group(),category=new Group();category.name='COLLISION';fixture.add(category)
const texture=new Texture(),geometry=new BoxGeometry(),material=new MeshStandardMaterial({map:texture}),anchor=new Mesh(geometry,material);anchor.userData.anchorId='keep';category.add(anchor)
let materialDisposals=0,geometryDisposals=0,textureDisposals=0;texture.addEventListener('dispose',()=>textureDisposals++);material.addEventListener('dispose',()=>materialDisposals++);geometry.addEventListener('dispose',()=>geometryDisposals++)
for(let i=0;i<3;i++){const mesh=new Mesh(geometry,material);mesh.userData.static=true;mesh.position.x=i+3;category.add(mesh)}
batchStaticDecor(fixture);assert.equal(materialDisposals,0);assert.equal(geometryDisposals,0);assert.equal(textureDisposals,0);assert.equal(anchor.material,material)
const resources=new SceneResourceDisposer();resources.object(fixture);resources.object(fixture);assert.equal(materialDisposals,1);assert.equal(geometryDisposals,1);assert.equal(textureDisposals,1)
// Hidden ancestors and alpha/draw-order-sensitive geometry must never be surfaced or merged.
const restricted=new Group(),restrictedCategory=new Group(),hidden=new Group();restrictedCategory.name='DETAILS';restricted.add(restrictedCategory);hidden.visible=false;restrictedCategory.add(hidden)
const opaque=new MeshStandardMaterial(),transparent=new MeshStandardMaterial({transparent:true,opacity:.5}),shared=new BoxGeometry()
for(let i=0;i<2;i++){const hiddenMesh=new Mesh(shared,opaque);hiddenMesh.userData.static=true;hidden.add(hiddenMesh);const alphaMesh=new Mesh(shared,transparent);alphaMesh.userData.static=true;restrictedCategory.add(alphaMesh)}
const restrictedStats=batchStaticDecor(restricted);assert.equal(restrictedStats.batches,0);assert.equal(hidden.children.length,2);assert.equal(hidden.visible,false);assert.equal(restrictedCategory.children.length,3)
// Replay the entire supplied route on the optimized collision graph.
const walker=new PortableWalker(batched.getObjectByName('COLLISION')!),first=READING_HALL.anchors[0]!.approach.eye;let teleports=0
const originalTeleport=walker.teleportEye.bind(walker);walker.teleportEye=(p:Vector3)=>{teleports++;originalTeleport(p)};walker.teleportEye(new Vector3(first.x,first.y,first.z));for(let i=0;i<120;i++)walker.step(1/120,0,0,0)
for(const leg of READING_HALL.route.walking!.legs)for(const p of leg.waypoints){let reached=false;for(let i=0;i<400;i++){const eye=walker.eye(),d=Math.hypot(p[0]-eye.x,p[2]-eye.z);if(d<.12){reached=true;break}walker.step(1/90,Math.min(1,d/.15),0,Math.atan2(eye.x-p[0],eye.z-p[2]))}assert.ok(reached,'optimized route waypoint must be reachable')}
assert.equal(teleports,1)
const result={method:'CPU triangle/normal/UV/material signatures and actual controller replay, not measured browser FPS',comparisonQuantization:1e-4,sourceMeshes:a.meshes,resultMeshes:b.meshes,meshReductionPercent:Math.round((1-b.meshes/a.meshes)*1000)/10,triangleCount:a.triangles,triangleMaterialHash:a.hash,colliderHash:ca.hash,landmarkMeshesUnchanged:true,sharedMaterialsDisposedDuringBatch:0,continuousRouteTeleports:teleports,stats:batched.userData.staticBatchStats}
writeFileSync('../scene-inspection/static_batching_validation.json',JSON.stringify(result,null,2));console.log(result)
