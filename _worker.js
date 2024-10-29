export default {
  async fetch(request, env, ctx) {
    return await handleRequest(request, env);
  },

  // 添加对scheduled事件的处理
  async scheduled(event, env, ctx) {
    await handleRequest(event, env);
  }
};

async function handleRequest(request, env) {
  const API_TOKEN = env.API_TOKEN;
  const ZONE_ID = env.ZONE_ID;
  const DOMAIN = env.DOMAIN;
  const CUSTOM_IPS = env.CUSTOM_IPS || '';
  const IP_API = env.IP_API || 'https://raw.githubusercontent.com/ymyuuu/IPDB/refs/heads/main/bestproxy.txt';
  const PASSWORD = env.PASSWORD || '';
  const EMAIL = env.EMAIL || '';

  // 检查密码
  const url = new URL(request.url);
  const providedPassword = url.searchParams.get('password');
  if (PASSWORD && providedPassword !== PASSWORD) {
    return new Response('访问被拒绝 / Access Denied', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  }

  try {
    checkRequiredVariables(API_TOKEN, ZONE_ID, DOMAIN, EMAIL, IP_API);

    let ips = await getIPs(CUSTOM_IPS, IP_API);
    if (ips.length === 0) {
      throw new Error('无法获取有效的 IP 地址');
    }

    // 删除现有的 A/AAAA 记录
    await deleteExistingDNSRecords(API_TOKEN, ZONE_ID, DOMAIN, EMAIL);

    let updateResults = await updateDNSRecords(ips, API_TOKEN, ZONE_ID, DOMAIN);
    const successCount = updateResults.filter(r => r.success).length;
    const failureCount = updateResults.filter(r => !r.success).length;

    const currentTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const updatedIPs = updateResults.filter(r => r.success).map(r => r.content);
    const updateStatus = getUpdateStatus(updatedIPs);

    const response = generateResponse(DOMAIN, EMAIL, ZONE_ID, API_TOKEN, ips, IP_API, successCount, failureCount, currentTime, updateStatus);

    return response;
  } catch (error) {
    logError('发生错误:', error);
    return new Response(`更新失败 / Update Failed: ${error.message}`, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  }
}

function checkRequiredVariables(API_TOKEN, ZONE_ID, DOMAIN, EMAIL, IP_API) {
  if (!API_TOKEN || !ZONE_ID || !DOMAIN || !EMAIL || !IP_API) {
    throw new Error('必要的变量未设置。请检查 API_TOKEN, ZONE_ID, DOMAIN, EMAIL 和 IP_API。');
  }
}

function maskZoneID(zoneID) {
  if (zoneID.length <= 8) return zoneID;
  return zoneID.substr(0, 3) + '*'.repeat(zoneID.length - 6) + zoneID.substr(-3);
}

function maskAPIToken(apiToken) {
  if (apiToken.length <= 8) return apiToken;
  return apiToken.substr(0, 3) + '*'.repeat(apiToken.length - 6) + apiToken.substr(-3);
}

function maskEmail(email) {
  if (!email) return '';
  const [username, domain] = email.split('@');
  return username.substr(0, 1) + '*'.repeat(username.length - 1) + '@' + domain;
}

async function getIPs(CUSTOM_IPS, IP_API) {
  let ips = CUSTOM_IPS ? CUSTOM_IPS.split(/[,\n]+/).map(ip => ip.trim()).filter(ip => ip) : [];

  if (ips.length === 0) {
    try {
      console.log(`${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} 从 IP_API 获取 IP 地址`);
      let response = await fetch(IP_API);
      if (!response.ok) {
        throw new Error(`从 IP_API 获取 IP 地址失败: HTTP 错误 ${response.status}`);
      }
      let text = await response.text();
      ips = text.trim().split(/[,\n]+/).map(ip => ip.trim()).filter(ip => {
        // 简单的 IP 地址验证
        return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || /^[a-fA-F0-9:]+$/.test(ip);
      });
      console.log('从 IP_API 获取的 IP 地址:', ips);
    } catch (error) {
      logError('从 IP_API 获取 IP 地址失败:', error);
      throw new Error('无法从 IP_API 获取有效的 IP 地址: ' + error.message);
    }
  }

  // 对 IP 地址进行去重
  ips = [...new Set(ips)];

  return ips;
}

async function deleteExistingDNSRecords(API_TOKEN, ZONE_ID, DOMAIN, EMAIL) {
  console.log(`${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} 删除现有 A/AAAA 记录`);

  let listUrl = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?type=A,AAAA&name=${DOMAIN}`;

  let response = await fetch(listUrl, {
    method: 'GET',
    headers: {
      'X-Auth-Email': EMAIL,
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  
  let data = await response.json();

  if (!response.ok) {
    throw new Error(`获取 DNS 记录失败: ${response.status} ${response.statusText}`);
  }

  const deletePromises = data.result.map(record => deleteDNSRecord(API_TOKEN, ZONE_ID, record.id, EMAIL));
  await Promise.all(deletePromises);
}

async function updateDNSRecords(ips, API_TOKEN, ZONE_ID, DOMAIN) {
  const createPromises = ips.map(ip => createDNSRecord(API_TOKEN, ZONE_ID, DOMAIN, ip.includes(':') ? 'AAAA' : 'A', ip));
  const createResults = await Promise.all(createPromises);
  return createResults;
}

async function deleteDNSRecord(API_TOKEN, ZONE_ID, recordId, EMAIL) {
  const deleteUrl = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${recordId}`;
  const deleteResponse = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      'X-Auth-Email': EMAIL,
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!deleteResponse.ok) {
    throw new Error(`删除记录失败: ${deleteResponse.status} ${deleteResponse.statusText}`);
  }
}

async function createDNSRecord(API_TOKEN, ZONE_ID, DOMAIN, type, content) {
  const createUrl = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records`;
  const createResponse = await fetch(createUrl, {
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
  });
  
  if (!createResponse.ok) {
    const errorData = await createResponse.json();
    throw new Error(`创建 ${type} 记录 ${content} 失败: ${errorData.errors[0].message}`);
  }

  const createData = await createResponse.json();
  return { success: createData.success, content };
}

function logError(message, error) {
  console.error(message, error);
}

function getUpdateStatus(updatedIPs) {
  return updatedIPs.length > 0 
    ? `更新成功，共更新了 ${updatedIPs.length} 个 IP: ${updatedIPs.join(', ')}`
    : '没有 IP 被更新';
}

function generateResponse(DOMAIN, EMAIL, ZONE_ID, API_TOKEN, ips, IP_API, successCount, failureCount, currentTime, updateStatus) {
  return new Response(`
################################################################
Cloudflare域名配置信息 / Cloudflare Domain Configuration
---------------------------------------------------------------
域名 / Domain：${DOMAIN}
邮箱 / Email：${maskEmail(EMAIL)}
区域ID / Zone ID：${maskZoneID(ZONE_ID)}
API令牌 / API Token：${maskAPIToken(API_TOKEN)}

---------------------------------------------------------------
################################################################
配置信息 / Configuration
---------------------------------------------------------------
DoH：
https://cloudflare-dns.com/dns-query

IP_API：
${IP_API}

---------------------------------------------------------------
################################################################
整理结果 / Results
---------------------------------------------------------------
IPv4：
${ips.join('\n')}

---------------------------------------------------------------
################################################################
更新结果 / Update Results
---------------------------------------------------------------
更新成功: ${successCount} 个
更新失败: ${failureCount} 个

---------------------------------------------------------------
################################################################
执行日志 / Execution Log
---------------------------------------------------------------
${currentTime} 变量加载完成
${currentTime} 域名解析完成
${currentTime} 删除现有 A/AAAA 记录
${currentTime} API获取 A/AAAA记录${ips.join(', ')}
${currentTime} API调用完成
${currentTime} IP去重完成
${currentTime} BAN_IP清理完成
${currentTime} ${updateStatus}
    `, {
      headers: { 
        'Content-Type': 'text/plain;charset=UTF-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
}
