使用说明：

1. 在 Cloudflare 仪表盘创建一个新的 Worker 并部署上述代码。
2. 创建一个 KV 命名空间（例如 DDNS_VARIABLES），并在 Worker 设置中绑定它。
3. 在 KV 命名空间中设置以下变量：

   - `API_KEY`: Cloudflare API 密钥
   - `ZONE_ID`: Cloudflare 域名 ID
   - `DOMAIN`: 要更新的域名
   - `PASSWORD`: 访问密码
   - `IPV4_API`: IPv4 地址列表，用逗号或换行分隔
   - `IPV6_API`: IPv6 地址列表，用逗号或换行分隔

4. 通过访问 `https://your-worker.subdomain.workers.dev/?password=your_password` 来触发 DNS 更新。
5. 通过访问 `https://your-worker.subdomain.workers.dev/api/v4` 或 `https://your-worker.subdomain.workers.dev/api/v6` 来获取 IP 列表。

变量解释：

- `API_KEY`: Cloudflare API 密钥，用于授权 API 请求。
- `ZONE_ID`: Cloudflare 域名 ID，用于指定要操作的域名。
- `DOMAIN`: 要更新的具体域名。
- `PASSWORD`: 访问密码，用于防止未授权的更新。
- `IPV4_API`: IPv4 地址列表，可以包含多个 IP，用逗号或换行分隔。
- `IPV6_API`: IPv6 地址列表，可以包含多个 IP，用逗号或换行分隔。

这个脚本会：
1. 支持为域名绑定多个 IPv4 和 IPv6 地址。
2. 允许通过 Cloudflare 仪表盘设置所有必要的变量。
3. 提供一个链接用于触发 DNS 更新。
4. 提供 API 端点来获取配置的 IPv4 和 IPv6 地址列表。
