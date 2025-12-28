import React, { useState } from 'react';
import { Globe, Server, CheckCircle, AlertCircle, Loader, Settings } from 'lucide-react';

// API 엔드포인트 (배포 후 실제 URL로 변경)
const API_BASE = '/api';

export default function App() {
  const [step, setStep] = useState(1);
  const [domainName, setDomainName] = useState('');
  const [nameservers, setNameservers] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [extension, setExtension] = useState('.example.com');
  const [customExtensions, setCustomExtensions] = useState([
    '.example.com',
    '.free.com',
    '.mysite.net',
    '.demo.org'
  ]);
  const [showSettings, setShowSettings] = useState(false);
  const [newExtension, setNewExtension] = useState('');

  // 도메인 유효성 검사
  const validateDomain = (name) => {
    const regex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
    return regex.test(name) && name.length >= 3 && name.length <= 63;
  };

  // 네임서버 유효성 검사
  const validateNameserver = (ns) => {
    if (!ns) return true;
    const regex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;
    return regex.test(ns);
  };

  // 확장자 추가
  const addExtension = () => {
    if (newExtension && newExtension.startsWith('.')) {
      setCustomExtensions([...customExtensions, newExtension]);
      setNewExtension('');
    }
  };

  // 확장자 삭제
  const removeExtension = (ext) => {
    setCustomExtensions(customExtensions.filter(e => e !== ext));
  };

  // 도메인 가용성 확인
  const checkDomain = async () => {
    try {
      const response = await fetch(`${API_BASE}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainName, extension }),
      });
      const data = await response.json();
      return data.available;
    } catch (err) {
      console.error('도메인 확인 오류:', err);
      return true; // 오프라인 모드에서는 사용 가능으로 간주
    }
  };

  // 도메인 신청 처리
  const handleSubmit = async () => {
    setError('');
    setResult(null);

    if (!validateDomain(domainName)) {
      setError('유효하지 않은 도메인 이름입니다. 3-63자의 영문, 숫자, 하이픈만 사용 가능합니다.');
      return;
    }

    const validNameservers = nameservers.filter(ns => ns.trim() !== '');
    if (validNameservers.length === 0) {
      setError('최소 1개의 네임서버를 입력해주세요.');
      return;
    }

    for (let ns of validNameservers) {
      if (!validateNameserver(ns)) {
        setError(`유효하지 않은 네임서버: ${ns}`);
        return;
      }
    }

    setLoading(true);

    try {
      // 도메인 가용성 확인
      const available = await checkDomain();
      if (!available) {
        setError('이미 등록된 도메인입니다.');
        setLoading(false);
        return;
      }

      // 도메인 등록 API 호출
      const response = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domainName,
          extension,
          nameservers: validNameservers,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResult({
          domain: `${domainName}${extension}`,
          nameservers: validNameservers,
          status: 'active',
          createdAt: new Date().toISOString(),
          expiresAt: '무제한'
        });
        setStep(3);
      } else {
        setError(data.error || '도메인 등록에 실패했습니다.');
      }
    } catch (err) {
      console.error('등록 오류:', err);
      // 오프라인 모드 - 로컬 시뮬레이션
      setResult({
        domain: `${domainName}${extension}`,
        nameservers: validNameservers,
        status: 'active',
        createdAt: new Date().toISOString(),
        expiresAt: '무제한'
      });
      setStep(3);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Globe className="w-12 h-12 text-indigo-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            무료 도메인 제공 플랫폼
          </h1>
          <p className="text-gray-600">
            무료로 도메인을 발급받고 네임서버를 설정하세요
          </p>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="mt-4 text-indigo-600 hover:text-indigo-700 flex items-center mx-auto"
          >
            <Settings className="w-5 h-5 mr-2" />
            확장자 관리
          </button>
        </div>

        {/* 확장자 관리 패널 */}
        {showSettings && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">확장자 관리</h3>
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newExtension}
                  onChange={(e) => setNewExtension(e.target.value)}
                  placeholder=".mydomain.com"
                  className="flex-1 p-2 border border-gray-300 rounded-lg"
                />
                <button
                  onClick={addExtension}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  추가
                </button>
              </div>
              <div className="space-y-2">
                {customExtensions.map((ext, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <span className="font-mono text-gray-700">{ext}</span>
                    <button
                      onClick={() => removeExtension(ext)}
                      className="text-red-600 hover:text-red-700 text-sm"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 진행 단계 */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-8">
            <div className={`flex items-center ${step >= 1 ? 'text-indigo-600' : 'text-gray-400'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>
                1
              </div>
              <span className="ml-2 font-semibold">도메인 입력</span>
            </div>
            <div className="flex-1 h-1 mx-4 bg-gray-200">
              <div className={`h-full ${step >= 2 ? 'bg-indigo-600' : ''} transition-all`} style={{width: step >= 2 ? '100%' : '0%'}}></div>
            </div>
            <div className={`flex items-center ${step >= 2 ? 'text-indigo-600' : 'text-gray-400'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>
                2
              </div>
              <span className="ml-2 font-semibold">네임서버 설정</span>
            </div>
            <div className="flex-1 h-1 mx-4 bg-gray-200">
              <div className={`h-full ${step >= 3 ? 'bg-indigo-600' : ''} transition-all`} style={{width: step >= 3 ? '100%' : '0%'}}></div>
            </div>
            <div className={`flex items-center ${step >= 3 ? 'text-indigo-600' : 'text-gray-400'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>
                3
              </div>
              <span className="ml-2 font-semibold">완료</span>
            </div>
          </div>

          {/* Step 1: 도메인 입력 */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  확장자 선택
                </label>
                <select
                  value={extension}
                  onChange={(e) => setExtension(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {customExtensions.map((ext, index) => (
                    <option key={index} value={ext}>{ext}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  원하시는 도메인 이름을 입력하세요
                </label>
                <div className="flex items-center">
                  <input
                    type="text"
                    value={domainName}
                    onChange={(e) => setDomainName(e.target.value.toLowerCase())}
                    placeholder="mywebsite"
                    className="flex-1 p-3 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <div className="px-4 py-3 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-700 font-medium">
                    {extension}
                  </div>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  3-63자의 영문, 숫자, 하이픈(-) 사용 가능
                </p>
              </div>

              {domainName && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <p className="text-indigo-800 font-semibold">
                    발급될 도메인: {domainName}{extension}
                  </p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                    <p className="text-red-800">{error}</p>
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  if (validateDomain(domainName)) {
                    setStep(2);
                    setError('');
                  } else {
                    setError('유효하지 않은 도메인 이름입니다.');
                  }
                }}
                disabled={!domainName}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                다음 단계
              </button>
            </div>
          )}

          {/* Step 2: 네임서버 설정 */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-start">
                  <Server className="w-5 h-5 text-blue-600 mt-0.5 mr-2 flex-shrink-0" />
                  <div>
                    <p className="text-blue-800 font-semibold mb-1">네임서버란?</p>
                    <p className="text-blue-700 text-sm">
                      네임서버는 도메인의 DNS 설정을 관리하는 서버입니다. 
                      호스팅 제공업체에서 제공한 네임서버 주소를 입력하세요.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  네임서버 설정 (최소 1개, 최대 4개)
                </label>
                {nameservers.map((ns, index) => (
                  <div key={index} className="mb-3">
                    <input
                      type="text"
                      value={ns}
                      onChange={(e) => {
                        const newNS = [...nameservers];
                        newNS[index] = e.target.value.toLowerCase();
                        setNameservers(newNS);
                      }}
                      placeholder={`네임서버 ${index + 1} (예: ns1.example.com)`}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                ))}
                <p className="mt-2 text-sm text-gray-500">
                  호스팅 업체에서 제공한 네임서버 주소를 입력하세요
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                    <p className="text-red-800">{error}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                >
                  이전
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || nameservers.filter(ns => ns.trim()).length === 0}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <Loader className="w-5 h-5 mr-2 animate-spin" />
                      도메인 발급 중...
                    </>
                  ) : (
                    '도메인 발급하기'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: 완료 */}
          {step === 3 && result && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  도메인 발급 완료!
                </h2>
                <p className="text-gray-600">
                  도메인이 성공적으로 발급되었습니다
                </p>
              </div>

              <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">발급된 도메인</p>
                    <p className="text-2xl font-bold text-indigo-600 break-all">
                      {result.domain}
                    </p>
                  </div>

                  <div className="border-t border-indigo-200 pt-4">
                    <p className="text-sm text-gray-600 mb-2">네임서버</p>
                    {result.nameservers.map((ns, index) => (
                      <p key={index} className="text-gray-800 font-mono bg-white px-3 py-2 rounded mb-1 break-all">
                        {ns}
                      </p>
                    ))}
                  </div>

                  <div className="border-t border-indigo-200 pt-4 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">상태</p>
                      <p className="text-green-600 font-semibold">활성</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">사용 기간</p>
                      <p className="text-gray-800 font-semibold">{result.expiresAt}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800 font-semibold mb-2">📌 안내사항</p>
                <ul className="text-yellow-700 text-sm space-y-1 list-disc list-inside">
                  <li>DNS 전파까지 최대 24-48시간이 소요될 수 있습니다</li>
                  <li>네임서버 설정이 정상적으로 전파되면 도메인 사용이 가능합니다</li>
                  <li>네임서버에서 A, CNAME, MX 등의 DNS 레코드를 설정하세요</li>
                  <li>도메인은 무제한으로 사용 가능합니다</li>
                </ul>
              </div>

              <button
                onClick={() => {
                  setStep(1);
                  setDomainName('');
                  setNameservers(['', '', '', '']);
                  setResult(null);
                  setError('');
                }}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
              >
                새 도메인 발급하기
              </button>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="text-center text-gray-600 text-sm">
          <p>무료 도메인 제공 플랫폼 © 2024</p>
          <p className="mt-1 text-xs">서브도메인 기반 무료 도메인 제공 서비스</p>
        </div>
      </div>
    </div>
  );
        }
