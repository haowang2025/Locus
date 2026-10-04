import dust2CalloutWalking from './dust2CalloutWalking.json'
import dust2CalloutAnchors from './dust2CalloutAnchors.json'
import type { LocusId } from './types'
import { BUILTIN_WALKING_ROUTES, type SceneWalkingRoute } from './sceneWalkingRoutes'

/** Stable world coordinates. Adapters own placement; model proposals choose IDs only. */
export type SceneId = 'reading-hall' | 'dust2' | 'dust2-callouts' | (string & {})
export type CueRelationId = 'ordered-row' | 'orbit' | 'frame' | 'rise'
export const EXECUTABLE_CUE_RELATIONS: Record<CueRelationId,string> = { 'ordered-row': '在线索区按顺序排列', orbit: '在线索区环形环绕', frame: '在线索区被框住', rise: '在线索区周期起伏' }
export type ScenePoint = { x: number; y: number; z: number }
export interface SceneAnchor {
  id: string
  locusId: LocusId
  label: string
  calloutAliases?: string[]
  playerCallout?: { regionZh: string; regionEn: string; aliases: string[]; landmarkZh: string; confidence: string; evidence: string }
  routeOrder: number
  zone: string
  position: ScenePoint
  landmark: { description: string; shape: string; material: string; colors: string[]; visibleFeatures: string[]; focusPoint?: ScenePoint; framingBounds?: { min:ScenePoint; max:ScenePoint; evidence:string } }
  semanticTags: string[]
  affordances: string[]
  capacity: number
  approach: { position: ScenePoint; eye: ScenePoint; lookAt: ScenePoint; yaw: number; pitch: number }
  cueVolume: { id: string; center: ScenePoint; size: ScenePoint; allowedRelations: string[]; allowedRelationIds: CueRelationId[]; maxObjects: number }
  neighbors: string[]
  relativeObjects: { name: string; relation: string }[]
  verification: { method: 'authored-geometry' | 'blender-raycast'; reachable: boolean | null; visible: boolean | null; sceneVersion: string; evidence: string }
}
export interface SceneDefinition {
  id: SceneId
  version: string
  title: string
  description: string
  familiarityPrompt: string
  worldTransform?: { targetSpan: number; centerXZ: boolean; floorY: boolean }
  anchors: SceneAnchor[]
  route: { spawnAnchorId: string; edges: [string, string][]; directed: boolean; walking?: SceneWalkingRoute }
  attribution?: { title: string; creator: string; url: string; license: string }
  limitations: string[]
}

// Registry entries are authored below; coordinates use the same Y-up convention as Three.js.
type HallStation = [string, string, string, number, number, number, string, string[], string[]]
export const HALL_STATIONS: HallStation[] = [
  ['entry', '黄铜迎宾台', '入口', 0, 6.5, 1.12, '胡桃木斜面讲台，正面嵌一条黄铜竖线', ['入口','介绍','定义','起点'], ['放在台面','从台面升起','沿黄铜线排列']],
  ['globe', '蓝色地球仪', '西翼', -6, 6, 1.35, '蓝绿色球体，被黄铜经纬环抱住，立于圆柱底座', ['世界','范围','整体','地理'], ['环绕球体','沿经纬线旋转','从底座升起']],
  ['atlas', '摊开的红色图册', '西翼', -9, 2.5, 1.08, '矮木桌上的红色大图册，奶油色双页展开', ['分类','地图','结构','索引'], ['铺在书页上','从书页弹出','分布在左右页']],
  ['clock', '高身摆钟', '西翼', -9, -2, 1.05, '深色高柜、象牙白圆钟面和金色摆锤', ['时间','周期','先后','历史'], ['随摆锤摆动','沿钟面排列','从钟柜前升起']],
  ['window', '琥珀圆窗前石台', '北廊', -6, -6.3, 0.95, '琥珀色圆窗前的双脚浅石长台，暖色圆窗与长台形成上下呼应', ['观察','光','视角','条件'], ['放在窗台','穿过圆窗','投影到窗前']],
  ['herbarium', '绿色植物标本台', '北廊', -2, -6.3, 1.05, '三株不同高度的绿色叶片，陶罐置于浅木长台', ['生长','生命','生态','阶段'], ['从花盆生长','在叶片之间连接','沿台面递增']],
  ['telescope', '铜色望远镜', '北廊', 2.5, -6.3, 1.3, '铜色长镜筒和三脚架，旁边是小圆托盘', ['预测','远方','目标','发现'], ['从镜筒射出','在托盘上聚焦','沿视线延伸']],
  ['cabinet', '紫色矿石陈列柜', '东翼', 7, -6.3, 1.1, '开放木柜内三颗紫色切面晶体，背板深蓝', ['元素','材料','属性','资源'], ['按层陈列','在晶体之间连接','从柜内涌出']],
  ['fountain', '青石涟漪池', '东翼', 9, -1.8, 0.85, '青灰石圆池，蓝色水面和三道同心涟漪', ['流动','循环','反馈','传播'], ['浮在水面','沿涟漪扩散','从池心喷出']],
  ['easel', '赭红画架', '东翼', 9, 3, 1.15, '赭红三脚画架，奶油色画布上有醒目的蓝色圆形', ['表达','形象','设计','比较'], ['绘在画布','从画布走出','框住关键对象']],
  ['chess', '黑白棋盘桌', '入口', 5, 6.3, 0.95, '方形黑白棋盘、两枚不同高度的木质棋子', ['对立','决策','策略','规则'], ['在棋格移动','比较黑白两侧','按步骤落子']],
  ['table', '中央八角讨论桌', '中庭', 0, 0, 0.9, '八角胡桃木桌面，中央嵌黄铜环，四周有矮凳', ['总结','整合','联系','结论'], ['汇聚到铜环','围桌连接','在桌面展开']],
]

function hallAnchor(station: HallStation, index: number): SceneAnchor {
  const [key, label, zone, x, z, y, description, tags, affordances] = station
  // Eye stands on the open inner circulation loop, looking out toward its landmark.
  const length = Math.hypot(x, z) || 1
  const feet = key === 'table' ? { x: 0, y: 0.02, z: 2.85 } : key === 'globe' ? { x: -6, y: 0.02, z: 2.8 } : key === 'window' ? { x: -6, y: 0.02, z: -3.1 } : key === 'cabinet' ? { x: 7, y: 0.02, z: -3.1 } : { x: x - x / length * 3.2, y: 0.02, z: z - z / length * 3.2 }
  const frontLength = Math.hypot(feet.x-x, feet.z-z)
  const frontCue = { x: x + (feet.x-x)/frontLength*1.5, y: 0.85, z: z + (feet.z-z)/frontLength*1.5 }
  const cueCenter = key === 'clock' || key === 'easel' || key === 'cabinet' || key === 'telescope' ? frontCue : key === 'globe' ? { x, y: 2.9, z } : key === 'herbarium' ? { x, y: 2.9, z: z + 0.35 } : key === 'chess' ? { x, y: 2.3, z } : { x, y: y + (key === 'entry' || key === 'atlas' ? 0.98 : 0.85), z: z + (z < -4 ? 0.35 : 0) }
  const targetHeights: Record<string,number> = { entry:1.05, globe:1.65, atlas:1.05, clock:1.5, window:1.9, herbarium:1.25, telescope:1.3, cabinet:1.35, fountain:0.9, easel:1.35, chess:1.05, table:1.05 }
  const target = { x, y: targetHeights[key] ?? 1.3, z }

  return {
    id: `hall-${key}`, locusId: `L${String(index + 1).padStart(2, '0')}` as LocusId,
    label, zone, routeOrder: index + 1, position: { x, y, z },
    landmark: { description, shape: description, material: '木材、石材与黄铜；各点位使用不同的轮廓和主色', colors: [key === 'globe' ? '蓝绿' : key === 'cabinet' ? '紫' : '暖木色'], visibleFeatures: description.split('，'), focusPoint: target },
    semanticTags: tags, affordances, capacity: 3,
    approach: { position: feet, eye: { ...feet, y: 1.62 }, lookAt: target, yaw: Math.atan2(feet.x - x, feet.z - z), pitch: Math.atan2(target.y - 1.62, Math.hypot(feet.x - x, feet.z - z)) },
    cueVolume: { id: `hall-${key}-cue`, center: cueCenter, size: { x: 1.5, y: 1.5, z: 1.2 }, allowedRelations: Object.values(EXECUTABLE_CUE_RELATIONS), allowedRelationIds: Object.keys(EXECUTABLE_CUE_RELATIONS) as CueRelationId[], maxObjects: 3 },
    neighbors: [index > 0 ? `hall-${HALL_STATIONS[index - 1]![0]}` : '', index < HALL_STATIONS.length - 1 ? `hall-${HALL_STATIONS[index + 1]![0]}` : ''].filter(Boolean),
    relativeObjects: [{ name: '中央八角讨论桌', relation: key === 'table' ? '本点位' : '沿内侧通道可见' }, ...(key === 'entry' ? [{name:'闭合的青绿双扇入口门',relation:'迎宾台后方；木质嵌板与黄铜拉手'}] : [])],
    verification: { method: 'authored-geometry', reachable: null, visible: true, sceneVersion: '1.1.0', evidence: '与 readingHall.ts 共用点位定义；Three.js CPU 检查通过观看点胶囊净空与观看点到线索中心射线检查；尚未进行浏览器行走验收。' },
  }
}
const HALL_VIEW_OVERRIDES: Record<string, SceneAnchor['approach']> = {
  "hall-entry": {
    "position": {
      "x": 0,
      "y": 0.01999999642372131,
      "z": 3.0999999999999996
    },
    "eye": {
      "x": 0,
      "y": 1.6199999964237215,
      "z": 3.0999999999999996
    },
    "lookAt": {
      "x": 0,
      "y": 1.5058993075929985,
      "z": 6.5
    },
    "yaw": 3.141592653589793,
    "pitch": -0.03354643648220299
  },
  "hall-globe": {
    "position": {
      "x": -6,
      "y": 0.01999999642372131,
      "z": 1.7999999999999998
    },
    "eye": {
      "x": -6,
      "y": 1.6199999964237215,
      "z": 1.7999999999999998
    },
    "lookAt": {
      "x": -6,
      "y": 1.7585000017881394,
      "z": 6
    },
    "yaw": 3.141592653589793,
    "pitch": 0.032964246454744425
  },
  "hall-atlas": {
    "position": {
      "x": -5.3386319434062255,
      "y": 0.01999999642372131,
      "z": 1.4829533176128404
    },
    "eye": {
      "x": -5.3386319434062255,
      "y": 1.6199999964237215,
      "z": 1.4829533176128404
    },
    "lookAt": {
      "x": -9,
      "y": 1.3324590366624804,
      "z": 2.5
    },
    "yaw": 1.8417431771333173,
    "pitch": -0.07552474782537538
  },
  "hall-clock": {
    "position": {
      "x": -4.705075930949232,
      "y": 0.01999999642372131,
      "z": -1.044171284779013
    },
    "eye": {
      "x": -4.705075930949232,
      "y": 1.6199999964237215,
      "z": -1.044171284779013
    },
    "lookAt": {
      "x": -8.096593106203166,
      "y": 1.0699999999999998,
      "z": -1.8047625879632094
    },
    "yaw": 1.3501836263202196,
    "pitch": -0.15693765239627983
  },
  "hall-window": {
    "position": {
      "x": -6,
      "y": 0.01999999642372131,
      "z": -2.3
    },
    "eye": {
      "x": -6,
      "y": 1.6199999964237215,
      "z": -2.3
    },
    "lookAt": {
      "x": -6,
      "y": 1.832499996125698,
      "z": -6.581521134078503
    },
    "yaw": 0,
    "pitch": 0.04959120017876076
  },
  "hall-herbarium": {
    "position": {
      "x": -0.6081359908365407,
      "y": 0.01999999642372131,
      "z": -1.915628371135104
    },
    "eye": {
      "x": -0.6081359908365407,
      "y": 1.6199999964237215,
      "z": -1.915628371135104
    },
    "lookAt": {
      "x": -2,
      "y": 1.9787499997019766,
      "z": -6.125
    },
    "yaw": 0.31934116874345714,
    "pitch": 0.08074173920663116
  },
  "hall-telescope": {
    "position": {
      "x": 1.0983870228394412,
      "y": 0.01999999642372131,
      "z": -2.7679352975553915
    },
    "eye": {
      "x": 1.0983870228394412,
      "y": 1.6199999964237215,
      "z": -2.7679352975553915
    },
    "lookAt": {
      "x": 1.9467317195418847,
      "y": 0.85,
      "z": -4.905763933245549
    },
    "yaw": -0.3777666579398215,
    "pitch": -0.32305433322450416
  },
  "hall-cabinet": {
    "position": {
      "x": 7,
      "y": 0.01999999642372131,
      "z": -2.3
    },
    "eye": {
      "x": 7,
      "y": 1.6199999964237215,
      "z": -2.3
    },
    "lookAt": {
      "x": 7,
      "y": 0.991000007018447,
      "z": -5.25
    },
    "yaw": 0,
    "pitch": -0.21007450503059777
  },
  "hall-fountain": {
    "position": {
      "x": 5.666025702650871,
      "y": 0.01999999642372131,
      "z": -1.1332051405301744
    },
    "eye": {
      "x": 5.666025702650871,
      "y": 1.6199999964237215,
      "z": -1.1332051405301744
    },
    "lookAt": {
      "x": 9,
      "y": 1.0708287010341881,
      "z": -1.7999999999999998
    },
    "yaw": -1.373400766945016,
    "pitch": -0.1601379136167538
  },
  "hall-easel": {
    "position": {
      "x": 5.205266807797944,
      "y": 0.01999999642372131,
      "z": 1.735088935932648
    },
    "eye": {
      "x": 5.205266807797944,
      "y": 1.6199999964237215,
      "z": 1.735088935932648
    },
    "lookAt": {
      "x": 7.722914167293235,
      "y": 0.8712499994039535,
      "z": 2.573092515877269
    },
    "yaw": -1.89211348314777,
    "pitch": -0.27502886262655635
  },
  "hall-chess": {
    "position": {
      "x": 5,
      "y": 0.02650000010803342,
      "z": 2.7
    },
    "eye": {
      "x": 5,
      "y": 1.6265000001080334,
      "z": 2.7
    },
    "lookAt": {
      "x": 5,
      "y": 1.526250001788139,
      "z": 6.299999999999999
    },
    "yaw": 3.141592653589793,
    "pitch": -0.027840026895304567
  },
  "hall-table": {
    "position": {
      "x": 0,
      "y": 0.01999999642372131,
      "z": 4.85
    },
    "eye": {
      "x": 0,
      "y": 1.6199999964237215,
      "z": 4.85
    },
    "lookAt": {
      "x": 0,
      "y": 1.1069441030025482,
      "z": 0
    },
    "yaw": 0,
    "pitch": -0.10539275732169484
  }
}
const hallAnchors = HALL_STATIONS.map(hallAnchor).map(a => ({...a, approach: HALL_VIEW_OVERRIDES[a.id] ?? a.approach}))
export const READING_HALL: SceneDefinition = {
  id: 'reading-hall', version: '1.1.0', title: '拾光阅览馆',
  description: '十二个有明确轮廓、材质与动作联想的阅读馆地标；由入口沿墙顺时针回到中央讨论桌。',
  familiarityPrompt: '先按路线浏览十二个地标，再将已经确认的内容放入相应点位。',
  anchors: hallAnchors,
  route: { spawnAnchorId: hallAnchors[0]!.id, edges: hallAnchors.slice(1).map((a, i) => [hallAnchors[i]!.id, a.id]), directed: true, walking: BUILTIN_WALKING_ROUTES['reading-hall'] },
  limitations: ['原创程序化演示场景，不代表真实建筑。', '几何与固定视角可静态检查；未通过浏览器实走前不声称已验证运行可达性。'],
}
export const DUST2_ANCHORS: SceneAnchor[] = [
  {
    "id": "dust2-west-gate",
    "locusId": "L01",
    "label": "西院禁入拱门",
    "routeOrder": 1,
    "zone": "西院",
    "position": {
      "x": -22.56885796220211,
      "y": 3.616457831325357,
      "z": 13.829658569887268
    },
    "landmark": {
      "description": "浅褐石墙中的双扇拱形木门，左门板带有 STAY OUT 字样；门前灰石小路两侧是砂土地面",
      "shape": "拱形双扇木门",
      "material": "深色木板、浅色石块",
      "colors": [
        "深褐",
        "砂褐"
      ],
      "visibleFeatures": [
        "浅褐石墙中的双扇拱形木门",
        "左门板带有 STAY OUT 字样",
        "门前灰石小路两侧是砂土地面"
      ],
      "focusPoint": {
        "x": -20.48195,
        "y": 5.1205,
        "z": 13.85545
      },
      "framingBounds": {
        "min": {
          "x": -20.48195,
          "y": 3.61445,
          "z": 12.0482
        },
        "max": {
          "x": -20.48195,
          "y": 6.62655,
          "z": 15.6627
        },
        "evidence": "Measured connected mesh components of the original GLB, normalized to100span. Selected arched door panel."
      }
    },
    "semanticTags": [
      "边界",
      "禁止",
      "条件",
      "准入"
    ],
    "affordances": [
      "把门想成边界或筛选条件（联想说明；不实现开门动作）"
    ],
    "capacity": 3,
    "approach": {
      "position": {
        "x": -25.36864415489403,
        "y": 3.6344578313253564,
        "z": 13.795056905018827
      },
      "eye": {
        "x": -25.36864415489403,
        "y": 5.234457831325356,
        "z": 13.795056905018827
      },
      "lookAt": {
        "x": -21.942785573541478,
        "y": 4.66967048192775,
        "z": 13.837395998921087
      },
      "yaw": -1.5831543788021119,
      "pitch": -0.16337815692809837
    },
    "cueVolume": {
      "id": "dust2-west-gate-cue",
      "center": {
        "x": -22.56885796220211,
        "y": 4.476457831325357,
        "z": 13.829658569887268
      },
      "size": {
        "x": 1.5,
        "y": 1.5,
        "z": 1.2
      },
      "allowedRelations": [
        "在线索区按顺序排列",
        "在线索区环形环绕",
        "在线索区被框住",
        "在线索区周期起伏"
      ],
      "maxObjects": 3,
      "allowedRelationIds": [
        "ordered-row",
        "orbit",
        "frame",
        "rise"
      ]
    },
    "neighbors": [
      "dust2-west-crate"
    ],
    "relativeObjects": [
      {
        "name": "灰石地面带",
        "relation": "从观看点通向门中央；两侧为砂土"
      },
      {
        "name": "低石栏",
        "relation": "门左前方"
      }
    ],
    "verification": {
      "method": "blender-raycast",
      "reachable": null,
      "visible": true,
      "sceneVersion": "dust2-vrchris-08f7ab9c-v4",
      "evidence": "实际 GLB 中 material_23/material_7 门板连通分量实测；观看点属于主步行连通区；完整线索体积无三角形相交；眼到门板与线索无遮挡；未验收浏览器交互。"
    }
  },
  {
    "id": "dust2-west-crate",
    "locusId": "L02",
    "label": "西院墙脚木箱",
    "routeOrder": 2,
    "zone": "西院",
    "position": {
      "x": -23.687669296879793,
      "y": 3.7286605834960938,
      "z": 21.161839474429204
    },
    "landmark": {
      "description": "西院石墙脚边的单层木箱，两个可见箱面都有 X 形斜撑；观看点位于狭长院落中",
      "shape": "木箱",
      "material": "原始 Dust2 纹理：砂岩、木板或绿色金属",
      "colors": [
        "砂褐",
        "灰",
        "绿"
      ],
      "visibleFeatures": [
        "西院石墙脚边的单层木箱",
        "两个可见箱面都有 X 形斜撑",
        "观看点位于狭长院落中"
      ],
      "focusPoint": {
        "x": -21.8359375,
        "y": 4.878090121717364,
        "z": 22.171875
      },
      "framingBounds": {
        "min": {
          "x": -22.89155,
          "y": 3.61445,
          "z": 19.87945
        },
        "max": {
          "x": -21.08435,
          "y": 5.42175,
          "z": 23.494
        },
        "evidence": "Measured connected mesh components of the original GLB, normalized to100span. Closest wooden-crate component."
      }
    },
    "semanticTags": [
      "容器",
      "边界",
      "保护"
    ],
    "affordances": [
      "排列在箱前",
      "绕过箱角"
    ],
    "capacity": 3,
    "approach": {
      "position": {
        "x": -25.882408229165755,
        "y": 3.6344578313253537,
        "z": 19.96470914772777
      },
      "eye": {
        "x": -25.882408229165755,
        "y": 5.234457831325354,
        "z": 19.96470914772777
      },
      "lookAt": {
        "x": -23.177753507815854,
        "y": 4.679492408447266,
        "z": 21.319305132100443
      },
      "yaw": -2.035114738597991,
      "pitch": -0.18144718833895254
    },
    "cueVolume": {
      "id": "dust2-west-crate-cue",
      "center": {
        "x": -23.687669296879793,
        "y": 4.748660583496094,
        "z": 21.161839474429204
      },
      "size": {
        "x": 1.5,
        "y": 1.5,
        "z": 1.2
      },
      "allowedRelations": [
        "在线索区按顺序排列",
        "在线索区环形环绕",
        "在线索区被框住",
        "在线索区周期起伏"
      ],
      "maxObjects": 3,
      "allowedRelationIds": [
        "ordered-row",
        "orbit",
        "frame",
        "rise"
      ]
    },
    "neighbors": [
      "dust2-west-gate",
      "dust2-south-crates"
    ],
    "relativeObjects": [
      {
        "name": "浅褐石墙",
        "relation": "贴近木箱后方与侧面"
      }
    ],
    "verification": {
      "method": "blender-raycast",
      "reachable": null,
      "visible": true,
      "sceneVersion": "dust2-vrchris-08f7ab9c-v4",
      "evidence": "GLB SHA256 92da5929670931087cebbb7493eceedfd38f38af9f5e85cf1761e90ff39f5960；Blender 导入实测地面 Object_14；静态观看点至线索中心射线无遮挡；未验收浏览器行走及整条路线。；v2 采用水平跨度100的人眼尺度；旧60点位模式保留200。；线索完整体积通过 Three.js 三角形相交排除检查。"
    }
  },
  {
    "id": "dust2-south-crates",
    "locusId": "L03",
    "label": "南院高低木箱",
    "routeOrder": 3,
    "zone": "南院",
    "position": {
      "x": -25.41454017917565,
      "y": 6.024089813232422,
      "z": 26.5145280664806
    },
    "landmark": {
      "description": "高低相邻的木箱都有 X 形斜撑，高箱立在低箱右后方，后方石墙可见拱形开口",
      "shape": "木箱",
      "material": "原始 Dust2 纹理：砂岩、木板或绿色金属",
      "colors": [
        "砂褐",
        "灰",
        "绿"
      ],
      "visibleFeatures": [
        "高低相邻的木箱都有 X 形斜撑",
        "高箱立在低箱右后方",
        "后方石墙可见拱形开口"
      ],
      "focusPoint": {
        "x": -26.606250762939453,
        "y": 7.588911824973256,
        "z": 24.859375
      },
      "framingBounds": {
        "min": {
          "x": -27.40965,
          "y": 6.0241,
          "z": 23.79525
        },
        "max": {
          "x": -25,
          "y": 8.43375,
          "z": 26.2049
        },
        "evidence": "Measured connected mesh components of the original GLB, normalized to100span. Closest wooden-crate component."
      }
    },
    "semanticTags": [
      "存储",
      "累积",
      "负担"
    ],
    "affordances": [
      "堆在木箱前",
      "从箱边探出"
    ],
    "capacity": 3,
    "approach": {
      "position": {
        "x": -23.611958165619,
        "y": 6.0440963855422165,
        "z": 29.03624751877093
      },
      "eye": {
        "x": -23.611958165619,
        "y": 7.644096385542216,
        "z": 29.03624751877093
      },
      "lookAt": {
        "x": -25.38561959222804,
        "y": 6.953056850585938,
        "z": 26.471328414482674
      },
      "yaw": 0.605003696936445,
      "pitch": -0.2180736747562489
    },
    "cueVolume": {
      "id": "dust2-south-crates-cue",
      "center": {
        "x": -25.18081824028505,
        "y": 6.884089813232422,
        "z": 26.839141768103342
      },
      "size": {
        "x": 1.5,
        "y": 1.5,
        "z": 1.2
      },
      "allowedRelations": [
        "在线索区按顺序排列",
        "在线索区环形环绕",
        "在线索区被框住",
        "在线索区周期起伏"
      ],
      "maxObjects": 3,
      "allowedRelationIds": [
        "ordered-row",
        "orbit",
        "frame",
        "rise"
      ]
    },
    "neighbors": [
      "dust2-west-crate",
      "dust2-south-stairs"
    ],
    "relativeObjects": [
      {
        "name": "低木箱",
        "relation": "高箱左前方"
      },
      {
        "name": "拱形开口",
        "relation": "木箱后方石墙上"
      }
    ],
    "verification": {
      "method": "blender-raycast",
      "reachable": null,
      "visible": true,
      "sceneVersion": "dust2-vrchris-08f7ab9c-v4",
      "evidence": "GLB SHA256 92da5929670931087cebbb7493eceedfd38f38af9f5e85cf1761e90ff39f5960；Blender 导入实测地面 Object_14；静态观看点至线索中心射线无遮挡；未验收浏览器行走及整条路线。；v2 采用水平跨度100的人眼尺度；旧60点位模式保留200。；线索完整体积通过 Three.js 三角形相交排除检查。"
    }
  },
  {
    "id": "dust2-south-stairs",
    "locusId": "L04",
    "label": "南院宽石阶",
    "routeOrder": 4,
    "zone": "南院",
    "position": {
      "x": -23.869851472301402,
      "y": 6.024089813232422,
      "z": 36.793667236700614
    },
    "landmark": {
      "description": "成排浅灰石台阶，左右低石栏，正前方木箱",
      "shape": "石阶",
      "material": "原始 Dust2 纹理：砂岩、木板或绿色金属",
      "colors": [
        "砂褐",
        "灰",
        "绿"
      ],
      "visibleFeatures": [
        "成排浅灰石台阶",
        "左右低石栏",
        "正前方木箱"
      ],
      "focusPoint": {
        "x": -24.1875,
        "y": 6.498064235567399,
        "z": 34.9375
      }
    },
    "semanticTags": [
      "开始",
      "层级",
      "递进"
    ],
    "affordances": [
      "沿台阶向上排列",
      "从石阶前升起"
    ],
    "capacity": 3,
    "approach": {
      "position": {
        "x": -23.515625,
        "y": 6.272038657902376,
        "z": 38.86357631835635
      },
      "eye": {
        "x": -23.515625,
        "y": 7.872038657902376,
        "z": 38.86357631835635
      },
      "lookAt": {
        "x": -23.869851472301402,
        "y": 6.884089813232422,
        "z": 36.793667236700614
      },
      "yaw": 0.16948958776200324,
      "pitch": -0.43973090300896006
    },
    "cueVolume": {
      "id": "dust2-south-stairs-cue",
      "center": {
        "x": -23.869851472301402,
        "y": 6.884089813232422,
        "z": 36.793667236700614
      },
      "size": {
        "x": 1.5,
        "y": 1.5,
        "z": 1.2
      },
      "allowedRelations": [
        "在线索区按顺序排列",
        "在线索区环形环绕",
        "在线索区被框住",
        "在线索区周期起伏"
      ],
      "maxObjects": 3,
      "allowedRelationIds": [
        "ordered-row",
        "orbit",
        "frame",
        "rise"
      ]
    },
    "neighbors": [
      "dust2-south-crates",
      "dust2-south-turn"
    ],
    "relativeObjects": [
      {
        "name": "石阶",
        "relation": "观看点正前方；线索放在其前方地面上的独立体积内"
      }
    ],
    "verification": {
      "method": "blender-raycast",
      "reachable": null,
      "visible": true,
      "sceneVersion": "dust2-vrchris-08f7ab9c-v4",
      "evidence": "GLB SHA256 92da5929670931087cebbb7493eceedfd38f38af9f5e85cf1761e90ff39f5960；Blender 导入实测地面 Object_25；静态观看点至线索中心射线无遮挡；未验收浏览器行走及整条路线。；观看点已按 CPU 胶囊物理落地结果修正。；v2 采用水平跨度100的人眼尺度；旧60点位模式保留200。；线索完整体积通过 Three.js 三角形相交排除检查。"
    }
  },
  {
    "id": "dust2-south-turn",
    "locusId": "L05",
    "label": "南转角门旁双层箱",
    "routeOrder": 5,
    "zone": "南通道",
    "position": {
      "x": 14.117171691364641,
      "y": 3.6144561767578125,
      "z": 26.17973492590608
    },
    "landmark": {
      "description": "拱形木门旁一上一下叠放的 X 形木箱，两个箱面形成竖向标记",
      "shape": "木箱",
      "material": "原始 Dust2 纹理：砂岩、木板或绿色金属",
      "colors": [
        "砂褐",
        "灰",
        "绿"
      ],
      "visibleFeatures": [
        "拱形木门旁一上一下叠放的 X 形木箱",
        "两个箱面形成竖向标记"
      ],
      "focusPoint": {
        "x": 13.4375,
        "y": 5.781683185071856,
        "z": 28.21875
      },
      "framingBounds": {
        "min": {
          "x": 12.0482,
          "y": 3.61445,
          "z": 27.10855
        },
        "max": {
          "x": 14.45785,
          "y": 7.2289,
          "z": 29.5182
        },
        "evidence": "Measured connected mesh components of the original GLB, normalized to100span. Closest wooden-crate component."
      }
    },
    "semanticTags": [
      "转折",
      "例外",
      "方向"
    ],
    "affordances": [
      "绕斜箱转向",
      "沿夹角排列"
    ],
    "capacity": 3,
    "approach": {
      "position": {
        "x": 15.252501694857884,
        "y": 3.6344578313253524,
        "z": 22.86933603064482
      },
      "eye": {
        "x": 15.252501694857884,
        "y": 5.2344578313253525,
        "z": 22.86933603064482
      },
      "lookAt": {
        "x": 13.555476341977625,
        "y": 5.0901484118652345,
        "z": 27.56660097406713
      },
      "yaw": 2.7949048667246617,
      "pitch": -0.028886114882835722
    },
    "cueVolume": {
      "id": "dust2-south-turn-cue",
      "center": {
        "x": 14.117171691364641,
        "y": 4.474456176757813,
        "z": 26.17973492590608
      },
      "size": {
        "x": 1.5,
        "y": 1.5,
        "z": 1.2
      },
      "allowedRelations": [
        "在线索区按顺序排列",
        "在线索区环形环绕",
        "在线索区被框住",
        "在线索区周期起伏"
      ],
      "maxObjects": 3,
      "allowedRelationIds": [
        "ordered-row",
        "orbit",
        "frame",
        "rise"
      ]
    },
    "neighbors": [
      "dust2-south-stairs",
      "dust2-east-crates"
    ],
    "relativeObjects": [
      {
        "name": "拱形木门",
        "relation": "木箱左侧"
      },
      {
        "name": "上层木箱",
        "relation": "位于下层木箱之上"
      }
    ],
    "verification": {
      "method": "blender-raycast",
      "reachable": null,
      "visible": true,
      "sceneVersion": "dust2-vrchris-08f7ab9c-v4",
      "evidence": "GLB SHA256 92da5929670931087cebbb7493eceedfd38f38af9f5e85cf1761e90ff39f5960；Blender 导入实测地面 Object_14；静态观看点至线索中心射线无遮挡；未验收浏览器行走及整条路线。；v2 采用水平跨度100的人眼尺度；旧60点位模式保留200。；线索完整体积通过 Three.js 三角形相交排除检查。"
    }
  },
  {
    "id": "dust2-east-crates",
    "locusId": "L06",
    "label": "东侧密集木箱角",
    "routeOrder": 6,
    "zone": "东廊",
    "position": {
      "x": 27.091311466394366,
      "y": 3.614452362060547,
      "z": 14.537314124237426
    },
    "landmark": {
      "description": "多只 X 形木箱挤放在浅褐石墙转角，前后箱面与侧墙形成狭窄凹角",
      "shape": "木箱组",
      "material": "原始 Dust2 纹理：砂岩、木板或绿色金属",
      "colors": [
        "砂褐",
        "灰",
        "绿"
      ],
      "visibleFeatures": [
        "多只 X 形木箱挤放在浅褐石墙转角",
        "前后箱面与侧墙形成狭窄凹角"
      ],
      "focusPoint": {
        "x": 25.8671875,
        "y": 5.179273822278889,
        "z": 16.4609375
      },
      "framingBounds": {
        "min": {
          "x": 24.0964,
          "y": 3.61445,
          "z": 14.06245
        },
        "max": {
          "x": 26.50605,
          "y": 6.0241,
          "z": 17.4698
        },
        "evidence": "Measured connected mesh components of the original GLB, normalized to100span. Closest wooden-crate component."
      }
    },
    "semanticTags": [
      "集合",
      "组合",
      "支撑"
    ],
    "affordances": [
      "在箱角汇聚",
      "按箱层分组"
    ],
    "capacity": 3,
    "approach": {
      "position": {
        "x": 28.707213045371663,
        "y": 3.6344578313253573,
        "z": 12.136473455303506
      },
      "eye": {
        "x": 28.707213045371663,
        "y": 5.234457831325358,
        "z": 12.136473455303506
      },
      "lookAt": {
        "x": 26.554285526476058,
        "y": 4.577899153442383,
        "z": 14.905957386966199
      },
      "yaw": 2.480800507079305,
      "pitch": -0.18502666458140132
    },
    "cueVolume": {
      "id": "dust2-east-crates-cue",
      "center": {
        "x": 27.091311466394366,
        "y": 4.474452362060547,
        "z": 14.537314124237426
      },
      "size": {
        "x": 1.5,
        "y": 1.5,
        "z": 1.2
      },
      "allowedRelations": [
        "在线索区按顺序排列",
        "在线索区环形环绕",
        "在线索区被框住",
        "在线索区周期起伏"
      ],
      "maxObjects": 3,
      "allowedRelationIds": [
        "ordered-row",
        "orbit",
        "frame",
        "rise"
      ]
    },
    "neighbors": [
      "dust2-south-turn",
      "dust2-east-stairs"
    ],
    "relativeObjects": [
      {
        "name": "贴近观看点的石墙",
        "relation": "在木箱组左侧形成前景"
      },
      {
        "name": "后排木箱",
        "relation": "在前排箱后形成层次"
      }
    ],
    "verification": {
      "method": "blender-raycast",
      "reachable": null,
      "visible": true,
      "sceneVersion": "dust2-vrchris-08f7ab9c-v4",
      "evidence": "GLB SHA256 92da5929670931087cebbb7493eceedfd38f38af9f5e85cf1761e90ff39f5960；Blender 导入实测地面 Object_26；静态观看点至线索中心射线无遮挡；未验收浏览器行走及整条路线。；v2 采用水平跨度100的人眼尺度；旧60点位模式保留200。；线索完整体积通过 Three.js 三角形相交排除检查。"
    }
  },
  {
    "id": "dust2-east-stairs",
    "locusId": "L07",
    "label": "东庭长石阶",
    "routeOrder": 7,
    "zone": "东庭",
    "position": {
      "x": 23.6,
      "y": 3.6144561767578125,
      "z": 3.359375
    },
    "landmark": {
      "description": "横穿庭院的长石阶，尽端墙面上并列两个拱形小窗",
      "shape": "石阶",
      "material": "原始 Dust2 纹理：砂岩、木板或绿色金属",
      "colors": [
        "砂褐",
        "灰",
        "绿"
      ],
      "visibleFeatures": [
        "横穿庭院的长石阶",
        "尽端墙面上并列两个拱形小窗"
      ],
      "focusPoint": {
        "x": 25.53125,
        "y": 3.974457004041587,
        "z": 3.359375
      }
    },
    "semanticTags": [
      "过程",
      "步骤",
      "先后"
    ],
    "affordances": [
      "沿长石阶递进",
      "在双窗下对照"
    ],
    "capacity": 3,
    "approach": {
      "position": {
        "x": 21.3,
        "y": 3.6344578313253613,
        "z": 3.359375
      },
      "eye": {
        "x": 21.3,
        "y": 5.234457831325361,
        "z": 3.359375
      },
      "lookAt": {
        "x": 24.082812500000003,
        "y": 4.349455404663086,
        "z": 3.359375
      },
      "yaw": -1.5707963267948966,
      "pitch": -0.3079098774712619
    },
    "cueVolume": {
      "id": "dust2-east-stairs-cue",
      "center": {
        "x": 23.6,
        "y": 4.474456176757813,
        "z": 3.359375
      },
      "size": {
        "x": 1.5,
        "y": 1.5,
        "z": 1.2
      },
      "allowedRelations": [
        "在线索区按顺序排列",
        "在线索区环形环绕",
        "在线索区被框住",
        "在线索区周期起伏"
      ],
      "maxObjects": 3,
      "allowedRelationIds": [
        "ordered-row",
        "orbit",
        "frame",
        "rise"
      ]
    },
    "neighbors": [
      "dust2-east-crates",
      "dust2-a-mark"
    ],
    "relativeObjects": [
      {
        "name": "石阶",
        "relation": "观看点正前方；线索放在其前方地面上的独立体积内"
      }
    ],
    "verification": {
      "method": "blender-raycast",
      "reachable": null,
      "visible": true,
      "sceneVersion": "dust2-vrchris-08f7ab9c-v4",
      "evidence": "GLB SHA256 92da5929670931087cebbb7493eceedfd38f38af9f5e85cf1761e90ff39f5960；Blender 导入实测地面 Object_25；静态观看点至线索中心射线无遮挡；未验收浏览器行走及整条路线。；v2 采用水平跨度100的人眼尺度；旧60点位模式保留200。；线索完整体积通过 Three.js 三角形相交排除检查。"
    }
  },
  {
    "id": "dust2-a-mark",
    "locusId": "L08",
    "label": "雕纹高台绿箱叠层",
    "routeOrder": 8,
    "zone": "东台",
    "position": {
      "x": 27.55467169136464,
      "y": 3.614452362060547,
      "z": -21.47660992590608
    },
    "landmark": {
      "description": "雕纹矮石栏上方有高低绿箱叠层，观看点位于较低街道；高台与街道形成明显高差",
      "shape": "石台",
      "material": "原始 Dust2 纹理：砂岩、木板或绿色金属",
      "colors": [
        "砂褐",
        "灰",
        "绿"
      ],
      "visibleFeatures": [
        "雕纹矮石栏上方有高低绿箱叠层",
        "观看点位于较低街道",
        "高台与街道形成明显高差"
      ],
      "focusPoint": {
        "x": 26.875,
        "y": 6.071730041503907,
        "z": -23.515625
      },
      "framingBounds": {
        "min": {
          "x": 25.6024,
          "y": 5.42175,
          "z": -25.2823
        },
        "max": {
          "x": 27.0896,
          "y": 7.83135,
          "z": -22.59035
        },
        "evidence": "Measured connected mesh components of the original GLB, normalized to100span. Selected visible green-box group."
      }
    },
    "semanticTags": [
      "上升",
      "门槛",
      "等级"
    ],
    "affordances": [
      "在高台前升起",
      "沿石栏排列"
    ],
    "capacity": 3,
    "approach": {
      "position": {
        "x": 30.031325301204816,
        "y": 3.634457831325371,
        "z": -18.59999999999997
      },
      "eye": {
        "x": 30.031325301204816,
        "y": 5.234457831325371,
        "z": -18.59999999999997
      },
      "lookAt": {
        "x": 27.131636599387015,
        "y": 5.227686535339355,
        "z": -22.337510201838953
      },
      "yaw": 0.6598311068455676,
      "pitch": -0.0014314258377907975
    },
    "cueVolume": {
      "id": "dust2-a-mark-cue",
      "center": {
        "x": 27.55467169136464,
        "y": 4.474452362060547,
        "z": -21.47660992590608
      },
      "size": {
        "x": 1.5,
        "y": 1.5,
        "z": 1.2
      },
      "allowedRelations": [
        "在线索区按顺序排列",
        "在线索区环形环绕",
        "在线索区被框住",
        "在线索区周期起伏"
      ],
      "maxObjects": 3,
      "allowedRelationIds": [
        "ordered-row",
        "orbit",
        "frame",
        "rise"
      ]
    },
    "neighbors": [
      "dust2-east-stairs",
      "dust2-stone-turn"
    ],
    "relativeObjects": [
      {
        "name": "雕纹石栏",
        "relation": "绿箱前方，隔开高台与下方街道"
      },
      {
        "name": "低处街道",
        "relation": "观看点所在位置"
      }
    ],
    "verification": {
      "method": "blender-raycast",
      "reachable": null,
      "visible": true,
      "sceneVersion": "dust2-vrchris-08f7ab9c-v4",
      "evidence": "GLB SHA256 92da5929670931087cebbb7493eceedfd38f38af9f5e85cf1761e90ff39f5960；Blender 导入实测地面 Object_25；静态观看点至线索中心射线无遮挡；未验收浏览器行走及整条路线。；v2 采用水平跨度100的人眼尺度；旧60点位模式保留200。；线索完整体积通过 Three.js 三角形相交排除检查。"
    }
  },
  {
    "id": "dust2-stone-turn",
    "locusId": "L09",
    "label": "中庭石路转弯",
    "routeOrder": 9,
    "zone": "中庭",
    "position": {
      "x": -3.7351755001696363,
      "y": 1.2048149108886719,
      "z": -18.84439040013571
    },
    "landmark": {
      "description": "灰色石路绕过凸出的墙角，前方墙上有黑色拱门",
      "shape": "石路",
      "material": "原始 Dust2 纹理：砂岩、木板或绿色金属",
      "colors": [
        "砂褐",
        "灰",
        "绿"
      ],
      "visibleFeatures": [
        "灰色石路绕过凸出的墙角",
        "前方墙上有黑色拱门"
      ],
      "focusPoint": {
        "x": -2.015625,
        "y": 1.5648190013472205,
        "z": -17.46875
      }
    },
    "semanticTags": [
      "选择",
      "分支",
      "因果"
    ],
    "affordances": [
      "在转弯处分叉",
      "沿石路连接"
    ],
    "capacity": 3,
    "approach": {
      "position": {
        "x": -5.687347523777213,
        "y": 1.2248192771085038,
        "z": -20.406128019021768
      },
      "eye": {
        "x": -5.687347523777213,
        "y": 2.824819277108504,
        "z": -20.406128019021768
      },
      "lookAt": {
        "x": -3.7351755001696363,
        "y": 2.0648149108886718,
        "z": -18.84439040013571
      },
      "yaw": -2.245537269018449,
      "pitch": -0.295124065946703
    },
    "cueVolume": {
      "id": "dust2-stone-turn-cue",
      "center": {
        "x": -3.7351755001696363,
        "y": 2.0648149108886718,
        "z": -18.84439040013571
      },
      "size": {
        "x": 1.5,
        "y": 1.5,
        "z": 1.2
      },
      "allowedRelations": [
        "在线索区按顺序排列",
        "在线索区环形环绕",
        "在线索区被框住",
        "在线索区周期起伏"
      ],
      "maxObjects": 3,
      "allowedRelationIds": [
        "ordered-row",
        "orbit",
        "frame",
        "rise"
      ]
    },
    "neighbors": [
      "dust2-a-mark",
      "dust2-middle-crate"
    ],
    "relativeObjects": [
      {
        "name": "石路",
        "relation": "观看点正前方；线索放在其前方地面上的独立体积内"
      }
    ],
    "verification": {
      "method": "blender-raycast",
      "reachable": null,
      "visible": true,
      "sceneVersion": "dust2-vrchris-08f7ab9c-v4",
      "evidence": "GLB SHA256 92da5929670931087cebbb7493eceedfd38f38af9f5e85cf1761e90ff39f5960；Blender 导入实测地面 Object_25；静态观看点至线索中心射线无遮挡；未验收浏览器行走及整条路线。；v2 采用水平跨度100的人眼尺度；旧60点位模式保留200。；线索完整体积通过 Three.js 三角形相交排除检查。"
    }
  },
  {
    "id": "dust2-middle-crate",
    "locusId": "L10",
    "label": "红岩壁前双绿箱",
    "routeOrder": 10,
    "zone": "中路",
    "position": {
      "x": -10.563557277304959,
      "y": 2.1954917907714844,
      "z": -24.534523215513907
    },
    "landmark": {
      "description": "红褐裸岩壁前一高一低两只绿箱，砂土地面过渡到灰石斜坡",
      "shape": "金属箱组",
      "material": "原始 Dust2 纹理：砂岩、木板或绿色金属",
      "colors": [
        "砂褐",
        "灰",
        "绿"
      ],
      "visibleFeatures": [
        "红褐裸岩壁前一高一低两只绿箱",
        "砂土地面过渡到灰石斜坡"
      ],
      "focusPoint": {
        "x": -10.75,
        "y": 2.756415223674509,
        "z": -25.8671875
      },
      "framingBounds": {
        "min": {
          "x": -25.3012,
          "y": 3.61445,
          "z": -30.12055
        },
        "max": {
          "x": -19.2771,
          "y": 6.0241,
          "z": -26.20475
        },
        "evidence": "Measured connected mesh components of the original GLB, normalized to100span. Selected visible green-box group."
      }
    },
    "semanticTags": [
      "比较",
      "资源",
      "二元"
    ],
    "affordances": [
      "连接两只绿箱",
      "在低箱前分组"
    ],
    "capacity": 3,
    "approach": {
      "position": {
        "x": -9.632926494916198,
        "y": 1.6245497954942243,
        "z": -21.379047705084513
      },
      "eye": {
        "x": -9.632926494916198,
        "y": 3.2245497954942244,
        "z": -21.379047705084513
      },
      "lookAt": {
        "x": -11.66129798847,
        "y": 3.375870111694336,
        "z": -24.36254417477246
      },
      "yaw": 0.597083574098726,
      "pitch": 0.04191906847262525
    },
    "cueVolume": {
      "id": "dust2-middle-crate-cue",
      "center": {
        "x": -10.480425542744445,
        "y": 3.2154917907714844,
        "z": -23.94031019419162
      },
      "size": {
        "x": 1.48,
        "y": 1.5,
        "z": 1.2
      },
      "allowedRelations": [
        "在线索区按顺序排列",
        "在线索区环形环绕",
        "在线索区被框住",
        "在线索区周期起伏"
      ],
      "maxObjects": 3,
      "allowedRelationIds": [
        "ordered-row",
        "orbit",
        "frame",
        "rise"
      ]
    },
    "neighbors": [
      "dust2-stone-turn",
      "dust2-b-mark"
    ],
    "relativeObjects": [
      {
        "name": "裸露红褐岩壁",
        "relation": "两只绿箱后方"
      },
      {
        "name": "灰石斜坡",
        "relation": "绿箱前方较低处"
      }
    ],
    "verification": {
      "method": "blender-raycast",
      "reachable": null,
      "visible": true,
      "sceneVersion": "dust2-vrchris-08f7ab9c-v4",
      "evidence": "GLB SHA256 92da5929670931087cebbb7493eceedfd38f38af9f5e85cf1761e90ff39f5960；Blender 导入实测地面 Object_26；静态观看点至线索中心射线无遮挡；未验收浏览器行走及整条路线。；观看点已按 CPU 胶囊物理落地结果修正。；v2 采用水平跨度100的人眼尺度；旧60点位模式保留200。；线索完整体积通过 Three.js 三角形相交排除检查。"
    }
  },
  {
    "id": "dust2-b-mark",
    "locusId": "L11",
    "label": "红标记两侧警示箱",
    "routeOrder": 11,
    "zone": "北院",
    "position": {
      "x": -23.56669499619485,
      "y": 3.6144561767578125,
      "z": -26.251531766451336
    },
    "landmark": {
      "description": "带黑黄警示边带的绿箱围住红色地面标记，北侧石墙有宽拱木门",
      "shape": "金属箱",
      "material": "原始 Dust2 纹理：砂岩、木板或绿色金属",
      "colors": [
        "砂褐",
        "灰",
        "绿"
      ],
      "visibleFeatures": [
        "带黑黄警示边带的绿箱围住红色地面标记",
        "北侧石墙有宽拱木门"
      ],
      "focusPoint": {
        "x": -24.1875,
        "y": 3.9744550966929597,
        "z": -29.5625
      },
      "framingBounds": {
        "min": {
          "x": -26.50605,
          "y": 3.61445,
          "z": -33.2642
        },
        "max": {
          "x": -19.2771,
          "y": 6.0241,
          "z": -26.20475
        },
        "evidence": "Measured connected mesh components of the original GLB, normalized to100span. Selected visible green-box group."
      }
    },
    "semanticTags": [
      "警示",
      "规则",
      "限制"
    ],
    "affordances": [
      "在警示箱之间连接",
      "从红色标记升起"
    ],
    "capacity": 3,
    "approach": {
      "position": {
        "x": -23.058909221051696,
        "y": 3.6344578313253724,
        "z": -22.20149813999054
      },
      "eye": {
        "x": -23.058909221051696,
        "y": 5.234457831325372,
        "z": -22.20149813999054
      },
      "lookAt": {
        "x": -23.076266332508887,
        "y": 4.698588411865234,
        "z": -28.240240632731126
      },
      "yaw": 0.0028742844523298606,
      "pitch": -0.08850638327048144
    },
    "cueVolume": {
      "id": "dust2-b-mark-cue",
      "center": {
        "x": -23.419264521453957,
        "y": 4.474456176757813,
        "z": -25.465233950660352
      },
      "size": {
        "x": 1.5,
        "y": 1.5,
        "z": 1.2
      },
      "allowedRelations": [
        "在线索区按顺序排列",
        "在线索区环形环绕",
        "在线索区被框住",
        "在线索区周期起伏"
      ],
      "maxObjects": 3,
      "allowedRelationIds": [
        "ordered-row",
        "orbit",
        "frame",
        "rise"
      ]
    },
    "neighbors": [
      "dust2-middle-crate",
      "dust2-north-gate"
    ],
    "relativeObjects": [
      {
        "name": "红色喷涂标记",
        "relation": "在绿箱之间的地面"
      },
      {
        "name": "宽拱木门",
        "relation": "在箱组后方北侧石墙上"
      }
    ],
    "verification": {
      "method": "blender-raycast",
      "reachable": null,
      "visible": true,
      "sceneVersion": "dust2-vrchris-08f7ab9c-v4",
      "evidence": "GLB SHA256 92da5929670931087cebbb7493eceedfd38f38af9f5e85cf1761e90ff39f5960；Blender 导入实测地面 Object_25；静态观看点至线索中心射线无遮挡；未验收浏览器行走及整条路线。；v2 采用水平跨度100的人眼尺度；旧60点位模式保留200。；线索完整体积通过 Three.js 三角形相交排除检查。"
    }
  },
  {
    "id": "dust2-north-gate",
    "locusId": "L12",
    "label": "北院宽拱木门",
    "routeOrder": 12,
    "zone": "北院",
    "position": {
      "x": -24.73550282311347,
      "y": 3.616457831325375,
      "z": -30.99974990093502
    },
    "landmark": {
      "description": "北院尽端的宽拱双扇木门，左前方有黑黄边带绿箱，观看点与门之间可见红色地面标记",
      "shape": "拱形双扇木门",
      "material": "深色木板、浅色石块",
      "colors": [
        "深褐",
        "砂褐"
      ],
      "visibleFeatures": [
        "北院尽端的宽拱双扇木门",
        "左前方有黑黄边带绿箱",
        "观看点与门之间可见红色地面标记"
      ],
      "focusPoint": {
        "x": -24.6988,
        "y": 5.1205,
        "z": -33.43365
      },
      "framingBounds": {
        "min": {
          "x": -26.50605,
          "y": 3.61445,
          "z": -33.43365
        },
        "max": {
          "x": -22.89155,
          "y": 6.62655,
          "z": -33.43365
        },
        "evidence": "Measured connected mesh components of the original GLB, normalized to100span. Selected arched door panel."
      }
    },
    "semanticTags": [
      "入口",
      "门槛",
      "筛选",
      "阶段"
    ],
    "affordances": [
      "把门想成边界或筛选条件（联想说明；不实现开门动作）"
    ],
    "capacity": 3,
    "approach": {
      "position": {
        "x": -24.77470594891913,
        "y": 3.634457831325375,
        "z": -28.40004547255723
      },
      "eye": {
        "x": -24.77470594891913,
        "y": 5.234457831325376,
        "z": -28.40004547255723
      },
      "lookAt": {
        "x": -24.72449197617943,
        "y": 4.669670481927763,
        "z": -31.729919930654514
      },
      "yaw": -0.01507869670328272,
      "pitch": -0.16799448793185062
    },
    "cueVolume": {
      "id": "dust2-north-gate-cue",
      "center": {
        "x": -24.73550282311347,
        "y": 4.476457831325375,
        "z": -30.99974990093502
      },
      "size": {
        "x": 1.5,
        "y": 1.5,
        "z": 1.2
      },
      "allowedRelations": [
        "在线索区按顺序排列",
        "在线索区环形环绕",
        "在线索区被框住",
        "在线索区周期起伏"
      ],
      "maxObjects": 3,
      "allowedRelationIds": [
        "ordered-row",
        "orbit",
        "frame",
        "rise"
      ]
    },
    "neighbors": [
      "dust2-b-mark"
    ],
    "relativeObjects": [
      {
        "name": "黑黄边带绿箱",
        "relation": "门左前方"
      },
      {
        "name": "红色地面标记",
        "relation": "观看点与门之间的地面"
      }
    ],
    "verification": {
      "method": "blender-raycast",
      "reachable": null,
      "visible": true,
      "sceneVersion": "dust2-vrchris-08f7ab9c-v4",
      "evidence": "实际 GLB 中 material_23/material_7 门板连通分量实测；观看点属于主步行连通区；完整线索体积无三角形相交；眼到门板与线索无遮挡；未验收浏览器交互。"
    }
  }
]
export const DUST2_SCENE: SceneDefinition = {
  id: 'dust2', version: 'dust2-vrchris-08f7ab9c-v4', title: 'Dust2 · 实景地标',
  worldTransform: { targetSpan: 100, centerXZ: true, floorY: true },
  description: '在原始 Dust2 模型中实测十二个石阶、木箱、绿箱、拱门与转角地标。线索布置在地标前方的独立地面体积内。',
  familiarityPrompt: '从西院拱门出发，经南院、东廊、东台与中庭，最后抵达北院宽门。名称按可见特征命名，不是竞技地图官方点位表。',
  anchors: DUST2_ANCHORS,
  route: { spawnAnchorId: DUST2_ANCHORS[0]!.id, edges: DUST2_ANCHORS.slice(1).map((a,i) => [DUST2_ANCHORS[i]!.id,a.id]), directed: true, walking: BUILTIN_WALKING_ROUTES.dust2 },
  attribution: { title: 'de_dust2 - CS map', creator: 'vrchris', url: 'https://sketchfab.com/3d-models/de-dust2-cs-map-056008d59eb849a29c0ab6884c0c3d87', license: 'CC-BY-4.0' },
  limitations: ['模型与纹理由 vrchris 提供，非本项目原创。', '点位经过 Blender 地面射线和观看点到线索中心的遮挡检查；不等于浏览器行走、移动设备性能或整条路线验证。', 'v4 全序列已通过同一胶囊控制器的一次出生、无中途瞬移回放；仍未进行浏览器实走验收。', 'v3 替换了两个孤立区域的点位，改用主步行连通区中有证据的拱门地标。'],
}

const MEASURED_FEATURE_BOUNDS: Record<string, NonNullable<SceneAnchor['landmark']['framingBounds']>> = {"hall-entry":{"min":{"x":-0.7500000000000001,"y":1.7881393449270533e-09,"z":5.9976100716194285},"max":{"x":0.7500000000000001,"y":1.2294965361768533,"z":7.0023899283805715},"evidence":"Exact world bounds of all authored meshes tagged with this anchorId; includes supporting base."},"hall-globe":{"min":{"x":-6.694999992847443,"y":1.3113021835042815e-08,"z":5.3920000195503235},"max":{"x":-5.305000007152557,"y":1.9949999928474427,"z":6.6079999804496765},"evidence":"Exact world bounds of all authored meshes tagged with this anchorId; includes supporting base."},"hall-atlas":{"min":{"x":-9.850000023841858,"y":1.0728836097317895e-08,"z":1.949999988079071},"max":{"x":-8.149999976158142,"y":1.2098361359210856,"z":3.050000011920929},"evidence":"Exact world bounds of all authored meshes tagged with this anchorId; includes supporting base."},"hall-clock":{"min":{"x":-9.404032967343197,"y":2.3841857821338408e-08,"z":-2.4609772260971603},"max":{"x":-8.471774334500418,"y":2.799999976158142,"z":-1.53902277390284},"evidence":"Exact world bounds of all authored meshes tagged with this anchorId; includes supporting base."},"hall-window":{"min":{"x":-7.129999995231628,"y":-1.0728836097317895e-08,"z":-8.576084524393082},"max":{"x":-4.870000004768372,"y":3.7299999952316285,"z":-5.850000011920929},"evidence":"Exact world bounds of all authored meshes tagged with this anchorId; includes supporting base."},"hall-herbarium":{"min":{"x":-2.850000023841858,"y":-3.576278662098531e-09,"z":-6.850000011920929},"max":{"x":-1.149999976158142,"y":2.1150000023841855,"z":-5.749999988079071},"evidence":"Exact world bounds of all authored meshes tagged with this anchorId; includes supporting base."},"hall-telescope":{"min":{"x":2.276743899019604,"y":0.016737564452383724,"z":-6.938252256414303},"max":{"x":2.921254913199085,"y":1.975000005364418,"z":-5.661747743585696},"evidence":"Exact world bounds of all authored meshes tagged with this anchorId; includes supporting base."},"hall-cabinet":{"min":{"x":6.05499999821186,"y":4.768371586472142e-08,"z":-6.624999988079071},"max":{"x":7.94500000178814,"y":2.6399999991059304,"z":-5.975000011920929},"evidence":"Exact world bounds of all authored meshes tagged with this anchorId; includes supporting base."},"hall-fountain":{"min":{"x":8.050000011920929,"y":1.3113021835042815e-08,"z":-2.749999988079071},"max":{"x":9.949999988079071,"y":0.8833147910237314,"z":-0.850000011920929},"evidence":"Exact world bounds of all authored meshes tagged with this anchorId; includes supporting base."},"hall-easel":{"min":{"x":8.690096797479098,"y":1.1920928910669204e-08,"z":2.3337185567965673},"max":{"x":9.382635595749456,"y":2.124999976158142,"z":3.6662814432034327},"evidence":"Exact world bounds of all authored meshes tagged with this anchorId; includes supporting base."},"hall-chess":{"min":{"x":4.149999976158142,"y":8.344650248570673e-09,"z":5.699999997019767},"max":{"x":5.850000023841858,"y":1.504999998807907,"z":6.9000000029802315},"evidence":"Exact world bounds of all authored meshes tagged with this anchorId; includes supporting base."},"hall-table":{"min":{"x":-2.280000001192093,"y":0,"z":-2.280000001192093},"max":{"x":2.280000001192093,"y":0.9277764120101931,"z":2.280000001192093},"evidence":"Exact world bounds of all authored meshes tagged with this anchorId; includes supporting base."},"dust2-west-gate":{"min":{"x":-20.48195,"y":3.61445,"z":12.0482},"max":{"x":-20.48195,"y":6.62655,"z":15.6627},"evidence":"Measured connected mesh components of the original GLB, normalized to100span. Selected arched door panel."},"dust2-west-crate":{"min":{"x":-22.89155,"y":3.61445,"z":19.87945},"max":{"x":-21.08435,"y":5.42175,"z":23.494},"evidence":"Measured connected mesh components of the original GLB, normalized to100span. Closest wooden-crate component."},"dust2-south-crates":{"min":{"x":-27.40965,"y":6.0241,"z":23.79525},"max":{"x":-25,"y":8.43375,"z":26.2049},"evidence":"Measured connected mesh components of the original GLB, normalized to100span. Closest wooden-crate component."},"dust2-south-turn":{"min":{"x":12.0482,"y":3.61445,"z":27.10855},"max":{"x":14.45785,"y":7.2289,"z":29.5182},"evidence":"Measured connected mesh components of the original GLB, normalized to100span. Closest wooden-crate component."},"dust2-east-crates":{"min":{"x":24.0964,"y":3.61445,"z":14.06245},"max":{"x":26.50605,"y":6.0241,"z":17.4698},"evidence":"Measured connected mesh components of the original GLB, normalized to100span. Closest wooden-crate component."},"dust2-a-mark":{"min":{"x":25.6024,"y":5.42175,"z":-25.2823},"max":{"x":27.0896,"y":7.83135,"z":-22.59035},"evidence":"Measured connected mesh components of the original GLB, normalized to100span. Selected visible green-box group."},"dust2-middle-crate":{"min":{"x":-25.3012,"y":3.61445,"z":-30.12055},"max":{"x":-19.2771,"y":6.0241,"z":-26.20475},"evidence":"Measured connected mesh components of the original GLB, normalized to100span. Selected visible green-box group."},"dust2-b-mark":{"min":{"x":-26.50605,"y":3.61445,"z":-33.2642},"max":{"x":-19.2771,"y":6.0241,"z":-26.20475},"evidence":"Measured connected mesh components of the original GLB, normalized to100span. Selected visible green-box group."},"dust2-north-gate":{"min":{"x":-26.50605,"y":3.61445,"z":-33.43365},"max":{"x":-22.89155,"y":6.62655,"z":-33.43365},"evidence":"Measured connected mesh components of the original GLB, normalized to100span. Selected arched door panel."}}
for (const scene of [READING_HALL,DUST2_SCENE]) for (const anchor of scene.anchors) { const bounds=MEASURED_FEATURE_BOUNDS[anchor.id]; if(bounds) anchor.landmark.framingBounds=bounds }
export const DUST2_CALLOUT_ANCHORS = dust2CalloutAnchors as SceneAnchor[]
export const DUST2_CALLOUT_SCENE: SceneDefinition = {
  id: 'dust2-callouts', version: 'dust2-vrchris-08f7ab9c-v5', title: 'Dust2 · 玩家报点',
  worldTransform: { targetSpan: 100, centerXZ: true, floorY: true },
  description: '按玩家熟悉的报点区域组织原模型中的具体地标；中文区域与实物名称配合常见别名，不再用泛化院落名称定位。',
  familiarityPrompt: '先按路线熟悉匪家、A 区、中路与 B 区；每个区域内只选一个明确实物。编号属于本场景，不与旧版互换。',
  anchors: DUST2_CALLOUT_ANCHORS,
  route: { spawnAnchorId: DUST2_CALLOUT_ANCHORS[0]!.id, edges: DUST2_CALLOUT_ANCHORS.slice(1).map((a,i) => [DUST2_CALLOUT_ANCHORS[i]!.id,a.id]), directed: true, walking: dust2CalloutWalking as SceneWalkingRoute },
  attribution: { ...DUST2_SCENE.attribution! },
  limitations: ['模型与纹理由 vrchris 提供，非本项目原创。', '区域使用常见玩家报点；区域内实物后缀是对本模型的描述，不冒充所有版本统一的竞技点位名。', '此场景使用独立 ID；旧 v4 与历史 60 点位方案继续保留原位置，不会自动迁移。', '参考图为 Blender 几何诊断；程序与几何检查不等于浏览器实走、移动设备或学习效果验收。'],
}
export const SCENE_DEFINITIONS: SceneDefinition[] = [READING_HALL, DUST2_CALLOUT_SCENE, DUST2_SCENE]
export function listSceneDefinitions(): SceneDefinition[] { return SCENE_DEFINITIONS }
/** Keep old semantic identities available for restoring existing projects. */
export function listCreatableSceneDefinitions(existingSceneId?: string): SceneDefinition[] {
  return SCENE_DEFINITIONS.filter(scene => scene.id !== 'dust2' || existingSceneId === 'dust2')
}
export function isDust2Scene(id: string): boolean { return id === 'dust2' || id === 'dust2-callouts' }
export function isOfflineBuiltinScene(id: string): boolean { return id === 'reading-hall' || isDust2Scene(id) }
export function anchorCalloutContext(anchor: SceneAnchor): string {
  return [anchor.zone, anchor.calloutAliases?.length ? `玩家别名：${anchor.calloutAliases.join(' / ')}` : '', anchor.landmark.description].filter(Boolean).join(' · ')
}
export function getSceneDefinition(id: string): SceneDefinition {
  const found = SCENE_DEFINITIONS.find((scene) => scene.id === id)
  if (!found) throw new Error(`未知场景：${id}`)
  return found
}

/** Structural validation is intentionally separate from geometric/browser verification. */
export function validateSceneDefinition(scene: SceneDefinition): string[] {
  const errors: string[] = [], ids=new Set<string>(), loci=new Set<string>(), orders=new Set<number>()
  const finitePoint=(p: ScenePoint) => [p.x,p.y,p.z].every(Number.isFinite)
  if (!scene.id.trim() || !scene.version.trim() || !scene.title.trim()) errors.push('场景缺少稳定 ID、版本或标题。')
  if (!scene.anchors.length || scene.anchors.length > 60) errors.push('当前存储格式支持 1–60 个地标。')
  for(const a of scene.anchors){
    if(ids.has(a.id)||loci.has(a.locusId)||orders.has(a.routeOrder))errors.push(`地标标识或顺序重复：${a.id}`)
    ids.add(a.id);loci.add(a.locusId);orders.add(a.routeOrder)
    if(!/^L(0[1-9]|[1-5][0-9]|60)$/.test(a.locusId))errors.push(`非法点位 ID：${a.locusId}`)
    if(![a.position,a.approach.position,a.approach.eye,a.approach.lookAt,a.cueVolume.center,a.cueVolume.size].every(finitePoint))errors.push(`坐标不是有限数值：${a.id}`)
    if(![a.cueVolume.size.x,a.cueVolume.size.y,a.cueVolume.size.z].every(v=>v>0))errors.push(`线索体积必须为正：${a.id}`)
    if(!Number.isInteger(a.capacity)||a.capacity<1||a.capacity!==a.cueVolume.maxObjects)errors.push(`容量与线索体积不一致：${a.id}`)
    if(!Number.isFinite(a.approach.yaw)||!Number.isFinite(a.approach.pitch))errors.push(`朝向无效：${a.id}`)
    if(!a.landmark.visibleFeatures.length || !a.affordances.length)errors.push(`地标缺少特征或动作语境：${a.id}`)
  }
  if(!ids.has(scene.route.spawnAnchorId))errors.push('起点不属于场景。')
  for(const a of scene.anchors)for(const id of a.neighbors)if(!ids.has(id))errors.push(`相邻地标不存在：${id}`)
  for(const [a,b] of scene.route.edges)if(!ids.has(a)||!ids.has(b))errors.push('路线引用了不存在的地标。')
  return errors
}
export function registerSceneDefinition(scene: SceneDefinition): void {
  const errors=validateSceneDefinition(scene)
  if(errors.length)throw new Error(errors.join(' '))
  if(SCENE_DEFINITIONS.some(s=>s.id===scene.id))throw new Error(`场景 ID 已存在：${scene.id}`)
  SCENE_DEFINITIONS.push(scene)
}
