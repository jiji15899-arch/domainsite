export async function onRequestGet(context) {
    return handleRequest(context, 'GET');
}

export async function onRequestPost(context) {
    return handleRequest(context, 'POST');
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    });
}

async function handleRequest(context, method) {
    const { request, env } = context;
    
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    };

    try {
        // KV 확인
        if (!env || !env.DOMAIN_STORAGE) {
            return new Response(JSON.stringify({
                success: false, 
                message: 'KV namespace가 바인딩되지 않았습니다. Cloudflare 설정을 확인하세요.',
                debug: 'DOMAIN_STORAGE is undefined'
            }), {headers, status: 500});
        }

        if (method === 'GET') {
            return await handleGet(request, env.DOMAIN_STORAGE, headers);
        } else if (method === 'POST') {
            return await handlePost(request, env.DOMAIN_STORAGE, headers);
        }
    } catch (e) {
        return new Response(JSON.stringify({
            success: false, 
            message: '서버 오류: ' + e.message,
            stack: e.stack
        }), {headers, status: 500});
    }
}

async function handleGet(request, storage, headers) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    try {
        if (action === 'getExtensions') {
            const data = await getJSON(storage, 'extensions');
            return new Response(JSON.stringify({extensions: data || []}), {headers});
        }

        if (action === 'getMyDomains') {
            const username = url.searchParams.get('username');
            const domains = await getJSON(storage, 'domains');
            const myDomains = (domains || []).filter(d => d.username === username);
            return new Response(JSON.stringify({domains: myDomains}), {headers});
        }

        if (action === 'getPendingPayments') {
            const domains = await getJSON(storage, 'domains');
            const pending = (domains || []).filter(d => d.status === 'pending');
            return new Response(JSON.stringify({payments: pending}), {headers});
        }

        if (action === 'getAllUsers') {
            const users = await getJSON(storage, 'users');
            const filteredUsers = (users || []).filter(u => u.username !== 'admindomain').map(u => ({
                username: u.username,
                email: u.email,
                status: u.status || 'active'
            }));
            return new Response(JSON.stringify({users: filteredUsers}), {headers});
        }

        if (action === 'getSecurityLogs') {
            const logs = await getJSON(storage, 'securityLogs');
            return new Response(JSON.stringify({logs: logs || []}), {headers});
        }

        return new Response(JSON.stringify({success: false, message: 'Unknown action'}), {headers});
    } catch (e) {
        return new Response(JSON.stringify({
            success: false, 
            message: 'GET 오류: ' + e.message
        }), {headers, status: 500});
    }
}

async function handlePost(request, storage, headers) {
    try {
        const body = await request.json();
        const { action } = body;

        if (action === 'register') return await registerUser(body, storage, headers);
        if (action === 'login') return await loginUser(body, storage, headers);
        if (action === 'requestDomain') return await requestDomain(body, storage, headers);
        if (action === 'addExtension') return await addExtension(body, storage, headers);
        if (action === 'deleteExtension') return await deleteExtension(body, storage, headers);
        if (action === 'approvePayment') return await approvePayment(body, storage, headers);
        if (action === 'rejectPayment') return await rejectPayment(body, storage, headers);
        if (action === 'suspendUser') return await suspendUser(body, storage, headers);
        if (action === 'unsuspendUser') return await unsuspendUser(body, storage, headers);
        if (action === 'blacklistUser') return await blacklistUser(body, storage, headers);

        if (action === 'updateBotSchedule') {
            await putJSON(storage, 'botSchedule', {start: body.start, end: body.end});
            return new Response(JSON.stringify({success: true}), {headers});
        }

        return new Response(JSON.stringify({success: false, message: 'Unknown action'}), {headers});
    } catch (e) {
        return new Response(JSON.stringify({
            success: false, 
            message: 'POST 오류: ' + e.message
        }), {headers, status: 500});
    }
}

async function getJSON(storage, key) {
    try {
        const value = await storage.get(key);
        if (!value) return null;
        return JSON.parse(value);
    } catch (e) {
        console.error(`getJSON error for key ${key}:`, e);
        return null;
    }
}

async function putJSON(storage, key, value) {
    try {
        await storage.put(key, JSON.stringify(value));
    } catch (e) {
        console.error(`putJSON error for key ${key}:`, e);
        throw e;
    }
}

async function registerUser(body, storage, headers) {
    const { username, email, password } = body;
    
    if (!username || !email || !password) {
        return new Response(JSON.stringify({success: false, message: '모든 필드를 입력해주세요'}), {headers});
    }
    
    let users = await getJSON(storage, 'users') || [];
    
    if (users.find(u => u.username === username)) {
        return new Response(JSON.stringify({success: false, message: '이미 존재하는 사용자명입니다'}), {headers});
    }

    users.push({username, email, password, status: 'active', createdAt: Date.now()});
    await putJSON(storage, 'users', users);
    await addSecurityLog(storage, 'register', username, '새 사용자 등록');
    
    return new Response(JSON.stringify({success: true}), {headers});
}

async function loginUser(body, storage, headers) {
    const { username, password } = body;
    
    if (username === 'admindomain' && password === 'admindomain120327') {
        await addSecurityLog(storage, 'admin_login', username, '관리자 로그인');
        return new Response(JSON.stringify({
            success: true,
            user: {username: 'admindomain', email: 'admin@domain.com', isAdmin: true}
        }), {headers});
    }

    let users = await getJSON(storage, 'users') || [];
    const user = users.find(u => u.username === username && u.password === password);
    
    if (!user) {
        await addSecurityLog(storage, 'login_failed', username, '로그인 실패');
        return new Response(JSON.stringify({success: false, message: '사용자명 또는 비밀번호가 틀립니다'}), {headers});
    }

    if (user.status === 'suspended' || user.status === 'blacklisted') {
        return new Response(JSON.stringify({success: false, message: '계정이 정지되었습니다'}), {headers});
    }

    await addSecurityLog(storage, 'login', username, '로그인 성공');
    
    return new Response(JSON.stringify({
        success: true,
        user: {username: user.username, email: user.email}
    }), {headers});
}

async function requestDomain(body, storage, headers) {
    const { username, domain, nameservers, price } = body;
    
    if (!domain || !nameservers || nameservers.length === 0) {
        return new Response(JSON.stringify({success: false, message: '도메인과 네임서버를 입력해주세요'}), {headers});
    }

    let users = await getJSON(storage, 'users') || [];
    const user = users.find(u => u.username === username);
    
    if (!user && username !== 'admindomain') {
        return new Response(JSON.stringify({success: false, message: '사용자를 찾을 수 없습니다'}), {headers});
    }

    if (user && user.status !== 'active') {
        return new Response(JSON.stringify({success: false, message: '계정이 정지되었습니다'}), {headers});
    }

    let domains = await getJSON(storage, 'domains') || [];
    
    if (domains.find(d => d.domain === domain)) {
        return new Response(JSON.stringify({success: false, message: '이미 등록된 도메인입니다'}), {headers});
    }

    const extensions = await getJSON(storage, 'extensions') || [];
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
    await putJSON(storage, 'domains', domains);
    await addSecurityLog(storage, 'domain_request', username, `도메인 신청: ${domain}`);

    if (price > 0 && username !== 'admindomain') {
        return new Response(JSON.stringify({
            success: true,
            needsPayment: true,
            paymentUrl: ext?.paymentUrl
        }), {headers});
    }

    return new Response(JSON.stringify({success: true}), {headers});
}

async function addExtension(body, storage, headers) {
    const { username, name, price, paymentUrl } = body;
    
    if (username !== 'admindomain') {
        return new Response(JSON.stringify({success: false, message: '권한이 없습니다'}), {headers});
    }

    if (!name || !name.startsWith('.')) {
        return new Response(JSON.stringify({success: false, message: '올바른 확장자를 입력해주세요 (예: .example.com)'}), {headers});
    }

    let extensions = await getJSON(storage, 'extensions') || [];
    
    if (extensions.find(e => e.name === name)) {
        return new Response(JSON.stringify({success: false, message: '이미 존재하는 확장자입니다'}), {headers});
    }

    extensions.push({name, price: price || 0, paymentUrl: paymentUrl || ''});
    await putJSON(storage, 'extensions', extensions);
    await addSecurityLog(storage, 'extension_add', username, `확장자 추가: ${name}`);
    
    return new Response(JSON.stringify({success: true}), {headers});
}

async function deleteExtension(body, storage, headers) {
    const { username, name } = body;
    
    if (username !== 'admindomain') {
        return new Response(JSON.stringify({success: false, message: '권한이 없습니다'}), {headers});
    }

    let extensions = await getJSON(storage, 'extensions') || [];
    extensions = extensions.filter(e => e.name !== name);
    await putJSON(storage, 'extensions', extensions);
    await addSecurityLog(storage, 'extension_delete', username, `확장자 삭제: ${name}`);
    
    return new Response(JSON.stringify({success: true}), {headers});
}

async function approvePayment(body, storage, headers) {
    const { username, domain } = body;
    
    if (username !== 'admindomain') {
        return new Response(JSON.stringify({success: false}), {headers});
    }

    let domains = await getJSON(storage, 'domains') || [];
    const domainObj = domains.find(d => d.domain === domain);
    
    if (domainObj) {
        domainObj.status = 'active';
        await putJSON(storage, 'domains', domains);
        await addSecurityLog(storage, 'payment_approve', username, `결제 승인: ${domain}`);
    }

    return new Response(JSON.stringify({success: true}), {headers});
}

async function rejectPayment(body, storage, headers) {
    const { username, domain } = body;
    
    if (username !== 'admindomain') {
        return new Response(JSON.stringify({success: false}), {headers});
    }

    let domains = await getJSON(storage, 'domains') || [];
    domains = domains.filter(d => d.domain !== domain);
    await putJSON(storage, 'domains', domains);
    await addSecurityLog(storage, 'payment_reject', username, `결제 거부: ${domain}`);

    return new Response(JSON.stringify({success: true}), {headers});
}

async function suspendUser(body, storage, headers) {
    const { username, targetUser } = body;
    
    if (username !== 'admindomain') {
        return new Response(JSON.stringify({success: false}), {headers});
    }

    let users = await getJSON(storage, 'users') || [];
    const user = users.find(u => u.username === targetUser);
    
    if (user) {
        user.status = 'suspended';
        await putJSON(storage, 'users', users);
        await addSecurityLog(storage, 'user_suspend', username, `사용자 정지: ${targetUser}`);
    }

    return new Response(JSON.stringify({success: true}), {headers});
}

async function unsuspendUser(body, storage, headers) {
    const { username, targetUser } = body;
    
    if (username !== 'admindomain') {
        return new Response(JSON.stringify({success: false}), {headers});
    }

    let users = await getJSON(storage, 'users') || [];
    const user = users.find(u => u.username === targetUser);
    
    if (user) {
        user.status = 'active';
        await putJSON(storage, 'users', users);
        await addSecurityLog(storage, 'user_unsuspend', username, `사용자 정지 해제: ${targetUser}`);
    }

    return new Response(JSON.stringify({success: true}), {headers});
}

async function blacklistUser(body, storage, headers) {
    const { username, targetUser } = body;
    
    if (username !== 'admindomain') {
        return new Response(JSON.stringify({success: false}), {headers});
    }

    let users = await getJSON(storage, 'users') || [];
    const user = users.find(u => u.username === targetUser);
    
    if (user) {
        user.status = 'blacklisted';
        await putJSON(storage, 'users', users);
        await addSecurityLog(storage, 'user_blacklist', username, `사용자 블랙리스트: ${targetUser}`);
    }

    return new Response(JSON.stringify({success: true}), {headers});
}

async function addSecurityLog(storage, type, username, description) {
    try {
        let logs = await getJSON(storage, 'securityLogs') || [];
        logs.push({type, username, description, timestamp: Date.now()});
        if (logs.length > 100) logs = logs.slice(-100);
        await putJSON(storage, 'securityLogs', logs);
    } catch (e) {
        console.error('Security log error:', e);
    }
    }
