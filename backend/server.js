// Express + Socket.io + nối TTN handler + LOG
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { initTTN, sendDownlink } = require('./ttnHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

// ====== LOG in-memory + file ======
const LOG_DIR = path.resolve(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// Giới hạn số mẫu giữ trong RAM (mỗi thiết bị)
const MAX_INMEM = 2000;
const memLog = new Map(); // devId -> [{ts, weights, battery, temp, rssi, snr}]

function csvHeaderFor(n) {
  const weightCols = Array.from({length:n}, (_,i)=>`weight_${i}`);
  return ['ts', ...weightCols, 'battery', 'temp', 'rssi', 'snr'].join(',') + '\n';
}
function toCSVLine(upl) {
  const n = (upl.weights||[]).length;
  const weightCols = Array.from({length:n}, (_,i)=> (upl.weights[i] ?? '') );
  return [upl.ts, ...weightCols, upl.battery ?? '', upl.temp ?? '', upl.rssi ?? '', upl.snr ?? ''].join(',');
}
function appendCSV(devId, upl) {
  const file = path.join(LOG_DIR, `${devId}.csv`);
  const needHeader = !fs.existsSync(file);
  const line = toCSVLine(upl) + '\n';
  if (needHeader) {
    const n = (upl.weights||[]).length;
    fs.appendFile(file, csvHeaderFor(n) + line, ()=>{});
  } else {
    fs.appendFile(file, line, ()=>{});
  }
}

// ====== Nhận uplink từ TTN, phát realtime và ghi log ======
initTTN((upl) => {
  io.emit('up', upl);

  const list = memLog.get(upl.devId) || [];
  list.push(upl);
  if (list.length > MAX_INMEM) list.shift();
  memLog.set(upl.devId, list);

  appendCSV(upl.devId, upl);
});

// ====== API ======
app.use(express.json());

app.get('/api/health', (_,res)=>res.json({ok:true, time:new Date().toISOString()}));

// Downlink: tare/zero
app.post('/api/tare', async (req, res) => {
  try {
    const { devId, fport = 10, payloadHex = '00', confirmed = false } = req.body || {};
    if (!devId) return res.status(400).json({ error: 'devId required' });
    await sendDownlink({ devId, fport, payloadHex, confirmed });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Trả log theo device (mặc định 200 mẫu mới nhất)
app.get('/api/log/:devId', (req, res) => {
  const devId = req.params.devId;
  const limit = Math.max(1, Math.min(5000, Number(req.query.limit) || 200));
  const list = memLog.get(devId) || [];
  res.json(list.slice(-limit));
});

// Tải CSV
app.get('/api/log/:devId/download.csv', (req, res) => {
  const devId = req.params.devId;
  const file = path.join(LOG_DIR, `${devId}.csv`);
  if (!fs.existsSync(file)) return res.status(404).send('No log yet');
  res.download(file, `${devId}.csv`);
});

// ====== Static frontend ======
const staticDir = path.resolve(__dirname, '..', 'frontend', 'public');
app.use(express.static(staticDir));

io.on('connection', (s) => {
  console.log('Client connected', s.id);
});

server.listen(PORT, () => {
  console.log(`Web server http://localhost:${PORT}`);
});
