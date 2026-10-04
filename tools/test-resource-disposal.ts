import assert from 'node:assert/strict'
import {BoxGeometry,Group,Mesh,MeshStandardMaterial,ShaderMaterial,Texture} from 'three'
import {SceneResourceDisposer} from '../src/three/resourceDisposer'
let closed=0,geometryEvents=0,materialEvents=0,textureEvents=0
const bitmap={close(){closed++}},second={close(){closed++}}
const a=new Texture(bitmap),b=new Texture(bitmap),c=new Texture(second)
for(const t of [a,b,c])t.addEventListener('dispose',()=>textureEvents++)
const geometry=new BoxGeometry();geometry.addEventListener('dispose',()=>geometryEvents++)
const material=new MeshStandardMaterial({map:a,normalMap:b});material.addEventListener('dispose',()=>materialEvents++)
const shader=new ShaderMaterial({uniforms:{one:{value:c},many:{value:[a,b,c]}}});shader.addEventListener('dispose',()=>materialEvents++)
const root=new Group();root.add(new Mesh(geometry,material),new Mesh(geometry,[material,shader]))
const disposer=new SceneResourceDisposer();disposer.object(root);disposer.object(root);disposer.material(material);disposer.texture(a)
assert.equal(geometryEvents,1);assert.equal(materialEvents,2);assert.equal(textureEvents,3);assert.equal(closed,2)
assert.deepEqual(disposer.counts,{geometries:1,materials:2,textures:3,closedImages:2})
const next=new Group(),nextGeometry=new BoxGeometry(),nextMaterial=new MeshStandardMaterial();next.add(new Mesh(nextGeometry,nextMaterial));disposer.object(next)
assert.equal(disposer.counts.geometries,2);assert.equal(disposer.counts.materials,3)
console.log('Resource disposal checks pass: shared graphs, material arrays, uniform textures, shared bitmap close, idempotence, retired/new graphs. No WebGL context test performed.')
