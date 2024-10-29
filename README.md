部署步骤:

1. 将此代码复制并粘贴到 Cloudflare Workers 的编辑器中,替换所有现有代码。

2. 在 Cloudflare Workers 的 "Settings" > "Variables" 中,添加以下环境变量:
   - `DOMAIN`: 您要更新的域名
   - `CUSTOM_IPS`: (可选) 如果您想使用自定义 IP 列表
   - `PASSWORD`: 设置一个访问密码
   - `IP_API`: (可选) 自定义 IP API 地址
   - `API_TOKEN`: 您的 Cloudflare API 令牌
   - `ZONE_ID`: 您的域名的 Cloudflare 区域 ID
   - `EMAIL`: 您的 Cloudflare 账户邮箱

3. 保存并部署您的 Cloudflare Worker。

4. 访问 Worker 时,需要在 URL 中添加密码参数,例如: `https://your-worker.your-subdomain.workers.dev/?password=your_password`
