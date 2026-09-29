# QR 贺卡

为 like 制作的轻量电子贺卡。目标地址 `https://card.llmat.dev`。

- 两个按钮：今天想见你 / 想要一份神秘礼物。
- 每位朋友拥有随机、固定链接；无过期时间，可以重复使用。
- Telegram 通知包括后台朋友备注、选择和洛杉矶时间。
- 每张卡共享 60 秒冷却，浏览器和 D1 后端同时检查；不受刷新影响。
- 不使用 LLM、常驻服务器或 public IP。
- 原生 HTML/CSS/JS + Cloudflare Worker + 一个小型 D1 数据库。

## 无需任何账号的预览与测试

需要 Node.js 24。

```bash
npm run preview
# 打开 http://localhost:8787/preview
npm test
```

`/preview` 只模拟按钮效果，明确显示未发送通知。正式卡片不会回退到模拟发送。网站根路径不会列出朋友或卡片。

## 最后配置：Cloudflare

```bash
npm install
npx wrangler login
npx wrangler d1 create qr-greeting-card
```

把返回的 database_id 填入 `wrangler.jsonc`，再执行：

```bash
npx wrangler d1 migrations apply qr-greeting-card --remote
```

确认 llmat.dev 的 DNS zone 在当前 Cloudflare 账号内且状态 Active；若域名在其他注册商购买，可继续保留注册商，只需按 Cloudflare 指示配置 nameserver。
在 `wrangler.jsonc` 启用已注释的 `routes`：

```json
"routes": [{"pattern":"card.llmat.dev","custom_domain":true}]
```

只绑定 card 子域名，不修改主站。若该子域名已有服务，先选择其他子域名。Cloudflare Custom Domain 负责 HTTPS 和对应 DNS。数据库保存卡片映射，不要删除或重建它；改网页、祝福不会改变既有链接。

## 最后配置：Telegram Bot

1. Telegram 搜索官方 @BotFather，执行 `/newbot`，按提示填写名称和以 bot 结尾的唯一用户名。
2. 保存 BotFather 给出的 Token。在 Telegram 打开自己的新 Bot，点击 Start 或发送 `/start`。
3. 在本机终端安全输入 Token，再获取自己的 chat ID。不要将 Token 写入仓库、聊天或截图。以下 Python 脚本不回显 Token，也不会把 Token 放进 shell 历史：

```bash
python3 - <<'PY'
import getpass, json, urllib.request
secret = getpass.getpass('Bot token: ')
try:
    with urllib.request.urlopen('https://api.telegram.org/bot'+secret+'/getUpdates', timeout=15) as r:
        data = json.load(r)
    chats = {m['message']['chat']['id'] for m in data.get('result',[]) if m.get('message',{}).get('chat',{}).get('type') == 'private'}
    print('Private chat IDs:', sorted(chats))
except Exception:
    print('获取失败，请检查 Token 和网络后重试。')
PY
```

如果没有结果，给 Bot 再发一次消息后重试；多个 ID 时先核对自己的对话，不要猜测。

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npm run deploy
```

两条 secret 命令会分别提示输入值。密钥仅在后端使用。无需 Telegram webhook，也无需运行轮询进程。

## 为朋友生成卡片

```bash
npm run card -- '朋友的私密备注' '生日快乐！有些小心意，想留给你随时领取。'
```

脚本生成 128-bit 随机编号、独立链接、私有 JSON 记录和 SQL 文件，并打印导入命令。运行打印的 `wrangler d1 execute ... --remote --file=...` 命令后生效。`private/` 已被 Git 忽略；请自行备份，D1 是线上映射的来源。

卡片没有自动到期或次数上限。链接属于持有者凭证：转发链接后，仍以原卡备注通知，不验证实际点击者。不要公开真实二维码或链接。

修改已有卡片时在 Cloudflare D1 控制台更新对应行的 greeting 或 friend_label，保留 id。不要把真实卡片映射提交到公开仓库。

上线且实测后再制作正式二维码，可在本机生成，不依赖动态二维码网站：

```bash
python3 -m pip install 'qrcode[pil]'
python3 - <<'PY'
import json, pathlib, qrcode
for p in pathlib.Path('private').glob('*.json'):
    card=json.loads(p.read_text())
    qr=qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M,box_size=12,border=4)
    qr.add_data(card['url']); qr.make(fit=True)
    qr.make_image(fill_color='black',back_color='white').save(p.with_suffix('.png'))
PY
```

## GitHub

仓库：`likefudan/greeting-card`（公开）。代码不含真实朋友记录和密钥。GitHub Actions 已配置自动测试。

```bash
git clone https://github.com/likefudan/greeting-card.git
cd greeting-card
npm ci
```

## 验证范围与限制

`npm test` 使用真实内存 SQLite 适配 D1 接口，覆盖并发防重、卡片隔离、私密备注、错误处理、跨域请求、缺失密钥及重复使用；不是 Cloudflare 生产环境测试。

Telegram 明确拒绝时立即释放冷却，允许重试；若网络超时，可能已送达，因此保留短暂冷却，页面明确提示无法确认，不自动重发。Telegram 没有此场景的 exactly-once 保证。

最后仍需用真实 Bot 在 Cloudflare 实测：两张卡分别触发通知、连续点击仅一次、等待 60 秒后可再发、扫码对应正确朋友、手机 Telegram 通知已启用。

依赖使用 Wrangler 4.x，已提交 package-lock.json。使用 `npm ci` 安装固定版本。上线前可运行 `npx wrangler deploy --dry-run` 验证 Cloudflare 打包配置。本项目尚未提供管理后台或自动部署，防止意外覆盖已有域名配置。

参考：
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- https://developers.cloudflare.com/d1/
- https://core.telegram.org/bots/api#sendmessage

## 网页管理

地址：`https://card.llmat.dev/admin`。管理密码由 GitHub 仓库 Secret `ADMIN_PASSWORD` 提供，每次部署都会同步到 Cloudflare Worker Secret 并验证登录。不要将密码写入代码或公开日志。更新 GitHub Secret 后重新运行部署即可更换密码，旧登录会话随之失效。

登录后输入收卡人名字，设置 1～6 个自定义按钮，选择 10 种样式之一，即可生成专属贺卡链接和 SVG 二维码。二维码在自有后端生成，不使用外部二维码服务。管理页可以复制链接、打开贺卡、下载二维码，并分页查找以前创建的卡片。名字也会出现在贺卡祝福和 Telegram 通知中。列表展示所有贺卡，可手动删除；删除后原链接和二维码立即失效。同名可创建多张独立卡；同一次提交重试复用原卡。

登录有效期 7 天，Cookie 使用 Secure、HttpOnly、SameSite=Strict；管理 API 校验身份，写请求检查同源。更换 Cloudflare Secret `ADMIN_PASSWORD` 后旧会话失效。请使用足够长且独立的管理密码，并保存在密码管理器中。
