使用说明
1. 可以绑定多个 IPv4 和 IPv6 地址,并且接口整合在一起。
2. 提供了一个 IP API 接口连接。
3. 可以在 Cloudflare 仪表盘上设置变量。
4. 可以通过链接访问更新 DNS 记录。
5. 支持在仪表盘设置自定义 IP 列表。

变量解释:

1. `API_KEY`: Cloudflare API 密钥,用于授权 DNS 记录更新。
2. `ZONE_ID`: Cloudflare 域名 ID,用于定位要操作的域名。
3. `DOMAIN`: 要更新的域名。
4. `PASSWORD`: 访问密码,用于验证更新请求。
5. `IP_API`: IP API 的 URL,用于获取当前 IP 地址(如果没有设置自定义 IP 列表)。
6. `CUSTOM_IP_LIST`: 自定义 IP 列表,可以包含 IPv4 和 IPv6 地址,用逗号或换行分隔。

使用方法:

1. 在 Cloudflare 仪表盘创建一个新的 Worker 并部署上述代码。
2. 创建一个 KV 命名空间(例如 DDNS_VARIABLES),并在 Worker 设置中绑定它。
3. 在 KV 命名空间中设置上述变量。
4. 访问 `https://your-worker.subdomain.workers.dev/?password=your_password` 来触发 DNS 更新。
5. 访问 `https://your-worker.subdomain.workers.dev/api` 来获取当前配置的 IP 列表。

这个脚本会优先使用 `CUSTOM_IP_LIST` 中的 IP 地址。如果 `CUSTOM_IP_LIST` 为空,它会从 `IP_API` 获取 IP 地址。这样,你可以灵活地选择使用自定义 IP 列表或者动态获取 IP 地址。

如果你有任何其他问题或需要进一步的解释,请随时告诉我。
