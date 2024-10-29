export default {
  async fetch(request, env, ctx) {
    return await handleRequest(request, env);
  }
};

async function handleRequest(request, env) {
  const API_TOKEN = env.API_TOKEN;
  const ZONE_ID = env.ZONE_ID;
  const DOMAIN = env.DOMAIN;
  const CUSTOM_IPS = env.CUSTOM_IPS || '';
  const PASSWORD = env.PASSWORD || '';
  const IP_API = env.IP_API || 'https://raw.githubusercontent.com/ymyuuu/IPDB/refs/heads/main/bestproxy.txt';
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
    if (!API_TOKEN || !ZONE_ID || !DOMAIN) {
      throw new Error('必要的变量未设置。请检查 API_TOKEN, ZONE_ID 和 DOMAIN。');
    }

    let ips = await getIPs(CUSTOM_IPS, IP_API);
    if (ips.length === 0) {
      throw new Error('无法获取有效的 IP 地址');
    }

    // 删除现有的 A 记录
    await deleteExistingARecords(API_TOKEN, ZONE_ID, DOMAIN);

    let updateResults = await updateDNSRecords(ips, API_TOKEN, ZONE_ID, DOMAIN);

    const currentTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

    const updatedIPs = updateResults.filter(r => r.success).map(r => r.content);
    const updateStatus = updatedIPs.length > 0 
      ? `更新成功，共更新了 ${updatedIPs.length} 个 IP: ${updatedIPs.join(', ')}`
      : '没有 IP 被更新';

    const response = `
################################################################
Cloudflare域名配置信息 / Cloudflare Domain Configuration
---------------------------------------------------------------
域名 / Domain：${DOMAIN}
邮箱 / Email：${maskEmail(EMAIL)}
区域ID / Zone ID：${maskString(ZONE_ID)}
API令牌 / API Token：${maskString(API_TOKEN)}

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
执行日志 / Execution Log
---------------------------------------------------------------
${currentTime} 变量加载完成
${currentTime} 域名解析完成
${currentTime} 删除现有 A 记录
${currentTime} API获取 A记录${ips.join(', ')}
${currentTime} API调用完成
${currentTime} IP去重完成
${currentTime} BAN_IP清理完成
${currentTime} ${updateStatus}
    `;

    return new Response(response, {
      headers: { 
        'Content-Type': 'text/plain;charset=UTF-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
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

function maskString(str) {
  if (str.length <= 8) return str;
  return str.substr(0, 3) + '*'.repeat(str.length - 6) + str.substr(-3);
}

function maskEmail(email) {
  if (!email) return '';
  const [username, domain] = email.split('@');
  return username.substr(0, 1) + '*'.repeat(username.length - 1) + '@' + domain;
}

async function getIPs(CUSTOM_IPS, IP_API) {
  let ips = [];
  
  if (CUSTOM_IPS) {
    ips = CUSTOM_IPS.split(/[,\n]+/).map(ip => ip.trim()).filter(ip => ip);
  }
  
  if (ips.length === 0) {
    try {
      let response = await fetch(IP_API);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      let text = await response.text();
      ips = text.split(/[,\n]+/).map(ip => ip.trim()).filter(ip => {
        // 简单的 IPv4 验证
        return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
      });
      console.log('从 IP_API 获取的 IP 地址:', ips);
    } catch (error) {
      console.error('获取 IP 地址失败:', error);
      throw new Error('无法从 IP_API 获取有效的 IP 地址: ' + error.message);
    }
  }
  
  if (ips.length === 0) {
    throw new Error('未能获取到有效的 IP 地址');
  }
  
  return ips;
}

async function deleteExistingARecords(API_TOKEN, ZONE_ID, DOMAIN) {
  console.log(`${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} 删除现有 A 记录`);

  let listUrl = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?type=A&name=${DOMAIN}`;

  let response = await fetch(listUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  
  let data = await response.json();

  if (!response.ok) {
    throw new Error(`获取 A 记录失败: ${response.status} ${response.statusText}`);
  }

  for (let record of data.result) {
    let deleteUrl = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${record.id}`;

    let deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!deleteResponse.ok) {
      throw new Error(`删除记录失败: ${deleteResponse.status} ${deleteResponse.statusText}`);
    }
  }
}

async function updateDNSRecords(ips, API_TOKEN, ZONE_ID, DOMAIN) {
  let results = [];
  
  for (let ip of ips) {
    let type = ip.includes(':') ? 'AAAA' : 'A';
    
    let createUrl = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records`;

    let createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: type,
        name: DOMAIN,
        content: ip,
        ttl: 1,
        proxied: false
      })
    });
    
    let createData = await createResponse.json();
    results.push({ success: createData.success, content: ip });
  }
  
  return results;
}
