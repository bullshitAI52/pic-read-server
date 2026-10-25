# 更新记录 / Changelog

## 2026-10-25 — feature/crop-assist

- OpenCV 图片处理组件随网页一起提供，不再依赖手机访问外部 docs.opencv.org；保留来源、许可证和文件校验值。
- 修复加载超过 30 秒后，“确认裁剪”始终不可用的问题：提示等待并继续检测，组件就绪后自动启用。
- 更新脚本缓存版本，并增加慢加载恢复的回归测试。
- 适用于独立裁剪分支及其 GitHub Pages；没有合并到 main。TG 服务器已单独部署相同修复。

### English

- Bundle OpenCV.js locally with source attribution, license and SHA-256 checksum, removing the runtime dependency on docs.opencv.org.
- Keep checking readiness after the 30-second warning so cropping becomes available when initialization eventually completes.
- Refresh the app script cache key and add a delayed-initialization regression test.
- Changes target the crop-assist branch and its Pages deployment, not main. The TG server received the same fix separately.
