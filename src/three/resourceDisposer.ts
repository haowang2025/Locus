import { BufferGeometry, Material, Object3D, Texture } from 'three'

/** Per-owner, idempotent GPU/bitmap cleanup. Weak tracking does not retain retired
 * models. Do not hand it resources intentionally owned by a different renderer. */
export class SceneResourceDisposer {
  private geometries = new WeakSet<BufferGeometry>()
  private materials = new WeakSet<Material>()
  private textures = new WeakSet<Texture>()
  private images = new WeakSet<object>()
  readonly counts = { geometries:0, materials:0, textures:0, closedImages:0 }

  texture(texture: Texture): void {
    if(this.textures.has(texture))return
    this.textures.add(texture);this.counts.textures++;texture.dispose()
    const candidates = Array.isArray(texture.source?.data) ? texture.source.data : [texture.source?.data]
    for(const image of candidates){
      if(!image||typeof image!=='object'||this.images.has(image))continue
      this.images.add(image)
      if(typeof image.close==='function'){image.close();this.counts.closedImages++}
    }
  }
  material(material: Material): void {
    if(this.materials.has(material))return
    this.materials.add(material)
    for(const value of Object.values(material))if(value instanceof Texture)this.texture(value)
    const uniforms=(material as Material & {uniforms?:Record<string,{value:unknown}>}).uniforms
    const visit=(value:unknown):void=>{if(value instanceof Texture)this.texture(value);else if(Array.isArray(value))value.forEach(visit)}
    if(uniforms)for(const uniform of Object.values(uniforms))visit(uniform.value)
    material.dispose();this.counts.materials++
  }
  object(root: Object3D): void {
    root.traverse(object=>{
      const renderable=object as Object3D & {geometry?:BufferGeometry;material?:Material|Material[]}
      if(renderable.geometry&&!this.geometries.has(renderable.geometry)){this.geometries.add(renderable.geometry);renderable.geometry.dispose();this.counts.geometries++}
      if(renderable.material){const materials=Array.isArray(renderable.material)?renderable.material:[renderable.material];materials.forEach(material=>this.material(material))}
    })
    const environment=root as Object3D & {background?:unknown;environment?:unknown}
    if(environment.background instanceof Texture)this.texture(environment.background)
    if(environment.environment instanceof Texture)this.texture(environment.environment)
  }
}
