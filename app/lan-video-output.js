const http = require('node:http');
const os = require('node:os');
const { randomBytes } = require('node:crypto');

const port = 8765;
const frameInterval = 1000 / 15;
const page = `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>3D 动捕工作台 · 局域网画面</title>
<style>
html,body{margin:0;min-height:100%;background:#121827;color:#fff;font:16px system-ui,sans-serif}
main{min-height:100vh;display:grid;place-items:center}
img{display:block;max-width:100vw;max-height:100vh;object-fit:contain}
</style>
<main><img src="./stream" alt="等待 3D 动捕画面"></main>
</html>`;

function interfaces() {
  return Object.entries(os.networkInterfaces()).flatMap(([name, addresses]) =>
    addresses.filter(({ family, internal }) => family === 'IPv4' && !internal)
      .map(({ address }) => ({ name, address }))
  );
}

module.exports = function createLanVideoOutput() {
  let server = null;
  let url = '';
  let lastFrameAt = 0;
  let error = '';
  const clients = new Set();
  const sockets = new Set();

  function stop() {
    const current = server;
    server = null;
    url = '';
    lastFrameAt = 0;
    current?.close();
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    clients.clear();
  }

  async function start(address) {
    if (server) return;
    error = '';
    if (!interfaces().some(entry => entry.address === address)) {
      throw Error('请选择当前可用的局域网地址');
    }
    const route = '/' + randomBytes(16).toString('hex') + '/';
    const instance = http.createServer((request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Referrer-Policy', 'no-referrer');
      if (request.method === 'GET' && request.url === route) {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(page);
        return;
      }
      if (request.method !== 'GET' || request.url !== route + 'stream') {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=frame' });
      response.flushHeaders();
      clients.add(response);
      response.on('close', () => clients.delete(response));
    });
    instance.on('connection', socket => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    server = instance;
    await new Promise((resolve, reject) => {
      instance.on('error', cause => {
        if (server !== instance) return;
        error = cause.code === 'EADDRINUSE'
          ? `局域网端口 ${port} 已被占用`
          : '无法开启局域网视频输出：' + cause.message;
        stop();
        reject(Error(error));
      });
      instance.once('close', () => {
        if (!url) reject(Error(error || '局域网视频输出已停止'));
      });
      instance.listen(port, address, () => {
        if (server !== instance) {
          instance.close();
          return;
        }
        url = `http://${address}:${port}${route}`;
        resolve();
      });
    });
  }

  function wantsFrame() {
    return clients.size > 0 && Date.now() - lastFrameAt >= frameInterval;
  }

  function send(frame) {
    if (!wantsFrame() || frame.isEmpty()) return;
    lastFrameAt = Date.now();
    const { width } = frame.getSize();
    const jpeg = (width > 1280 ? frame.resize({ width: 1280 }) : frame).toJPEG(75);
    const payload = Buffer.concat([
      Buffer.from(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`),
      jpeg,
      Buffer.from('\r\n')
    ]);
    for (const client of clients) {
      if (!client.destroyed && !client.writableNeedDrain) client.write(payload);
    }
  }

  return {
    start, stop, wantsFrame, send,
    state: () => ({ url, starting: Boolean(server && !url), interfaces: interfaces(), error })
  };
};
