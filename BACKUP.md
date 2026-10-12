# 私有仓库备份与恢复

本仓库备份 3D动捕工作台的当前源码、原引擎、人物模型、图标、Windows 虚拟相机依赖、许可证、界面配置与验证报告。大体积二进制文件使用 Git LFS。

## 恢复

1. 安装 Git 和 Git LFS，运行 `git lfs install`。
2. 克隆本私有仓库，然后在仓库目录运行 `git lfs pull`。
3. 本机运行时仍来自已安装的 XR Animator Electron v37.3.0 与 Python 3.11。仓库中的虚拟相机 Python 依赖已保留，其他电脑需要安装对应运行时并调整路径；本仓库不是独立安装包。
4. 将 `launch-context/SystemAnimator_path.txt` 改为克隆目录中 `engine/AT_SystemAnimator_v110350.gadget/SystemAnimator_webkit.html` 的绝对路径。
5. 检查 `启动3D动捕工作台.cmd` 中 Electron 路径，以及 `app/video-output.js` 的本机 Python 3.11 路径；启动目录必须为 `launch-context`。
6. 启动软件。虚拟相机首次开启会在当前 Windows 用户下注册 Avatar Camera。

## 备份范围

- `app/`：中文控制台与原引擎桥接，包含动作库、视角拖动、纯色背景、视频输出。
- `engine/`：当前使用的原引擎与本地修改，以及配套动作、材质、追踪模型和工具。
- `models/`、`assets/`：人物模型、模型来源和授权、图标与生成提示词。
- `runtime/`：虚拟相机 DirectShow 组件、桥接程序、Python 依赖。
- `user-data/studio-settings.json`：纯色背景配置。
- `engine/AT_SystemAnimator_v110350.gadget/TEMP/_config_local/XR Animator.js`：原引擎当前追踪、显示等本地配置，已检查未含非空凭据字段。
- `tools/`：模型转换与维护脚本、开发验证工具。
- 根目录的 JSON 文件：已完成的验证报告。

未上传 Chromium 用户会话目录（含 cookies、登录数据和原引擎 Local Storage）、缓存、锁文件、调试日志、测试截图、Android 安装包及下载缓存。原引擎个人偏好可在恢复后重新设置。GitHub 仓库保持私有；模型与第三方代码仍按各自原许可证使用。

`BACKUP-MANIFEST.json` 记录初次备份各文件的原始大小与 SHA256；文本文件在不同 Git 换行设置下字节可能不同。可通过 `git fsck` 和 `git lfs fsck` 检查仓库及大文件完整性。

## 后续保存修改

在仓库目录执行 `git add -A`、`git commit -m "更新 3D动捕工作台"`、`git push`。Git LFS 会自动推送已跟踪的大文件。软件运行过程中产生的缓存不会进入备份。
