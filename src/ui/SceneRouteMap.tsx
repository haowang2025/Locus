import type { SceneDefinition } from '../lib/sceneRegistry'
import type { LocusId } from '../lib/types'

/** A readable plan view of the actual tested path, not straight lines through walls. */
export default function SceneRouteMap({scene,onSelect}:{scene:SceneDefinition;onSelect?:(id:LocusId)=>void}){
  const route=scene.route.walking
  if(!route||route.sceneVersion!==scene.version)return null
  const points=route.legs.flatMap(l=>l.waypoints),xs=points.map(p=>p[0]),zs=points.map(p=>p[2])
  if(!points.length)return null
  const minX=Math.min(...xs)-3,maxX=Math.max(...xs)+3,minZ=Math.min(...zs)-3,maxZ=Math.max(...zs)+3
  const spanX=maxX-minX,spanZ=maxZ-minZ,scale=Math.min(600/spanX,380/spanZ)
  const xy=(x:number,z:number)=>[(x-minX)*scale+20,(z-minZ)*scale+20] as const
  return <section className="route-overview" aria-label="地标步行路线" style={{background:'#1e302d',border:'1px solid #52776b',borderRadius:14,padding:14,marginBottom:14,color:'#e9f3e9'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><strong>沿真实通道走一遍</strong><span style={{fontSize:12}}>约 {Math.round(route.totalMeters)} 米 · {scene.anchors.length} 个地标</span></div>
    <svg viewBox={`0 0 ${spanX*scale+40} ${spanZ*scale+40}`} style={{display:'block',width:'100%',maxHeight:360,marginTop:8}} role="img" aria-label={`${scene.title}从${scene.anchors[0]?.label}到${scene.anchors.at(-1)?.label}的步行路线`}>
      {route.legs.map((leg,i)=><polyline key={leg.from+'-'+leg.to} points={leg.waypoints.map(p=>xy(p[0],p[2]).join(',')).join(' ')} fill="none" stroke={i%2?'#b6b78a':'#83cbb6'} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round"/>)}
      {scene.anchors.map(anchor=>{const [x,y]=xy(anchor.approach.position.x,anchor.approach.position.z);return <g key={anchor.id} onClick={()=>onSelect?.(anchor.locusId)} style={{cursor:onSelect?'pointer':'default'}} tabIndex={onSelect?0:undefined} role={onSelect?'button':undefined} aria-label={`${anchor.routeOrder} ${anchor.label}`} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect?.(anchor.locusId)}}}>
        <title>{anchor.routeOrder} · {anchor.label}（观看点）</title><circle cx={x} cy={y} r={9} fill="#163c34" stroke="#e7d3a0" strokeWidth={1.5}/><text x={x} y={y+3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff8df">{anchor.routeOrder}</text>
      </g>})}
    </svg>
    <ol aria-label="玩家报点路线图例" style={{display:'flex',flexWrap:'wrap',gap:'6px 18px',paddingLeft:22,fontSize:12}}>{scene.anchors.map(anchor=><li key={anchor.id}><button type="button" onClick={()=>onSelect?.(anchor.locusId)} disabled={!onSelect} style={{font:'inherit',color:'inherit',background:'none',border:0,padding:0,textAlign:'left',cursor:onSelect?'pointer':'default'}}>{anchor.label}{anchor.calloutAliases?.length ? ` · ${anchor.calloutAliases.join(' / ')}` : ''}</button><span style={{display:'block',opacity:.75}}>{anchor.zone}</span></li>)}</ol>
    <p style={{fontSize:12,margin:'8px 0 0',lineHeight:1.55}}>线条沿几何可走通道，圆点是地标观看点。已通过一次出生、不瞬移的控制器回放；浏览器实走与设备表现仍需验证。点击编号可跳转。</p>
  </section>
}
