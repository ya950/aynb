export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 检查密码,但对 /update 和 /history 路径不做密码检查
    const providedPassword = url.searchParams.get('password');
    if (pathname !== '/update' && pathname !== '/history' && env.PASSWORD && providedPassword !== env.PASSWORD) {
      return new Response('访问被拒绝', {
        status: 403,
        headers: getResponseHeaders()
      });
    }

    if (pathname === '/update' && request.method === 'POST') {
      return await handleManualUpdate(request, env);
    } else if (pathname === '/history') {
      return await getUpdateHistory(env);
    } else {
      return await handleRequest(request, env);
    }
  },

  async scheduled(event, env, ctx) {
    await handleRequest(event, env);
  }
};

async function handleRequest(request, env) {
  const { API_TOKEN, ZONE_ID, DOMAIN, CUSTOM_IPS, IP_API, EMAIL } = loadEnvironmentVariables(env);

  try {
    validateRequiredVariables(API_TOKEN, ZONE_ID, DOMAIN, EMAIL, IP_API);

    let ips = await getIPs(CUSTOM_IPS, IP_API);
    if (ips.length === 0) {
      throw new Error('无法从配置的 IP_API 获取有效的 IP 地址');
    }

    // 删除现有的 A/AAAA 记录
    await deleteExistingDNSRecords(API_TOKEN, ZONE_ID, DOMAIN, EMAIL);

    let updateResults = await updateDNSRecords(ips, API_TOKEN, ZONE_ID, DOMAIN);
    const successCount = updateResults.filter(r => r.success).length;
    const failureCount = updateResults.filter(r => !r.success).length;

    const currentTime = getCurrentTime();
    const updatedIPs = updateResults.filter(r => r.success).map(r => r.content);
    const updateStatus = getUpdateStatus(updatedIPs);

    // 获取每个IP地址的地理位置信息
    const ipLocationInfo = await getIPLocationInfo(updatedIPs);

    // 保存更新历史记录
    await saveUpdateHistory(env, currentTime, successCount, failureCount, updatedIPs, ipLocationInfo);

    const response = await generateResponse(DOMAIN, EMAIL, ZONE_ID, API_TOKEN, ips, IP_API, CUSTOM_IPS, successCount, failureCount, currentTime, updateStatus, ipLocationInfo);

    return response;
  } catch (error) {
    const errorMessage = `更新失败: ${error.message}`;
    logError(errorMessage, error);
    return new Response(errorMessage, {
      status: 500,
      headers: getResponseHeaders()
    });
  }
}

async function handleManualUpdate(request, env) {
  const { API_TOKEN, ZONE_ID, DOMAIN, CUSTOM_IPS, IP_API, EMAIL } = loadEnvironmentVariables(env);

  try {
    validateRequiredVariables(API_TOKEN, ZONE_ID, DOMAIN, EMAIL, IP_API);

    let ips = await getIPs(CUSTOM_IPS, IP_API);
    if (ips.length === 0) {
      throw new Error('无法从配置的 IP_API 获取有效的 IP 地址');
    }

    // 删除现有的 A/AAAA 记录
    await deleteExistingDNSRecords(API_TOKEN, ZONE_ID, DOMAIN, EMAIL);

    let updateResults = await updateDNSRecords(ips, API_TOKEN, ZONE_ID, DOMAIN);
    const successCount = updateResults.filter(r => r.success).length;
    const failureCount = updateResults.filter(r => !r.success).length;

    const currentTime = getCurrentTime();
    const updatedIPs = updateResults.filter(r => r.success).map(r => r.content);
    const updateStatus = getUpdateStatus(updatedIPs);

    // 获取每个IP地址的地理位置信息
    const ipLocationInfo = await getIPLocationInfo(updatedIPs);

    // 保存更新历史记录
    await saveUpdateHistory(env, currentTime, successCount, failureCount, updatedIPs, ipLocationInfo);

    const response = await generateResponse(DOMAIN, EMAIL, ZONE_ID, API_TOKEN, ips, IP_API, CUSTOM_IPS, successCount, failureCount, currentTime, updateStatus, ipLocationInfo);

    return response;
  } catch (error) {
    const errorMessage = `更新失败: ${error.message}`;
    logError(errorMessage, error);
    return new Response(errorMessage, {
      status: 500,
      headers: getResponseHeaders()
    });
  }
}

async function getUpdateHistory(env) {
  const history = await env.UPDATE_HISTORY.list();
  const historyItems = await Promise.all(history.keys.map(async (key) => {
    const value = await env.UPDATE_HISTORY.get(key);
    return JSON.parse(value);
  }));

  const responseHtml = generateHistoryHtml(historyItems);

  return new Response(responseHtml, {
    headers: getResponseHeaders()
  });
}

async function saveUpdateHistory(env, currentTime, successCount, failureCount, updatedIPs, ipLocationInfo) {
  const historyItem = {
    timestamp: currentTime,
    successCount,
    failureCount,
    updatedIPs,
    ipLocationInfo
  };

  await env.UPDATE_HISTORY.put(currentTime, JSON.stringify(historyItem));
}

function loadEnvironmentVariables(env) {
  return {
    API_TOKEN: env.API_TOKEN,
    ZONE_ID: env.ZONE_ID,
    DOMAIN: env.DOMAIN,
    CUSTOM_IPS: env.CUSTOM_IPS || '',
    IP_API: env.IP_API || 'https://raw.githubusercontent.com/ymyuuu/IPDB/refs/heads/main/bestproxy.txt',
    PASSWORD: env.PASSWORD || '',
    EMAIL: env.EMAIL || ''
  };
}

function validateRequiredVariables(API_TOKEN, ZONE_ID, DOMAIN, EMAIL, IP_API) {
  if (!API_TOKEN || !ZONE_ID || !DOMAIN || !EMAIL || !IP_API) {
    throw new Error('必要的变量未设置。请检查 API_TOKEN, ZONE_ID, DOMAIN, EMAIL 和 IP_API。');
  }
}

async function getIPs(CUSTOM_IPS, IP_API) {
  let ips = [];
  if (IP_API) {
    try {
      logInfo(`${getCurrentTime()} 从 IP_API 获取 IP 地址`);
      const response = await fetchWithRetry(IP_API, {}, 3);
      const text = await response.text();
      ips = text.trim().split(/[,\n]+/).map(ip => ip.trim()).filter(isValidIP);
      logInfo(`从 IP_API 获取的 IP 地址: ${ips.join(', ')}`);
    } catch (error) {
      logError('从 IP_API 获取 IP 地址失败:', error);
      throw new Error('无法从 IP_API 获取有效的 IP 地址: ' + error.message);
    }
  }
  if (CUSTOM_IPS) {
    ips = ips.concat(CUSTOM_IPS.split(/[,\n]+/).map(ip => ip.trim()).filter(isValidIP));
    logInfo(`从 CUSTOM_IPS 获取的 IP 地址: ${ips.join(', ')}`);
  }
  // 对 IP 地址进行去重
  ips = [...new Set(ips)];
  logInfo(`最终用于更新的IP地址: ${ips.join(', ')}`);
  return ips;
}

function isValidIP(ip) {
  // 简单的 IP 地址验证
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || /^[a-fA-F0-9:]+$/.test(ip);
}

async function deleteExistingDNSRecords(API_TOKEN, ZONE_ID, DOMAIN, EMAIL) {
  logInfo(`${getCurrentTime()} 删除 ${DOMAIN} 的现有 A/AAAA 记录`);

  let listUrl = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?type=A,AAAA&name=${DOMAIN}`;

  let response = await fetchWithRetry(
    listUrl,
    {
      method: 'GET',
      headers: {
        'X-Auth-Email': EMAIL,
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    },
    3
  );

  let data = await response.json();

  if (!response.ok) {
    throw new Error(`获取 ${DOMAIN} 的 DNS 记录失败: ${response.status} ${response.statusText}`);
  }

  const deletePromises = data.result.map(record => deleteDNSRecord(API_TOKEN, ZONE_ID, record.id, EMAIL, DOMAIN));
  await Promise.all(deletePromises);
}

async function updateDNSRecords(ips, API_TOKEN, ZONE_ID, DOMAIN) {
  const createPromises = ips.map(ip => createDNSRecord(API_TOKEN, ZONE_ID, DOMAIN, ip.includes(':') ? 'AAAA' : 'A', ip));
  const createResults = await Promise.all(createPromises);
  return createResults;
}

async function deleteDNSRecord(API_TOKEN, ZONE_ID, recordId, EMAIL, DOMAIN) {
  const deleteUrl = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${recordId}`;
  const deleteResponse = await fetchWithRetry(
    deleteUrl,
    {
      method: 'DELETE',
      headers: {
        'X-Auth-Email': EMAIL,
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    },
    3
  );

  if (!deleteResponse.ok) {
    throw new Error(`删除 ${DOMAIN} 的记录失败: ${deleteResponse.status} ${deleteResponse.statusText}`);
  }
}

async function createDNSRecord(API_TOKEN, ZONE_ID, DOMAIN, type, content) {
  const createUrl = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records`;
  const createResponse = await fetchWithRetry(
    createUrl,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type,
        name: DOMAIN,
        content,
        ttl: 1,
        proxied: false
      })
    },
    3
  );

  if (!createResponse.ok) {
    const errorData = await createResponse.json();
    throw new Error(`创建 ${type} 记录 ${content} 失败: ${errorData.errors[0].message}`);
  }

  const createData = await createResponse.json();
  return { success: createData.success, content };
}

async function fetchWithRetry(url, options, retryCount) {
  let attempts = 0;
  while (attempts < retryCount) {
    try {
      return await fetch(url, options);
    } catch (error) {
      attempts++;
      logError(`请求 ${url} 失败, 重试 ${attempts}/${retryCount}: ${error.message}`);
    }
  }
  throw new Error(`请求 ${url} 失败, 已达到最大重试次数`);
}

function logError(message, error) {
  console.error(`[错误] ${message}`, error);
}

function logInfo(message) {
  console.log(`[信息] ${message}`);
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

async function generateResponse(DOMAIN, EMAIL, ZONE_ID, API_TOKEN, ips, IP_API, CUSTOM_IPS, successCount, failureCount, currentTime, updateStatus, ipLocationInfo) {
  const responseHtml = generateResponseHtml(DOMAIN, EMAIL, ZONE_ID, API_TOKEN, ips, IP_API, CUSTOM_IPS, successCount, failureCount, currentTime, updateStatus, ipLocationInfo);

  return new Response(responseHtml, {
    headers: getResponseHeaders()
  });
}

function generateResponseHtml(DOMAIN, EMAIL, ZONE_ID, API_TOKEN, ips, IP_API, CUSTOM_IPS, successCount, failureCount, currentTime, updateStatus, ipLocationInfo) {
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
        <p>${DOMAIN}</p>
      </div>
      <div class="info-item">
        <span>邮箱:</span>
        <p>${maskEmail(EMAIL)}</p>
      </div>
      <div class="info-item">
        <span>区域 ID:</span>
        <p>${maskZoneID(ZONE_ID)}</p>
      </div>
      <div class="info-item">
        <span>API 令牌:</span>
        <p>${maskAPIToken(API_TOKEN)}</p>
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
        <p>${IP_API}</p>
      </div>
    </div>
    <div class="section">
      <h2>结果</h2>
      <div class="info-item">
        <span>CUSTOM_IPS:</span>
        <p>${CUSTOM_IPS.split('\n').join('<br>')}</p>
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
      <div class="log-item">${currentTime} 删除 ${DOMAIN} 的现有 A/AAAA 记录</div>
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
    ${historyItems.map(item => `
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
  const locationPromises = ips.map(async (ip) => {
    try {
      const response = await fetchWithRetry(`https://ipinfo.io/${ip}/json`, {}, 3);
      const data = await response.json();
      return {
        ip,
        location: `${data.city}, ${data.region}, ${data.country}`
      };
    } catch (error) {
      logError(`获取 ${ip} 的地理位置信息失败:`, error);
      return {
        ip,
        location: '未知'
      };
    }
  });

  return await Promise.all(locationPromises);
}
