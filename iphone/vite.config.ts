import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const localHosts = new Set(['127.0.0.1:3002', 'localhost:3002', '[::1]:3002']);
const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export default defineConfig({
  plugins: [react(), {
    name: 'local-only-bootstrap',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/local')) return next();
        const host = req.headers.host || '';
        let trustedOrigin = !req.headers.origin;
        try {
          if (req.headers.origin) {
            const origin = new URL(req.headers.origin);
            trustedOrigin = origin.protocol === 'http:' && origin.host === host;
          }
        } catch { trustedOrigin = false; }
        if (
          req.headers['cf-ray'] !== undefined ||
          !localHosts.has(host) ||
          !loopback.has(req.socket.remoteAddress || '') ||
          !trustedOrigin
        ) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Local only');
          return;
        }
        next();
      });
    },
  }],
  server: {
    host: '127.0.0.1',
    port: 3002,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/voice': {target: 'http://127.0.0.1:4310', changeOrigin:true},
      '/live': {target: 'ws://127.0.0.1:4310', ws:true},
      '/api/local': {
        target: 'http://127.0.0.1:4310',
        rewrite: () => '/local',
        changeOrigin: true,
        configure(proxy) {
          // Strip Origin only after the local request guard above validates it.
          proxy.on('proxyReq', req => req.removeHeader('origin'));
        },
      },
    },
  },
});
