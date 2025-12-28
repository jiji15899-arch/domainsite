const ADMIN = {username: 'admindomain', password: 'admindomain120327'};
const CF_API_TOKEN = 'i4R0fO-MHqjz0DP_4vaDIMYhpMnMgrMxilsx9rwt';
const CF_ZONE_ID = 'e308082f47b0db0e14f46ca5fc53c4db';

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, {headers: corsHeaders});
  }

  try {
    if (path === '/auth/login') return await login(request, corsHeaders);
    if (path === '/auth/register') return await register(request, corsHeaders);
    if (path === '/domain/register') return await registerDomain(request, corsHeaders);
    if (path.startsWith('/domains/')) return await getDomains(path, corsHeaders);
    if (path === '/tlds') return await getTlds(corsHeaders);
    if (path === '/admin/tld' && request.method === 'POST') return await addTld(request, corsHeaders);
    if (path.startsWith('/admin/tld/') && request.method === 'DELETE') return await deleteTld(path, url, corsHeaders);
    if (path.startsWith('/admin/users')) return await getUsers(url, corsHeaders);
    if (path.includes('/suspend')) return await toggleSuspend(path, url, corsHeaders);
    if (path.includes('/blacklist')) return await blacklist(path, url, corsHeaders);
    if (path.startsWith('/admin/payments')) return await getPayments(url, corsHeaders);
    if (path.includes('/approve')) return await approvePayment(path, url, corsHeaders);
    if (path.includes('/reject')) return await rejectPayment(path, url, corsHeaders);
    if (path === '/admin/security') return await updateSecurity(request, corsHeaders);
    
    return new Response(JSON.stringify({error: 'Not found'}), {status: 404, headers: corsHeaders});
  } catch (e) {
    return new Response(JSON.stringify({error: e.message}), {status: 500, headers: corsHeaders});
  }
}

async function login(request, headers) {
  const {username, password} = await request.json();
  
  if (username === ADMIN.username && password === ADMIN.password) {
    return new Response(JSON.stringify({
      success: true,
      user: {username, isAdmin: true}
    }), {headers});
  }
  
  const users = await DOMAIN_KV.get('users', {type: 'json'}) || {};
  const user = users[username];
  
  if (!user || user.password !== password) {
    return new Response(JSON.stringify({success: false, message: '로그인 실패'}), {headers});
  }
  
  if (user.status === 'suspended' || user.status === 'blacklisted') {
    return new Response(JSON.stringify({success: false, message: '계정이 정지되었습니다'}), {headers});
  }
  
  return new Response(JSON.stringify({
    success: true,
    user: {username, isAdmin: false}
  }), {headers});
}

async function register(request, headers) {
  const {username, password} = await request.json();
  
  if (!username || !password || username.length < 3) {
    return new Response(JSON.stringify({success: false, message: '유효하지 않은 입력'}), {headers});
  }
  
  const users = await DOMAIN_KV.get('users', {type: 'json'}) || {};
  
  if (users[username]) {
    return new Response(JSON.stringify({success: false, message: '이미 존재하는 사용자명'}), {headers});
  }
  
  users[username] = {password, status: 'active', createdAt: Date.now()};
  await DOMAIN_KV.put('users', JSON.stringify(users));
  
  return new Response(JSON.stringify({success: true, message: '회원가입 성공!'}), {headers});
}

async function registerDomain(request, headers) {
  const {username, domain, tld, nameservers} = await request.json();
  
  if (!domain || !tld || !nameservers || nameservers.length === 0) {
    return new Response(JSON.stringify({success: false, message: '필수 정보 누락'}), {headers});
  }
  
  const users = await DOMAIN_KV.get('users', {type: 'json'}) || {};
  const user = users[username];
  
  if (!user || user.status !== 'active') {
    return new Response(JSON.stringify({success: false, message: '사용 불가 계정'}), {headers});
  }
  
  const tlds = await DOMAIN_KV.get('tlds', {type: 'json'}) || [];
  const tldInfo = tlds.find(t => t.name === tld);
  
  if (!tldInfo) {
    return new Response(JSON.stringify({success: false, message: '유효하지 않은 TLD'}), {headers});
  }
  
  if (tldInfo.price > 0 && username !== ADMIN.username) {
    const payments = await DOMAIN_KV.get('payments', {type: 'json'}) || [];
    payments.push({
      id: Date.now().toString(),
      username,
      domain,
      tld,
      price: tldInfo.price,
      status: 'pending',
      createdAt: Date.now()
    });
    await DOMAIN_KV.put('payments', JSON.stringify(payments));
    
    if (tldInfo.paymentLink) {
      return new Response(JSON.stringify({
        success: false,
        message: '결제가 필요합니다',
        redirectUrl: tldInfo.paymentLink
      }), {headers});
    }
    
    return new Response(JSON.stringify({
      success: false,
      message: '관리자 승인 대기 중'
    }), {headers});
  }
  
  const fullDomain = domain + tld;
  const domains = await DOMAIN_KV.get('domains', {type: 'json'}) || {};
  
  if (domains[fullDomain]) {
    return new Response(JSON.stringify({success: false, message: '이미 등록된 도메인'}), {headers});
  }
  
  domains[fullDomain] = {
    username,
    domain,
    tld,
    nameservers,
    createdAt: Date.now(),
    expiresAt: null
  };
  
  await DOMAIN_KV.put('domains', JSON.stringify(domains));
  
  await createDNSRecord(domain, tld, nameservers);
  
  return new Response(JSON.stringify({
    success: true,
    message: `${fullDomain} 등록 완료!`
  }), {headers});
}

async function createDNSRecord(domain, tld, nameservers) {
  const subdomain = domain + tld.replace(/\./g, '-');
  
  for (let i = 0; i < nameservers.length; i++) {
    try {
      await fetch(`https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'NS',
          name: subdomain,
          content: nameservers[i],
          ttl: 3600
        })
      });
    } catch (e) {
      console.error('DNS creation error:', e);
    }
  }
}

async function getDomains(path, headers) {
  const username = path.split('/').pop();
  const domains = await DOMAIN_KV.get('domains', {type: 'json'}) || {};
  
  const userDomains = Object.values(domains).filter(d => d.username === username);
  
  return new Response(JSON.stringify({domains: userDomains}), {headers});
}

async function getTlds(headers) {
  const tlds = await DOMAIN_KV.get('tlds', {type: 'json'}) || [
    {name: '.free.com', price: 0, paymentLink: ''},
    {name: '.mysite.net', price: 0, paymentLink: ''}
  ];
  
  return new Response(JSON.stringify({tlds}), {headers});
}

async function addTld(request, headers) {
  const {name, price, paymentLink, admin} = await request.json();
  
  if (admin !== ADMIN.username) {
    return new Response(JSON.stringify({success: false, message: '권한 없음'}), {headers});
  }
  
  const tlds = await DOMAIN_KV.get('tlds', {type: 'json'}) || [];
  tlds.push({name, price, paymentLink});
  await DOMAIN_KV.put('tlds', JSON.stringify(tlds));
  
  return new Response(JSON.stringify({success: true, message: 'TLD 추가 완료'}), {headers});
}

async function deleteTld(path, url, headers) {
  const admin = url.searchParams.get('admin');
  if (admin !== ADMIN.username) {
    return new Response(JSON.stringify({success: false}), {headers});
  }
  
  const name = decodeURIComponent(path.split('/').pop());
  const tlds = await DOMAIN_KV.get('tlds', {type: 'json'}) || [];
  const filtered = tlds.filter(t => t.name !== name);
  await DOMAIN_KV.put('tlds', JSON.stringify(filtered));
  
  return new Response(JSON.stringify({success: true}), {headers});
}

async function getUsers(url, headers) {
  const admin = url.searchParams.get('admin');
  if (admin !== ADMIN.username) {
    return new Response(JSON.stringify({users: []}), {headers});
  }
  
  const users = await DOMAIN_KV.get('users', {type: 'json'}) || {};
  const userList = Object.entries(users).map(([username, data]) => ({
    username,
    status: data.status,
    createdAt: data.createdAt
  }));
  
  return new Response(JSON.stringify({users: userList}), {headers});
}

async function toggleSuspend(path, url, headers) {
  const admin = url.searchParams.get('admin');
  if (admin !== ADMIN.username) {
    return new Response(JSON.stringify({success: false}), {headers});
  }
  
  const username = path.split('/')[3];
  const users = await DOMAIN_KV.get('users', {type: 'json'}) || {};
  
  if (users[username]) {
    users[username].status = users[username].status === 'suspended' ? 'active' : 'suspended';
    await DOMAIN_KV.put('users', JSON.stringify(users));
  }
  
  return new Response(JSON.stringify({success: true}), {headers});
}

async function blacklist(path, url, headers) {
  const admin = url.searchParams.get('admin');
  if (admin !== ADMIN.username) {
    return new Response(JSON.stringify({success: false}), {headers});
  }
  
  const username = path.split('/')[3];
  const users = await DOMAIN_KV.get('users', {type: 'json'}) || {};
  
  if (users[username]) {
    users[username].status = 'blacklisted';
    await DOMAIN_KV.put('users', JSON.stringify(users));
  }
  
  return new Response(JSON.stringify({success: true}), {headers});
}

async function getPayments(url, headers) {
  const admin = url.searchParams.get('admin');
  if (admin !== ADMIN.username) {
    return new Response(JSON.stringify({payments: []}), {headers});
  }
  
  const payments = await DOMAIN_KV.get('payments', {type: 'json'}) || [];
  const pending = payments.filter(p => p.status === 'pending');
  
  return new Response(JSON.stringify({payments: pending}), {headers});
}

async function approvePayment(path, url, headers) {
  const admin = url.searchParams.get('admin');
  if (admin !== ADMIN.username) {
    return new Response(JSON.stringify({success: false}), {headers});
  }
  
  const id = path.split('/')[3];
  const payments = await DOMAIN_KV.get('payments', {type: 'json'}) || [];
  const payment = payments.find(p => p.id === id);
  
  if (payment) {
    payment.status = 'approved';
    await DOMAIN_KV.put('payments', JSON.stringify(payments));
    
    const {username, domain, tld, nameservers} = payment;
    const fullDomain = domain + tld;
    const domains = await DOMAIN_KV.get('domains', {type: 'json'}) || {};
    
    domains[fullDomain] = {
      username,
      domain,
      tld,
      nameservers: nameservers || [],
      createdAt: Date.now(),
      expiresAt: null
    };
    
    await DOMAIN_KV.put('domains', JSON.stringify(domains));
  }
  
  return new Response(JSON.stringify({success: true}), {headers});
}

async function rejectPayment(path, url, headers) {
  const admin = url.searchParams.get('admin');
  if (admin !== ADMIN.username) {
    return new Response(JSON.stringify({success: false}), {headers});
  }
  
  const id = path.split('/')[3];
  const payments = await DOMAIN_KV.get('payments', {type: 'json'}) || [];
  const filtered = payments.filter(p => p.id !== id);
  await DOMAIN_KV.put('payments', JSON.stringify(filtered));
  
  return new Response(JSON.stringify({success: true}), {headers});
}

async function updateSecurity(request, headers) {
  const {admin, startTime, endTime} = await request.json();
  
  if (admin !== ADMIN.username) {
    return new Response(JSON.stringify({success: false}), {headers});
  }
  
  await DOMAIN_KV.put('security', JSON.stringify({startTime, endTime}));
  
  return new Response(JSON.stringify({success: true}), {headers});
}
