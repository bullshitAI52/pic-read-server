# 服务器部署

## Docker 部署

在安装 Docker Compose 的 Linux 服务器上运行：

```bash
git clone https://github.com/bullshitAI52/pic-read-server.git
cd pic-read-server
docker compose up -d --build
```

然后手机或电脑访问 `http://服务器IP:8765`。上传图片和生成的 PDF 会保存在 Docker 数据卷中。

## 手机使用

手机浏览器可以上传照片、旋转页面、调整顺序、开始转换、阅读 PDF 和下载文件。手机不需要安装 Python 或 Tesseract，OCR 和 PDF 生成都在服务器上完成。

## 公网部署注意事项

当前版本适合可信服务器或局域网使用。公开访问前应增加 HTTPS、登录验证、上传大小限制、限流和定期清理策略，不建议直接把 8765 端口暴露到公网。
