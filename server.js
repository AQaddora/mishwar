const http = require('http');
const page = '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>مِشوار</title><body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#0f172a;color:#fff"><div style="text-align:center"><h1 style="font-size:3rem;margin:0">مِشوار</h1><p>قريباً — مواصلات غزة</p></div></body></html>';
http.createServer((req, res) => {
  if (req.url === '/api/health') { res.writeHead(200, {'content-type': 'application/json'}); return res.end(JSON.stringify({ ok: true, commit: 'placeholder' })); }
  res.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); res.end(page);
}).listen(process.env.PORT || 3000);
