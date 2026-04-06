# APK（Debug）

> 说明：为支持“原版 + 新版”同时安装，新版使用了不同包名与签名。

- 最低 Android：7.0（minSdk 24）

## 原版（旧包名）

- 文件：`memory-palace-mvp-debug.apk`（项目顶级目录）
- 包名：`com.memorypalace.mvp`
- 版本：`1.0.2`
- SHA256：`0520d7bef7f8ad1588ad2875cb7e6bc988e7cc68ca1c053431bf7898ff4d4821`

## 新版（GLB 包名，可与原版共存）

- 文件：`memory-palace-mvp-glb-debug.apk`（项目顶级目录）
- 包名：`com.memorypalace.mvp.glb`
- 版本：`1.0.7-glb`
- SHA256：`a07222fd3557f645e65db6f113527fe06f20ed6928332c0f0abef7f5329cc8a8`

安装方式（任选）：

1) 复制到手机后直接打开安装（需允许“安装未知应用”）。
2) 使用 ADB：
   - `adb install -r memory-palace-mvp-debug.apk`
   - `adb install -r memory-palace-mvp-glb-debug.apk`

备注：

- Quest 2 的 VR 版本走 WebXR（在 Quest Browser 打开网页进入 VR），不在本 APK（Android WebView）中运行。
