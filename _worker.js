export default {
  async fetch(request, env, ctx) {
    return await handleRequest(request, env, ctx);
  }
};

async function handleRequest(request, env, ctx) {
  const API_TOKEN = env.API_TOKEN;
  const ZONE_ID = env.ZONE_ID;
  const DOMAIN = env.DOMAIN;
  const CUSTOM_IPS = env.CUSTOM_IPS || '';
  const IP_API = 'https://api.ipify.org';

  try {
    // 检查必要的变量是否已设置
    if (!API_TOKEN || !ZONE_ID || !DOMAIN) {
      throw new Error('必要的变量未设置。请检查 API_TOKEN, ZONE_ID 和 DOMAIN。');
    }

    console.log('ZONE_ID:', ZONE_ID);
    console.log('DOMAIN:', DOMAIN);

    // 获取 IP 地址
    let ips = await getIPs(CUSTOM_IPS, IP_API);
    console.log('获取到的 IP 地址:', ips);

    // 更新 DNS 记录
    let updateResult = await updateDNS(ips, API_TOKEN, ZONE_ID, DOMAIN);
    
    // 打印完整的更新结果
    console.log('更新结果:', JSON.stringify(updateResult, null, 2));

    // 返回结果
    return new Response(JSON.stringify(updateResult), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error) {
    // 错误处理
    console.error('发生错误:', error);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

async function getIPs(CUSTOM_IPS, IP_API) {
  let ips = [];
  
  if (CUSTOM_IPS) {
    ips = CUSTOM_IPS.split(/[,\n]+/).map(ip => ip.trim()).filter(ip => ip);
  }
  
  if (ips.length === 0) {
    let response = await fetch(IP_API);
    let ip = await response.text();
    ips.push(ip);
  }
  
  return ips;
}

async function updateDNS(ips, API_TOKEN, ZONE_ID, DOMAIN) {
  let results = [];
  
  for (let ip of ips) {
    let type = ip.includes(':') ? 'AAAA' : 'A';
    
    console.log(`正在更新 DNS 记录: 类型=${type}, 域名=${DOMAIN}, IP=${ip}`);

    let listUrl = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?type=${type}&name=${DOMAIN}`;
    console.log('请求 URL:', listUrl);

    let response = await fetch(listUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    let responseText = await response.text();
    console.log('API 响应状态:', response.status);
    console.log('API 响应头:', JSON.stringify(Object.fromEntries(response.headers), null, 2));
    console.log('API 响应体:', responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('解析 JSON 失败:', e);
      throw new Error('无法解析 API 响应');
    }

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status} ${response.statusText}\n${responseText}`);
    }
    
    if (data.result && data.result.length > 0) {
      // 更新现有记录
      let recordId = data.result[0].id;
      let updateUrl = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${recordId}`;
      console.log('更新 URL:', updateUrl);

      let updateResponse = await fetch(updateUrl, {
        method: 'PUT',
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
      
      let updateData = await updateResponse.json();
      console.log('更新响应:', JSON.stringify(updateData));
      results.push(updateData);
    } else {
      // 创建新记录
      let createUrl = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records`;
      console.log('创建 URL:', createUrl);

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
      console.log('创建响应:', JSON.stringify(createData));
      results.push(createData);
    }
  }
  
  return results;
}
