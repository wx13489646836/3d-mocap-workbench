# 更新日志

## 2026-10-19 · 摄像头动捕修复与控制面板优化

### 摄像头与动作捕捉

- 用设备 ID 直接选择摄像头，替换依赖数字键输入的旧菜单，消除“选项 B”和无关输入框。
- 等待视频解码，并将识别画布尺寸同步为有效视频尺寸，修复摄像头已有画面但动捕无法处理的问题。
- 等待识别结果后完成动捕启动；增加设备占用、权限拒绝、解码失败和超时的中文提示。
- 支持设备刷新、自动 / 480p / 720p / 1080p 采集、镜像输入，以及本地视频文件。
- 提供面部、身体、身体与手部、面部与身体、全身和旧版 Holistic 模式。
- 停止动捕保留视频输入；关闭输入释放所有视频轨道；修正关闭后仍显示连接中的状态。
- 修复关闭设备后的延迟回调空指针，以及退出窗口时状态轮询访问已销毁对象的问题。

### 界面

- 新增独立取景预览、设备信息、实际输入尺寸和识别状态。
- 视频输入页集中显示设备设置；动捕页默认折叠输入设置，突出追踪模式与启动 / 停止操作。
- 保留启动时不自动采集的行为，支持键盘操作和小窗口布局。
- 实际界面截图：`docs/screenshots/camera-input.png`、`docs/screenshots/motion-capture.png`。两张截图均在关闭采集后保存。

### 同步本地已有的代码改进

- 修正特定 Tripo FBX 的旧版 Phong 非金属材质、过强高光和完全不透明纹理被当作透明材质的问题，保留显式材质和真实透明度。
- 为匹配的 Tripo PBR 模型补充预览灯光与镜头适配，并修正旧缓存中的异常高光系数。
- Blender 查找支持 `BLENDER_PATH` 与现有本地安装位置。
- 启动脚本与虚拟相机输出改用项目目录内的 Electron / Python 运行时路径。运行时二进制需单独准备，见 README。

### 验证

- HP True Vision FHD Camera 实测自动输入为 640 × 480、30 帧/秒，全身动捕返回 MediaPipe 识别结果。
- 21 项采集回归检查通过，覆盖视频解码、取景预览、全身识别、停止与释放、重新连接、镜像、权限拒绝、设备占用、本地视频与取消选择，以及其他功能页恢复。
- 检查 1380、1040、768、375 CSS 像素宽度，面板无横向溢出；采集生命周期未出现脚本运行错误。
- 报告：`capture-verification.json`。报告保留设备名称与检查结果，省略设备 ID。
- 本节的端到端结果覆盖摄像头与动捕流程；模型材质及运行路径调整另做语法检查，未据此宣称在其他机器上完成验证。

从项目根目录在 PowerShell 中复跑（需已准备运行时与可用摄像头）：

```powershell
$projectRoot = (Get-Location).Path
$env:GPUSET = 'true'
$env:STUDIO_CAPTURE_REPORT = Join-Path $projectRoot 'capture-verification.json'
Set-Location (Join-Path $projectRoot 'launch-context')
& "$projectRoot\runtime\electron\electron.exe" "$projectRoot\app" --studio-capture-test "$projectRoot\engine\AT_SystemAnimator_v110350.gadget\images\XR Animator"
```

测试会短暂打开摄像头并启动识别，完成后释放输入并退出。报告路径所在目录也会保存关闭采集后的界面截图；测试不会保存摄像头取景画面。
