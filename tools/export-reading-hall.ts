import { writeFileSync } from 'node:fs'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { createReadingHallWorld } from '../src/three/readingHall'
import { READING_HALL, listSceneDefinitions } from '../src/lib/sceneRegistry'
class NodeFileReader {
  result: ArrayBuffer | string | null = null
  onloadend?: () => void
  readAsArrayBuffer(blob: Blob) { blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.()}) }
  readAsDataURL(blob: Blob) { blob.arrayBuffer().then(result=>{this.result=`data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;this.onloadend?.()}) }
}
Object.assign(globalThis,{FileReader:NodeFileReader})
const {group}=createReadingHallWorld()
const glb = await new GLTFExporter().parseAsync(group, {binary:true,onlyVisible:true})
writeFileSync('../scene-inspection/reading_hall.glb',Buffer.from(glb as ArrayBuffer))
writeFileSync('../scene-inspection/reading_hall_anchors.json',JSON.stringify(READING_HALL,null,2))
writeFileSync('../scene-inspection/scene_definitions.json',JSON.stringify(listSceneDefinitions(),null,2))
writeFileSync('../scene-inspection/dust2_anchors.json',JSON.stringify(listSceneDefinitions().find(s=>s.id==='dust2')!.anchors,null,2))
console.log('Reading hall exported with',READING_HALL.anchors.length,'anchors')
