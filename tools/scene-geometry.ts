import { readFileSync } from 'node:fs'
import { Box3, Group, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DUST2_SCENE } from '../src/lib/sceneRegistry'
/** CPU geometry only: strips texture declarations, preserves every vertex and transform. */
export async function loadDustGeometryForInspection(): Promise<Group> {
 const b=readFileSync('public/maps/dust2/de_dust2_cs_map.glb'),n=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+n).toString())
 j.materials=[];j.textures=[];j.images=[];for(const mesh of j.meshes)for(const p of mesh.primitives)delete p.material
 const json=Buffer.from(JSON.stringify(j)),pad=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);json.copy(pad)
 const tail=b.subarray(20+n),out=Buffer.alloc(20+pad.length+tail.length);b.copy(out,0,0,12);out.writeUInt32LE(out.length,8);out.writeUInt32LE(pad.length,12);out.writeUInt32LE(0x4e4f534a,16);pad.copy(out,20);tail.copy(out,20+pad.length)
 const gltf=await new GLTFLoader().parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength),'')
 const root=new Group();root.add(gltf.scene);root.updateMatrixWorld(true);let box=new Box3().setFromObject(root);const size=box.getSize(new Vector3());root.scale.setScalar(DUST2_SCENE.worldTransform!.targetSpan/Math.max(size.x,size.z));root.updateMatrixWorld(true);box=new Box3().setFromObject(root);const center=box.getCenter(new Vector3());root.position.set(-center.x,-box.min.y,-center.z);root.updateMatrixWorld(true);return root
}
