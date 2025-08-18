// Express + Socket.io + nối TTN handler
require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { initTTN, sendDownlink } = require('./ttnHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

// nhận uplink từ TTN và bơm realtime ra frontend
initTTN((upl) => {
  io.emit('up', upl);
});

// API
app.use(express.json());

app.get('/api/health', (_,res)=>res.json({ok:true, time:new Date().toISOString()}));

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

// phục vụ frontend (public)
const staticDir = path.resolve(__dirname, '..', 'frontend', 'public');
app.use(express.static(staticDir));

// Socket.io sẵn đường dẫn /socket.io/*
io.on('connection', (s) => {
  console.log('Client connected', s.id);
});

server.listen(PORT, () => {
  console.log(`Web server http://localhost:${PORT}`);
});
