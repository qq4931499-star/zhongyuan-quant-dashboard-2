# 中圆量化收益分析仪表板：本地化运行与自建部署指南

**适用项目：** `zhongyuan-quant-dashboard`  
**编写日期：** 2026-08-18（SGT）  
**目标：** 将当前网站的源码、交易数据库、品牌资源和运行配置完整保留，并在本地电脑或自建服务器上运行一个可独立维护的版本。

> **先读结论。** 当前项目的完整保护应分成两条线：第一条是使用官方 **Task Data Backup** 保存可恢复快照；第二条是建立独立的 Git 源码、MySQL 逻辑备份和品牌资源副本，为长期自建部署做准备。仅下载源码并不包含数据库、上传资源、密钥和平台能力。[1] [2]

本指南描述的是**长期迁出或灾备演练**的技术路径，而不是官方服务调整期间的替代恢复机制。对于受影响账户，官方恢复路径仍是按通知要求完成 Task Data Backup，并在恢复窗口使用该备份恢复网站。[1] [2]

## 1. 当前项目的技术与资产边界

当前项目是一个公开协作型量化交易收益仪表板。前端为 React 19 与 Vite，服务端为 Express 与 tRPC，数据访问采用 Drizzle ORM 和 MySQL 兼容数据库。项目以 `pnpm` 管理依赖，并提供 `dev`、`build`、`start`、`check`、`test` 和 `db:push` 脚本。

| 资产类别 | 当前内容 | 本地/自建部署的处理方式 | 重要性 |
|---|---|---|---|
| 源码 | React 页面、Express 服务端、tRPC 路由、Drizzle schema、导出与测试脚本 | Git 克隆或项目源码 ZIP；必须包含 `pnpm-lock.yaml` 与 `patches/` | 极高 |
| 业务数据 | `trades`、`dashboardSettings`、`users` 三张表 | 官方备份包 + MySQL SQL 逻辑备份或应用层 CSV/XLSX 账本 | 极高 |
| 品牌资源 | 彩色 Logo、白色 Logo、策略海报背景图 | 下载原文件，放入自有对象存储或项目静态目录；替换 `/manus-storage/` 引用 | 高 |
| 导出能力 | 营销图、策略汇总海报、今日策略战报、长图自适应高度 | 随源码迁移；需在目标环境重新做 PNG 验证 | 高 |
| 股票候选 | 代码、名称、拼音缩写候选 | 当前调用公开腾讯股票提示接口；目标环境必须允许 HTTPS 出网 | 中 |
| 平台集成 | Manus OAuth、存储代理、内置 Forge 存储凭据、默认 `manus.space` 域名 | 必须移除、关闭或替换，不能作为独立部署的长期依赖 | 高 |

当前数据模式如下。`trades` 是核心业务表，`dashboardSettings` 是页面标题与显示区间的单行配置，`users` 来自全栈模板的身份模型。交易记录的卖出价和卖出时间均允许为空，用于表示未平仓记录。

| 表 | 关键字段 | 本地恢复时的核验重点 |
|---|---|---|
| `trades` | `id`、`symbol`、`stockName`、买卖价格、买卖时间 | 条数、最早/最晚买入时间、未平仓数量、代码名称、价格精度 |
| `dashboardSettings` | 标题、副标题、展示起止日期 | 必须存在一条当前配置；恢复后页面标题与导出区间一致 |
| `users` | OpenID、名称、邮箱、角色 | 当前业务公开可编辑；若关闭 OAuth，此表可保留但不作为运行前置条件 |

## 2. 推荐的总体路线

建议把迁移拆成**可恢复备份**与**可运行副本**两个互相独立的交付物。前者用于官方恢复，后者用于自建部署和长期可移植性。

```mermaid
flowchart LR
  A[当前 Manus 网站] --> B[Task Data Backup
代码 + DB + 文件 + 配置]
  A --> C[Git 源码镜像]
  A --> D[业务数据导出
SQL + CSV/XLSX]
  A --> E[品牌原文件副本]
  C --> F[本地开发环境]
  D --> F
  E --> F
  F --> G[临时验收环境]
  G --> H[自建 VPS / 私有服务器]
```

| 目标 | 推荐方案 | 原因与注意事项 |
|---|---|---|
| 官方服务调整期间恢复原站 | **Task Data Backup → 官方恢复** | 这是唯一可同时恢复代码、数据库、文件、配置和平台能力的官方路径。[1] [2] |
| 团队电脑离线演练 | **本地 Node.js + MySQL** | 成本最低，适合验收、数据核对和内网使用；电脑需保持开机。 |
| 长期对外独立运行 | **VPS + Docker Compose + MySQL + 反向代理** | 与当前 Node/MySQL 架构贴合；需要自行负责 TLS、监控、备份、系统更新和权限。Docker Compose 适合以单个 YAML 管理应用、网络和卷。[3] |
| 降低运维但保留自有控制 | **第三方托管 Node 服务 + 托管 MySQL** | 可减少服务器维护，但仍需替换 Manus OAuth、存储代理和域名配置；必须先在临时环境验收。 |

> **关键限制。** `manus.space` 默认地址不能作为外部迁移时的 DNS 入口；如果未来要切换到自建站，建议先使用团队自己注册和控制的域名。官方也不建议仅为短期停机而转移域名或部署所有权。[2]

## 3. 第一步：完整导出当前网站

### 3.1 官方完整快照：必须先做

如果账户收到影响通知，请先在 [Data Backup Tool](https://manus.im/backup) 执行 **Export task data → Export more → All tasks → All time**；若只导出本站，则使用 **Custom export → Website tasks → All time**。网站备份包含代码、静态文件、数据库、配置、密钥和第三方集成设置，但它是固定时点快照，不会自动包含之后新增的交易。[1] [2]

在每次集中录入交易后重新导出；最后一次业务变更后，再生成一份最终包。完整备份集不要改名、拆分或混用不同批次的分包。[1]

### 3.2 源码：建立不依赖平台的 Git 镜像

当前项目已同步到用户的 GitHub 仓库。请在自己的电脑执行以下步骤；仓库访问需要使用您的 GitHub 登录、SSH Key 或个人访问令牌，**不要复制或保存任何平台会话令牌**。

```bash
git clone https://github.com/qq4931499-star/zhongyuan-quant-dashboard-2.git
cd zhongyuan-quant-dashboard-2
git fetch --all --tags
git status
git log -1 --oneline
```

随后建议在另一个私有远程仓库建立镜像，以避免只依赖单一托管方：

```bash
git remote add mirror git@github.com:YOUR_ORG/zhongyuan-quant-dashboard-backup.git
git push --mirror mirror
```

代码快照至少应包含以下文件和目录：`client/`、`server/`、`shared/`、`drizzle/`、`scripts/`、`package.json`、`pnpm-lock.yaml`、`drizzle.config.ts`、`vite.config.ts`、`vitest.config.ts`、`patches/`。不要把 `.env`、数据库密码、访问令牌或浏览器下载目录提交到 Git。

### 3.3 数据库：导出 SQL 与可读账本

官方 Task Data Backup 是当前平台数据库的主保护。对于已迁移到自己控制的 MySQL 后续环境，请额外保留可独立恢复的 SQL 逻辑备份。`mysqldump` 会生成可重建对象定义和表数据的 SQL 语句，适合备份或迁移到另一台 MySQL 服务器。[4]

在**自建 MySQL**或已获得合法数据库访问权限的目标环境执行：

```bash
export DB_HOST=127.0.0.1
export DB_PORT=3306
export DB_NAME=zhongyuan_quant
export DB_USER=quant_app

mysqldump \
  --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" -p \
  --single-transaction --routines --events --triggers --no-tablespaces \
  --databases "$DB_NAME" \
  --result-file="backup/zhongyuan_quant-$(date +%F-%H%M).sql"
```

`--single-transaction` 对 InnoDB 场景适合减少逻辑备份期间的阻塞；请使用权限最小化的专用备份账号，并把 SQL 文件加密存放。[4]

此外，建议保留一份团队可阅读的 CSV/XLSX 交易账本，其中至少包含代码、名称、买入价、卖出价、买入时间和卖出时间。当前网站已有批量**导入**与模板下载；建议后续增加受控的“全量原始交易导出 + 核验清单”功能，以减少手动整理成本。

### 3.4 静态资源：下载并替换 `/manus-storage/` 引用

当前前端引用了三项平台存储资源：

| 当前资源 | 建议本地文件名 | 替代方式 |
|---|---|---|
| 公司彩色 Logo | `assets/zhongyuan-logo.png` | 放入自有对象存储或 `client/public/assets/` |
| 海报白色 Logo | `assets/zhongyuan-logo-white.png` | 同上 |
| 策略海报背景 | `assets/strategy-poster-background.png` | 同上 |

本地/自建版本不能持续依赖 `/manus-storage/` 路径，因为它当前由平台存储代理和 Forge 凭据生成临时访问地址。请在网站仍可访问时保留原始文件，或从完整 Task Data Backup 中提取上传资产，然后将 `Home.tsx` 中的资源 URL 改为自有路径，例如：

```ts
const BRAND_LOGO_URL = "/assets/zhongyuan-logo.png";
const POSTER_WHITE_LOGO_URL = "/assets/zhongyuan-logo-white.png";
const POSTER_BACKGROUND_URL = "/assets/strategy-poster-background.png";
```

## 4. 本地运行：推荐的开发与验收流程

### 4.1 前置软件

| 软件 | 建议版本 | 用途 |
|---|---|---|
| Node.js | 22 LTS 或与项目锁定版本兼容的 LTS | 前端构建、Express 服务端、测试 |
| pnpm | 按 `package.json` 的 `packageManager` 字段安装 | 锁定依赖安装 |
| MySQL | 8.x，`utf8mb4` | 业务数据库 |
| Git | 当前稳定版 | 获取和更新源码 |
| Docker Desktop（可选） | 当前稳定版 | 一键启动应用与 MySQL |

建议使用版本管理器安装 Node.js；npm 官方文档也建议使用版本管理器而不是全局安装器，以降低权限与多版本切换问题。[5]

### 4.2 创建本地数据库和最小环境文件

先创建专用数据库与应用账号：

```sql
CREATE DATABASE zhongyuan_quant
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE USER 'quant_app'@'localhost' IDENTIFIED BY '替换为高强度密码';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP
  ON zhongyuan_quant.* TO 'quant_app'@'localhost';
FLUSH PRIVILEGES;
```

在项目根目录创建 `.env`，并确保该文件位于 `.gitignore` 中：

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=mysql://quant_app:替换为高强度密码@127.0.0.1:3306/zhongyuan_quant
JWT_SECRET=用密码管理器生成的至少32字节随机值

# 迁移到独立部署后不使用 Manus OAuth/Forge 存储时，不要填入平台凭据。
# VITE_APP_ID=
# OAUTH_SERVER_URL=
# BUILT_IN_FORGE_API_URL=
# BUILT_IN_FORGE_API_KEY=
```

### 4.3 安装、建表、导入与启动

```bash
corepack enable
pnpm install --frozen-lockfile

# 二选一：全新空库按 Drizzle schema 建表；或导入完整 SQL 备份。
pnpm db:push

# 如果已有 SQL 备份，请先导入，再跳过 db:push，避免重复建表。
mysql --host=127.0.0.1 --user=quant_app -p zhongyuan_quant < backup/zhongyuan_quant-YYYY-MM-DD-HHMM.sql

pnpm check
pnpm test
pnpm dev
```

浏览器打开 `http://127.0.0.1:3000`。正式构建测试使用：

```bash
pnpm build
NODE_ENV=production PORT=3000 pnpm start
```

### 4.4 本地化必须完成的三项代码调整

当前网站公开协作编辑，因此独立版本可先保持**无登录公开模式**。但下列平台能力必须明确处理：

| 当前实现 | 自建处理建议 | 原因 |
|---|---|---|
| Manus OAuth 回调 | 公开模式下移除/关闭 `/api/oauth/callback` 注册；若未来需登录，替换为 Auth.js、Keycloak、企业 SSO 或自建账号体系 | 当前 OAuth 依赖 Manus 身份服务 |
| `/manus-storage/*` 存储代理 | 将三项品牌资源改为本地静态文件或自有 S3/MinIO；移除 `registerStorageProxy` | 该代理依赖 Forge API URL 与密钥 |
| Forge 环境变量 | 移除 `BUILT_IN_FORGE_API_URL`、`BUILT_IN_FORGE_API_KEY` 依赖 | 独立环境不应使用平台私有凭据 |
| 腾讯股票候选查询 | 保留 HTTPS 出网并测试；离线环境可保留手工输入，或导入自维护股票代码表 | 当前候选检索使用外网公共接口 |
| 分析脚本 | 删除或替换 Umami 环境变量 | 属于可选统计，不影响交易主流程 |

## 5. Docker Compose：推荐的自建服务器方式

Docker Compose 可用一个 YAML 文件管理应用、MySQL、网络和持久卷，适合当前这个 Node.js + MySQL 双服务项目。[3]

### 5.1 `Dockerfile` 示例

```dockerfile
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### 5.2 `compose.yaml` 示例

```yaml
services:
  db:
    image: mysql:8.4
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: zhongyuan_quant
      MYSQL_USER: quant_app
      MYSQL_PASSWORD: CHANGE_ME
      MYSQL_ROOT_PASSWORD: CHANGE_ROOT_PASSWORD
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_0900_ai_ci
    volumes:
      - mysql_data:/var/lib/mysql
      - ./backup:/backup:ro
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-pCHANGE_ROOT_PASSWORD"]
      interval: 10s
      timeout: 5s
      retries: 10

  app:
    build: .
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: mysql://quant_app:CHANGE_ME@db:3306/zhongyuan_quant
      JWT_SECRET: CHANGE_TO_A_RANDOM_SECRET
    ports:
      - "127.0.0.1:3000:3000"

volumes:
  mysql_data:
```

启动命令：

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

首次启动后，在数据库容器或管理员工作站导入 SQL 备份；然后完成第 7 节验收。生产环境不要把密码写进 Git 管理的 `compose.yaml`，应使用受保护的 `.env`、Docker secrets 或云厂商的 Secret Manager。

### 5.3 反向代理与域名

建议让应用只监听 `127.0.0.1:3000`，由 Caddy 或 Nginx 提供 HTTPS。Caddy 的最小示例：

```caddyfile
quant.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

域名切换应在临时环境完成完整验收后执行。不要尝试把当前默认 `manus.space` 子域名迁移到外部 DNS；应改用团队可控制的自有域名。[2]

## 6. 数据导入、核验与回滚

### 6.1 导入顺序

| 顺序 | 操作 | 通过条件 |
|---|---|---|
| 1 | 创建空 MySQL 数据库与最小权限应用账号 | 可登录，字符集为 `utf8mb4` |
| 2 | 导入 SQL 备份或按 schema 建表后导入数据 | 三张表存在，无导入错误 |
| 3 | 部署本地静态资源并替换资源 URL | 三张品牌图均返回 HTTP 200 |
| 4 | 配置 `.env` 并启动服务 | 首页、`/api/trpc` 正常响应 |
| 5 | 执行功能验收 | 编辑、导入、股票候选、三类导出均通过 |
| 6 | 仅在目标域名验收后切换 DNS | 新旧站有可回退记录 |

### 6.2 恢复后核验 SQL

```sql
SELECT COUNT(*) AS trade_count,
       MIN(buyDate) AS first_buy,
       MAX(buyDate) AS last_buy,
       SUM(sellPrice IS NULL OR sellDate IS NULL) AS open_or_incomplete_count
FROM trades;

SELECT id, title, subtitle, startDate, endDate
FROM dashboardSettings;

SELECT COUNT(*) AS user_count FROM users;
```

将结果与迁移前生成的核验清单比对。若交易总数、最早/最晚时间或未平仓数量不一致，应停止 DNS 切换，优先检查导入日志、SQL 文件完整性和备份时间点。

### 6.3 业务验收清单

| 功能 | 必测情形 |
|---|---|
| 交易编辑 | 新增、修改、删除；卖出价/卖出时间确认；收益率截断两位小数 |
| 股票候选 | 代码、中文名称、拼音缩写搜索；手工输入未命中时不被覆盖 |
| 批量导入 | CSV、XLSX、空卖出字段、重复交易跳过、模板下载 |
| 导出 | 营销图、策略汇总海报、今日策略战报；当日/本周/本月/全部/自定义范围；长明细底部不截断 |
| 资源与网络 | 三张品牌图加载；股票候选外网查询成功，或离线时手工输入可用 |
| 安全 | 数据库不暴露公网；`.env` 不入库；反向代理 HTTPS 正常 |

## 7. 离线运行与自建服务器的取舍

本项目可在没有公网入口的电脑上运行，但“完全离线”与“功能完全相同”不可同时满足。交易编辑、收益率计算、趋势图、批量导入和图片导出均可在局域网/离线环境使用；股票候选和拼音搜索当前依赖外部 HTTPS 查询，因此离线时应切换到手工输入或维护一份本地股票代码表。

| 方案 | 推荐对象 | 优点 | 主要限制 |
|---|---|---|---|
| 本地单机 | 数据敏感、内部演练 | 数据在自己电脑；零云服务器成本 | 电脑需开机；无公网访问；需自行备份 |
| 局域网服务器 | 小型团队 | 内网协作、可控访问 | 需处理内网备份、权限和机器维护 |
| VPS + Docker Compose | 需要稳定外网访问的团队 | 独立域名、可持续运行、易于迁移 | 需负责操作系统、TLS、监控、备份和安全补丁 |
| 第三方托管 Node + MySQL | 希望减少运维 | 部署维护压力较低 | 仍需改造 OAuth、存储和环境变量；供应商锁定风险仍存在 |

对于当前公开可编辑的业务模式，建议在自建服务器上至少增加**编辑权限控制、数据库每日备份、操作日志和 HTTPS**。若希望保留公开查看但限制编辑，可将读取接口公开，写入接口改为管理员口令、企业 SSO 或受控账号。

## 8. 建议的 48 小时执行顺序

| 时间 | 负责人动作 | 交付物 |
|---|---|---|
| 第 0 天 | 完成官方 Task Data Backup；镜像 Git 仓库；下载三项品牌原文件 | 备份包、Git 镜像、资源目录 |
| 第 1 天上午 | 在本地 Docker Compose 启动 MySQL 与应用；导入数据 | 可访问的本地测试站 |
| 第 1 天下午 | 完成功能、导出、数据核验；记录差异 | 验收清单与 SQL 核验结果 |
| 第 2 天 | 在临时 VPS/域名复刻；配置 HTTPS、备份和监控 | 临时预发布站 |
| 第 2 天后 | 仅在团队验收通过后决定是否切换自有域名 | DNS 变更计划与回滚记录 |

## 9. 风险提示

不要把源码 ZIP 当作数据库备份，也不要把截图或单张导出的 PNG 当作交易原始数据备份。官方 Task Data Backup 是时间点快照；其后发生的公开协作编辑不会自动同步到旧包。[1] [2]

独立部署前必须处理 Manus 专属依赖：OAuth、Forge 存储代理、`/manus-storage/` 资源路径和默认域名。未替换这些依赖时，即使应用在本地启动，图片、登录或存储相关路径也可能失败。

MySQL 逻辑备份文件和 `.env` 均可能包含敏感业务数据或密钥。应采用加密磁盘、最小权限、异地副本和恢复演练；不要将 SQL、密钥或生产数据库端口公开到互联网。

## References

[1] [How to Back Up Your Data — Manus Help Center](https://help.manus.im/en/articles/16147892-service-change-overview-how-to-back-up-your-data)  
[2] [Websites During the August 2026 Data Separation — Manus Help Center](https://help.manus.im/en/collections/19704025-data-back-up-and-restoration)  
[3] [Docker Compose Documentation](https://docs.docker.com/compose/)  
[4] [mysqldump — A Database Backup Program](https://dev.mysql.com/doc/en/mysqldump.html)  
[5] [Downloading and Installing Node.js and npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm/)
