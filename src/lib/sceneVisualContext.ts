import dust2CalloutVisualContext from './dust2CalloutVisualContext.json'
import { getSceneDefinition, type ScenePoint } from './sceneRegistry'

export interface SceneVisualAsset {
  id: string
  /** Same-origin public asset path only; no external URLs or credentials. */
  path: string
  mimeType: 'image/jpeg' | 'image/png'
  sha256: string
  byteLength: number
  width: number
  height: number
}
export interface SceneAnchorVisualView extends SceneVisualAsset {
  anchorId: string
  label: string
  eye: ScenePoint
  lookAt: ScenePoint
  projection: { kind:'perspective'; verticalFovDeg:number; aspectRatio:number }
  visibleFeatures: string[]
  cueVolume: { id:string; center:ScenePoint; size:ScenePoint }
}
export interface SceneVisualContextManifest {
  schemaVersion: 1
  sceneId: string
  sceneVersion: string
  title: string
  coordinateConvention: 'Three.js Y-up; Blender conversion (x,-z,y)'
  generation: {
    method:'blender-geometry-inspection'
    tool:string
    sourceGeometrySha256:string
    browserVerified:false
    lighting:string
    notes:string[]
  }
  overview: SceneVisualAsset & { projection:{kind:'orthographic'; horizontalSpanMeters:number; verticalSpanMeters:number} }
  anchors: SceneAnchorVisualView[]
  attribution?: {title:string;creator:string;url:string;license:string}
}

/** Populated only after the actual version-matched renders and bytes are verified. */
export const SCENE_VISUAL_CONTEXTS: Record<string,SceneVisualContextManifest> = {
  'dust2-callouts': dust2CalloutVisualContext as SceneVisualContextManifest,
  "reading-hall": {
    "schemaVersion": 1,
    "sceneId": "reading-hall",
    "sceneVersion": "1.1.0",
    "title": "拾光阅览馆",
    "coordinateConvention": "Three.js Y-up; Blender conversion (x,-z,y)",
    "generation": {
      "method": "blender-geometry-inspection",
      "tool": "Blender 4.3.2 / Cycles",
      "sourceGeometrySha256": "aca2dc6c51d02b6c2ed748dee07800677c6ed79ae560b9cc8d5d8c67f764d2af",
      "browserVerified": false,
      "lighting": "Diagnostic studio lighting; Dust2 views include a small camera-side fill to reveal enclosed geometry. This is not a pixel match to browser lighting.",
      "notes": [
        "青框表示允许线索体积；不属于实际地图道具。",
        "俯视图叠加编号与通过几何控制器回放的步行路径。",
        "仅使用实际导入或程序化导出的几何渲染，没有用生成图片替代场景事实。",
        "本包未测试模型视觉理解，也不代表浏览器或设备验收。"
      ]
    },
    "overview": {
      "id": "reading-hall-overview",
      "path": "scene-context/reading-hall/1.1.0/overview.jpg",
      "mimeType": "image/jpeg",
      "sha256": "53ccf2e5af55f51443f2e2bc1dcda3ad5f74bf5cb02edabc7b50cd246f4edb6c",
      "byteLength": 265509,
      "width": 1200,
      "height": 1200,
      "projection": {
        "kind": "orthographic",
        "horizontalSpanMeters": 30,
        "verticalSpanMeters": 30
      }
    },
    "anchors": [
      {
        "id": "hall-entry-view",
        "path": "scene-context/reading-hall/1.1.0/hall-entry.jpg",
        "mimeType": "image/jpeg",
        "sha256": "97680098c725d764584f9a6eb5e13497b252ecd4e03b816b9b2a0cdd2f3bfc90",
        "byteLength": 162732,
        "width": 960,
        "height": 540,
        "anchorId": "hall-entry",
        "label": "黄铜迎宾台",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "胡桃木斜面讲台",
          "正面嵌一条黄铜竖线"
        ],
        "cueVolume": {
          "id": "hall-entry-cue",
          "center": {
            "x": 0,
            "y": 2.1,
            "z": 6.5
          },
          "size": {
            "x": 1.5,
            "y": 1.5,
            "z": 1.2
          }
        }
      },
      {
        "id": "hall-globe-view",
        "path": "scene-context/reading-hall/1.1.0/hall-globe.jpg",
        "mimeType": "image/jpeg",
        "sha256": "ede42d734627f5097b92e9f6c931c6ddea6ca67826759eed1c6c0823c71d290d",
        "byteLength": 147329,
        "width": 960,
        "height": 540,
        "anchorId": "hall-globe",
        "label": "蓝色地球仪",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "蓝绿色球体",
          "被黄铜经纬环抱住",
          "立于圆柱底座"
        ],
        "cueVolume": {
          "id": "hall-globe-cue",
          "center": {
            "x": -6,
            "y": 2.9,
            "z": 6
          },
          "size": {
            "x": 1.5,
            "y": 1.5,
            "z": 1.2
          }
        }
      },
      {
        "id": "hall-atlas-view",
        "path": "scene-context/reading-hall/1.1.0/hall-atlas.jpg",
        "mimeType": "image/jpeg",
        "sha256": "3e2ea6bf8e1f4c8b214279229574607a714eb447cc23c686e96b6fe994e4f822",
        "byteLength": 166404,
        "width": 960,
        "height": 540,
        "anchorId": "hall-atlas",
        "label": "摊开的红色图册",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "矮木桌上的红色大图册",
          "奶油色双页展开"
        ],
        "cueVolume": {
          "id": "hall-atlas-cue",
          "center": {
            "x": -9,
            "y": 2.06,
            "z": 2.5
          },
          "size": {
            "x": 1.5,
            "y": 1.5,
            "z": 1.2
          }
        }
      },
      {
        "id": "hall-clock-view",
        "path": "scene-context/reading-hall/1.1.0/hall-clock.jpg",
        "mimeType": "image/jpeg",
        "sha256": "03533be8b0382a89ad9f5c5676a3912aab0c5ad6d6766ed38fe1452e20dd4309",
        "byteLength": 165730,
        "width": 960,
        "height": 540,
        "anchorId": "hall-clock",
        "label": "高身摆钟",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "深色高柜、象牙白圆钟面和金色摆锤"
        ],
        "cueVolume": {
          "id": "hall-clock-cue",
          "center": {
            "x": -7.535719409724071,
            "y": 0.85,
            "z": -1.6746043132720159
          },
          "size": {
            "x": 1.5,
            "y": 1.5,
            "z": 1.2
          }
        }
      },
      {
        "id": "hall-window-view",
        "path": "scene-context/reading-hall/1.1.0/hall-window.jpg",
        "mimeType": "image/jpeg",
        "sha256": "1b5d37eaa260a7fa7fe86dbee010ca67ac461ad4d63d42a5a779bd547a2420eb",
        "byteLength": 151570,
        "width": 960,
        "height": 540,
        "anchorId": "hall-window",
        "label": "琥珀圆窗前石台",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "琥珀色圆窗前的双脚浅石长台",
          "暖色圆窗与长台形成上下呼应"
        ],
        "cueVolume": {
          "id": "hall-window-cue",
          "center": {
            "x": -6,
            "y": 1.7999999999999998,
            "z": -5.95
          },
          "size": {
            "x": 1.5,
            "y": 1.5,
            "z": 1.2
          }
        }
      },
      {
        "id": "hall-herbarium-view",
        "path": "scene-context/reading-hall/1.1.0/hall-herbarium.jpg",
        "mimeType": "image/jpeg",
        "sha256": "0e8d084fc1b0267445b6f626158e66a881f985bd1cd94b61ad107fd842fe709e",
        "byteLength": 148452,
        "width": 960,
        "height": 540,
        "anchorId": "hall-herbarium",
        "label": "绿色植物标本台",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "三株不同高度的绿色叶片",
          "陶罐置于浅木长台"
        ],
        "cueVolume": {
          "id": "hall-herbarium-cue",
          "center": {
            "x": -2,
            "y": 2.9,
            "z": -5.95
          },
          "size": {
            "x": 1.5,
            "y": 1.5,
            "z": 1.2
          }
        }
      },
      {
        "id": "hall-telescope-view",
        "path": "scene-context/reading-hall/1.1.0/hall-telescope.jpg",
        "mimeType": "image/jpeg",
        "sha256": "9460364a9e6e84af52f915c2cb7531bf83e2954cde8587640e8846a2022c8055",
        "byteLength": 172424,
        "width": 960,
        "height": 540,
        "anchorId": "hall-telescope",
        "label": "铜色望远镜",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "铜色长镜筒和三脚架",
          "旁边是小圆托盘"
        ],
        "cueVolume": {
          "id": "hall-telescope-cue",
          "center": {
            "x": 1.9467317195418847,
            "y": 0.85,
            "z": -4.905763933245549
          },
          "size": {
            "x": 1.5,
            "y": 1.5,
            "z": 1.2
          }
        }
      },
      {
        "id": "hall-cabinet-view",
        "path": "scene-context/reading-hall/1.1.0/hall-cabinet.jpg",
        "mimeType": "image/jpeg",
        "sha256": "458aaaae237e1987a7255010eea246c7656327c8dd8276d09771add0641c9a4c",
        "byteLength": 168618,
        "width": 960,
        "height": 540,
        "anchorId": "hall-cabinet",
        "label": "紫色矿石陈列柜",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "开放木柜内三颗紫色切面晶体",
          "背板深蓝"
        ],
        "cueVolume": {
          "id": "hall-cabinet-cue",
          "center": {
            "x": 7,
            "y": 0.85,
            "z": -4.8
          },
          "size": {
            "x": 1.5,
            "y": 1.5,
            "z": 1.2
          }
        }
      },
      {
        "id": "hall-fountain-view",
        "path": "scene-context/reading-hall/1.1.0/hall-fountain.jpg",
        "mimeType": "image/jpeg",
        "sha256": "4737e38b2e045d850ee1ef3f2cea124f536b33eeaf9a3e1f596075a8e0cc524d",
        "byteLength": 165759,
        "width": 960,
        "height": 540,
        "anchorId": "hall-fountain",
        "label": "青石涟漪池",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "青灰石圆池",
          "蓝色水面和三道同心涟漪"
        ],
        "cueVolume": {
          "id": "hall-fountain-cue",
          "center": {
            "x": 9,
            "y": 1.7,
            "z": -1.8
          },
          "size": {
            "x": 1.5,
            "y": 1.5,
            "z": 1.2
          }
        }
      },
      {
        "id": "hall-easel-view",
        "path": "scene-context/reading-hall/1.1.0/hall-easel.jpg",
        "mimeType": "image/jpeg",
        "sha256": "72f4b1f9c9d82857f776ec904f81dd0bd70639ef78c2078b41be04bb2912f5c8",
        "byteLength": 183232,
        "width": 960,
        "height": 540,
        "anchorId": "hall-easel",
        "label": "赭红画架",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "赭红三脚画架",
          "奶油色画布上有醒目的蓝色圆形"
        ],
        "cueVolume": {
          "id": "hall-easel-cue",
          "center": {
            "x": 7.5769750529242295,
            "y": 0.85,
            "z": 2.525658350974743
          },
          "size": {
            "x": 1.5,
            "y": 1.5,
            "z": 1.2
          }
        }
      },
      {
        "id": "hall-chess-view",
        "path": "scene-context/reading-hall/1.1.0/hall-chess.jpg",
        "mimeType": "image/jpeg",
        "sha256": "83d7622add94176a1c104a10c787a6c948acf60e3dcd399b903e5b726c3bcf5e",
        "byteLength": 162174,
        "width": 960,
        "height": 540,
        "anchorId": "hall-chess",
        "label": "黑白棋盘桌",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "方形黑白棋盘、两枚不同高度的木质棋子"
        ],
        "cueVolume": {
          "id": "hall-chess-cue",
          "center": {
            "x": 5,
            "y": 2.3,
            "z": 6.3
          },
          "size": {
            "x": 1.5,
            "y": 1.5,
            "z": 1.2
          }
        }
      },
      {
        "id": "hall-table-view",
        "path": "scene-context/reading-hall/1.1.0/hall-table.jpg",
        "mimeType": "image/jpeg",
        "sha256": "7f4662dc6ff5c79e67a741a0bddf4d1416c38090d968531d0993d443578a7d5e",
        "byteLength": 140938,
        "width": 960,
        "height": 540,
        "anchorId": "hall-table",
        "label": "中央八角讨论桌",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "八角胡桃木桌面",
          "中央嵌黄铜环",
          "四周有矮凳"
        ],
        "cueVolume": {
          "id": "hall-table-cue",
          "center": {
            "x": 0,
            "y": 1.75,
            "z": 0
          },
          "size": {
            "x": 1.5,
            "y": 1.5,
            "z": 1.2
          }
        }
      }
    ]
  },
  "dust2": {
    "schemaVersion": 1,
    "sceneId": "dust2",
    "sceneVersion": "dust2-vrchris-08f7ab9c-v4",
    "title": "Dust2 · 实景地标",
    "coordinateConvention": "Three.js Y-up; Blender conversion (x,-z,y)",
    "generation": {
      "method": "blender-geometry-inspection",
      "tool": "Blender 4.3.2 / Cycles",
      "sourceGeometrySha256": "92da5929670931087cebbb7493eceedfd38f38af9f5e85cf1761e90ff39f5960",
      "browserVerified": false,
      "lighting": "Diagnostic studio lighting; Dust2 views include a small camera-side fill to reveal enclosed geometry. This is not a pixel match to browser lighting.",
      "notes": [
        "青框表示允许线索体积；不属于实际地图道具。",
        "俯视图叠加编号与通过几何控制器回放的步行路径。",
        "仅使用实际导入或程序化导出的几何渲染，没有用生成图片替代场景事实。",
        "本包未测试模型视觉理解，也不代表浏览器或设备验收。"
      ]
    },
    "overview": {
      "id": "dust2-overview",
      "path": "scene-context/dust2/dust2-vrchris-08f7ab9c-v4/overview.jpg",
      "mimeType": "image/jpeg",
      "sha256": "c12a7e05935d783303c9ee8e83131ae14bb0fee512fef72788cc95202c663382",
      "byteLength": 244974,
      "width": 1200,
      "height": 1200,
      "projection": {
        "kind": "orthographic",
        "horizontalSpanMeters": 115,
        "verticalSpanMeters": 115
      }
    },
    "anchors": [
      {
        "id": "dust2-west-gate-view",
        "path": "scene-context/dust2/dust2-vrchris-08f7ab9c-v4/dust2-west-gate.jpg",
        "mimeType": "image/jpeg",
        "sha256": "8dc96f85065025866e1eab0f98068f3131df19d615f088c9b45d99cf68206e57",
        "byteLength": 196058,
        "width": 960,
        "height": 540,
        "anchorId": "dust2-west-gate",
        "label": "西院禁入拱门",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "浅褐石墙中的双扇拱形木门",
          "左门板带有 STAY OUT 字样",
          "门前灰石小路两侧是砂土地面"
        ],
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
          }
        }
      },
      {
        "id": "dust2-west-crate-view",
        "path": "scene-context/dust2/dust2-vrchris-08f7ab9c-v4/dust2-west-crate.jpg",
        "mimeType": "image/jpeg",
        "sha256": "c8e3ea3071ba6a2ecebe730c6d21f99be0b32be7e99679f90719eb8ec030110d",
        "byteLength": 195147,
        "width": 960,
        "height": 540,
        "anchorId": "dust2-west-crate",
        "label": "西院墙脚木箱",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "西院石墙脚边的单层木箱",
          "两个可见箱面都有 X 形斜撑",
          "观看点位于狭长院落中"
        ],
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
          }
        }
      },
      {
        "id": "dust2-south-crates-view",
        "path": "scene-context/dust2/dust2-vrchris-08f7ab9c-v4/dust2-south-crates.jpg",
        "mimeType": "image/jpeg",
        "sha256": "19a8fa8f00359a2b585eb62bfeefe144edd01b2822cabea1d19bc3a94164063b",
        "byteLength": 182207,
        "width": 960,
        "height": 540,
        "anchorId": "dust2-south-crates",
        "label": "南院高低木箱",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "高低相邻的木箱都有 X 形斜撑",
          "高箱立在低箱右后方",
          "后方石墙可见拱形开口"
        ],
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
          }
        }
      },
      {
        "id": "dust2-south-stairs-view",
        "path": "scene-context/dust2/dust2-vrchris-08f7ab9c-v4/dust2-south-stairs.jpg",
        "mimeType": "image/jpeg",
        "sha256": "7a197bcb7a4bcf571ce465da9a261577537ab112e13fc268cc24306525bba11c",
        "byteLength": 201901,
        "width": 960,
        "height": 540,
        "anchorId": "dust2-south-stairs",
        "label": "南院宽石阶",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "成排浅灰石台阶",
          "左右低石栏",
          "正前方木箱"
        ],
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
          }
        }
      },
      {
        "id": "dust2-south-turn-view",
        "path": "scene-context/dust2/dust2-vrchris-08f7ab9c-v4/dust2-south-turn.jpg",
        "mimeType": "image/jpeg",
        "sha256": "0cbc67c9ac273710ed5258eaa448d738e646a701a8454f04f57800cd652b2521",
        "byteLength": 185117,
        "width": 960,
        "height": 540,
        "anchorId": "dust2-south-turn",
        "label": "南转角门旁双层箱",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "拱形木门旁一上一下叠放的 X 形木箱",
          "两个箱面形成竖向标记"
        ],
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
          }
        }
      },
      {
        "id": "dust2-east-crates-view",
        "path": "scene-context/dust2/dust2-vrchris-08f7ab9c-v4/dust2-east-crates.jpg",
        "mimeType": "image/jpeg",
        "sha256": "2314a6486ac6f92b202ac9e8c28ba5db00c4fdea4fb054545a48cff7191e1c56",
        "byteLength": 190816,
        "width": 960,
        "height": 540,
        "anchorId": "dust2-east-crates",
        "label": "东侧密集木箱角",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "多只 X 形木箱挤放在浅褐石墙转角",
          "前后箱面与侧墙形成狭窄凹角"
        ],
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
          }
        }
      },
      {
        "id": "dust2-east-stairs-view",
        "path": "scene-context/dust2/dust2-vrchris-08f7ab9c-v4/dust2-east-stairs.jpg",
        "mimeType": "image/jpeg",
        "sha256": "4761be33322d9656cf5aecdaf724dfdd3eea60be06079cff2011d9e877ec6176",
        "byteLength": 198519,
        "width": 960,
        "height": 540,
        "anchorId": "dust2-east-stairs",
        "label": "东庭长石阶",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "横穿庭院的长石阶",
          "尽端墙面上并列两个拱形小窗"
        ],
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
          }
        }
      },
      {
        "id": "dust2-a-mark-view",
        "path": "scene-context/dust2/dust2-vrchris-08f7ab9c-v4/dust2-a-mark.jpg",
        "mimeType": "image/jpeg",
        "sha256": "c93b244ba83ec10887a0bb82584ee431fe905d9d2dab45a95b611a132f9e1a6e",
        "byteLength": 161102,
        "width": 960,
        "height": 540,
        "anchorId": "dust2-a-mark",
        "label": "雕纹高台绿箱叠层",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "雕纹矮石栏上方有高低绿箱叠层",
          "观看点位于较低街道",
          "高台与街道形成明显高差"
        ],
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
          }
        }
      },
      {
        "id": "dust2-stone-turn-view",
        "path": "scene-context/dust2/dust2-vrchris-08f7ab9c-v4/dust2-stone-turn.jpg",
        "mimeType": "image/jpeg",
        "sha256": "55d31437b2e73c6b399f7280b4a654ddd792c7303c6b3b29681f4bc9f97bc85f",
        "byteLength": 203626,
        "width": 960,
        "height": 540,
        "anchorId": "dust2-stone-turn",
        "label": "中庭石路转弯",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "灰色石路绕过凸出的墙角",
          "前方墙上有黑色拱门"
        ],
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
          }
        }
      },
      {
        "id": "dust2-middle-crate-view",
        "path": "scene-context/dust2/dust2-vrchris-08f7ab9c-v4/dust2-middle-crate.jpg",
        "mimeType": "image/jpeg",
        "sha256": "9f95a196022569ec1b27966679af5aa80e35f0b180274627ebf839cf2f69bb57",
        "byteLength": 162674,
        "width": 960,
        "height": 540,
        "anchorId": "dust2-middle-crate",
        "label": "红岩壁前双绿箱",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "红褐裸岩壁前一高一低两只绿箱",
          "砂土地面过渡到灰石斜坡"
        ],
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
          }
        }
      },
      {
        "id": "dust2-b-mark-view",
        "path": "scene-context/dust2/dust2-vrchris-08f7ab9c-v4/dust2-b-mark.jpg",
        "mimeType": "image/jpeg",
        "sha256": "19a3149ff42bd53af5c73722887fd3c94bfcc9a953219dc50c495966c595d769",
        "byteLength": 173582,
        "width": 960,
        "height": 540,
        "anchorId": "dust2-b-mark",
        "label": "红标记两侧警示箱",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "带黑黄警示边带的绿箱围住红色地面标记",
          "北侧石墙有宽拱木门"
        ],
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
          }
        }
      },
      {
        "id": "dust2-north-gate-view",
        "path": "scene-context/dust2/dust2-vrchris-08f7ab9c-v4/dust2-north-gate.jpg",
        "mimeType": "image/jpeg",
        "sha256": "82751d19809f597f4052fc0edc977085dc434d64c5aff4f741d7044ad334ac30",
        "byteLength": 191409,
        "width": 960,
        "height": 540,
        "anchorId": "dust2-north-gate",
        "label": "北院宽拱木门",
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
        "projection": {
          "kind": "perspective",
          "verticalFovDeg": 70,
          "aspectRatio": 1.7777777777777777
        },
        "visibleFeatures": [
          "北院尽端的宽拱双扇木门",
          "左前方有黑黄边带绿箱",
          "观看点与门之间可见红色地面标记"
        ],
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
          }
        }
      }
    ],
    "attribution": {
      "title": "de_dust2 - CS map",
      "creator": "vrchris",
      "url": "https://sketchfab.com/3d-models/de-dust2-cs-map-056008d59eb849a29c0ab6884c0c3d87",
      "license": "CC-BY-4.0"
    }
  }
}
export function getSceneVisualContext(sceneId:string):SceneVisualContextManifest|null {
  const manifest=SCENE_VISUAL_CONTEXTS[sceneId]
  if(!manifest)return null
  const scene=getSceneDefinition(sceneId)
  if(scene.version!==manifest.sceneVersion||scene.anchors.length!==manifest.anchors.length)return null
  const same=(a:ScenePoint,b:ScenePoint)=>Math.abs(a.x-b.x)<1e-5&&Math.abs(a.y-b.y)<1e-5&&Math.abs(a.z-b.z)<1e-5
  for(const view of manifest.anchors){
    const anchor=scene.anchors.find(a=>a.id===view.anchorId)
    if(!anchor||anchor.label!==view.label||!same(anchor.approach.eye,view.eye)||!same(anchor.approach.lookAt,view.lookAt)||!same(anchor.cueVolume.center,view.cueVolume.center)||!same(anchor.cueVolume.size,view.cueVolume.size))return null
  }
  return manifest
}
