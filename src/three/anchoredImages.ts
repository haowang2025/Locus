import {DoubleSide, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, Scene, SRGBColorSpace, Texture, Vector3} from 'three'
import {imagePlaneSize} from '../offline/attachments'
import {assertImageDimensions,imageHeaderDimensions} from '../offline/imageHeader'
import type {SceneAnchor} from '../lib/sceneRegistry'
export interface LocusImage {id:string;blob:Blob}
type Placement={cueVolume:Pick<SceneAnchor['cueVolume'],'center'|'size'>;approach:Pick<SceneAnchor['approach'],'eye'>}
export interface DecodedLocusImage {width:number;height:number;texture:Texture;close:()=>void}
type CacheEntry=DecodedLocusImage & {bytes:number;refs:number}
export async function decodeLocusImage(blob:Blob):Promise<DecodedLocusImage>{
 if(!blob.size||blob.size>48*1024*1024)throw new Error('图片附件为空或超过48MB。')
 const size=imageHeaderDimensions(new Uint8Array(await blob.slice(0,4*1024*1024).arrayBuffer()),blob.type);assertImageDimensions(size.width,size.height)
 if(typeof createImageBitmap!=='function')throw new Error('此浏览器不支持安全图片解码，请使用练习面板中的原图。')
 const ratio=Math.min(1,2048/Math.max(size.width,size.height)),width=Math.max(1,Math.round(size.width*ratio)),height=Math.max(1,Math.round(size.height*ratio))
 const bitmap=await createImageBitmap(blob,{resizeWidth:width,resizeHeight:height,imageOrientation:'flipY',premultiplyAlpha:'none'})
 const texture=new Texture(bitmap);texture.colorSpace=SRGBColorSpace;texture.needsUpdate=true;texture.generateMipmaps=false;texture.minFilter=LinearFilter
 return {width:bitmap.width,height:bitmap.height,texture,close:()=>bitmap.close()}
}
/** One selected image per locus; serialized decode and a32MiB resident RGBA budget.
 * Cache owns textures; planes own only geometry/material. Clearing hides synchronously. */
export class AnchoredImages {
 private generations=new Map<string,number>()
 private cache=new Map<Blob,CacheEntry>()
 private planes=new Map<string,{mesh:Mesh<PlaneGeometry,MeshBasicMaterial>;entry:CacheEntry}>()
 private tail:Promise<void>=Promise.resolve()
 private disposed=false
 private scene:Scene
 private decode:typeof decodeLocusImage
 private budget:number
 constructor(scene:Scene,decode=decodeLocusImage,budget=32*1024*1024){this.scene=scene;this.decode=decode;this.budget=budget}
 has(id:string){return this.planes.has(id)}
 objects(){return [...this.planes.values()].map(v=>v.mesh)}
 clear(id:string){this.generations.set(id,(this.generations.get(id)??0)+1);const old=this.planes.get(id);if(!old)return;old.mesh.removeFromParent();old.mesh.geometry.dispose();old.mesh.material.dispose();old.entry.refs--;this.planes.delete(id)}
 clearAll(){for(const id of new Set([...this.generations.keys(),...this.planes.keys()]))this.clear(id)}
 private evict(required:number,sourceBytes=0){
  let used=[...this.cache.values()].reduce((n,v)=>n+v.bytes,0),compressed=[...this.cache.keys()].reduce((n,b)=>n+b.size,0)
  const fits=()=>used+required<=this.budget&&compressed+sourceBytes<=64*1024*1024&&this.cache.size<16
  for(const [blob,entry]of this.cache){if(fits())break;if(entry.refs)continue;entry.texture.dispose();entry.close();this.cache.delete(blob);used-=entry.bytes;compressed-=blob.size}
  if(!fits())throw new Error('场景图片解码预算已满，请减少同时显示的图片。')
 }
 set(id:string,images:LocusImage[],placement:Placement,selectedId?:string):Promise<void>{
  this.clear(id);if(this.disposed)return Promise.resolve()
  const selected=selectedId?images.find(image=>image.id===selectedId):images[0];if(!selected)return Promise.resolve()
  const generation=this.generations.get(id),current=()=>!this.disposed&&this.generations.get(id)===generation
  const run=async()=>{
   if(!current())return
   let entry=this.cache.get(selected.blob)
   if(!entry){
    // Reserve worst-case2048² RGBA before decode; source dimensions are preflighted by decoder.
    this.evict(2048*2048*4,selected.blob.size)
    const decoded=await this.decode(selected.blob)
    if(!current()){decoded.texture.dispose();decoded.close();return}
    const bytes=decoded.width*decoded.height*4
    if(!Number.isSafeInteger(bytes)||decoded.width<=0||decoded.height<=0||decoded.width>2048||decoded.height>2048){decoded.texture.dispose();decoded.close();throw new Error('图片解码结果超出安全尺寸。')}
    try{this.evict(bytes,selected.blob.size)}catch(error){decoded.texture.dispose();decoded.close();throw error}
    entry={...decoded,bytes,refs:0};this.cache.set(selected.blob,entry)
   }else{this.cache.delete(selected.blob);this.cache.set(selected.blob,entry)}
   if(!current())return
   const {width,height}=imagePlaneSize(entry.width/entry.height,placement.cueVolume.size)
   const mesh=new Mesh(new PlaneGeometry(width,height),new MeshBasicMaterial({map:entry.texture,side:DoubleSide,toneMapped:false}))
   const p=placement.cueVolume.center,e=placement.approach.eye;mesh.position.set(p.x,p.y,p.z);mesh.lookAt(new Vector3(e.x,e.y,e.z));mesh.userData.locusId=id;mesh.userData.assetId=selected.id;mesh.name='anchored user image';entry.refs++;this.planes.set(id,{mesh,entry});this.scene.add(mesh)
  }
  const result=this.tail.then(run);this.tail=result.catch(()=>{});return result
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.clearAll();for(const e of this.cache.values()){e.texture.dispose();e.close()}this.cache.clear()}
}
