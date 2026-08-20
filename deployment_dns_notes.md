# 域名部署解析记录

| 时间 | 检查 | 结果 |
|---|---|---|
| 2026-08-20 16:55 | 服务器本机携带 `Host: zhongyuanzb.xyz` 请求 `127.0.0.1:80` | 已返回 Node.js 应用首页（HTTP 200）。 |
| 2026-08-20 16:55 | 沙箱浏览器访问 `http://zhongyuanzb.xyz` | 仍返回旧 Nginx 404。 |

该差异表明下一步须核验公网 DNS 的 A/AAAA 记录或缓存是否实际指向 `43.129.210.253`；在公网解析一致前，不申请 HTTPS 证书，也不更改其他站点配置。

| 2026-08-20 17:02 | ACME 预检 | `zhongyuanzb.xyz` 与 `www.zhongyuanzb.xyz` 均解析至 `43.129.210.253`；两个域名的 HTTP 验证路径返回 Nginx 404，说明 80 端口可从公网到达并可进行 webroot 验证。 |
| 2026-08-20 17:04 | HTTPS 浏览器验收 | `https://zhongyuanzb.xyz` 已加载中圆量化收益分析仪表板；页面读取 51 条迁移交易、公开编辑控件和三类导出界面均已出现。 |
| 2026-08-20 17:12 | 自建发布包浏览器验收 | 更新后的独立服务通过 `https://zhongyuanzb.xyz` 正常加载 51 条交易；品牌资源来自 `/assets/brand/`，交易编辑、候选搜索、日期范围与导出控件均已渲染。 |
| 2026-08-20 17:14 | 导出回归验收 | 策略汇总海报导出设置成功打开并完成下载；生成文件为 `中圆量化8月度收益走势-策略汇总海报.png`，尺寸 1080×1156，文件大小 1,442,644 bytes，页面按钮状态已恢复。 |
| 2026-08-20 17:15 | 隔离与回归验收 | `zhongyuan-quant.service` 为 active，3108 仅监听 `127.0.0.1`；快照接口返回 HTTP 200。HTTPS 证书有效至 2026-11-18。`seedfler.com`、`xinlongseafood.com`、`yingshunai.com` 均返回 HTTP 200。 |
| 2026-08-20 17:16 | 本地静态资源验收 | 公网与服务器本机均可读取公司 Logo、白色海报 Logo 和金色城市海报背景，均返回 HTTP 200。 |
| 2026-08-20 17:18 | 部署密钥撤销 | 已从 root 的 `authorized_keys` 移除精确匹配的 1 条部署专用 ED25519 公钥；该私钥随后被 SSH 拒绝，沙箱中的私钥及公钥副本已删除；`https://zhongyuanzb.xyz` 仍返回 HTTP 200。 |
| 2026-08-21 04:55 | DNSPod 状态截图 | 截图显示 `zhongyuanzb.xyz` 被标为“DNS 地址待修改”；DNSPod 提示“未正常使用 DNSPod 解析服务”，并建议将名称服务器设为 `a.dnspod.com`、`b.dnspod.com`、`c.dnspod.com`。该截图本身未显示当前权威名称服务器或 A 记录。 |
| 2026-08-21 17:20 | 公共 DNS 核验 | Google Public DNS 返回当前权威名称服务器正是 `a.dnspod.com`、`b.dnspod.com`、`c.dnspod.com`；根域名与 `www` 的 A 记录均为 `43.129.210.253`，根域名未见 AAAA 记录。 |
| 2026-08-21 17:20 | HTTPS 连通性复核 | 从公网访问 `https://zhongyuanzb.xyz/` 与 `https://www.zhongyuanzb.xyz/` 均返回 HTTP 200，远端地址均为 `43.129.210.253`。 |
