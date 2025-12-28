// Cloudflare Pages Functions API
// 파일 위치: /functions/api/[[path]].js

const ADMIN = { username: 'admindomain', password: 'admindomain120327' };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function getKV(env, key) {
  if (!env.DOMAINS_KV) return null;
  const val = await env.DOMAINS_KV.get(key);
  return val ? JSON.parse(val) : null;
}

async function setKV(env, key, value) {
  if (!env.DOMAINS_KV) return;
  await env.DOMAINS_KV.put(key, JSON.stringify(value));
}

async function detectSecurity(env, user, action) {
  const now = Date.now();
  const schedule = await getKV(env, 'bot_schedule') || { start: '00:00', end: '23:59', active: true };
  
  if (!schedule.active) return;
  
  const kst = new Date(now + 9 * 60 * 60 * 1000);
  const hour = kst.getUTCHours();
  const minute = kst.getUTCMinutes();
  const currentTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  
  if (currentTime >= schedule.start && currentTime <= schedule.end) {
    const suspiciousActions = ['multiple_requests', 'payment_manipulation', 'server_access'];
    if (suspiciousActions.includes(action)) {
      const log = {
        id: now,
        user,
        type: action,
        description: `의심스러운 활동 감지: ${action}`,
        timestamp: now,
      };
      const logs = await getKV(env, 'security_logs') || [];
      logs.unshift(log);
      await setKV(env, 'security_logs', logs.slice(0, 100));
      
      const users = await getKV(env, 'users') || [];
      const userIndex = users.findIndex(u => u.username === user);
      if (userIndex !== -1) {
        users[userIndex].status = 'suspended';
        await setKV(env, 'users', users);
      }
    }
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 확장자 관리
    if (path === 'extensions' && request.method === 'GET') {
      const data = await getKV(env, 'extensions') || [{ id: 1, name: '.example.com', price: 0, paymentRequired: false }];
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (path === 'extensions' && request.method === 'POST') {
      const ext = await request.json();
      const exts = await getKV(env, 'extensions') || [];
      exts.push({ ...ext, id: Date.now() });
      await setKV(env, 'extensions', exts);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (path.startsWith('extensions/') && request.method === 'DELETE') {
      const id = parseInt(path.split('/')[1]);
      const exts = await getKV(env, 'extensions') || [];
      await setKV(env, 'extensions', exts.filter(e => e.id !== id));
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 사용자 관리
    if (path === 'users' && request.method === 'GET') {
      const data = await getKV(env, 'users') || [];
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (path === 'register' && request.method === 'POST') {
      const user = await request.json();
      const users = await getKV(env, 'users') || [];
      
      if (users.find(u => u.username === user.username)) {
        return new Response(JSON.stringify({ success: false, error: '이미 존재하는 사용자' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      users.push({ ...user, role: 'user', status: 'active', createdAt: Date.now() });
      await setKV(env, 'users', users);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (path === 'login' && request.method === 'POST') {
      const { username, password } = await request.json();
      const users = await getKV(env, 'users') || [];
      const user = users.find(u => u.username === username && u.password === password);
      
      if (!user) {
        return new Response(JSON.stringify({ success: false }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ success: true, user }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (path.startsWith('users/') && request.method === 'PUT') {
      const username = path.split('/')[1];
      const { status } = await request.json();
      const users = await getKV(env, 'users') || [];
      const index = users.findIndex(u => u.username === username);
      
      if (index !== -1) {
        users[index].status = status;
        await setKV(env, 'users', users);
      }
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 결제 관리
    if (path === 'payments' && request.method === 'GET') {
      const data = await getKV(env, 'payments') || [];
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (path === 'payments' && request.method === 'POST') {
      const payment = await request.json();
      const payments = await getKV(env, 'payments') || [];
      payments.push({ ...payment, id: Date.now() });
      await setKV(env, 'payments', payments);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (path.startsWith('payments/') && request.method === 'PUT') {
      const id = parseInt(path.split('/')[1]);
      const { status } = await request.json();
      const payments = await getKV(env, 'payments') || [];
      const index = payments.findIndex(p => p.id === id);
      
      if (index !== -1) {
        payments[index].status = status;
        await setKV(env, 'payments', payments);
      }
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 보안 로그
    if (path === 'security-logs' && request.method === 'GET') {
      const data = await getKV(env, 'security_logs') || [];
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 보안봇 스케줄
    if (path === 'bot-schedule' && request.method === 'POST') {
      const schedule = await request.json();
      await setKV(env, 'bot_schedule', schedule);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 도메인 등록
    if (path === 'register' && request.method === 'POST') {
      const { domainName, extension, nameservers, user } = await request.json();
      
      await detectSecurity(env, user, 'domain_register');
      
      const cfApiToken = env.CF_API_TOKEN;
      const cfZoneId = env.CF_ZONE_ID;
      
      if (cfApiToken && cfZoneId) {
        const fullDomain = `${domainName}${extension}`;
        
        const promises = nameservers.map(async (ns) => {
          return fetch(`https://api.cloudflare.com/client/v4/zones/${cfZoneId}/dns_records`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${cfApiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'NS',
              name: fullDomain,
              content: ns,
              ttl: 3600,
            }),
          });
        });
        
        await Promise.all(promises);
      }
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  }
