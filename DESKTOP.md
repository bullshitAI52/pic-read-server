# 离线桌面版 / Offline desktop edition

## 中文

下载地址：[GitHub Releases](https://github.com/bullshitAI52/pic-read-server/releases/latest)。

| 电脑类型 | 下载文件 |
| --- | --- |
| Windows 64 位 | `PicRead-Offline-Windows-x64-Setup.exe` |
| Mac Apple 芯片（M 系列） | `PicRead-Offline-macOS-AppleSilicon.dmg` |
| Mac Intel 芯片 | `PicRead-Offline-macOS-Intel.dmg` |

Windows 双击安装程序，按提示安装。Mac 打开 DMG，把应用拖到 Applications（应用程序）。Mac 芯片类型可在“关于本机”查看。

应用尚未购买商业代码签名或进行 Apple 公证，系统可能提示无法验证发布者。请仅在确认下载来源可信后，按系统安全设置允许打开；不要关闭系统整体安全保护。Windows 界面依赖 Edge WebView2，缺少该运行环境的电脑需要先安装 Microsoft 官方 WebView2 Runtime。

### 怎么用

1. 打开应用，选择电脑里的图片。
2. 点击缩略图，拖动四个角点，对准纸张四角；方向不对可先旋转。
3. 点击“确认裁剪”，程序把歪斜的纸张拉正。
4. 点击“保存高清图片到电脑”，选择位置，保存 PNG 图片。
5. 裁错可以恢复原图，再重新裁剪。

处理在本机完成，不依赖 VPS；高清保存基于原图而非预览缩略图，但不能凭空补出原照片没有的细节。离线版不生成互联网分享链接，不支持 OCR 和 PDF 转换。处理缓存默认保存在用户应用数据目录，裁剪缓存有七天清理逻辑，请及时另存需要长期保留的图片。已另存的图片不会因此删除。

### 自动打包

在仓库 Actions 中选择 **Build offline installers → Run workflow**，成功后从各平台的 Artifacts 下载构建结果（需要登录 GitHub）。推送 `desktop-v*` 标签会自动构建并上传安装包到对应 Release。Windows、Apple Silicon、Intel Mac 分别构建，不需要在自己的电脑上准备三套环境。

自动检查会启动打包后的本地服务并验证首页和健康接口；这不等同于在各系统上人工验证安装、窗口交互和保存对话框。

## English

Download installers from [GitHub Releases](https://github.com/bullshitAI52/pic-read-server/releases/latest).

- Windows x64: run `PicRead-Offline-Windows-x64-Setup.exe`.
- Apple Silicon Mac: open `PicRead-Offline-macOS-AppleSilicon.dmg` and drag the app to Applications.
- Intel Mac: use `PicRead-Offline-macOS-Intel.dmg` instead.

Import a photo, open its preview, drag the four corners to match the paper, and confirm the crop. Perspective correction straightens the selected area. Rotate or restore the original when needed, then choose the high-resolution save button and select a local PNG destination.

Processing runs locally without a VPS or a separate Python installation. Output uses the original image rather than its preview thumbnail; it cannot recover detail missing from the original. Public sharing links, OCR, and PDF conversion are not available in this edition. Save important results outside the application cache: cached crops have a seven-day cleanup policy; separately saved images are unaffected.

These builds are not commercially code-signed or Apple-notarized, so operating-system security prompts may appear. Only allow an app after verifying its source; do not disable system-wide protection. Windows requires Microsoft Edge WebView2 Runtime; install the official runtime first if it is missing.

To build, run **Build offline installers** from the Actions tab and download its artifacts. Tags matching `desktop-v*` trigger builds and publish installers to a GitHub Release. Each platform has its own build job. Automated smoke tests check the packaged local server and homepage, not a complete interactive installation or save-dialog test.
