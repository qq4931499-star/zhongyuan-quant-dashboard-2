# 自有服务器部署盘点

> 盘点时间：2026-08-20。以下信息通过只读 SSH 命令获取，仅用于本项目隔离部署。

| 项目 | 盘点结果 | 部署约束 |
|---|---|---|
| 服务器 | `43.129.210.253`，SSH 为 `root@22` | 使用专用部署密钥；不修改其他站点目录。 |
| 域名 | `zhongyuanzb.xyz` 与 `www.zhongyuanzb.xyz` | 已有独立 Nginx 虚拟主机和空站点目录。 |
| Web 服务 | 宝塔面板管理的 Nginx 1.30.4，监听 80/443 | 仅修改 `zhongyuanzb.xyz` 对应虚拟主机；先语法检测，再无中断重载。 |
| 现有站点 | `seedfler.com`、`xinlongseafood.com`、`yingshunai.com` 等 | 不修改其根目录、反向代理、端口和服务。 |
| 运行环境 | Node.js 20.19.4、MySQL 8.0.45、无 Docker 容器 | 新应用使用独立目录、独立系统服务和独立数据库账号。 |
| 已用端口 | 80、443、3001、3306、33060、8001、18080 等 | 新应用仅监听 `127.0.0.1:3108`，不直接对公网暴露。 |
| 数据库 | MySQL 实例已存在 | 创建专用数据库 `zhongyuan_quant` 和最小权限账号，不触碰现有库。 |

## 隔离部署原则

新站点代码将位于 `/opt/zhongyuan-quant-dashboard`；应用由独立的 `zhongyuan-quant.service` 进程以非特权用户运行；数据库使用 `zhongyuan_quant` 与专用账号；Nginx 仅在 `zhongyuanzb.xyz` 虚拟主机中新增到 `127.0.0.1:3108` 的反向代理。所有 Nginx 修改均需通过 `nginx -t` 后再执行平滑重载。
