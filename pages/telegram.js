/* Optional same-origin Telegram gateway; ordinary Pages visits do not load the SDK. */
(async () => {
  const job = new URLSearchParams(location.search).get("tg_job");
  if (!job) return;
  const note = document.querySelector("footer p");
  note.textContent = "TG 模式：图片通过机器人服务器中转，透视处理在浏览器完成。服务器不落盘保存图片；任务一小时过期。Telegram 聊天中的图片由你自行删除。";
  document.querySelector(".badge").textContent = "Telegram · 四角裁剪";
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-web-app.js";
      script.onload = resolve; script.onerror = reject;
      document.head.appendChild(script);
    });
    const tg = window.Telegram.WebApp;
    if (!tg.initData) throw new Error("请从 TG 机器人消息中的按钮打开");
    tg.ready(); tg.expand();
    if (tg.isVersionAtLeast("7.7")) tg.disableVerticalSwipes();
    const endpoint = `/api/jobs/${encodeURIComponent(job)}`;
    const headers = {"X-Telegram-Init-Data": tg.initData};
    async function checked(response) {
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || "连接失败，请稍后重试");
      }
      return response;
    }
    status("正在读取 TG 图片…");
    const response = await checked(await fetch(`${endpoint}/image`, {headers}));
    const blob = await response.blob();
    await loadFile(new File([blob], "telegram-image", {type: blob.type}));
    const send = document.createElement("button");
    send.className = "primary"; send.textContent = "发回 Telegram 高清图片";
    document.querySelector(".result-actions").appendChild(send);
    send.addEventListener("click", async () => {
      const url = document.getElementById("downloadBtn").getAttribute("href");
      if (!url) return;
      send.disabled = true; send.textContent = "正在发送…";
      try {
        const result = await (await fetch(url)).blob();
        await checked(await fetch(`${endpoint}/result`, {method: "POST", headers, body: result}));
        send.textContent = "已发回 TG（重新处理请再发一张图）";
        status("高清 PNG 已发回机器人聊天，也可在这里下载。");
      } catch (error) {
        send.disabled = false; send.textContent = "重试发送到 TG";
        status(error.message, true);
      }
    });
  } catch (error) { status(error.message || "TG 组件加载失败，请重新打开", true); }
})();
