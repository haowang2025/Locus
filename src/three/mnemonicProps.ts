import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, ConeGeometry } from 'three'
/** Recognizable, text-free mnemonic miniatures. Their symbolic interpretation remains creative, not factual evidence. */
export function createMnemonicProp(shape: string, color: string): Group {
  const root = new Group(), material = new MeshStandardMaterial({ color, roughness: .42, metalness: .2 }), accent = new MeshStandardMaterial({ color: '#efe2bd', roughness: .58 })
  const box = (x:number,y:number,z:number,px=0,py=0,pz=0,m=material) => { const o = new Mesh(new BoxGeometry(x,y,z),m); o.position.set(px,py,pz); root.add(o); return o }
  const cylinder = (r:number,h:number,x=0,y=0,z=0,m=material) => { const o = new Mesh(new CylinderGeometry(r,r,h,16),m); o.position.set(x,y,z); root.add(o); return o }
  const ring = (r:number,t:number,x=0,y=0,z=0) => { const o = new Mesh(new TorusGeometry(r,t,8,24),material); o.position.set(x,y,z); root.add(o); return o }
  if (shape === 'cart') {
    box(.58,.12,.36,0,.02); box(.28,.23,.25,.03,.19,0,accent)
    for (const x of [-.19,.19]) for (const z of [-.21,.21]) { const wheel=cylinder(.095,.045,x,-.1,z); wheel.rotation.x=Math.PI/2 }
    box(.025,.24,.025,-.28,.17,-.16); box(.025,.24,.025,-.28,.17,.16); box(.025,.025,.32,-.28,.29,0)
  }
  else if (shape === 'force-pair') {
    box(.22,.3,.24,-.18,0,0); box(.22,.3,.24,.18,0,0,accent)
    for (const side of [-1,1]) { box(.26,.045,.045,side*.34,0,.18); const arrow=new Mesh(new ConeGeometry(.09,.16,12),material); arrow.position.set(side*.52,0,.18); arrow.rotation.z=-side*Math.PI/2; root.add(arrow) }
  }
  else if (shape === 'key') { ring(.16,.045,-.19,.12); box(.45,.065,.065,.15,.12); box(.07,.15,.07,.31,.04); box(.06,.11,.07,.17,.065) }
  else if (shape === 'scale') { box(.35,.07,.24,0,-.22); cylinder(.035,.55,0,.04); const arm = box(.7,.035,.04,0,.3); arm.rotation.z=.06; for(const side of [-1,1]){ cylinder(.012,.3,side*.29,.13); cylinder(.14,.035,side*.29,-.02); } }
  else if (shape === 'chain') { for(let i=0;i<4;i++){ const o=ring(.12,.04,(i-1.5)*.17,0); o.scale.y=.7; if(i%2)o.rotation.y=Math.PI/2; } }
  else if (shape === 'bridge') { box(.85,.07,.4,0,.1); for(const side of [-1,1]){ box(.09,.45,.38,side*.3,-.12); box(.8,.06,.035,0,.34,side*.2); for(const x of [-.3,0,.3])box(.035,.24,.035,x,.22,side*.2); } }
  else if (shape === 'shield') { const shield = new Mesh(new SphereGeometry(.29,5,4),material); shield.scale.set(.95,1.2,.2); shield.rotation.z=Math.PI; root.add(shield); box(.055,.42,.055,0,0,.1,accent); box(.3,.055,.055,0,.05,.1,accent) }
  else if (shape === 'clock') { const face=cylinder(.29,.08); face.rotation.x=Math.PI/2; ring(.29,.025,0,0,.055); for(let i=0;i<12;i++){ const a=i/12*Math.PI*2; box(.022,.045,.03,Math.sin(a)*.235,Math.cos(a)*.235,.06,accent).rotation.z=-a } box(.025,.2,.03,0,.07,.09,accent); box(.14,.028,.03,.06,0,.1,accent) }
  else if (shape === 'book') { box(.48,.09,.38,0,0,0,accent); box(.51,.025,.4,0,.06); box(.51,.025,.4,0,-.06); box(.035,.14,.4,-.25,0); box(.06,.008,.34,.08,.078,0,accent) }
  else if (shape === 'water') { const base=cylinder(.3,.1,0,-.19); base.material = new MeshStandardMaterial({ color: '#65cbe6', metalness:.25, roughness:.2 }); for(let i=0;i<3;i++){ const drop=new Mesh(new SphereGeometry(.07,12,8),base.material);drop.position.set((i-1)*.14,.02+Math.abs(i-1)*.09,0);drop.scale.y=1.6;root.add(drop) } }
  else if (shape === 'sphere') root.add(new Mesh(new SphereGeometry(.28,20,12),material))
  else if (shape === 'cone') root.add(new Mesh(new ConeGeometry(.28,.6,16),material))
  else if (shape === 'ring') ring(.24,.08)
  else box(.48,.48,.48)
  return root
}
