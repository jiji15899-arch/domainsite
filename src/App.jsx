import React, { useState, useEffect } from 'react';
import { Globe, Server, CheckCircle, AlertCircle, Loader, Settings, Shield, Users, DollarSign, Ban, Clock, Eye, LogOut, LogIn } from 'lucide-react';

const ADMIN_CREDENTIALS = { username: 'admindomain', password: 'admindomain120327' };
const API_BASE = '/api';

export default function App() {
  const [user, setUser] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '', isRegister: false });
  const [view, setView] = useState('domain'); // domain, admin
  
  // 도메인 발급
  const [step, setStep] = useState(1);
  const [domainName, setDomainName] = useState('');
  const [nameservers, setNameservers] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [extension, setExtension] = useState('');
  
  // 관리자
  const [extensions, setExtensions] = useState([]);
  const [users, setUsers] = useState([]);
  const [payments, setPendingPayments] = useState([]);
  const [securityLogs, setSecurityLogs] = useState([]);
  const [botSchedule, setBotSchedule] = useState({ start: '00:00', end: '23:59', active: true });
  const [newExt, setNewExt] = useState({ name: '', price: 0, paymentRequired: false, paymentLink: '' });

  useEffect(() => {
    loadData();
    const savedUser = localStorage.getItem('user');
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  const loadData = async () => {
    try {
      const [exts, usrs, pays, logs] = await Promise.all([
        fetch(`${API_BASE}/extensions`).then(r => r.json()),
        fetch(`${API_BASE}/users`).then(r => r.json()),
        fetch(`${API_BASE}/payments`).then(r => r.json()),
        fetch(`${API_BASE}/security-logs`).then(r => r.json())
      ]);
      setExtensions(exts.data || [{ name: '.example.com', price: 0, paymentRequired: false }]);
      setUsers(usrs.data || []);
      setPendingPayments(pays.data || []);
      setSecurityLogs(logs.data || []);
    } catch (e) {
      setExtensions([{ name: '.example.com', price: 0, paymentRequired: false }]);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const { username, password, isRegister } = loginForm;
    
    if (isRegister) {
      const newUser = { username, password, role: 'user', status: 'active', createdAt: Date.now() };
      await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      setUser(newUser);
      localStorage.setItem('user', JSON.stringify(newUser));
      setShowLogin(false);
    } else {
      if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        const adminUser = { username, role: 'admin', status: 'active' };
        setUser(adminUser);
        localStorage.setItem('user', JSON.stringify(adminUser));
        setShowLogin(false);
      } else {
        const res = await fetch(`${API_BASE}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
          setUser(data.user);
          localStorage.setItem('user', JSON.stringify(data.user));
          setShowLogin(false);
        } else {
          setError('로그인 실패');
        }
      }
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
    setView('domain');
  };

  const addExtension = async () => {
    if (!newExt.name.startsWith('.')) return;
    const ext = { ...newExt, id: Date.now(), createdBy: user.username };
    await fetch(`${API_BASE}/extensions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ext)
    });
    setExtensions([...extensions, ext]);
    setNewExt({ name: '', price: 0, paymentRequired: false, paymentLink: '' });
  };

  const removeExtension = async (id) => {
    await fetch(`${API_BASE}/extensions/${id}`, { method: 'DELETE' });
    setExtensions(extensions.filter(e => e.id !== id));
  };

  const handleDomainSubmit = async () => {
    if (!user) {
      setError('로그인이 필요합니다');
      setShowLogin(true);
      return;
    }

    if (user.status === 'suspended' || user.status === 'blacklisted') {
      setError('계정이 정지되었습니다');
      return;
    }

    const selectedExt = extensions.find(e => e.name === extension);
    if (selectedExt?.paymentRequired && user.role !== 'admin') {
      if (selectedExt.paymentLink) {
        window.open(selectedExt.paymentLink, '_blank');
      }
      await fetch(`${API_BASE}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: user.username,
          domain: `${domainName}${extension}`,
          amount: selectedExt.price,
          status: 'pending',
          createdAt: Date.now()
        })
      });
      setError('결제 후 관리자 승인이 필요합니다');
      return;
    }

    setLoading(true);
    try {
      const validNS = nameservers.filter(ns => ns.trim());
      const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainName, extension, nameservers: validNS, user: user.username })
      });
      const data = await res.json();
      if (data.success) {
        setResult({ domain: `${domainName}${extension}`, nameservers: validNS, status: 'active', createdAt: new Date().toISOString(), expiresAt: '무제한' });
        setStep(3);
      }
    } catch (e) {
      setError('도메인 발급 실패');
    }
    setLoading(false);
  };

  const approvePayment = async (paymentId, approve) => {
    await fetch(`${API_BASE}/payments/${paymentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: approve ? 'approved' : 'rejected' })
    });
    loadData();
  };

  const updateUserStatus = async (username, status) => {
    await fetch(`${API_BASE}/users/${username}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    loadData();
  };

  const updateBotSchedule = async () => {
    await fetch(`${API_BASE}/bot-schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(botSchedule)
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <Globe className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-900">무료 도메인 제공</h1>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="text"
              placeholder="사용자명"
              value={loginForm.username}
              onChange={(e) => setLoginForm({...loginForm, username: e.target.value})}
              className="w-full p-3 border rounded-lg"
              required
            />
            <input
              type="password"
              placeholder="비밀번호"
              value={loginForm.password}
              onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
              className="w-full p-3 border rounded-lg"
              required
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button type="submit" className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
              {loginForm.isRegister ? '회원가입' : '로그인'}
            </button>
            <button
              type="button"
              onClick={() => setLoginForm({...loginForm, isRegister: !loginForm.isRegister})}
              className="w-full text-indigo-600 text-sm hover:underline"
            >
              {loginForm.isRegister ? '로그인으로 전환' : '회원가입으로 전환'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* 헤더 */}
        <div className="bg-white rounded-lg shadow-lg p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Globe className="w-8 h-8 text-indigo-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">무료 도메인 제공</h1>
              <p className="text-sm text-gray-600">{user.username} ({user.role === 'admin' ? '관리자' : '사용자'})</p>
            </div>
          </div>
          <div className="flex gap-2">
            {user.role === 'admin' && (
              <button
                onClick={() => setView(view === 'domain' ? 'admin' : 'domain')}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
              >
                {view === 'admin' ? <Globe className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                {view === 'admin' ? '도메인 발급' : '관리자 패널'}
              </button>
            )}
            <button onClick={handleLogout} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 flex items-center gap-2">
              <LogOut className="w-4 h-4" />
              로그아웃
            </button>
          </div>
        </div>

        {/* 관리자 패널 */}
        {view === 'admin' && user.role === 'admin' && (
          <div className="space-y-6">
            {/* 확장자 관리 */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                확장자 관리
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-5 gap-2">
                  <input
                    type="text"
                    placeholder=".example.com"
                    value={newExt.name}
                    onChange={(e) => setNewExt({...newExt, name: e.target.value})}
                    className="p-2 border rounded"
                  />
                  <input
                    type="number"
                    placeholder="가격 (원)"
                    value={newExt.price}
                    onChange={(e) => setNewExt({...newExt, price: Number(e.target.value)})}
                    className="p-2 border rounded"
                  />
                  <input
                    type="text"
                    placeholder="결제 링크"
                    value={newExt.paymentLink}
                    onChange={(e) => setNewExt({...newExt, paymentLink: e.target.value})}
                    className="p-2 border rounded"
                  />
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newExt.paymentRequired}
                      onChange={(e) => setNewExt({...newExt, paymentRequired: e.target.checked})}
                    />
                    <span className="text-sm">결제 필요</span>
                  </label>
                  <button onClick={addExtension} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                    추가
                  </button>
                </div>
                <div className="space-y-2">
                  {extensions.map((ext) => (
                    <div key={ext.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div>
                        <span className="font-mono font-bold">{ext.name}</span>
                        {ext.paymentRequired && <span className="ml-2 text-sm text-green-600">₩{ext.price}</span>}
                      </div>
                      <button onClick={() => removeExtension(ext.id)} className="text-red-600 text-sm hover:underline">
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 결제 승인 */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                결제 승인 ({payments.filter(p => p.status === 'pending').length})
              </h2>
              <div className="space-y-2">
                {payments.filter(p => p.status === 'pending').map((pay) => (
                  <div key={pay.id} className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <div>
                      <p className="font-semibold">{pay.domain}</p>
                      <p className="text-sm text-gray-600">{pay.user} - ₩{pay.amount}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => approvePayment(pay.id, true)} className="px-3 py-1 bg-green-600 text-white rounded text-sm">
                        승인
                      </button>
                      <button onClick={() => approvePayment(pay.id, false)} className="px-3 py-1 bg-red-600 text-white rounded text-sm">
                        거부
                      </button>
                    </div>
                  </div>
                ))}
                {payments.filter(p => p.status === 'pending').length === 0 && (
                  <p className="text-gray-500 text-center py-4">대기 중인 결제가 없습니다</p>
                )}
              </div>
            </div>

            {/* 사용자 관리 */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" />
                사용자 관리 ({users.length})
              </h2>
              <div className="space-y-2">
                {users.map((u) => (
                  <div key={u.username} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div>
                      <p className="font-semibold">{u.username}</p>
                      <p className="text-sm text-gray-600">상태: {u.status === 'active' ? '활성' : u.status === 'suspended' ? '정지' : '블랙리스트'}</p>
                    </div>
                    <div className="flex gap-2">
                      {u.status === 'active' && (
                        <button onClick={() => updateUserStatus(u.username, 'suspended')} className="px-3 py-1 bg-yellow-600 text-white rounded text-sm">
                          정지
                        </button>
                      )}
                      {u.status === 'suspended' && (
                        <button onClick={() => updateUserStatus(u.username, 'active')} className="px-3 py-1 bg-green-600 text-white rounded text-sm">
                          해제
                        </button>
                      )}
                      <button onClick={() => updateUserStatus(u.username, 'blacklisted')} className="px-3 py-1 bg-red-600 text-white rounded text-sm">
                        블랙리스트
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 보안봇 설정 */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                보안봇 스케줄 (한국 표준시)
              </h2>
              <div className="space-y-4">
                <div className="flex gap-4 items-center">
                  <input
                    type="time"
                    value={botSchedule.start}
                    onChange={(e) => setBotSchedule({...botSchedule, start: e.target.value})}
                    className="p-2 border rounded"
                  />
                  <span>~</span>
                  <input
                    type="time"
                    value={botSchedule.end}
                    onChange={(e) => setBotSchedule({...botSchedule, end: e.target.value})}
                    className="p-2 border rounded"
                  />
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={botSchedule.active}
                      onChange={(e) => setBotSchedule({...botSchedule, active: e.target.checked})}
                    />
                    <span>활성화</span>
                  </label>
                  <button onClick={updateBotSchedule} className="px-4 py-2 bg-indigo-600 text-white rounded">
                    저장
                  </button>
                </div>
              </div>
            </div>

            {/* 보안 로그 */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Eye className="w-5 h-5" />
                보안 로그 ({securityLogs.length})
              </h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {securityLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-red-50 border border-red-200 rounded">
                    <p className="font-semibold text-red-800">{log.type}</p>
                    <p className="text-sm text-gray-600">{log.user} - {log.description}</p>
                    <p className="text-xs text-gray-500">{new Date(log.timestamp).toLocaleString('ko-KR')}</p>
                  </div>
                ))}
                {securityLogs.length === 0 && (
                  <p className="text-gray-500 text-center py-4">보안 이벤트가 없습니다</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 도메인 발급 */}
        {view === 'domain' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            {step === 1 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold">도메인 발급</h2>
                <div>
                  <label className="block text-sm font-medium mb-2">확장자 선택</label>
                  <select value={extension} onChange={(e) => setExtension(e.target.value)} className="w-full p-3 border rounded-lg">
                    <option value="">선택하세요</option>
                    {extensions.map((ext) => (
                      <option key={ext.id} value={ext.name}>
                        {ext.name} {ext.paymentRequired && `(₩${ext.price})`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">도메인 이름</label>
                  <div className="flex">
                    <input
                      type="text"
                      value={domainName}
                      onChange={(e) => setDomainName(e.target.value.toLowerCase())}
                      placeholder="mywebsite"
                      className="flex-1 p-3 border rounded-l-lg"
                    />
                    <div className="px-4 py-3 bg-gray-100 border border-l-0 rounded-r-lg">{extension}</div>
                  </div>
                </div>
                {error && <p className="text-red-600">{error}</p>}
                <button
                  onClick={() => setStep(2)}
                  disabled={!domainName || !extension}
                  className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300"
                >
                  다음
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold">네임서버 설정</h2>
                {nameservers.map((ns, i) => (
                  <input
                    key={i}
                    type="text"
                    value={ns}
                    onChange={(e) => {
                      const newNS = [...nameservers];
                      newNS[i] = e.target.value;
                      setNameservers(newNS);
                    }}
                    placeholder={`네임서버 ${i + 1}`}
                    className="w-full p-3 border rounded-lg"
                  />
                ))}
                {error && <p className="text-red-600">{error}</p>}
                <div className="flex gap-3">
                  <button onClick={() => setStep(1)} className="flex-1 py-3 bg-gray-200 rounded-lg">이전</button>
                  <button
                    onClick={handleDomainSubmit}
                    disabled={loading}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    {loading ? '처리 중...' : '발급'}
                  </button>
                </div>
              </div>
            )}

            {step === 3 && result && (
              <div className="space-y-6">
                <div className="text-center">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold mb-2">발급 완료!</h2>
                  <p className="text-xl text-indigo-600 font-bold">{result.domain}</p>
                </div>
                <button
                  onClick={() => {
                    setStep(1);
                    setDomainName('');
                    setNameservers(['', '', '', '']);
                    setResult(null);
                  }}
                  className="w-full py-3 bg-indigo-600 text-white rounded-lg"
                >
                  새 도메인 발급
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
    }
