export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === '/health') {
      return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
    }
    
    if (pathname === '/ping') {
      return new Response('pong');
    }

    if (pathname.startsWith('/auth') || pathname.startsWith('/ai') || 
        pathname.startsWith('/dashboard') || pathname.startsWith('/telemetry') ||
        pathname.startsWith('/privacy') || pathname.startsWith('/audit')) {
      return Response.json({ 
        message: 'Backend API will be available soon',
        path: pathname 
      });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
};
