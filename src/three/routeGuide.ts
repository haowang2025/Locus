import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments } from 'three'
import type { SceneDefinition } from '../lib/sceneRegistry'
/** Optional floor-level guide follows tested route waypoints, never the direct anchor chord. */
export function createSceneRouteGuide(scene:SceneDefinition):Group{
 const root=new Group();root.name='walking_route_guide'
 const route=scene.route.walking;if(!route||route.sceneVersion!==scene.version)return root
 const vertices:number[]=[]
 for(const leg of route.legs)for(let i=1;i<leg.waypoints.length;i++){
  if(i%4===0)continue // a restrained broken line rather than a solid stripe
  const a=leg.waypoints[i-1]!,b=leg.waypoints[i]!
  vertices.push(a[0],a[1]+.04,a[2],b[0],b[1]+.04,b[2])
 }
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3))
 root.add(new LineSegments(geometry,new LineBasicMaterial({color:0x8cd6b7,transparent:true,opacity:.55,depthWrite:false})))
 return root
}
