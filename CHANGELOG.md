# 更新记录 / Changelog

## 2026-10-25 — TG 保存兼容性 / Saving compatibility

- 新增手机系统分享按钮；分享取消不再误报保存成功。不支持时提示使用 TG 或 Safari。
- TG 模式保存按钮改为回传聊天，不再依赖内置浏览器下载 blob 链接。
- 同时发送可存相册的 JPEG 照片（最长边 2400，可能再被 TG 压缩）和原分辨率、未改动的 PNG 文件。透明区域只在相册版铺白，高清 PNG 保留原样。
- 照片失败可重试，已确认送达的 PNG 不重复发送。网络超时无法完全排除 TG 已接收的情况，请先查看聊天。
- Add native file sharing and route Telegram-mode saving back to chat. Send an album-friendly JPEG plus the unchanged full-resolution PNG; retry partial delivery without resending an acknowledged document. Device photo permissions still apply.
- 自动测试不代表已在用户 iPhone 上完成相册保存验收。

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
