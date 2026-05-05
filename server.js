const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;

// ── MIME types ────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
};

// ── HTTP/HTTPS fetch helper ───────────────────────────────────────
function fetchURL(targetUrl, opts = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('Too many redirects'));
    let parsed;
    try { parsed = new URL(targetUrl); } catch { return reject(new Error('URL tidak valid')); }

    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 Chrome/112.0 Mobile Safari/537.36',
        'Accept': 'application/json, */*',
        'Referer': 'https://www.tiktok.com/',
        ...(opts.headers || {})
      },
      timeout: 20000
    };

    const req = lib.request(options, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        let loc = res.headers.location;
        if (loc.startsWith('/')) loc = `${parsed.protocol}//${parsed.hostname}${loc}`;
        return fetchURL(loc, opts, redirectCount + 1).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        data: Buffer.concat(chunks).toString('utf-8')
      }));
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// ── TikWM API ─────────────────────────────────────────────────────
async function getTikTokData(videoUrl) {
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(videoUrl)}&hd=1`;
  const resp = await fetchURL(apiUrl);
  if (resp.status !== 200) throw new Error(`API error HTTP ${resp.status}`);

  let json;
  try { json = JSON.parse(resp.data); } catch { throw new Error('Response tidak valid'); }
  if (json.code !== 0 || !json.data) throw new Error(json.msg || 'Video tidak ditemukan');

  const d = json.data;
  return {
    title:        d.title || 'Video TikTok',
    author:       d.author?.unique_id ? '@' + d.author.unique_id : '@unknown',
    authorName:   d.author?.nickname || '',
    cover:        d.cover || d.origin_cover || '',
    duration:     d.duration || 0,
    plays:        d.play_count || 0,
    likes:        d.digg_count || 0,
    noWatermark:  d.hdplay || d.play || '',
    withWatermark:d.wmplay || '',
    music:        d.music_info?.play || d.music || '',
    musicTitle:   d.music_info?.title || '',
    size:         d.size    ? Math.round(d.size    / 1024 / 1024 * 10) / 10 : null,
    hdSize:       d.hd_size ? Math.round(d.hd_size / 1024 / 1024 * 10) / 10 : null,
  };
}

// ── Proxy stream helper ───────────────────────────────────────────
function proxyStream(fileUrl, res, filename, redirectCount = 0) {
  if (redirectCount > 5) { res.writeHead(500); return res.end('Too many redirects'); }
  let parsed;
  try { parsed = new URL(fileUrl); } catch { res.writeHead(400); return res.end('Bad URL'); }

  const lib = parsed.protocol === 'https:' ? https : http;
  const req = lib.get({
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/112.0 Mobile Safari/537.36',
      'Referer': 'https://www.tiktok.com/',
    }
  }, (upstream) => {
    if ([301,302,307,308].includes(upstream.statusCode) && upstream.headers.location) {
      let loc = upstream.headers.location;
      if (loc.startsWith('/')) loc = `${parsed.protocol}//${parsed.hostname}${loc}`;
      return proxyStream(loc, res, filename, redirectCount + 1);
    }
    res.writeHead(200, {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': upstream.headers['content-type'] || 'application/octet-stream',
      'Content-Length': upstream.headers['content-length'] || '',
      'Access-Control-Allow-Origin': '*',
    });
    upstream.pipe(res);
  });
  req.on('error', (e) => { if (!res.headersSent) { res.writeHead(500); res.end('Proxy error'); } });
}

// ── Allowed CDN domains ───────────────────────────────────────────
const ALLOWED_DOMAINS = [
  'tikwm.com','tiktokcdn.com','tiktokcdn-us.com',
  'tiktok.com','muscdn.com','tiktokv.com','ttwstatic.com'
];

function isAllowedDomain(rawUrl) {
  try {
    const h = new URL(rawUrl).hostname;
    return ALLOWED_DOMAINS.some(d => h === d || h.endsWith('.' + d));
  } catch { return false; }
}

// ── Request body parser ───────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 4096) { req.destroy(); reject(new Error('Body too large')); } });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ── Static file server ────────────────────────────────────────────
function serveStatic(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ── Main HTTP server ──────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); return res.end(); }

  // ── POST /api/get ──────────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/get') {
    res.setHeader('Content-Type', 'application/json');
    try {
      const body = await parseBody(req);
      const videoUrl = (body.url || '').trim();
      if (!videoUrl) throw new Error('URL diperlukan');
      if (!/tiktok\.com|vm\.tiktok|vt\.tiktok/i.test(videoUrl)) throw new Error('Bukan URL TikTok yang valid');

      const data = await getTikTokData(videoUrl);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data }));
    } catch (err) {
      console.error('[GET ERROR]', err.message);
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── GET /api/download ──────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/download') {
    const fileUrl  = decodeURIComponent(parsed.query.url || '');
    const filename = decodeURIComponent(parsed.query.filename || 'tiksave.mp4');

    if (!fileUrl || !isAllowedDomain(fileUrl)) {
      res.writeHead(403); return res.end('Domain tidak diizinkan');
    }
    proxyStream(fileUrl, res, filename);
    return;
  }

  // ── GET /api/health ────────────────────────────────────────────
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
  }

  // ── Static files ───────────────────────────────────────────────
  let filePath;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(__dirname, 'public', 'index.html');
  } else {
    filePath = path.join(__dirname, 'public', pathname);
  }

  // Security: prevent path traversal
  const safePath = path.resolve(filePath);
  const publicDir = path.resolve(__dirname, 'public');
  if (!safePath.startsWith(publicDir)) {
    res.writeHead(403); return res.end('Forbidden');
  }

  serveStatic(safePath, res);
});

server.listen(PORT, () => {
  console.log(`\n🎵 TikSave running → http://localhost:${PORT}`);
  console.log(`   No dependencies needed. Pure Node.js!\n`);
});
