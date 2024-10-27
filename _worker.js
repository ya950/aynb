addEventListener('fetch'， event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const { pathname, searchParams } = url

  // 从 KV 存储中读取变量
  const API_KEY = await DDNS_VARIABLES.get('API_KEY')
  const ZONE_ID = await DDNS_VARIABLES.get('ZONE_ID')
  const DOMAIN = await DDNS_VARIABLES.get('DOMAIN')
  const PASSWORD = await DDNS_VARIABLES.get('PASSWORD')
  const IPV4_API = await DDNS_VARIABLES.get('IPV4_API')
  const IPV6_API = await DDNS_VARIABLES.get('IPV6_API')

  // 检查密码
  if (searchParams.get('password') !== PASSWORD) {
    return new Response('密码错误', { status: 401 })
  }

  // 处理 API 请求
  if (pathname === '/api/v4') {
    return new Response(IPV4_API, { headers: { 'Content-Type': 'text/plain' } })
  } else if (pathname === '/api/v6') {
    return new Response(IPV6_API, { headers: { 'Content-Type': 'text/plain' } })
  }

  // 更新 DNS 记录
  try {
    const ipv4List = IPV4_API.split(/[,\s]+/).filter(Boolean)
    const ipv6List = IPV6_API.split(/[,\s]+/).filter(Boolean)

    await updateDNSRecords(API_KEY, ZONE_ID, DOMAIN, 'A', ipv4List)
    await updateDNSRecords(API_KEY, ZONE_ID, DOMAIN, 'AAAA', ipv6List)

    return new Response('DDNS 更新成功！', { status: 200 })
  } catch (error) {
    return new Response(`更新失败：${error.message}`, { status: 500 })
  }
}

async function updateDNSRecords(apiKey, zoneId, domain, type, ipList) {
  const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=${type}&name=${domain}`
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }

  // 获取现有记录
  const response = await fetch(url, { headers })
  const data = await response.json()
  const existingRecords = data.result

  // 删除多余的记录
  for (let i = ipList.length; i < existingRecords.length; i++) {
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${existingRecords[i].id}`, {
      method: 'DELETE',
      headers
    })
  }

  // 更新或创建记录
  for (let i = 0; i < ipList.length; i++) {
    const ip = ipList[i]
    if (i < existingRecords.length) {
      // 更新现有记录
      await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${existingRecords[i].id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ type, name: domain, content: ip, ttl: 1, proxied: false })
      })
    } else {
      // 创建新记录
      await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type, name: domain, content: ip, ttl: 1, proxied: false })
      })
    }
  }
}
