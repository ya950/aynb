// 定义变量
const AUTH_EMAIL = ''; // Cloudflare 账户邮箱
const AUTH_KEY = ''; // Cloudflare API 密钥
const ZONE_ID = ''; // 域名的 Zone ID
const DOMAIN = ''; // 要更新的域名
const CUSTOM_IPS = ''; // 自定义 IP 列表,用逗号分隔
const IP_API = 'https://api.ipify.org'; // IP API 接口

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  try {
    // 获取 IP 地址
    let ips = await getIPs();
    
    // 更新 DNS 记录
    let updateResult = await updateDNS(ips);
    
    // 返回结果
    return new Response(JSON.stringify(updateResult), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error) {
    // 错误处理
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

async function getIPs() {
  let ips = [];
  
  // 从自定义 IP 列表获取 IP
  if (CUSTOM_IPS) {
    ips = CUSTOM_IPS.split(/[,\n]+/).map(ip => ip.trim()).filter(ip => ip);
  }
  
  // 如果没有自定义 IP,则从 API 获取
  if (ips.length === 0) {
    let response = await fetch(IP_API);
    let ip = await response.text();
    ips.push(ip);
  }
  
  return ips;
}

async function updateDNS(ips) {
  let results = [];
  
  for (let ip of ips) {
    let type = ip.includes(':') ? 'AAAA' : 'A';
    
    let response = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?type=${type}&name=${DOMAIN}`, {
      method: 'GET',
      headers: {
        'X-Auth-Email': AUTH_EMAIL,
        'X-Auth-Key': AUTH_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    let data = await response.json();
    
    if (data.result.length > 0) {
      // 更新现有记录
      let recordId = data.result[0].id;
      let updateResponse = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${recordId}`, {
        method: 'PUT',
        headers: {
          'X-Auth-Email': AUTH_EMAIL,
          'X-Auth-Key': AUTH_KEY,
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
      results.push(updateData);
    } else {
      // 创建新记录
      let createResponse = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records`, {
        method: 'POST',
        headers: {
          'X-Auth-Email': AUTH_EMAIL,
          'X-Auth-Key': AUTH_KEY,
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
      results.push(createData);
    }
  }
  
  return results;
}
