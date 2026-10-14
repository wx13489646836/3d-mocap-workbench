# 常见模型格式导入

点击“导入模型 / 动作”选择模型文件，或选择包含模型与贴图的 ZIP。

| 格式 | 导入行为 |
|---|---|
| VRM、PMX、PMD | 直接导入人物，沿用原有引擎 |
| OBJ | 自动读取 MTL 与贴图，转换为模型展示 |
| FBX、GLB、GLTF、BLEND | 有可识别的人形骨骼与蒙皮时自动转换为 VRM；其他模型供展示 |
| STL、PLY | 转换为模型展示 |
| ZIP | 读取模型与配套资源；多个模型时提供文件选择 |
| VMD、BVH、仅含动作的 FBX | 沿用动作导入 |

自动转换需要本机 Blender 4.2 或更新版。工作台会查找 Program Files 或 LocalAppData/Programs 下 Blender Foundation 的安装。转换在后台运行；原文件保持不变，结果保存在本机 imports 目录。

OBJ 的 .mtl、纹理贴图，GLTF 的 .bin 和贴图必须放在原来的相对位置。缺失贴图会提示文件名。

动捕转换目前识别 Mixamo、常见 left/right 命名和部分 Bip01 人形骨骼。任意命名、自定义多骨架或映射不完整的模型仍可展示，但不能自动动捕。转换不会为没有骨骼的模型自动绑骨，也不会自动生成面部表情；已有标准名称的表情形态会尽量保留并映射。

模型与转换缓存仅保存在本机，不自动上传仓库。原模型的使用许可仍然适用。

## 开发验证

设置环境变量 `STUDIO_IMPORT_TEST_FILES` 为三个测试文件路径的 JSON 数组（依次为无骨骼 FBX ZIP、OBJ ZIP、带人形骨骼 FBX ZIP），使用 `--studio-format-import-test` 启动引擎，可验证实际导入按钮、失败恢复、骨骼动作和内置 VRM 切换。

关闭输出管道回归测试使用 `--studio-import-error-test`；设置 `STUDIO_STATIC_TEST_MODEL` 指向本机测试 GLB。测试素材无需加入仓库。
