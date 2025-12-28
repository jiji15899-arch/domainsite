export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        
        // API 요청 처리
        if (url.pathname.startsWith('/api/domains')) {
            const { default: handler } = await import('./functions/api/domains.js');
            return handler.onRequest ? 
                handler.onRequest({ request, env }) :
                (request.method === 'GET' ? 
                    handler.onRequestGet({ request, env }) : 
                    handler.onRequestPost({ request, env }));
        }
        
        // 정적 파일 반환
        return env.ASSETS.fetch(request);
    }
}
