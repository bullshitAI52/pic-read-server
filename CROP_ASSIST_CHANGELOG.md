# 裁剪辅助更新 / Crop assistance update

## 2026-10-22：手机操作与下载修复

- 四角触控范围固定为屏幕上的 48 × 48 像素，不再随高分辨率图片缩成小点；画面保持原图比例。
- 主要按钮高度至少 48 像素，窄屏自动分行；角点周围留出拖动空间，放大镜继续可用。
- 拖动时保留手指与角点的初始偏移，避免按到触控区边缘时角点跳动；取消或失去触控捕获时释放拖动。
- 裁剪前检查交叉、重合、内凹和过小选框，给出可操作的错误说明。
- 生成 PNG 成功后才提供真实下载链接，链接在当前结果有效期间保留；增加“打开图片／长按保存”手机备用入口。
- 大图导入上限为 1600 万像素、单边 8192 像素，超过限制提示用户，不自动降低分辨率。自动找边先在小预览上进行，释放轮廓对象，降低内存开销。
- 恢复原图会恢复初始方向；旋转不再覆盖保留的原图。
- 在 390px 窄屏实测角点为 48px，拖动后成功裁剪、生成并下载 PNG；旋转后尺寸从 1200×900 变为 900×1200，恢复后回到 1200×900。不是对所有实体手机浏览器的兼容性保证。

### English

Mobile handles now retain a 48px touch area regardless of source-image resolution. Buttons wrap without vertical text, and the preview preserves aspect ratio. Dragging keeps the initial finger offset and releases on lost pointer capture. Crop validation rejects crossed, coincident, concave, tiny, or oversized selections. A PNG is encoded before persistent download/open-image links become available, allowing a long-press save fallback on mobile. Rotation no longer overwrites the original. Detection runs on a reduced-size canvas with contour cleanup. Images over 16 megapixels or 8192px per side are rejected explicitly rather than silently resized.

Verified in a 390px browser viewport: 48px handles, drag/crop/download flow, and rotation/reset dimensions. Actual physical-phone compatibility remains device-dependent.

## 发布范围

本次仅同步到独立分支 `feature/crop-assist`。没有部署 VPS、合并主分支、创建版本标签或替换已有安装包。原版与新分支分别保留。

纯浏览器版：[https://bullshitai52.github.io/pic-read-server/](https://bullshitai52.github.io/pic-read-server/)

网页文件位于 `pages/`，由 `.github/workflows/pages.yml` 在本分支更新时自动发布。网页版使用浏览器内的 OpenCV.js，不连接本项目的 FastAPI 接口；图片不会上传 VPS。首次打开需要联网加载 OpenCV.js，组件加载完成后即可在当前页面本地处理图片。

## 新增了什么

### 1. 角点放大镜

- 图片预览增加“角点放大镜”开关，默认开启。
- 鼠标或手指拖动四角时显示约三倍于当前显示比例的局部放大图，十字线标出当前角点。
- 放大图位于当前角点另一侧，减少手指遮挡；松手、取消拖动、换图或关闭预览时隐藏。
- 放大镜只是预览，不改变输出图片像素，也不进行 AI 放大。

### 2. 自动框选四角，保留手动微调

- 增加“打开未裁剪图片时自动框选四角”开关，默认开启。
- 增加“重新识别四角”按钮，可主动重新检测。
- 基于现有 OpenCV 检测较大的凸四边形，按左上、右上、右下、左下返回比例坐标；考虑当前旋转方向。
- 自动识别只建议角点，不直接裁剪、不保存图片、不改动原文件。用户检查并微调后，仍需点击“确认裁剪”。
- 未识别到候选边框或请求失败时保留当前角点，允许继续手动裁剪。
- 开始手动拖动、切换图片、旋转或确认裁剪后，过期的识别结果不会覆盖新状态。
- 已裁剪图片不会在每次打开时自动再识别，可使用按钮主动识别。

识别属于几何规则，不是能理解任意纸张的 AI。复杂背景、纸张颜色接近背景、强反光、弯曲书页、多个矩形物体都可能漏检或误检。请始终检查四角；四角透视校正不能代替弯曲书页展平。

## 怎么用

打开图片预览 → 等待建议四角 → 拖动角点时查看放大镜 → 微调至纸张边缘 → 确认裁剪 → 保存高清图片。不需要自动识别或放大镜时，取消对应勾选即可；选项本次不跨应用重启保存。

## 改动位置

- `newspaper_reader/core/image_proc.py`：只读四角检测函数，检测图最长边限制在 1300 像素；最终裁剪仍走原有原图处理逻辑。
- `newspaper_reader/app.py`：新增 `POST /api/job/{job_id}/page/{page_id}/detect-corners`。
- `newspaper_reader/web/static/`：两个开关、重新识别按钮、放大镜、状态提示和异步结果保护。
- `newspaper_reader/test/test_crop_assist.py`：合成图片与只读接口回归测试。
- `newspaper_reader/test/test_crop_assist_ui.cjs`：前端检测与放大镜逻辑测试。

## 验证情况

- Python 五项测试通过：小图/大图坐标、空白/极小图片、90/180/270 度旋转、菱形四角不重复、检测接口不修改源图与页面状态（含缺失图片 404）。
- Node 前端逻辑测试通过：识别成功、无结果、无效结果、手动输入/切图后的旧结果忽略、放大镜开关和结束拖动清理。
- JavaScript 语法、Python 编译与 Git 空白检查通过。
- 尚未完成真实手机触摸、真实拍摄样本集以及 Windows/Mac 安装包的人工界面验证。这次未重新打包安装程序。
- GitHub Pages 版已在本地浏览器确认页面正常显示、OpenCV.js 能加载且控制项状态正常；发布后的 HTTPS 页面仍需在 Actions 完成后再次核验。

复现：

```sh
python -m unittest newspaper_reader.test.test_crop_assist -v
node newspaper_reader/test/test_crop_assist_ui.cjs
node --check newspaper_reader/web/static/app.js
```

Python 测试需要项目运行依赖及 `httpx`，前端逻辑测试只需要 Node.js。

## English

This update lives only on `feature/crop-assist`. It is not deployed to the VPS, merged into `main`, tagged, or included in existing release installers.

Live browser edition: [https://bullshitai52.github.io/pic-read-server/](https://bullshitai52.github.io/pic-read-server/). It is deployed from `pages/` by GitHub Actions. Image processing runs locally in the browser with OpenCV.js and does not call the project's FastAPI server. An internet connection is required to load OpenCV.js when opening the page.

- **Corner magnifier:** an optional close-up with crosshairs appears while dragging a corner, at roughly 3× the displayed image scale. It moves to the opposite side and disappears when dragging ends. It does not upscale the exported image.
- **Automatic corner suggestions:** an optional default-on setting detects a large convex quadrilateral when an uncropped image opens. A separate button reruns detection. Users can still adjust every corner manually and must explicitly confirm the crop.
- Detection uses a reduced-size image and returns normalized coordinates for the existing original-resolution crop path. It respects page rotation and never writes image files. Failure preserves the current selection; stale responses cannot overwrite manual edits or another page.
- Detection is heuristic. Low contrast, glare, curved pages, or competing rectangles may produce missing or incorrect suggestions. Always check the proposed corners. Options are not persisted across restarts in this revision.

Five Python regression tests and isolated JavaScript interaction-logic checks passed, along with syntax/compile/whitespace checks. Physical mobile touch, a real-photo evaluation set, and interactive Windows/macOS installer tests have not been completed. No new installers were built for this branch.
# 2026-10-24：可选 Telegram 接入

- 机器人私聊收图，通过 Mini App 复用四角拖动、放大镜和透视裁剪。
- 一键以 PNG 文件回传，不二次压缩；任务隔离、登录签名校验、一小时过期和重复发送保护。
- 新增独立 `telegram/` 服务、中英文说明和模拟测试。普通 Pages 不加载 TG SDK。
- 尚未配置真实机器人或部署网关；main、原 VPS 与安装包未修改。
