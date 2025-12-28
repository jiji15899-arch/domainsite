export async function onRequest(context) {
    const { request, env } = context;
    
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        });
    }

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    };

    try {
        if (request.method === 'GET') {
            return await handleGet(request, env, headers);
        } else if (request.method === 'POST') {
            return await handlePost(request, env, headers);
        }
    } catch (e) {
        return new Response(JSON.stringify({success: false, message: e.message}), {headers});
    }
}

async function handleGet(request, env, headers) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    if (action === 'getExtensions') {
        const data = await env.DOMAIN_STORAGE.get('extensions', {type: 'json'}) || [];
        return new Response(JSON.stringify({extensions: data}), {headers});
    }

    if (action === 'getMyDomains') {
        const username = url.searchParams.get('username');
        const domains = await env.DOMAIN_STORAGE.get('domains', {type: 'json'}) || [];
        const myDomains = domains.filter(d => d.username === username);
        return new Response(JSON.stringify({domains: myDomains}), {headers});
    }

    if (action === 'getPendingPayments') {
        const domains = await env.DOMAIN_STORAGE.get('domains', {type: 'json'}) || [];
        const pending = domains.filter(d => d.status === 'pending');
        return new Response(JSON.stringify({payments: pending}), {headers});
    }

    if (action === 'getAllUsers') {
        const users = await env.DOMAIN_STORAGE.get('users', {type: 'json'}) || [];
        const filteredUsers = users.filter(u => u.username !== 'admindomain').map(u => ({
            username: u.username,
            email: u.email,
            status: u.status || 'active'
        }));
        return new Response(JSON.stringify({users: filteredUsers}), {headers});
    }

    if (action === 'getSecurityLogs') {
        const logs = await env.DOMAIN_STORAGE.get('securityLogs', {type: 'json'}) || [];
        return new Response(JSON.stringify({logs}), {headers});
    }

    return new Response(JSON.stringify({success: false}), {headers});
}

async function handlePost(request, env, headers) {
    const body = await request.json();
    const { action } = body;

    if (action === 'register') {
        return await registerUser(body, env, headers);
    }

    if (action === 'login') {
        return await loginUser(body, env, headers);
    }

    if (action === 'requestDomain') {
        return await requestDomain(body, env, headers);
    }

    if (action === 'addExtension') {
        return await addExtension(body, env, headers);
    }

    if (action === 'deleteExtension') {
        return await deleteExtension(body, env, headers);
    }

    if (action === 'approvePayment') {
        return await approvePayment(body, env, headers);
    }

    if (action === 'rejectPayment') {
        return await rejectPayment(body, env, headers);
    }

    if (action === 'suspendUser') {
        return await suspendUser(body, env, headers);
    }

    if (action === 'unsuspendUser') {
        return await unsuspendUser(body, env, headers);
    }

    if (action === 'blacklistUser') {
        return await blacklistUser(body, env, headers);
    }

    if (action === 'updateBotSchedule') {
        await env.DOMAIN_STORAGE.put('botSchedule', JSON.stringify({start: body.start, end: body.end}));
        return new Response(JSON.stringify({success: true}), {headers});
    }

    return new Response(JSON.stringify({success: false}), {headers});
}

async function registerUser(body, env, headers) {
    const { username, email, password } = body;
    
    let users = await env.DOMAIN_STORAGE.get('users', {type: 'json'}) || [];
    
    if (users.find(u => u.username === username)) {
        return new Response(JSON.stringify({success: false, message: '이미 존재하는 사용자명입니다'}), {headers});
    }

    users.push({username, email, password, status: 'active', createdAt: Date.now()});
    await env.DOMAIN_STORAGE.put('users', JSON.stringify(users));
    
    await addSecurityLog(env, 'register', username, '새 사용자 등록');
    
    return new Response(JSON.stringify({success: true}), {headers});
}

async function loginUser(body, env, headers) {
    const { username, password } = body;
    
    let users = await env.DOMAIN_STORAGE.get('users', {type: 'json'}) || [];
    
    if (username === 'admindomain' && password === 'admindomain120327') {
        return new Response(JSON.stringify({
            success: true,
            user: {username: 'admindomain', email: 'admin@domain.com', isAdmin: true}
        }), {headers});
    }

    const user = users.find(u => u.username === username && u.password === password);
    
    if (!user) {
        await addSecurityLog(env, 'login_failed', username, '로그인 실패');
        return new Response(JSON.stringify({success: false, message: '사용자명 또는 비밀번호가 틀립니다'}), {headers});
    }

    if (user.status === 'suspended' || user.status === 'blacklisted') {
        return new Response(JSON.stringify({success: false, message: '계정이 정지되었습니다'}), {headers});
    }

    await addSecurityLog(env, 'login', username, '로그인 성공');
    
    return new Response(JSON.stringify({
        success: true,
        user: {username: user.username, email: user.email}
    }), {headers});
}

async function requestDomain(body, env, headers) {
    const { username, domain, nameservers, price } = body;
    
    let users = await env.DOMAIN_STORAGE.get('users', {type: 'json'}) || [];
    const user = users.find(u => u.username === username);
    
    if (!user || user.status !== 'active') {
        return new Response(JSON.stringify({success: false, message: '사용자를 찾을 수 없거나 계정이 정지되었습니다'}), {headers});
    }

    let domains = await env.DOMAIN_STORAGE.get('domains', {type: 'json'}) || [];
    
    if (domains.find(d => d.domain === domain)) {
        return new Response(JSON.stringify({success: false, message: '이미 등록된 도메인입니다'}), {headers});
    }

    const extensions = await env.DOMAIN_STORAGE.get('extensions', {type: 'json'}) || [];
    const ext = extensions.find(e => domain.endsWith(e.name));

    const newDomain = {
        domain,
        username,
        nameservers,
        status: (price > 0 && username !== 'admindomain') ? 'pending' : 'active',
        price: price || 0,
        createdAt: Date.now()
    };

    domains.push(newDomain);
    await env.DOMAIN_STORAGE.put('domains', JSON.stringify(domains));
    
    await addSecurityLog(env, 'domain_request', username, `도메인 신청: ${domain}`);

    if (price > 0 && username !== 'admindomain') {
        return new Response(JSON.stringify({
            success: true,
            needsPayment: true,
            paymentUrl: ext?.paymentUrl
        }), {headers});
    }

    return new Response(JSON.stringify({success: true}), {headers});
}

async function addExtension(body, env, headers) {
    const { username, name, price, paymentUrl } = body;
    
    if (username !== 'admindomain') {
        return new Response(JSON.stringify({success: false, message: '권한이 없습니다'}), {headers});
    }

    let extensions = await env.DOMAIN_STORAGE.get('extensions', {type: 'json'}) || [];
    
    if (extensions.find(e => e.name === name)) {
        return new Response(JSON.stringify({success: false, message: '이미 존재하는 확장자입니다'}), {headers});
    }

    extensions.push({name, price: price || 0, paymentUrl: paymentUrl || ''});
    await env.DOMAIN_STORAGE.put('extensions', JSON.stringify(extensions));
    
    await addSecurityLog(env, 'extension_add', username, `확장자 추가: ${name}`);
    
    return new Response(JSON.stringify({success: true}), {headers});
}

async function deleteExtension(body, env, headers) {
    const { username, name } = body;
    
    if (username !== 'admindomain') {
        return new Response(JSON.stringify({success: false, message: '권한이 없습니다'}), {headers});
    }

    let extensions = await env.DOMAIN_STORAGE.get('extensions', {type: 'json'}) || [];
    extensions = extensions.filter(e => e.name !== name);
    await env.DOMAIN_STORAGE.put('extensions', JSON.stringify(extensions));
    
    await addSecurityLog(env, 'extension_delete', username, `확장자 삭제: ${name}`);
    
    return new Response(JSON.stringify({success: true}), {headers});
}

async function approvePayment(body, env, headers) {
    const { username, domain } = body;
    
    if (username !== 'admindomain') {
        return new Response(JSON.stringify({success: false}), {headers});
    }

    let domains = await env.DOMAIN_STORAGE.get('domains', {type: 'json'}) || [];
    const domainObj = domains.find(d => d.domain === domain);
    
    if (domainObj) {
        domainObj.status = 'active';
        await env.DOMAIN_STORAGE.put('domains', JSON.stringify(domains));
        await addSecurityLog(env, 'payment_approve', username, `결제 승인: ${domain}`);
    }

    return new Response(JSON.stringify({success: true}), {headers});
}

async function rejectPayment(body, env, headers) {
    const { username, domain } = body;
    
    if (username !== 'admindomain') {
        return new Response(JSON.stringify({success: false}), {headers});
    }

    let domains = await env.DOMAIN_STORAGE.get('domains', {type: 'json'}) || [];
    domains = domains.filter(d => d.domain !== domain);
    await env.DOMAIN_STORAGE.put('domains', JSON.stringify(domains));
    
    await addSecurityLog(env, 'payment_reject', username, `결제 거부: ${domain}`);

    return new Response(JSON.stringify({success: true}), {headers});
}

async function suspendUser(body, env, headers) {
    const { username, targetUser } = body;
    
    if (username !== 'admindomain') {
        return new Response(JSON.stringify({success: false}), {headers});
    }

    let users = await env.DOMAIN_STORAGE.get('users', {type: 'json'}) || [];
    const user = users.find(u => u.username === targetUser);
    
    if (user) {
        user.status = 'suspended';
        await env.DOMAIN_STORAGE.put('users', JSON.stringify(users));
        await addSecurityLog(env, 'user_suspend', username, `사용자 정지: ${targetUser}`);
    }

    return new Response(JSON.stringify({success: true}), {headers});
}

async function unsuspendUser(body, env, headers) {
    const { username, targetUser } = body;
    
    if (username !== 'admindomain') {
        return new Response(JSON.stringify({success: false}), {headers});
    }

    let users = await env.DOMAIN_STORAGE.get('users', {type: 'json'}) || [];
    const user = users.find(u => u.username === targetUser);
    
    if (user) {
        user.status = 'active';
        await env.DOMAIN_STORAGE.put('users', JSON.stringify(users));
        await addSecurityLog(env, 'user_unsuspend', username, `사용자 정지 해제: ${targetUser}`);
    }

    return new Response(JSON.stringify({success: true}), {headers});
}

async function blacklistUser(body, env, headers) {
    const { username, targetUser } = body;
    
    if (username !== 'admindomain') {
        return new Response(JSON.stringify({success: false}), {headers});
    }

    let users = await env.DOMAIN_STORAGE.get('users', {type: 'json'}) || [];
    const user = users.find(u => u.username === targetUser);
    
    if (user) {
        user.status = 'blacklisted';
        await env.DOMAIN_STORAGE.put('users', JSON.stringify(users));
        await addSecurityLog(env, 'user_blacklist', username, `사용자 블랙리스트: ${targetUser}`);
    }

    return new Response(JSON.stringify({success: true}), {headers});
}

async function addSecurityLog(env, type, username, description) {
    let logs = await env.DOMAIN_STORAGE.get('securityLogs', {type: 'json'}) || [];
    logs.push({type, username, description, timestamp: Date.now()});
    if (logs.length > 100) logs = logs.slice(-100);
    await env.DOMAIN_STORAGE.put('securityLogs', JSON.stringify(logs));
                                   }
