export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      switch (pathname) {
        case '/update':
          return request.method === 'POST' ? await handleManualUpdate(env) : methodNotAllowed();
        case '/history':
          return await getUpdateHistory(env);
        default:
          if (!await checkPassword(url, env)) {
            return new Response('访问被拒绝', { status: 403, headers: getResponseHeaders() });
          }
          return await handleRequest(env);
      }
    } catch (error) {
      return handleError(error);
    }
  },

  async scheduled(event, env, ctx) {
    try {
      await handleRequest(env);
    } catch (error) {
      console.error('Scheduled task failed:', error);
    }
  }
};

async function checkPassword(url, env) {
  const providedPassword = url.searchParams.get('password');
  return !env.PASSWORD || providedPassword === env.PASSWORD;
}

async function handleRequest(env) {
  const config = loadEnvironmentVariables(env);
  validateRequiredVariables(config);

  const ips = await getIPs(config.CUSTOM_IPS, config.IP_API);
  if (ips.length === 0) {
    throw new Error('无法获取有效的 IP 地址');
  }

  await deleteExistingDNSRecords(config);
  const updateResults = await updateDNSRecords(ips, config);
  const { successCount, failureCount, updatedIPs } = processUpdateResults(updateResults);

  const currentTime = getCurrentTime();
  const updateStatus = getUpdateStatus(updatedIPs);
  const ipLocationInfo = await getIPLocationInfo(updatedIPs);

  await saveUpdateHistory(env, currentTime, successCount, failureCount, updatedIPs, ipLocationInfo);

  return generateResponse(config, ips, successCount, failureCount, currentTime, updateStatus, ipLocationInfo);
}

async function handleManualUpdate(env) {
  return handleRequest(env);
}

async function getUpdateHistory(env) {
  const history = await env.UPDATE_HISTORY.list();
  const historyItems = await Promise.all(history.keys.map(async (key) => {
    const item = await env.UPDATE_HISTORY.get(key);
    return item ? JSON.parse(item) : null;
  }));
  return new Response(generateHistoryHtml(historyItems), { headers: getResponseHeaders() });
}

function loadEnvironmentVariables(env) {
  return {
    API_TOKEN: env.API_TOKEN,
    ZONE_ID: env.ZONE_ID,
    DOMAIN: env.DOMAIN,
    CUSTOM_IPS: env.CUSTOM_IPS || '',
    IP_API: env.IP_API || '',
    EMAIL: env.EMAIL || ''
  };
}

function validateRequiredVariables({ API_TOKEN, ZONE_ID, DOMAIN, EMAIL, IP_API }) {
  if (!API_TOKEN || !ZONE_ID || !DOMAIN || !EMAIL || !IP_API) {
    throw new Error('必要的变量未设置。请检查 API_TOKEN, ZONE_ID, DOMAIN, EMAIL 和 IP_API。');
  }
}

async function getIPs(CUSTOM_IPS, IP_API) {
  let ips = [];
  if (IP_API) {
    try {
      const response = await fetchWithRetry(IP_API);
      const text = await response.text();
      ips = text.trim().split(/[,\n]+/).map(ip => ip.trim());
      console.log(`从 IP_API 获取的 IP 地址: ${ips.join(', ')}`);
    } catch (error) {
      console.error('从 IP_API 获取 IP 地址失败:', error);
    }
  }
  if (CUSTOM_IPS) {
    ips = ips.concat(CUSTOM_IPS.split(/[,\n]+/).map(ip => ip.trim()));
    console.log(`从 CUSTOM_IPS 获取的 IP 地址: ${ips.join(', ')}`);
  }
  return [...new Set(ips)];
}

async function updateDNSRecords(ips, { API_TOKEN, ZONE_ID, DOMAIN }) {
  const resolvedIPs = await Promise.all(ips.map(async (ip) => {
    if (isValidIP(ip)) {
      return { original: ip, resolved: ip };
    } else if (isValidDomain(ip)) {
      try {
        const resolvedIP = await resolveDomain(ip);
        return { original: ip, resolved: resolvedIP };
      } catch (error) {
        console.error(`解析域名 ${ip} 失败:`, error);
        return null;
      }
    } else {
      console.error(`无效的 IP 或域名: ${ip}`);
      return null;
    }
  }));

  const validResolvedIPs = resolvedIPs.filter(item => item !== null);

  return Promise.all(validResolvedIPs.map(item =>
    createDNSRecord(API_TOKEN, ZONE_ID, DOMAIN, item.resolved.includes(':') ? 'AAAA' : 'A', item.resolved)
  ));
}

async function resolveDomain(domain) {
  const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=A`, {
    headers: { 'Accept': 'application/dns-json' }
  });
  const data = await response.json();
  if (data.Answer && data.Answer.length > 0) {
    return data.Answer[0].data;
  }
  throw new Error(`无法解析域名 ${domain}`);
}

async function deleteExistingDNSRecords({ API_TOKEN, ZONE_ID, DOMAIN, EMAIL }) {
  console.log(`删除 ${DOMAIN} 的现有 A/AAAA 记录`);
  const listUrl = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?type=A,AAAA&name=${DOMAIN}`;
  const response = await fetchWithRetry(listUrl, {
    method: 'GET',
    headers: getCloudflareHeaders(API_TOKEN, EMAIL)
  });

  if (!response.ok) {
    throw new Error(`获取 ${DOMAIN} 的 DNS 记录失败: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  await Promise.all(data.result.map(record => deleteDNSRecord(API_TOKEN, ZONE_ID, record.id, EMAIL, DOMAIN)));
}

async function deleteDNSRecord(API_TOKEN, ZONE_ID, recordId, EMAIL, DOMAIN) {
  const deleteUrl = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${recordId}`;
  const deleteResponse = await fetchWithRetry(deleteUrl, {
    method: 'DELETE',
    headers: getCloudflareHeaders(API_TOKEN, EMAIL)
  });

  if (!deleteResponse.ok) {
    throw new Error(`删除 ${DOMAIN} 的记录失败: ${deleteResponse.status} ${deleteResponse.statusText}`);
  }
}

async function createDNSRecord(API_TOKEN, ZONE_ID, DOMAIN, type, content) {
  const createUrl = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records`;
  const createResponse = await fetchWithRetry(createUrl, {
    method: 'POST',
    headers: getCloudflareHeaders(API_TOKEN),
    body: JSON.stringify({ type, name: DOMAIN, content, ttl: 1, proxied: false })
  });

  if (!createResponse.ok) {
    const errorData = await createResponse.json();
    throw new Error(`创建 ${type} 记录 ${content} 失败: ${errorData.errors[0].message}`);
  }

  const createData = await createResponse.json();
  return { success: createData.success, content };
}

async function fetchWithRetry(url, options = {}, retryCount = 3) {
  for (let i = 0; i < retryCount; i++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      console.error(`请求 ${url} 失败, 重试 ${i + 1}/${retryCount}: ${error.message}`);
      if (i === retryCount - 1) throw error;
    }
  }
}

function getCloudflareHeaders(API_TOKEN, EMAIL = '') {
  const headers = {
    'Authorization': `Bearer ${API_TOKEN}`,
    'Content-Type': 'application/json'
  };
  if (EMAIL) headers['X-Auth-Email'] = EMAIL;
  return headers;
}

function getCurrentTime() {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

function getUpdateStatus(updatedIPs) {
  return updatedIPs.length > 0
    ? `更新成功，共更新了 ${updatedIPs.length} 个 IP: ${updatedIPs.join(', ')}`
    : '没有 IP 被更新';
}

function getResponseHeaders() {
  return {
    'Content-Type': 'text/html;charset=UTF-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
}

function processUpdateResults(updateResults) {
  const successCount = updateResults.filter(r => r.success).length;
  const failureCount = updateResults.length - successCount;
  const updatedIPs = updateResults.filter(r => r.success).map(r => r.content);
  return { successCount, failureCount, updatedIPs };
}

async function generateResponse(config, ips, successCount, failureCount, currentTime, updateStatus, ipLocationInfo) {
  const responseHtml = generateResponseHtml(config, ips, successCount, failureCount, currentTime, updateStatus, ipLocationInfo);
  return new Response(responseHtml, { headers: getResponseHeaders() });
}

function generateResponseHtml(config, ips, successCount, failureCount, currentTime, updateStatus, ipLocationInfo) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Cloudflare 域名配置</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      text-align: center;
      color: #333;
    }
    h2 {
      color: #444;
    }
    .section {
      background-color: white;
      border-radius: 5px;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
      padding: 20px;
      margin-bottom: 20px;
    }
    .info-item {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .info-item span {
      font-weight: bold;
    }
    .info-item p {
      margin: 0;
    }
    .success-count,
    .failure-count {
      font-weight: bold;
    }
    .log-item {
      margin-bottom: 5px;
    }
    .button {
      background-color: #4CAF50;
      border: none;
      color: white;
      padding: 15px 32px;
      text-align: center;
      text-decoration: none;
      display: inline-block;
      font-size: 16px;
      margin: 4px 2px;
      cursor: pointer;
    }
    .button:hover {
      background-color: #45a049;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Cloudflare 域名配置</h1>

    <!-- 添加手动更新按钮 -->
    <div class="section">
      <h2>手动操作</h2>
      <button class="button" onclick="manualUpdate()">手动更新DNS记录</button>
      <a href="/history" class="button">查看更新历史</a>
    </div>

    <div class="section">
      <h2>Cloudflare 域名配置</h2>
      <div class="info-item">
        <span>域名:</span>
        <p>${config.DOMAIN}</p>
      </div>
      <div class="info-item">
        <span>邮箱:</span>
        <p>${maskEmail(config.EMAIL)}</p>
      </div>
      <div class="info-item">
        <span>区域 ID:</span>
        <p>${maskZoneID(config.ZONE_ID)}</p>
      </div>
      <div class="info-item">
        <span>API 令牌:</span>
        <p>${maskAPIToken(config.API_TOKEN)}</p>
      </div>
    </div>
    <div class="section">
      <h2>配置信息</h2>
      <div class="info-item">
        <span>DoH:</span>
        <p>https://cloudflare-dns.com/dns-query</p>
      </div>
      <div class="info-item">
        <span>IP_API:</span>
        <p>${config.IP_API}</p>
      </div>
    </div>
    <div class="section">
      <h2>结果</h2>
      <div class="info-item">
        <span>CUSTOM_IPS:</span>
        <p>${config.CUSTOM_IPS.split('\n').join('<br>')}</p>
      </div>
      <div class="info-item">
        <span>IP_API:</span>
        <p>${ips.join('<br>')}</p>
      </div>
    </div>
    <div class="section">
      <h2>更新结果</h2>
      <div class="info-item">
        <span>更新成功:</span>
        <p class="success-count">${successCount}</p>
      </div>
      <div class="info-item">
        <span>更新失败:</span>
        <p class="failure-count">${failureCount}</p>
      </div>
    </div>
    <div class="section">
      <h2>IP 地理位置信息</h2>
      ${ipLocationInfo.map(info => `
        <div class="info-item">
          <span>IP:</span>
          <p>${info.ip}</p>
        </div>
        <div class="info-item">
          <span>位置:</span>
          <p>${info.location}</p>
        </div>
      `).join('')}
    </div>
    <div class="section">
      <h2>执行日志</h2>
      <div class="log-item">${currentTime} 变量加载完成</div>
      <div class="log-item">${currentTime} 域名解析完成</div>
      <div class="log-item">${currentTime} 删除 ${config.DOMAIN} 的现有 A/AAAA 记录</div>
      <div class="log-item">${currentTime} API获取 A/AAAA记录${ips.join(', ')}</div>
      <div class="log-item">${currentTime} API调用完成</div>
      <div class="log-item">${currentTime} IP去重完成</div>
      <div class="log-item">${currentTime} ${updateStatus}</div>
    </div>
  </div>

  <script>
    function manualUpdate() {
      fetch('/update', { method: 'POST' })
        .then(response => response.text())
        .then(result => {
          alert(result);
          location.reload();
        })
        .catch(error => alert('更新失败: ' + error));
    }
  </script>
</body>
</html>
`;
}

function generateHistoryHtml(historyItems) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>更新历史记录</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      text-align: center;
      color: #333;
    }
    .history-item {
      background-color: white;
      border-radius: 5px;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
      padding: 20px;
      margin-bottom: 20px;
    }
    .history-item h2 {
      margin-top: 0;
    }
    .info-item {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .info-item span {
      font-weight: bold;
    }
    .info-item p {
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>更新历史记录</h1>
    ${historyItems.filter(item => item !== null && item !== undefined).map(item => `
      <div class="history-item">
        <h2>${item.timestamp}</h2>
        <div class="info-item">
          <span>更新成功:</span>
          <p>${item.successCount}</p>
        </div>
        <div class="info-item">
          <span>更新失败:</span>
          <p>${item.failureCount}</p>
        </div>
        <div class="info-item">
          <span>更新的 IP 地址:</span>
          <p>${item.updatedIPs.join('<br>')}</p>
        </div>
        ${item.ipLocationInfo.map(info => `
          <div class="info-item">
            <span>IP:</span>
            <p>${info.ip}</p>
          </div>
          <div class="info-item">
            <span>位置:</span>
            <p>${info.location}</p>
          </div>
        `).join('')}
      </div>
    `).join('')}
  </div>
</body>
</html>
`;
}

function maskZoneID(zoneID) {
  return maskString(zoneID, 3, 6);
}

function maskAPIToken(apiToken) {
  return maskString(apiToken, 3, 6);
}

function maskEmail(email) {
  if (!email) return '';
  const [username, domain] = email.split('@');
  return username.charAt(0) + '*'.repeat(username.length - 1) + '@' + domain;
}

function maskString(str, startLength, endLength) {
  if (str.length <= 8) return str;
  return str.substr(0, startLength) + '*'.repeat(str.length - startLength - endLength) + str.substr(-endLength);
}

async function getIPLocationInfo(ips) {
  return Promise.all(ips.map(async (ip) => {
    try {
      const response = await fetchWithRetry(`https://ipinfo.io/${ip}/json`, {}, 3);
      const data = await response.json();
      return {
        ip,
        location: `${data.city}, ${data.region}, ${data.country}`
      };
    } catch (error) {
      console.error(`获取 ${ip} 的地理位置信息失败:`, error);
      return {
        ip,
        location: '未知'
      };
    }
  }));
}

function handleError(error) {
  console.error('操作失败:', error);
  return new Response(`操作失败: ${error.message}`, {
    status: 500,
    headers: getResponseHeaders()
  });
}

function methodNotAllowed() {
  return new Response('Method Not Allowed', { status: 405, headers: getResponseHeaders() });
}

async function saveUpdateHistory(env, currentTime, successCount, failureCount, updatedIPs, ipLocationInfo) {
  const historyItem = { timestamp: currentTime, successCount, failureCount, updatedIPs, ipLocationInfo };
  await env.UPDATE_HISTORY.put(currentTime, JSON.stringify(historyItem));
}

function isValidIP(ip) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || /^[a-fA-F0-9:]+$/.test(ip);
}

function isValidDomain(domain) {
  const domainRegex = /^(?!:\/\/)([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/;
  return domainRegex.test(domain);
}
