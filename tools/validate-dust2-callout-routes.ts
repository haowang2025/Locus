import {readFileSync,writeFileSync} from 'node:fs'
import {Box3,Group,Ray,Vector3} from 'three'
import {Octree} from 'three/examples/jsm/math/Octree.js'
import {Capsule} from 'three/examples/jsm/math/Capsule.js'
import {loadDustGeometryForInspection} from './scene-geometry'
import {DUST2_SCENE,type SceneDefinition} from '../src/lib/sceneRegistry'
import {PortableWalker} from '../src/offline/walkController'

type Point={x:number;y:number;z:number}
type Node=Point&{id:number;gx:number;gz:number}
type LegResult={from:string;to:string;pass:boolean;visited:number;attempt:number;reason?:string;graphNodes?:number;waypoints?:Point[];failedAt?:number;frames?:number;seconds?:number;end?:Point;trace?:Point[]}
class Heap {
 a:{id:number;f:number}[]=[]
 push(id:number,f:number){const a=this.a;let i=a.length;a.push({id,f});while(i){const p=(i-1)>>1;if(a[p]!.f<=f)break;a[i]=a[p]!;i=p}a[i]={id,f}}
 pop(){const a=this.a,first=a[0]!,last=a.pop()!;if(a.length){let i=0;while(true){let c=i*2+1;if(c>=a.length)break;if(c+1<a.length&&a[c+1]!.f<a[c]!.f)c++;if(a[c]!.f>=last.f)break;a[i]=a[c]!;i=c}a[i]=last}return first}
 get length(){return this.a.length}
}
function groundGrid(root:Group,step:number){
 const octree=new Octree().fromGraphNode(root),box=new Box3().setFromObject(root),nodes:Node[]=[],cells=new Map<string,Node[]>(),normal=new Vector3()
 const nx=Math.ceil((box.max.x-box.min.x)/step),nz=Math.ceil((box.max.z-box.min.z)/step)
 const capsule=new Capsule(new Vector3(),new Vector3(),.28)
 for(let gx=0;gx<=nx;gx++)for(let gz=0;gz<=nz;gz++){
  const x=box.min.x+gx*step,z=box.min.z+gz*step,ray=new Ray(new Vector3(x,box.max.y+1,z),new Vector3(0,-1,0));const layers:Node[]=[]
  for(let k=0;k<12;k++){
   const hit=octree.rayIntersect(ray);if(!hit)break
   const y=hit.position.y+.022;ray.origin.y=hit.position.y-.006
   if(hit.triangle.getNormal(normal).y<.55)continue
   capsule.start.set(x,y+.28,z);capsule.end.set(x,y+1.4,z);const collision=octree.capsuleIntersect(capsule)
   if(collision&&collision.depth>.025)continue
   if(layers.some(n=>Math.abs(n.y-y)<.08))continue
   const node={id:nodes.length,gx,gz,x,y,z};nodes.push(node);layers.push(node)
  }
  if(layers.length)cells.set(gx+','+gz,layers)
 }
 const edgeCache=new Map<string,boolean>()
 function edgeClear(a:Node,b:Node){
  const key=a.id+':'+b.id;if(edgeCache.has(key))return edgeCache.get(key)!
  let clear=true
  // Conservative body clearance above the higher foot surface; controller replay
  // separately proves the step/ramp, gravity and support transitions.
  for(const t of [.25,.5,.75]){
   const x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=Math.max(a.y,b.y)
   capsule.start.set(x,y+.28,z);capsule.end.set(x,y+1.4,z)
   const hit=octree.capsuleIntersect(capsule);if(hit&&hit.depth>.04){clear=false;break}
  }
  edgeCache.set(key,clear);return clear
 }
 function neighbors(a:Node){const result:Node[]=[];for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){if((!dx&&!dz)||Math.hypot(dx,dz)*step>.65)continue;for(const b of cells.get((a.gx+dx)+','+(a.gz+dz))??[]){if(b.y-a.y>.335||a.y-b.y>.35)continue;if(edgeClear(a,b))result.push(b)}}return result}
 function nearest(p:{x:number;y:number;z:number}){let best:Node|undefined,score=Infinity;for(const n of nodes){if(Math.abs(n.y-p.y)>.4)continue;const d=Math.hypot(n.x-p.x,n.z-p.z)+Math.abs(n.y-p.y)*2;if(d<score){score=d;best=n}}if(!best||score>1.2)throw new Error('No close ground grid point '+JSON.stringify(p));return best}
 function search(start:Node,end:Node,blocked:Set<string>){
  const heap=new Heap(),g=new Float64Array(nodes.length).fill(Infinity),prev=new Int32Array(nodes.length).fill(-1),closed=new Uint8Array(nodes.length);g[start.id]=0;heap.push(start.id,0)
  let visited=0
  while(heap.length){const current=heap.pop().id;if(closed[current])continue;closed[current]=1;visited++;if(current===end.id){const path:Node[]=[];for(let id=current;id!==-1;id=prev[id]!)path.push(nodes[id]!);return {path:path.reverse(),visited}}
   const a=nodes[current]!;for(const b of neighbors(a)){if(closed[b.id]||blocked.has(a.id+':'+b.id))continue;const candidate=g[current]!+Math.hypot(b.x-a.x,b.z-a.z)+Math.abs(b.y-a.y)*1.5;if(candidate>=g[b.id]!)continue;g[b.id]=candidate;prev[b.id]=current;heap.push(b.id,candidate+Math.hypot(b.x-end.x,b.z-end.z))}
  }
  return {path:null,visited}
 }
 return {nodes,nearest,search,neighbors,octree,step}
}
function simulate(root:Group,path:Node[],start:{x:number;y:number;z:number},goal:{x:number;y:number;z:number}){
 const walker=new PortableWalker(root);walker.teleportEye(new Vector3(start.x,start.y+1.6,start.z));for(let i=0;i<120;i++)walker.step(1/120,0,0,0)
 const points=[...path.map(n=>({x:n.x,y:n.y,z:n.z})),goal],trace:{x:number;y:number;z:number}[]=[];let frames=0,failedAt=-1
 for(let index=0;index<points.length;index++){
  const target=points[index]!;let noProgress=0,lastDistance=Infinity
  for(let k=0;k<360;k++){
   const eye=walker.eye(),distance=Math.hypot(target.x-eye.x,target.z-eye.z)
   if(distance<.12&&Math.abs(target.y+1.62-eye.y)<.4)break
   if(k===359){failedAt=index;break}
   const yaw=Math.atan2(eye.x-target.x,eye.z-target.z),movement=Math.min(1,distance/.15);walker.step(1/60,movement,0,yaw);frames++
   if(frames%6===0){const e=walker.eye();trace.push({x:e.x,y:e.y-1.62,z:e.z})}
   if(lastDistance-distance<.0003)noProgress++;else noProgress=0;lastDistance=distance
   if(noProgress>90){failedAt=index;break}
  }
  if(failedAt>=0)break
 }
 const end=walker.eye();return {pass:failedAt<0&&Math.hypot(end.x-goal.x,end.z-goal.z)<.25,failedAt,frames,seconds:frames/60,end:{x:end.x,y:end.y,z:end.z},trace}
}
async function run(definition:SceneDefinition,root:Group){
 console.log('Building multi-height grid',definition.id);root.updateMatrixWorld(true);root=(root.getObjectByName('COLLISION')??root) as Group;const grid=groundGrid(root,Number(process.env.NAV_STEP)||(definition.id==='dust2'?.4:.3));console.log('Walkable grid nodes',grid.nodes.length)
 if(process.env.NAV_COMPONENTS){
  const comp=new Int32Array(grid.nodes.length).fill(-1),components:{id:number;seed:string;count:number}[]=[]
  for(const a of definition.anchors){
   const seed=grid.nearest(a.approach.position);if(comp[seed.id]>=0)continue
   const id=components.length,queue=[seed];comp[seed.id]=id
   for(let i=0;i<queue.length;i++)for(const n of grid.neighbors(queue[i]!)){if(comp[n.id]>=0)continue;comp[n.id]=id;queue.push(n)}
   components.push({id,seed:a.id,count:queue.length})
  }
  writeFileSync('../scene-inspection/'+definition.id+'_nav_components.json',JSON.stringify({components,anchors:definition.anchors.map(a=>({id:a.id,position:a.approach.position,component:comp[grid.nearest(a.approach.position).id]})),nodes:grid.nodes.map(n=>[n.x,n.y,n.z,comp[n.id]])}));console.log('COMPONENTS',JSON.stringify(components));return []
 }
 const results:LegResult[]=[];const concatenated:Node[]=[]
 for(let i=1;i<definition.anchors.length;i++){
  const from=definition.anchors[i-1]!,to=definition.anchors[i]!,start=grid.nearest(from.approach.position),end=grid.nearest(to.approach.position),blocked=new Set<string>();let final:LegResult|null=null
  for(let attempt=0;attempt<12;attempt++){
   const found=grid.search(start,end,blocked)
   if(!found.path){final={from:from.id,to:to.id,pass:false,reason:'No connected multi-height graph path',visited:found.visited,attempt};break}
   const replay=simulate(root,found.path,from.approach.position,to.approach.position)
   final={from:from.id,to:to.id,graphNodes:found.path.length,attempt,visited:found.visited,waypoints:found.path.map(n=>({x:n.x,y:n.y,z:n.z})),...replay}
   if(replay.pass)break
   const at=Math.min(found.path.length-1,Math.max(1,replay.failedAt));blocked.add(found.path[at-1]!.id+':'+found.path[at]!.id)
  }
  if(!final)throw new Error('No route result produced')
  results.push(final);if(final.pass&&final.waypoints){concatenated.push(...final.waypoints.map((n:Point)=>({...n,id:-1,gx:-1,gz:-1})),{...to.approach.position,id:-1,gx:-1,gz:-1})}
  console.log(definition.id,from.id,'->',to.id,final.pass,final.reason??('seconds '+final.seconds+' failAt '+final.failedAt))
  writeFileSync('../scene-inspection/'+definition.id+'_walking_routes.json',JSON.stringify({method:'Multi-height ground graph + actual PortableWalker replay; not browser input/render verification',sceneId:definition.id,sceneVersion:definition.version,gridStep:grid.step,nodeCount:grid.nodes.length,results},null,2))
 }
 if(results.every(r=>r.pass)){
  const continuous=simulate(root,concatenated,definition.anchors[0]!.approach.position,definition.anchors.at(-1)!.approach.position)
  writeFileSync('../scene-inspection/'+definition.id+'_continuous_route.json',JSON.stringify({method:'One initial spawn, no inter-anchor teleports; actual capsule controller replay',sceneId:definition.id,sceneVersion:definition.version,gridStep:grid.step,...continuous},null,2));console.log('CONTINUOUS',definition.id,continuous.pass,continuous.seconds,continuous.failedAt)
 }
 return results
}
const candidate={...DUST2_SCENE,id:'dust2-callouts',version:'dust2-vrchris-08f7ab9c-v5',anchors:JSON.parse(readFileSync('src/lib/dust2CalloutAnchors.json','utf8'))};
await run(candidate,await loadDustGeometryForInspection());
