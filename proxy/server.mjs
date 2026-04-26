#!/usr/bin/env node
// QA-Tree 本地 CORS 兜底 proxy
// - 仅监听 127.0.0.1，拒绝非本地连接
// - POST /forward + X-Upstream-URL header → 转发到上游 OpenAI 兼容接口
// - 上游 URL 必须命中白名单前缀（默认 OpenAI / DeepSeek / Moonshot / localhost）
// - 流式响应按 chunk 透传，加上 CORS 头
// 零依赖：仅用 node:http / node:https

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 8787);

const DEFAULT_UPSTREAMS = [
  'https://api.openai.com/',
  'https://api.deepseek.com/',
  'https://api.moonshot.cn/',
  'http://localhost',
  'http://127.0.0.1',
];

const WHITELIST = (
  process.env.PROXY_UPSTREAMS
    ? process.env.PROXY_UPSTREAMS.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_UPSTREAMS
);

const ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  'Accept',
  'X-Upstream-URL',
  'OpenAI-Beta',
  'Anthropic-Version',
];

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(', '));
  res.setHeader('Access-Control-Max-Age', '600');
}

function send(res, status, body, headers = {}) {
  setCorsHeaders(res);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.statusCode = status;
  res.end(body);
}

function isWhitelisted(targetUrl) {
  return WHITELIST.some((prefix) => targetUrl.startsWith(prefix));
}

function pickHeaders(req) {
  const out = {};
  for (const name of ALLOWED_HEADERS) {
    const v = req.headers[name.toLowerCase()];
    if (v && name !== 'X-Upstream-URL') out[name] = v;
  }
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handleForward(req, res) {
  const upstreamRaw = req.headers['x-upstream-url'];
  if (!upstreamRaw || typeof upstreamRaw !== 'string') {
    return send(res, 400, 'Missing X-Upstream-URL header');
  }

  let upstream;
  try {
    upstream = new URL(upstreamRaw);
  } catch {
    return send(res, 400, `Invalid upstream URL: ${upstreamRaw}`);
  }
  if (upstream.protocol !== 'http:' && upstream.protocol !== 'https:') {
    return send(res, 400, `Unsupported protocol: ${upstream.protocol}`);
  }
  if (!isWhitelisted(upstream.toString())) {
    return send(
      res,
      403,
      `Upstream not in whitelist. Set PROXY_UPSTREAMS env to allow custom prefixes.\nGot: ${upstream.toString()}\nWhitelist:\n${WHITELIST.join('\n')}`,
    );
  }

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return send(res, 400, `Failed to read body: ${err.message}`);
  }

  const transport = upstream.protocol === 'https:' ? https : http;
  const headers = pickHeaders(req);
  headers['Host'] = upstream.host;
  headers['Content-Length'] = String(body.length);

  const upstreamReq = transport.request(
    {
      method: req.method,
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
      path: upstream.pathname + upstream.search,
      headers,
    },
    (upstreamRes) => {
      setCorsHeaders(res);
      const passthrough = ['content-type', 'cache-control', 'transfer-encoding'];
      for (const h of passthrough) {
        const v = upstreamRes.headers[h];
        if (v) res.setHeader(h, v);
      }
      res.statusCode = upstreamRes.statusCode ?? 502;
      upstreamRes.pipe(res);
      upstreamRes.on('error', (err) => {
        console.error('[proxy] upstream stream error:', err.message);
        res.destroy();
      });
    },
  );

  upstreamReq.on('error', (err) => {
    console.error('[proxy] upstream error:', err.message);
    if (!res.headersSent) send(res, 502, `Upstream error: ${err.message}`);
    else res.destroy();
  });

  // 客户端中途断开 → 中止上游
  res.on('close', () => {
    if (!upstreamReq.destroyed) upstreamReq.destroy();
  });

  upstreamReq.end(body);
}

const server = http.createServer((req, res) => {
  // 拒绝非本地连接（双保险，listen 已绑定 127.0.0.1）
  const remote = req.socket.remoteAddress ?? '';
  if (remote !== '127.0.0.1' && remote !== '::1' && remote !== '::ffff:127.0.0.1') {
    return send(res, 403, 'Only local connections are allowed');
  }

  if (req.method === 'OPTIONS') {
    return send(res, 204, '');
  }

  if (req.method === 'GET' && req.url === '/health') {
    return send(res, 200, JSON.stringify({ ok: true, whitelist: WHITELIST }), {
      'Content-Type': 'application/json',
    });
  }

  if (req.method === 'POST' && req.url === '/forward') {
    return handleForward(req, res);
  }

  send(res, 404, `Not found: ${req.method} ${req.url}`);
});

server.listen(PORT, HOST, () => {
  console.log(`QA-Tree proxy listening on http://${HOST}:${PORT}`);
  console.log('Allowed upstream prefixes:');
  for (const w of WHITELIST) console.log(`  - ${w}`);
  console.log(
    'Override via PROXY_UPSTREAMS env (comma-separated). Health: GET /health',
  );
});

server.on('error', (err) => {
  console.error('[proxy] server error:', err.message);
  process.exit(1);
});

const shutdown = () => {
  console.log('\n[proxy] shutting down…');
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
