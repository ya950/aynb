**部署步骤**:

1. 登录到您的 Cloudflare 控制台,进入 "Workers" 页面。

2. 创建一个新的 Worker,并将 `Workers.js` 文件中的代码复制粘贴到 Worker 的编辑器中。

3. 在 "Settings" > "Variables" 中,添加以下环境变量:
   - `API_TOKEN`: 您的 Cloudflare API 令牌。
   - `ZONE_ID`: 您要更新 DNS 记录的域名对应的 Cloudflare 区域 ID。
   - `DOMAIN`: 您要更新 DNS 记录的域名。
   - `CUSTOM_IPS`: (可选) 如果您想使用自定义的 IP 地址列表,请在这里设置。多个 IP 地址之间可以用逗号或换行符分隔。
   - `PASSWORD`: 设置一个访问密码,访问 Worker 时需要在 URL 中提供。
   - `EMAIL`: 您的 Cloudflare 账户邮箱。

4. 保存并部署您的 Cloudflare Worker。

**变量说明**:

- `API_TOKEN`: 您的 Cloudflare API 令牌,用于认证 Cloudflare API 调用。
- `ZONE_ID`: 您要更新 DNS 记录的域名对应的 Cloudflare 区域 ID。
- `DOMAIN`: 您要更新 DNS 记录的域名。
- `CUSTOM_IPS`: (可选) 如果您想使用自定义的 IP 地址列表,请在这里设置。多个 IP 地址之间可以用逗号或换行符分隔。
- `PASSWORD`: 设置一个访问密码,访问 Worker 时需要在 URL 中提供。
- `EMAIL`: 您的 Cloudflare 账户邮箱,用于认证 Cloudflare API 调用。

**支持的 DNS 记录类型**:

- `A`: IPv4 地址记录
- `AAAA`: IPv6 地址记录

您可以在 `updateDNSRecords` 函数中添加对其他类型 DNS 记录的支持,比如 `CNAME`、`MX` 等。

**访问 Worker**:

1. 访问您 Cloudflare Worker 的 URL,格式为 `https://your-worker.your-subdomain.workers.dev?password=your_password`。
2. 将 `your-worker` 替换为您的 Cloudflare Worker 的名称,`your-subdomain` 替换为您的 Cloudflare 子域名。
3. `your_password` 替换为您在 Cloudflare Workers 的 "Settings" > "Variables" 中设置的 `PASSWORD` 变量的值。

**日志和错误处理**:

您可以在 Cloudflare Workers 的 "Logs" 页面查看 Worker 的运行日志,其中包含了 IP 地址获取、DNS 记录删除和创建等操作的详细信息。

如果在运行过程中出现任何错误,错误信息也会记录在日志中,方便您进行问题诊断和解决。
