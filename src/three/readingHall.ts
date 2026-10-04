import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, ConeGeometry, Vector3 } from 'three'
import { HALL_STATIONS, READING_HALL } from '../lib/sceneRegistry'
import type { LocusPose } from './dust2blockout'
import { batchStaticDecor } from './batchStaticDecor'

/** Offline, texture-free scene: shared by app and portable export. No DOM dependencies. */
export function createReadingHallWorld(options: { batchStatic?: boolean } = {}): { group: Group; loci: LocusPose[] } {
  const group = new Group(); group.name = 'reading_hall_v1'
  const architecture = new Group(); architecture.name = 'COLLISION'; group.add(architecture)
  const details = new Group(); details.name = 'DETAILS'; group.add(details)
  const mat = (color: number, metalness = 0, roughness = 0.75) => new MeshStandardMaterial({ color, metalness, roughness })
  const cream = mat(0xe7dec9), wood = mat(0x664933), dark = mat(0x302e2b), brass = mat(0xb89451, 0.55, 0.34), stone = mat(0xa9b6b0)
  const blue = mat(0x397482), red = mat(0xa34e3e), ivory = mat(0xf5eacf), green = mat(0x56745b), purple = mat(0x8362a0)
  function box(name: string, x:number,y:number,z:number,w:number,h:number,d:number,m:MeshStandardMaterial,parent:Group=architecture) {
    const o = new Mesh(new BoxGeometry(w,h,d),m); o.name=name; o.position.set(x,y,z); o.userData.static=true; parent.add(o); return o
  }
  function cylinder(name:string,x:number,y:number,z:number,r:number,h:number,m:MeshStandardMaterial,segments=24,parent:Group=architecture) {
    const o = new Mesh(new CylinderGeometry(r,r,h,segments),m); o.name=name;o.position.set(x,y,z);o.userData.static=true;parent.add(o);return o
  }
  function sphere(name:string,x:number,y:number,z:number,r:number,m:MeshStandardMaterial,parent:Group=details) {
    const o=new Mesh(new SphereGeometry(r,24,16),m);o.name=name;o.position.set(x,y,z);parent.add(o);return o
  }
  function ring(name:string,x:number,y:number,z:number,r:number,t:number,m:MeshStandardMaterial,horizontal=true) {
    const o=new Mesh(new TorusGeometry(r,t,10,48),m);o.name=name;o.position.set(x,y,z);if(horizontal)o.rotation.x=Math.PI/2;details.add(o);return o
  }
  box('continuous oak floor',0,-0.16,0,24,0.32,18,wood)
  // Repeated floor seams and a restrained inset circulation band make scale readable.
  for(let x=-11.5;x<12;x+=0.75) box('floor board seam',x,0.003,0,0.012,0.007,17.7,dark,details)
  box('north wall',0,2.3,-9,24,4.6,0.35,cream)
  box('west wall',-12,2.3,0,0.35,4.6,18,cream)
  box('east wall',12,2.3,0,0.35,4.6,18,cream)
  box('entry wall left',-7,2.3,9,10,4.6,0.35,cream)
  box('entry wall right',7,2.3,9,10,4.6,0.35,cream)
  box('entry lintel',0,4.1,9,4,1,0.4,wood)
  // Visible closed entrance: the authored floor ends behind this physical double door.
  // 2.94m clear span, 2.96m leaves, 1.1m handles; no invisible perimeter collider.
  for(const side of [-1,1]) {
    box('entry stone infill',side*1.78,1.8,9,0.44,3.6,0.35,cream)
    box('entry walnut jamb',side*1.52,1.53,8.8,0.12,3.06,0.22,wood)
    box('closed teal entrance leaf',side*0.738,1.49,8.86,1.47,2.98,0.16,blue)
    for(const y of [0.72,2.08])box('entrance recessed walnut panel',side*0.738,y,8.767,1.14,1.02,0.028,wood,details)
    for(const y of [0.99,1.21])box('door handle mount',side*0.17,y,8.7,0.05,0.05,0.16,brass,details)
    cylinder('brass entrance pull',side*0.17,1.1,8.61,0.025,0.27,brass,12,details)
  }
  box('entry header',0,3.07,8.8,3.18,0.18,0.22,wood)
  box('solid entrance transom',0,3.39,9,3.12,0.46,0.35,cream)

  for(const x of [-11.6,11.6]) {box('dark wall dado',x,0.6,0,0.16,1.2,17.5,wood);box('brass dado cap',x,1.22,0,0.18,0.035,17.5,brass,details)}
  box('north dado',0,0.6,-8.7,23.5,1.2,0.18,wood)
  for(const x of [-10,-6,-2,2,6,10]) {
    box('structural pilaster',x,2.25,-8.7,0.32,4.5,0.5,wood)
    box('pilaster capital',x,4.25,-8.65,0.6,0.24,0.6,brass,details)
  }
  for(const z of [-7,-3,1,5]) {
    for(const x of [-11.65,11.65]) box('side pilaster',x,2.25,z,0.5,4.5,0.3,wood)
    box('exposed ceiling beam',0,4.55,z,24,0.28,0.3,wood)
  }
  // Clear central sky-lit volume; ceiling intentionally open for lightweight runtime lighting.
  for(const x of [-4,4]) for(const z of [-4,4]) {cylinder('column base',x,0.1,z,0.34,0.2,stone);cylinder('slender brass column',x,2.2,z,0.13,4.2,brass);cylinder('column capital',x,4.3,z,0.3,0.16,stone)}
  for(const z of [-4,0,4]) for(const x of [-11.35,11.35]) {
    box('bookcase backing',x,2.05,z,0.45,2.8,2.1,wood)
    for(let shelf=0;shelf<4;shelf++) {
      box('shelf edge',x+(x<0?0.23:-0.23),0.8+shelf*0.67,z,0.45,0.08,2.1,wood)
      for(let b=0;b<9;b++) box('book spine',x+(x<0?0.3:-0.3),1.05+shelf*0.67,z-0.85+b*0.2,0.22,0.4+(b%3)*0.035,0.13,[blue,red,green,ivory][(b+shelf)%4]!,details)
    }
  }
  for(const [key,, ,x,z,y] of HALL_STATIONS) {
    const architectureStart = architecture.children.length, detailsStart = details.children.length
    if(key==='entry') {
      box('lectern foot',x,0.08,z,1.3,0.16,0.9,wood);box('lectern body',x,0.55,z,0.8,0.94,0.55,wood)
      const top=box('sloped lectern',x,y,z,1.5,0.1,1,wood);top.rotation.x=0.12;box('lectern brass inlay',x,0.6,z+0.28,0.07,0.8,0.02,brass,details)
    } else if(key==='globe') {
      cylinder('globe plinth',x,0.42,z,0.4,0.84,wood);sphere('blue globe',x,1.3,z,0.58,blue);ring('meridian',x,1.3,z,0.66,0.035,brass,false);ring('equator',x,1.3,z,0.59,0.018,brass)
    } else if(key==='clock') {
      box('clock cabinet',x,1.4,z,0.8,2.8,0.65,wood);const face=cylinder('ivory clock face',x,2.25,z+0.35,0.33,0.04,ivory,32,details);face.rotation.x=Math.PI/2
      box('clock long hand',x,2.36,z+0.39,0.025,0.23,0.02,dark,details);box('clock short hand',x+0.065,2.25,z+0.39,0.15,0.025,0.02,dark,details)
      box('pendulum rod',x,1.3,z+0.37,0.025,1.1,0.025,brass,details);sphere('pendulum bob',x,0.8,z+0.37,0.14,brass)
    } else if(key==='window') {
      box('window sill',x,y-0.08,z,1.9,0.16,0.9,stone)
      for (const dx of [-0.65,0.65]) box('stone table support',x+dx,(y-0.16)/2,z,0.22,y-0.16,0.55,stone)
      ring('amber round window frame',x,2.6,-8.5,1.05,0.08,brass,false)
      const pane=cylinder('amber round window glass',x,2.6,-8.53,0.99,0.035,mat(0xd9a65c,0,0.45),48,details);pane.rotation.x=Math.PI/2
      box('round window mullion',x,2.6,-8.47,0.045,1.95,0.045,brass,details)
    } else if(key==='telescope') {
      for(const a of [0,2.094,4.188]) {const leg=box('telescope tripod leg',x+Math.cos(a)*0.21,0.65,z+Math.sin(a)*0.21,0.045,Math.hypot(1.3,.42),0.045,brass);leg.quaternion.setFromUnitVectors(new Vector3(0,1,0),new Vector3(-Math.cos(a)*.42,1.3,-Math.sin(a)*.42).normalize())}
      cylinder('telescope mounting joint',x,1.4,z,.065,.28,brass,16,details)
      const tube=cylinder('telescope copper tube',x,1.55,z,0.13,1.3,brass,24,details);tube.rotation.x=-1.1;const lens=sphere('blue telescope lens',x,1.84,z-0.55,0.135,blue);lens.scale.z=0.2
    } else if(key==='cabinet') {
      box('mineral cabinet back',x,1.3,z-0.25,1.8,2.6,0.12,blue)
      for(const dx of [-0.9,0.9])box('mineral cabinet side',x+dx,1.3,z,0.09,2.6,0.65,wood)
      for(const h of [0.1,0.95,1.8,2.6])box('mineral cabinet shelf',x,h,z,1.85,0.08,0.65,wood)
      for(let i=0;i<3;i++){const crystal=new Mesh(new ConeGeometry(0.22,0.55,5),purple);crystal.position.set(x+(i-1)*0.52,1.25,z);details.add(crystal)}
    } else if(key==='fountain') {
      cylinder('stone fountain basin',x,0.42,z,0.95,0.84,stone,40);cylinder('blue water surface',x,0.85,z,0.85,0.02,blue,40,details)
      for(const r of [0.25,0.5,0.75])ring('water ripple',x,0.87,z,r,0.014,ivory)
    } else if(key==='easel') {
      for(const dx of [-0.5,0.5]){const leg=box('easel leg',x+dx,1,z,0.08,2,0.08,red);leg.rotation.z=dx*0.3}
      box('easel rear leg',x,0.7,z-0.35,0.08,1.4,0.08,red);box('easel canvas',x,1.6,z+0.08,1.3,1.05,0.06,ivory)
      const emblem=cylinder('painted blue circle',x,1.6,z+0.12,0.31,0.01,blue,32,details);emblem.rotation.x=Math.PI/2
    } else if(key==='table') {
      cylinder('octagonal walnut table',x,y-0.075,z,1.65,0.15,wood,8);cylinder('table base',x,0.38,z,0.55,0.76,dark,8);ring('table brass inlay',x,y+0.004,z,0.8,0.025,brass)
      for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5])cylinder('low reading stool',x+Math.cos(a)*2,0.25,z+Math.sin(a)*2,0.28,0.5,wood)
    } else {
      box(`${key} tabletop`,x,y-0.06,z,1.7,0.12,1.1,wood)
      for(const dx of [-0.68,0.68]) for(const dz of [-0.4,0.4])box(`${key} table leg`,x+dx,(y-0.12)/2,z+dz,0.1,y-0.12,0.1,wood)
      if(key==='atlas') {
        box('atlas red binding',x,y+0.04,z,1.2,0.08,0.85,red,details)
        for(const dx of [-0.3,0.3]){const page=box('atlas ivory page',x+dx,y+0.095,z,0.56,0.025,0.78,ivory,details);page.rotation.z=dx>0?-0.08:0.08}
        for(const dx of [-0.4,-0.2,0.2,0.4])box('atlas map line',x+dx,y+0.12,z,0.015,0.01,0.55,blue,details)
      } else if(key==='herbarium') {
        for(let i=0;i<3;i++){const dx=(i-1)*0.53;cylinder('terracotta pot',x+dx,y+0.15,z,0.18,0.3,red,16,details);cylinder('plant stem',x+dx,y+0.47+i*0.08,z,0.018,0.55+i*0.16,green,8,details);for(let k=0;k<3;k++){const leaf=sphere('specimen leaf',x+dx+(k%2?0.1:-0.1),y+0.4+k*0.16,z,0.15,green);leaf.scale.set(1,0.4,0.5)}}
      } else if(key==='chess') {
        for(let a=0;a<8;a++)for(let b=0;b<8;b++)box('chess square',x-0.525+a*0.15,y+0.01,z-0.525+b*0.15,0.15,0.02,0.15,(a+b)%2?ivory:dark,details)
        for(const [dx,h,m] of [[-0.3,0.25,ivory],[0.3,0.42,dark]] as const){cylinder('chess piece',x+dx,y+h/2+0.025,z,0.07,h,m,12,details);sphere('chess crown',x+dx,y+h+0.04,z,0.095,m)}
      }
    }
    for (const [parent,start] of [[architecture,architectureStart],[details,detailsStart]] as const) for(const object of parent.children.slice(start)) object.traverse(part=>{part.userData.anchorId=`hall-${key}`})
    // Face readable fronts toward their designated approach, not a global axis.
    if (['entry','clock','cabinet','easel'].includes(key)) {
      // Authored orientations are fixed; reframing a camera must not rotate its landmark.
      const yaw = ({"entry": 3.141592653589793, "clock": 1.3521273809209546, "cabinet": 0.0, "easel": -1.892546881191539} as Record<string,number>)[key] ?? 0
      for (const [parent,start] of [[architecture,architectureStart],[details,detailsStart]] as const) {
        const parts=parent.children.slice(start), pivot=new Group();pivot.position.set(x,0,z);parent.add(pivot)
        for(const part of parts){part.position.x-=x;part.position.z-=z;pivot.add(part)}
        pivot.rotation.y=yaw
      }
    }
  }
  const loci: LocusPose[] = READING_HALL.anchors.map(a=>({locusId:a.locusId,routeIndex:a.routeOrder,position:a.approach.position,markerPosition:a.cueVolume.center,yaw:a.approach.yaw,pitch:a.approach.pitch}))
  if(options.batchStatic)batchStaticDecor(group)
  return {group,loci}
}
