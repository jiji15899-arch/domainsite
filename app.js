// 스토리지 사용 가능 여부 확인
function isStorageAvailable() {
    return typeof window !== 'undefined' && window.storage && typeof window.storage.get === 'function';
}

// 로컬 스토리지 폴백
const localDB = {
    data: {},
    get(key) {
        if (this.data[key]) return Promise.resolve({value: this.data[key]});
        const stored = localStorage.getItem('db_' + key);
        if (stored) {
            this.data[key] = stored;
            return Promise.resolve({value: stored});
        }
        return Promise.reject(new Error('Key not found'));
    },
    set(key, value) {
        this.data[key] = value;
        localStorage.setItem('db_' + key, value);
        return Promise.resolve({key, value});
    }
};

// 스토리지 래퍼
const storage = {
    async get(key) {
        if (isStorageAvailable()) {
            return await window.storage.get(key);
        }
        return await localDB.get(key);
    },
    async set(key, value) {
        if (isStorageAvailable()) {
            return await window.storage.set(key, value);
        }
        return await localDB.set(key, value);
    }
};

// 스토리지 초기화
async function initStorage() {
    const defaults = {
        users: [{username: 'admindomain', password: 'admindomain120327', email: 'admin@domain.com', role: 'admin', status: 'active'}],
        extensions: [{ext: '.com', price: 0, paymentLink: ''}, {ext: '.net', price: 0, paymentLink: ''}, {ext: '.org', price: 0, paymentLink: ''}],
        domains: [],
        payments: [],
        security: {botStartTime: '00:00', botEndTime: '23:59', suspiciousActivities: []}
    };

    for (const [key, value] of Object.entries(defaults)) {
        try {
            await storage.get(key);
        } catch {
            await storage.set(key, JSON.stringify(value));
        }
    }
}

// 데이터 가져오기
async function getData(key) {
    try {
        const result = await storage.get(key);
        return JSON.parse(result.value);
    } catch {
        return null;
    }
}

// 데이터 저장
async function setData(key, value) {
    await storage.set(key, JSON.stringify(value));
}

// 현재 사용자
function getCurrentUser() {
    const user = localStorage.getItem('currentUser');
    return user ? JSON.parse(user) : null;
}

// 인증 확인
function checkAuth() {
    const user = getCurrentUser();
    if (!user) {
        window.location.href = 'login.html';
        return false;
    }
    if (user.status !== 'active') {
        alert('계정이 정지되었습니다.');
        localStorage.removeItem('currentUser');
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// 관리자 확인
function checkAdminAuth() {
    const user = getCurrentUser();
    if (!user || user.role !== 'admin') {
        alert('관리자 권한이 필요합니다.');
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

// 페이지 초기화
async function initPage() {
    await initStorage();
    const navMenu = document.getElementById('navMenu');
    if (!navMenu) return;
    
    const user = getCurrentUser();
    if (user) {
        navMenu.innerHTML = `
            <span style="color: white; margin-right: 15px;">${user.username}님</span>
            <a href="dashboard.html">내 도메인</a>
            ${user.role === 'admin' ? '<a href="admin.html">관리자</a>' : ''}
            <button onclick="logout()">로그아웃</button>
        `;
    } else {
        navMenu.innerHTML = `
            <a href="login.html">로그인</a>
            <a href="register.html">회원가입</a>
        `;
    }
}

// 로그아웃
function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}

// 회원가입
async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!username || !email || !password) {
        alert('모든 필드를 입력해주세요.');
        return;
    }

    if (password !== confirmPassword) {
        alert('비밀번호가 일치하지 않습니다.');
        return;
    }

    try {
        await initStorage();
        const users = await getData('users') || [];
        
        if (users.find(u => u.username === username)) {
            alert('이미 존재하는 사용자명입니다.');
            return;
        }

        users.push({
            username,
            email,
            password,
            role: 'user',
            status: 'active',
            createdAt: new Date().toISOString()
        });

        await setData('users', users);
        alert('회원가입이 완료되었습니다.');
        window.location.href = 'login.html';
    } catch (error) {
        console.error('회원가입 오류:', error);
        alert('회원가입 중 오류가 발생했습니다: ' + error.message);
    }
}

// 로그인
async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
        alert('사용자명과 비밀번호를 입력해주세요.');
        return;
    }

    try {
        await initStorage();
        const users = await getData('users') || [];
        
        const user = users.find(u => u.username === username && u.password === password);
        
        if (!user) {
            alert('사용자명 또는 비밀번호가 올바르지 않습니다.');
            return;
        }

        if (user.status !== 'active') {
            alert('계정이 정지되었습니다. 관리자에게 문의하세요.');
            return;
        }

        localStorage.setItem('currentUser', JSON.stringify(user));
        
        if (user.role === 'admin') {
            window.location.href = 'admin.html';
        } else {
            window.location.href = 'dashboard.html';
        }
    } catch (error) {
        console.error('로그인 오류:', error);
        alert('로그인 중 오류가 발생했습니다: ' + error.message);
    }
}

// 확장자 로드
async function loadExtensions() {
    try {
        await initStorage();
        const extensions = await getData('extensions') || [];
        const select = document.getElementById('domainExt');
        if (select) {
            select.innerHTML = extensions.map(e => 
                `<option value="${e.ext}">${e.ext} ${e.price > 0 ? '(₩' + e.price + ')' : '(무료)'}</option>`
            ).join('');
        }
    } catch (error) {
        console.error('확장자 로드 실패:', error);
    }
}

// 도메인 확인
async function checkDomain() {
    const domainName = document.getElementById('domainName').value.trim();
    const domainExt = document.getElementById('domainExt').value;
    const resultDiv = document.getElementById('searchResult');
    const registerForm = document.getElementById('registerForm');

    if (!domainName) {
        alert('도메인 이름을 입력하세요.');
        return;
    }

    const user = getCurrentUser();
    if (!user) {
        alert('로그인이 필요합니다.');
        window.location.href = 'login.html';
        return;
    }

    const fullDomain = domainName + domainExt;

    try {
        const domains = await getData('domains') || [];
        const exists = domains.find(d => d.domain === fullDomain);

        if (exists) {
            resultDiv.className = 'unavailable';
            resultDiv.textContent = `${fullDomain}은(는) 이미 등록된 도메인입니다.`;
            registerForm.style.display = 'none';
        } else {
            resultDiv.className = 'available';
            resultDiv.textContent = `${fullDomain}은(는) 등록 가능합니다!`;
            registerForm.style.display = 'block';

            const extensions = await getData('extensions') || [];
            const extInfo = extensions.find(e => e.ext === domainExt);

            const paymentInfoDiv = document.getElementById('paymentInfo');
            if (extInfo && extInfo.price > 0 && user.role !== 'admin') {
                paymentInfoDiv.innerHTML = `
                    <p><strong>결제 필요:</strong> ₩${extInfo.price}</p>
                    ${extInfo.paymentLink ? `<p>결제 링크: <a href="${extInfo.paymentLink}" target="_blank">결제하기</a></p>` : ''}
                    <p>결제 완료 후 관리자 승인이 필요합니다.</p>
                `;
            } else {
                paymentInfoDiv.innerHTML = '';
            }
        }
    } catch (error) {
        console.error('도메인 확인 오류:', error);
        alert('도메인 확인 중 오류가 발생했습니다.');
    }
}

// 도메인 등록
async function registerDomain() {
    const domainName = document.getElementById('domainName').value.trim();
    const domainExt = document.getElementById('domainExt').value;
    const ns1 = document.getElementById('ns1').value.trim();
    const ns2 = document.getElementById('ns2').value.trim();
    const ns3 = document.getElementById('ns3').value.trim();
    const ns4 = document.getElementById('ns4').value.trim();

    if (!ns1 || !ns2) {
        alert('최소 2개의 네임서버를 입력해야 합니다.');
        return;
    }

    const user = getCurrentUser();
    const fullDomain = domainName + domainExt;
    const nameservers = [ns1, ns2, ns3, ns4].filter(ns => ns);

    try {
        const extensions = await getData('extensions') || [];
        const extInfo = extensions.find(e => e.ext === domainExt);

        if (extInfo && extInfo.price > 0 && user.role !== 'admin') {
            const payments = await getData('payments') || [];
            
            payments.push({
                id: Date.now(),
                username: user.username,
                domain: fullDomain,
                price: extInfo.price,
                status: 'pending',
                nameservers,
                createdAt: new Date().toISOString()
            });

            await setData('payments', payments);
            alert('결제 승인 대기 중입니다. 관리자가 확인 후 도메인이 등록됩니다.');
            window.location.href = 'dashboard.html';
            return;
        }

        const domains = await getData('domains') || [];

        domains.push({
            domain: fullDomain,
            owner: user.username,
            nameservers,
            registeredAt: new Date().toISOString(),
            status: 'active'
        });

        await setData('domains', domains);
        alert('도메인이 성공적으로 등록되었습니다!');
        window.location.href = 'dashboard.html';
    } catch (error) {
        console.error('도메인 등록 오류:', error);
        alert('도메인 등록 중 오류가 발생했습니다.');
    }
}

// 사용자 도메인 로드
async function loadUserDomains() {
    if (!checkAuth()) return;

    const user = getCurrentUser();
    const container = document.getElementById('userDomains');

    try {
        const domains = await getData('domains') || [];
        const userDomains = domains.filter(d => d.owner === user.username);

        if (userDomains.length === 0) {
            container.innerHTML = '<p>등록된 도메인이 없습니다.</p>';
            return;
        }

        container.innerHTML = userDomains.map(d => `
            <div class="domain-card">
                <h4>${d.domain}</h4>
                <p><strong>등록일:</strong> ${new Date(d.registeredAt).toLocaleDateString('ko-KR')}</p>
                <p><strong>상태:</strong> ${d.status === 'active' ? '활성' : '비활성'}</p>
                <p><strong>네임서버:</strong></p>
                <ul>
                    ${d.nameservers.map(ns => `<li>${ns}</li>`).join('')}
                </ul>
            </div>
        `).join('');
    } catch (error) {
        console.error('도메인 로드 오류:', error);
        container.innerHTML = '<p>도메인을 불러오는 중 오류가 발생했습니다.</p>';
    }
}

// 관리자 데이터 로드
async function loadAdminData() {
    if (!checkAdminAuth()) return;
    await loadExtensionList();
    await loadPendingPayments();
    await loadUserList();
    await loadAllDomains();
    await loadSecuritySettings();
}

// 탭 전환
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');
}

// 확장자 추가
async function addExtension() {
    const ext = document.getElementById('newExt').value.trim();
    const price = parseInt(document.getElementById('extPrice').value) || 0;
    const paymentLink = document.getElementById('paymentLink').value.trim();

    if (!ext.startsWith('.')) {
        alert('확장자는 .으로 시작해야 합니다.');
        return;
    }

    try {
        const extensions = await getData('extensions') || [];

        if (extensions.find(e => e.ext === ext)) {
            alert('이미 존재하는 확장자입니다.');
            return;
        }

        extensions.push({ext, price, paymentLink});
        await setData('extensions', extensions);
        
        document.getElementById('newExt').value = '';
        document.getElementById('extPrice').value = '';
        document.getElementById('paymentLink').value = '';
        
        await loadExtensionList();
        alert('확장자가 추가되었습니다.');
    } catch (error) {
        console.error('확장자 추가 오류:', error);
        alert('확장자 추가 중 오류가 발생했습니다.');
    }
}

// 확장자 목록
async function loadExtensionList() {
    try {
        const extensions = await getData('extensions') || [];
        const container = document.getElementById('extensionList');

        container.innerHTML = extensions.map((e, i) => `
            <div class="extension-item">
                <div>
                    <strong>${e.ext}</strong> - ${e.price > 0 ? '₩' + e.price : '무료'}
                    ${e.paymentLink ? ` | <a href="${e.paymentLink}" target="_blank">결제링크</a>` : ''}
                </div>
                <button class="btn-danger" onclick="deleteExtension(${i})">삭제</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('확장자 목록 로드 실패:', error);
    }
}

// 확장자 삭제
async function deleteExtension(index) {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
        const extensions = await getData('extensions') || [];
        extensions.splice(index, 1);
        await setData('extensions', extensions);
        await loadExtensionList();
    } catch (error) {
        alert('확장자 삭제 중 오류가 발생했습니다.');
    }
}

// 결제 승인 대기
async function loadPendingPayments() {
    try {
        const payments = await getData('payments') || [];
        const pending = payments.filter(p => p.status === 'pending');
        const container = document.getElementById('pendingPayments');

        if (pending.length === 0) {
            container.innerHTML = '<p>대기 중인 결제가 없습니다.</p>';
            return;
        }

        container.innerHTML = pending.map(p => `
            <div class="payment-item">
                <div>
                    <strong>${p.domain}</strong> - ${p.username} - ₩${p.price}
                    <br><small>${new Date(p.createdAt).toLocaleString('ko-KR')}</small>
                </div>
                <div>
                    <button class="btn-success" onclick="approvePayment(${p.id})">승인</button>
                    <button class="btn-danger" onclick="rejectPayment(${p.id})">거부</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('결제 목록 로드 실패:', error);
    }
}

// 결제 승인
async function approvePayment(id) {
    try {
        const payments = await getData('payments') || [];
        const payment = payments.find(p => p.id === id);

        if (!payment) return;

        const domains = await getData('domains') || [];

        domains.push({
            domain: payment.domain,
            owner: payment.username,
            nameservers: payment.nameservers,
            registeredAt: new Date().toISOString(),
            status: 'active'
        });

        payment.status = 'approved';

        await setData('domains', domains);
        await setData('payments', payments);

        alert('결제가 승인되었습니다.');
        await loadPendingPayments();
    } catch (error) {
        alert('결제 승인 중 오류가 발생했습니다.');
    }
}

// 결제 거부
async function rejectPayment(id) {
    try {
        const payments = await getData('payments') || [];
        const payment = payments.find(p => p.id === id);
        
        if (payment) {
            payment.status = 'rejected';
            await setData('payments', payments);
            alert('결제가 거부되었습니다.');
            await loadPendingPayments();
        }
    } catch (error) {
        alert('결제 거부 중 오류가 발생했습니다.');
    }
}

// 사용자 목록
async function loadUserList() {
    try {
        const users = await getData('users') || [];
        const container = document.getElementById('userList');

        container.innerHTML = users.filter(u => u.role !== 'admin').map(u => `
            <div class="user-item">
                <div>
                    <strong>${u.username}</strong> (${u.email})
                    <br><small>상태: ${u.status === 'active' ? '활성' : u.status === 'suspended' ? '정지' : '블랙리스트'}</small>
                </div>
                <div>
                    ${u.status === 'active' ? 
                        `<button class="btn-warning" onclick="suspendUser('${u.username}')">정지</button>
                         <button class="btn-danger" onclick="blacklistUser('${u.username}')">블랙리스트</button>` :
                        `<button class="btn-success" onclick="activateUser('${u.username}')">활성화</button>`
                    }
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('사용자 목록 로드 실패:', error);
    }
}

// 사용자 정지
async function suspendUser(username) {
    if (!confirm('정말 정지하시겠습니까?')) return;

    try {
        const users = await getData('users') || [];
        const user = users.find(u => u.username === username);
        
        if (user) {
            user.status = 'suspended';
            await setData('users', users);
            await loadUserList();
        }
    } catch (error) {
        alert('사용자 정지 중 오류가 발생했습니다.');
    }
}

// 블랙리스트
async function blacklistUser(username) {
    if (!confirm('정말 블랙리스트에 등재하시겠습니까?')) return;

    try {
        const users = await getData('users') || [];
        const user = users.find(u => u.username === username);
        
        if (user) {
            user.status = 'blacklisted';
            await setData('users', users);
            await loadUserList();
        }
    } catch (error) {
        alert('블랙리스트 등재 중 오류가 발생했습니다.');
    }
}

// 사용자 활성화
async function activateUser(username) {
    try {
        const users = await getData('users') || [];
        const user = users.find(u => u.username === username);
        
        if (user) {
            user.status = 'active';
            await setData('users', users);
            await loadUserList();
        }
    } catch (error) {
        alert('사용자 활성화 중 오류가 발생했습니다.');
    }
}

// 전체 도메인
async function loadAllDomains() {
    try {
        const domains = await getData('domains') || [];
        const container = document.getElementById('allDomains');

        if (domains.length === 0) {
            container.innerHTML = '<p>등록된 도메인이 없습니다.</p>';
            return;
        }

        container.innerHTML = domains.map((d, i) => `
            <div class="domain-item">
                <div>
                    <strong>${d.domain}</strong> - ${d.owner}
                    <br><small>${new Date(d.registeredAt).toLocaleDateString('ko-KR')} | ${d.status}</small>
                </div>
                <button class="btn-danger" onclick="deleteDomain(${i})">삭제</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('도메인 목록 로드 실패:', error);
    }
}

// 도메인 삭제
async function deleteDomain(index) {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
        const domains = await getData('domains') || [];
        domains.splice(index, 1);
        await setData('domains', domains);
        await loadAllDomains();
    } catch (error) {
        alert('도메인 삭제 중 오류가 발생했습니다.');
    }
}

// 보안 설정
async function loadSecuritySettings() {
    try {
        const security = await getData('security') || {botStartTime: '00:00', botEndTime: '23:59', suspiciousActivities: []};

        document.getElementById('botStartTime').value = security.botStartTime;
        document.getElementById('botEndTime').value = security.botEndTime;

        const container = document.getElementById('suspiciousActivities');
        if (security.suspiciousActivities.length === 0) {
            container.innerHTML = '<p>의심 활동이 감지되지 않았습니다.</p>';
        } else {
            container.innerHTML = security.suspiciousActivities.map((a, i) => `
                <div class="suspicious-item">
                    <div>
                        <strong>${a.username}</strong> - ${a.activity}
                        <br><small>${new Date(a.timestamp).toLocaleString('ko-KR')}</small>
                    </div>
                    <div>
                        <button class="btn-success" onclick="clearSuspicious(${i})">해제</button>
                        <button class="btn-danger" onclick="confirmSuspend('${a.username}')">정지 확정</button>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('보안 설정 로드 실패:', error);
    }
}

// 보안봇 업데이트
async function updateSecurityBot() {
    const startTime = document.getElementById('botStartTime').value;
    const endTime = document.getElementById('botEndTime').value;

    try {
        const security = await getData('security') || {suspiciousActivities: []};
        
        security.botStartTime = startTime;
        security.botEndTime = endTime;

        await setData('security', security);
        alert('보안봇 설정이 저장되었습니다.');
    } catch (error) {
        alert('설정 저장 중 오류가 발생했습니다.');
    }
}

// 의심 활동 해제
async function clearSuspicious(index) {
    try {
        const security = await getData('security') || {suspiciousActivities: []};
        
        security.suspiciousActivities.splice(index, 1);
        await setData('security', security);
        
        await loadSecuritySettings();
    } catch (error) {
        alert('해제 중 오류가 발생했습니다.');
    }
}

// 정지 확정
async function confirmSuspend(username) {
    await suspendUser(username);
    await loadSecuritySettings();
              }
