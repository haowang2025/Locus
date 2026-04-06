# 记忆宫殿 MVP（离线 Android）

React + Three.js + IndexedDB，本地离线；使用 Capacitor 打包成可安装 Android App。

## 功能（MVP）

- 多宫殿（本地）：可创建/删除/进入；每个宫殿 60 个固定点位（默认内置 Dust2 GLB；失败自动回退 OBJ）
- 自定义地图：支持离线导入 `*.glb`，用 `L01..L60` 锚点节点将点位绑定到地标（可选 `COLLISION` 简化碰撞）
- 导入：逐行文本 / CSV（覆盖导入，最多 60 条）
- 3D：FPS 自由探索 + 点位列表跳转；靠近点位可一键打开卡片
- 卡片：prompt/answer/note + 可选图片 + 可选 3D 模型（`.glb`，本地存储）
- 导出：`.mpalace`（zip：`palace.json` + `images/` + `models/`），Android 端走系统分享面板
- 传输：WebRTC P2P（房间码信令 / 扫码 / 复制粘贴），接收方自动导入为新宫殿

> 说明：内置地图默认加载 Dust2 GLB（若失败会自动回退到内置 Dust2 OBJ）。

## 开发（Web）

```bash
cd memory-palace/mvp
npm i
npm run dev
```

## 房间码信令服务（可选）

房间码模式需要一个 WebSocket 信令服务（用于交换 WebRTC offer/answer；数据仍走 P2P）。

```bash
cd memory-palace/mvp
npm run signal   # 默认 ws://<host>:8787
```

## 打包（Android APK）

构建依赖：Android SDK + JDK（建议 21–24；避免用 JDK 25 运行 Gradle）。

```bash
cd memory-palace/mvp
npm run android:apk
```

产物路径通常为：`memory-palace/mvp/android/app/build/outputs/apk/debug/app-debug.apk`。

## VR（Quest 2 / WebXR）

说明：

- VR 只在 **WebXR 浏览器**里运行（Quest Browser 打开网页）；Capacitor 的 Android APK（WebView）不支持 WebXR。
- 进入方式：打开地图页后点击「进入 VR」。

交互（自动切换：手势优先，无手势时回退手柄）：

- 右手捏合 / 右扳机：交互（开卡/训练）
- 左手捏合 / 左扳机：自由瞬移（仅可站立地面）
- 左手握拳 / 左握把：点位瞬移（需先用头部准星瞄到 L01..L60 的 marker）

提示：WebXR 需要 HTTPS（或 `localhost`）。把 `dist/` 部署到任意 HTTPS 静态站点后用 Quest Browser 打开即可。

## 资源署名（Attribution）

- Built-in Dust2 GLB：`de_dust2 - CS map` by vrchris（Sketchfab），License: CC-BY-4.0
  - Source: https://sketchfab.com/3d-models/de-dust2-cs-map-056008d59eb849a29c0ab6884c0c3d87
