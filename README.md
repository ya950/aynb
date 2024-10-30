使用说明:

1. 将代码部署到 Cloudflare Workers 平台上。
2. 在 Cloudflare Workers 的环境变量中设置以下变量:
   - `API_TOKEN`: Cloudflare API 令牌
   - `ZONE_ID`: Cloudflare 区域 ID
   - `DOMAIN`: 要更新的域名
   - `CUSTOM_IPS`: (可选) 自定义 IP 地址列表,以逗号或换行符分隔，支持绑定IPV4,IPV6,域名[172.67.129.67，2606:4700:3036::ac43:8143，sy.us.com]
   - `PASSWORD`: (可选) 访问密码,用于限制对该 Workers 的访问
   - `IP_API`: (可选) 获取 IP 地址的 API 地址列表,以逗号分隔。例如 `https://raw.githubusercontent.com/heads/main/bestproxy.txt`
   - `EMAIL`: Cloudflare 账户邮箱
   - KV空间绑定
   - UPDATE_HISTORY: 用于存储更新历史的 KV 存储对象。
     创建一个KV空间命名为UPDATE_HISTORY
     绑定刚创建的KV空间UPDATE_HISTORY，变量名称也为UPDATE_HISTORY
3. 访问 Workers 的 URL 即可触发 DNS 记录的更新。
   例如：https://fd2.1990909.xyz/?password=sd123
         https://【你的自定义域】/?password=【你的密码】
5. 如果设置了 `TGTOKEN` 和 `TGID` 变量,Workers 将在 DNS 记录更新完成后向指定的 Telegram 群组发送通知。
6. 您还可以设置定期执行 DNS 记录更新的 Cron 任务。
   你可以使用标准的 Cron 表达式格式。例如，*/5 * * * * 表示每 5 分钟运行一次。
