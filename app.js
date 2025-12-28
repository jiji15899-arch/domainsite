let currentUser = null;

async function init() {
    const user = localStorage.getItem('currentUser');
    if (user) {
        currentUser = JSON.parse(user);
        showMainSection();
        if (currentUser.username === 'admindomain') {
            window.location.href = '/admin.html';
        }
    }
    await loadExtensions();
}

function showMessage(msg, type = 'success') {
    const msgEl = document.getElementById('message');
    msgEl.textContent = msg;
    msgEl.className = `message ${type}`;
    msgEl.style.display = 'block';
    setTimeout(() => msgEl.style.display = 'none', 3000);
}

function showLogin() {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
}

function showRegister() {
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('login-form').style.display = 'none';
}

function hideAuth() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'none';
}

async function register() {
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;

    if (!username || !email || !password) {
        showMessage('모든 필드를 입력해주세요', 'error');
        return;
    }

    try {
        const res = await fetch('/api/domains', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({action: 'register', username, email, password})
        });
        const data = await res.json();
        
        if (data.success) {
            showMessage('회원가입 성공! 로그인해주세요');
            hideAuth();
            document.getElementById('reg-username').value = '';
            document.getElementById('reg-email').value = '';
            document.getElementById('reg-password').value = '';
        } else {
            showMessage(data.message || '회원가입 실패', 'error');
        }
    } catch (e) {
        showMessage('오류가 발생했습니다', 'error');
    }
}

async function login() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!username || !password) {
        showMessage('사용자명과 비밀번호를 입력해주세요', 'error');
        return;
    }

    try {
        const res = await fetch('/api/domains', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({action: 'login', username, password})
        });
        const data = await res.json();
        
        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            if (username === 'admindomain') {
                window.location.href = '/admin.html';
            } else {
                showMainSection();
                showMessage('로그인 성공!');
            }
        } else {
            showMessage(data.message || '로그인 실패', 'error');
        }
    } catch (e) {
        showMessage('오류가 발생했습니다', 'error');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('main-section').style.display = 'none';
    showMessage('로그아웃되었습니다');
}

function showMainSection() {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('main-section').style.display = 'block';
    document.querySelector('.auth-buttons').style.display = 'none';
    loadMyDomains();
}

async function loadExtensions() {
    try {
        const res = await fetch('/api/domains?action=getExtensions');
        const data = await res.json();
        
        const select = document.getElementById('domain-ext');
        if (select) {
            select.innerHTML = data.extensions.map(ext => 
                `<option value="${ext.name}" data-price="${ext.price}">${ext.name} ${ext.price > 0 ? `(₩${ext.price})` : '(무료)'}</option>`
            ).join('');
        }
    } catch (e) {
        console.error('확장자 로드 실패:', e);
    }
}

async function requestDomain() {
    const domainName = document.getElementById('domain-name').value.trim().toLowerCase();
    const ext = document.getElementById('domain-ext').value;
    const price = document.getElementById('domain-ext').selectedOptions[0].dataset.price;
    
    const ns1 = document.getElementById('ns1').value.trim();
    const ns2 = document.getElementById('ns2').value.trim();
    const ns3 = document.getElementById('ns3').value.trim();
    const ns4 = document.getElementById('ns4').value.trim();

    if (!domainName || !ns1) {
        showMessage('도메인 이름과 최소 1개의 네임서버를 입력해주세요', 'error');
        return;
    }

    if (!/^[a-z0-9-]+$/.test(domainName)) {
        showMessage('도메인은 영문 소문자, 숫자, 하이픈만 사용 가능합니다', 'error');
        return;
    }

    const nameservers = [ns1, ns2, ns3, ns4].filter(ns => ns);

    try {
        const res = await fetch('/api/domains', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                action: 'requestDomain',
                username: currentUser.username,
                domain: domainName + ext,
                nameservers,
                price: parseFloat(price)
            })
        });
        const data = await res.json();
        
        if (data.success) {
            if (data.needsPayment) {
                showMessage(`결제가 필요합니다. 결제 후 승인을 기다려주세요`, 'error');
                if (data.paymentUrl) window.open(data.paymentUrl, '_blank');
            } else {
                showMessage('도메인이 성공적으로 등록되었습니다!');
                document.getElementById('domain-name').value = '';
                document.getElementById('ns1').value = '';
                document.getElementById('ns2').value = '';
                document.getElementById('ns3').value = '';
                document.getElementById('ns4').value = '';
                loadMyDomains();
            }
        } else {
            showMessage(data.message || '도메인 등록 실패', 'error');
        }
    } catch (e) {
        showMessage('오류가 발생했습니다', 'error');
    }
}

async function loadMyDomains() {
    if (!currentUser) return;
    
    try {
        const res = await fetch(`/api/domains?action=getMyDomains&username=${currentUser.username}`);
        const data = await res.json();
        
        const list = document.getElementById('domain-list');
        if (data.domains.length === 0) {
            list.innerHTML = '<p>등록된 도메인이 없습니다.</p>';
        } else {
            list.innerHTML = data.domains.map(d => `
                <div class="domain-item">
                    <h4>${d.domain}</h4>
                    <p><strong>상태:</strong> ${d.status === 'active' ? '활성' : d.status === 'pending' ? '결제 대기' : '정지됨'}</p>
                    <p><strong>네임서버:</strong> ${d.nameservers.join(', ')}</p>
                    <p><strong>등록일:</strong> ${new Date(d.createdAt).toLocaleString('ko-KR')}</p>
                    <p><strong>만료일:</strong> 무제한</p>
                </div>
            `).join('');
        }
    } catch (e) {
        console.error('도메인 로드 실패:', e);
    }
}

window.onload = init;
