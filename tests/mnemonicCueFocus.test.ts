import test from 'node:test'
import assert from 'node:assert/strict'
import {Box3, Mesh, MeshStandardMaterial} from 'three'
import {READING_HALL} from '../src/lib/sceneRegistry'
import {buildMnemonicCueGroup,setMnemonicCueFocus,animateMnemonicCueGroup} from '../src/three/mnemonicCues'
import type {MnemonicCardData} from '../src/lib/palaceTypes'

test('unit focus preserves geometry, motion bounds, material identity and original colors',()=>{
 const cues:MnemonicCardData['cues']=[0,1,2].map(i=>({unitId:`unit-${i}`,volumeId:READING_HALL.anchors[0]!.cueVolume.id,object:'test',action:'test',spatialRelation:'在线索区按顺序排列',relationId:'ordered-row',rationale:'test',visual:{shape:'box',color:'#65a8ca',motion:'pulse'}}))
 const group=buildMnemonicCueGroup({cues},READING_HALL.anchors[0]!),materials:MeshStandardMaterial[]=[],geometries:unknown[]=[]
 group.traverse(o=>{if(o instanceof Mesh){geometries.push(o.geometry);materials.push(...(Array.isArray(o.material)?o.material:[o.material]) as MeshStandardMaterial[])}})
 const initial=materials.map(m=>({color:m.color.getHex(),emissive:m.emissive.getHex(),intensity:m.emissiveIntensity}));animateMnemonicCueGroup(group,1);const bounds=new Box3().setFromObject(group)
 for(let i=0;i<30;i++)setMnemonicCueFocus(group,`unit-${i%3}`)
 setMnemonicCueFocus(group,'unit-1');assert.deepEqual(group.children.map(c=>c.userData.focusState),['context','active','context']);assert.deepEqual(group.children.map(c=>c.userData.ordinal),[1,2,3]);assert.equal(materials[1]!.emissiveIntensity,.38);assert.notEqual(materials[0]!.color.getHex(),initial[0]!.color)
 assert.ok(new Box3().setFromObject(group).equals(bounds))
 for(const reset of [null,'unknown-unit']){setMnemonicCueFocus(group,reset);materials.forEach((m,i)=>{assert.equal(m.color.getHex(),initial[i]!.color);assert.equal(m.emissive.getHex(),initial[i]!.emissive);assert.equal(m.emissiveIntensity,initial[i]!.intensity)})}
 const afterMaterials:unknown[]=[],afterGeometries:unknown[]=[];group.traverse(o=>{if(o instanceof Mesh){afterGeometries.push(o.geometry);afterMaterials.push(...(Array.isArray(o.material)?o.material:[o.material]))}});assert.deepEqual(afterMaterials,materials);assert.deepEqual(afterGeometries,geometries)
})
