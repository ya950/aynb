使用说明:

1. 将代码部署到 Cloudflare Workers 平台上。
2. 在 Cloudflare Workers 的环境变量中设置以下变量:
   - `API_TOKEN`: Cloudflare API 令牌
   - `ZONE_ID`: Cloudflare 区域 ID
   - `DOMAIN`: 要更新的域名
   - `CUSTOM_IPS`: (可选) 自定义 IP 地址列表,以逗号或换行符分隔
   - `PASSWORD`: (可选) 访问密码,用于限制对该 Workers 的访问
   - `IP_API`: (可选) 获取 IP 地址的 API 地址列表,以逗号分隔。默认为 `https://raw.githubusercontent.com/ymyuuu/IPDB/refs/heads/main/bestproxy.txt`
   - `EMAIL`: Cloudflare 账户邮箱
   - `TGTOKEN`: (可选) Telegram 机器人 Token
   - `TGID`: (可选) Telegram 群组 ID
3. 访问 Workers 的 URL 即可触发 DNS 记录的更新。
   例如：https://fd1.1990909.xyz/?password=sd123
         https://【你的自定义域】/?password=【你的密码】
5. 如果设置了 `TGTOKEN` 和 `TGID` 变量,Workers 将在 DNS 记录更新完成后向指定的 Telegram 群组发送通知。
6. 您还可以设置定期执行 DNS 记录更新的 Cron 任务。

变量使用说明:

- `API_TOKEN`: Cloudflare API 令牌,用于认证 Cloudflare API 请求。
- `ZONE_ID`: Cloudflare 区域 ID,用于指定要更新 DNS 记录的区域。
- `DOMAIN`: 要更新的域名。
- `CUSTOM_IPS`: (可选) 自定义 IP 地址列表,以逗号或换行符分隔。如果设置了该变量,系统将优先使用这些 IP 地址,而不是从 `IP_API` 获取。
- `PASSWORD`: (可选) 访问密码,用于限制对该 Workers 的访问。如果设置了密码,访问 Workers 时需要在 URL 中添加 `?password=<PASSWORD>` 参数。
- `IP_API`: (可选) 获取 IP 地址的 API 地址列表,以逗号分隔。默认为 `https://raw.githubusercontent.com/ymyuuu/IPDB/refs/heads/main/bestproxy.txt`。如果 `CUSTOM_IPS` 未设置,系统将从这些 API 地址获取 IP 地址。
- `EMAIL`: Cloudflare 账户邮箱,用于认证 Cloudflare API 请求。
- `TGTOKEN`: (可选) Telegram 机器人 Token,用于在 DNS 记录更新完成后向 Telegram 群组发送通知。
- `TGID`: (可选) Telegram 群组 ID,用于接收 DNS 记录更新通知。

如果您有任何其他问题,欢迎随时告知我。
