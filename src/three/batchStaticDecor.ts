import { BufferGeometry, Group, InstancedMesh, Material, Matrix4, Mesh, MeshStandardMaterial, NormalBlending, Object3D, SkinnedMesh } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export interface StaticBatchStats { sourceMeshes:number;resultMeshes:number;batches:number;batchedSourceMeshes:number }
/** Pre-render optimization for opaque, fully visible standard-material decoration only. Landmark meshes stay separate/editable, COLLISION
 * boundaries stay intact, and shared materials/textures are never disposed here. */
export function batchStaticDecor(root:Group):StaticBatchStats {
  root.updateWorldMatrix(true,true)
  const geometryReferences=new Map<BufferGeometry,number>()
  const stats:StaticBatchStats={sourceMeshes:0,resultMeshes:0,batches:0,batchedSourceMeshes:0}
  root.traverse(object=>{if(object instanceof Mesh){stats.sourceMeshes++;geometryReferences.set(object.geometry,(geometryReferences.get(object.geometry)??0)+1)}})
  for(const categoryName of ['COLLISION','DETAILS']){
    const category=root.getObjectByName(categoryName)
    if(!(category instanceof Group))continue
    const inverse=new Matrix4().copy(category.matrixWorld).invert()
    const buckets=new Map<Material,Mesh[]>()
    category.traverse(object=>{
      if(!(object instanceof Mesh)||object instanceof InstancedMesh||object instanceof SkinnedMesh)return
      if(object.userData.anchorId||object.userData.static!==true||!object.visible||Array.isArray(object.material))return
      let ancestor=object.parent
      while(ancestor){if(!ancestor.visible)return;ancestor=ancestor.parent}
      const material=object.material
      if(!(material instanceof MeshStandardMaterial)||material.transparent||material.opacity!==1||material.alphaTest>0||material.alphaHash||material.blending!==NormalBlending||!material.depthWrite||!material.depthTest||material.displacementMap)return
      if(material.onBeforeCompile!==Material.prototype.onBeforeCompile||object.onBeforeRender!==Object3D.prototype.onBeforeRender||object.onAfterRender!==Object3D.prototype.onAfterRender)return
      if(object.geometry.drawRange.start!==0||object.geometry.drawRange.count!==Infinity)return
      if(object.matrixWorld.determinant()<=0||Object.keys(object.geometry.morphAttributes).length)return
      if(object.renderOrder!==0||object.castShadow||object.receiveShadow||object.customDepthMaterial||object.customDistanceMaterial)return
      if(object.layers.mask!==1)return
      const list=buckets.get(object.material)??[];list.push(object);buckets.set(object.material,list)
    })
    for(const [material,meshes] of buckets){
      if(meshes.length<2)continue
      const clones=meshes.map(mesh=>mesh.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(inverse,mesh.matrixWorld)))
      const merged=mergeGeometries(clones,false)
      for(const geometry of clones)geometry.dispose()
      if(!merged)continue
      const batch=new Mesh(merged,material);batch.name=`STATIC_BATCH_${categoryName}_${stats.batches+1}`
      batch.userData.static=true;batch.userData.batchSourceCount=meshes.length;batch.userData.nonSemanticDecor=true
      category.add(batch)
      for(const mesh of meshes){
        mesh.removeFromParent()
        const remaining=(geometryReferences.get(mesh.geometry)??1)-1;geometryReferences.set(mesh.geometry,remaining)
        // An anchor or another unbatched mesh may share this geometry.
        if(remaining===0)mesh.geometry.dispose()
      }
      stats.batches++;stats.batchedSourceMeshes+=meshes.length
    }
  }
  root.updateWorldMatrix(true,true)
  root.traverse(object=>{if(object instanceof Mesh)stats.resultMeshes++})
  root.userData.staticBatchStats=stats
  return stats
}
