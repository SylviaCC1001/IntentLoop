# Windows 笔记本部署指南

这份指南用于把 IntentLoop 部署到一台闲置 Windows 笔记本上，让手机、平板或其他电脑访问同一个站点。

## 推荐形态

- Windows 笔记本常插电，关闭睡眠。
- IntentLoop 作为单实例 Node 服务运行。
- SQLite 数据库和上传文件放在持久目录，例如 `D:\intentloop-data`。
- 内网访问可用 `COOKIE_SECURE=false`。
- 公网或跨网络访问推荐使用 Cloudflare Tunnel 提供 HTTPS。

不要同时启动多个 IntentLoop 实例写同一个 SQLite 文件。

## 1. 安装依赖

在 Windows 笔记本 PowerShell 中执行：

```powershell
winget install Git.Git
winget install OpenJS.NodeJS.LTS
winget install Cloudflare.cloudflared
```

验证：

```powershell
node -v
npm -v
git -v
cloudflared --version
```

Node 建议使用 `v22` 或更高版本。

## 2. 拉取代码

```powershell
cd D:\
git clone <你的仓库地址> IntentLoop
cd D:\IntentLoop
npm ci
```

## 3. 准备数据目录

```powershell
mkdir D:\intentloop-data
```

这个目录必须长期保留，里面会保存：

- `prd.db`
- PRD/原型/附录版本文件
- 原型 zip 解压后的文件
- 评审注释和会话数据

## 4. 初始化并启动

内网 HTTP 访问：

```powershell
$env:INVITE_CODE="换成一个强邀请码"
npm run deploy:windows:start -- -DataDir "D:\intentloop-data" -Port 3123 -CookieSecure false
```

启动后，同一局域网设备访问：

```text
http://这台笔记本IP:3123
```

如果局域网设备无法访问，需要放行防火墙：

```powershell
New-NetFirewallRule -DisplayName "IntentLoop 3123" -Direction Inbound -Protocol TCP -LocalPort 3123 -Action Allow
```

## 5. Cloudflare Tunnel HTTPS 访问

如果需要外网或跨网络访问，另开一个 PowerShell 窗口执行：

```powershell
cloudflared tunnel --url http://localhost:3123
```

Cloudflare 会输出一个 `https://...trycloudflare.com` 地址，其他设备使用这个 HTTPS 地址访问。

使用 Cloudflare Tunnel 时，也可以把服务用 secure cookie 启动：

```powershell
$env:INVITE_CODE="换成一个强邀请码"
npm run deploy:windows:start -- -DataDir "D:\intentloop-data" -Port 3123 -CookieSecure true
```

如果只使用局域网 `http://IP:3123`，请保持 `-CookieSecure false`，否则浏览器可能无法保存登录态。

## 6. 备份数据

手动备份：

```powershell
npm run deploy:windows:backup -- -DataDir "D:\intentloop-data" -BackupDir "D:\intentloop-backups"
```

备份文件会生成在：

```text
D:\intentloop-backups\intentloop-YYYYMMDD-HHMMSS.zip
```

正式使用后，建议每天至少备份一次整个 `D:\intentloop-data`。

## 7. 开机登录后自启

先确认你已经至少手动启动并构建成功一次，然后注册计划任务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\register-startup-task.ps1 -DataDir "D:\intentloop-data" -Port 3123 -CookieSecure false
```

查看任务：

```powershell
Get-ScheduledTask -TaskName "IntentLoop"
```

删除任务：

```powershell
Unregister-ScheduledTask -TaskName "IntentLoop" -Confirm:$false
```

## 8. 笔记本系统设置

- 接通电源时永不睡眠。
- 合上盖子设置为“不采取任何操作”。
- 路由器里给这台笔记本固定 IP。
- 不要随便删除 `D:\intentloop-data`。
