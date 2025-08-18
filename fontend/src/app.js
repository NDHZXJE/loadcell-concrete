const state = {
    cfg: null,
    latestByDev: new Map(),
    selectedDev: null
  };
  
  async function loadConfig() {
    const r = await fetch('/config.json');
    state.cfg = await r.json();
    document.getElementById('camTitle').textContent = state.cfg.camera?.title || 'Camera';
  }
  
  function playHLS(url) {
    const video = document.getElementById('video');
    if (window.Hls && Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: !!state.cfg.camera?.lowLatency });
      hls.loadSource(url);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url; // Safari
    } else {
      console.warn('Trình duyệt không hỗ trợ HLS');
    }
  }
  
  function resizeCanvas() {
    const v = document.getElementById('video');
    const c = document.getElementById('overlay');
    c.width = v.clientWidth; c.height = v.clientHeight;
    drawOverlay();
  }
  window.addEventListener('resize', resizeCanvas);
  
  function colorForWeight(w) {
    const th = state.cfg.thresholds || { ok: 5, warn: 20 };
    if (w <= th.ok) return '#5be37a';
    if (w <= th.warn) return '#ffd166';
    return '#ff5d5d';
  }
  
  function drawOverlay() {
    const c = document.getElementById('overlay');
    const ctx = c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);
  
    const devId = state.selectedDev || [...state.latestByDev.keys()][0];
    if (!devId) return;
  
    const meta = (state.cfg.devices||{})[devId];
    if (!meta || !meta.length) return;
  
    const latest = state.latestByDev.get(devId);
    const weights = latest?.weights || [];
  
    ctx.font = '14px ui-sans-serif';
    ctx.lineWidth = 2;
  
    meta.forEach((roi, idx) => {
      const x = Math.round(roi.x * c.width);
      const y = Math.round(roi.y * c.height);
      const w = Number(weights[idx] ?? NaN);
      const col = isNaN(w) ? '#89a' : colorForWeight(w);
  
      // point
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI*2);
      ctx.fillStyle = col; ctx.globalAlpha = 0.85; ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = '#0a0f1f'; ctx.stroke();
  
      // label
      const txt = `${roi.label}${isNaN(w)?'':': '+w.toFixed(2)}`;
      const tw = ctx.measureText(txt).width;
      const pad = 6, h=22;
      const lx = Math.min(x+14, c.width - tw - pad*2 - 6);
      const ly = Math.max(y- h/2, 0);
      ctx.fillStyle = 'rgba(10,15,31,0.8)';
      ctx.fillRect(lx, ly, tw + pad*2, h);
      ctx.strokeStyle = '#2b3763'; ctx.strokeRect(lx, ly, tw + pad*2, h);
      ctx.fillStyle = '#cfe1ff';
      ctx.fillText(txt, lx + pad, ly + 15);
    });
  }
  
  function upsertRow(devId, data) {
    const tbody = document.querySelector('#tbl tbody');
    let tr = document.querySelector(`tr[data-dev="${devId}"]`);
    if (!tr) {
      tr = document.createElement('tr');
      tr.dataset.dev = devId;
      tr.innerHTML = `<td class="dev"></td><td class="w"></td><td class="rssi"></td><td class="snr"></td><td class="batt"></td><td class="ts"></td>`;
      tr.addEventListener('click', () => { state.selectedDev = devId; drawOverlay(); });
      tbody.appendChild(tr);
    }
    tr.querySelector('.dev').textContent = devId + (state.selectedDev===devId ? ' ✓' : '');
    tr.querySelector('.w').textContent = (data.weights||[]).map(v=>Number(v).toFixed(2)).join(', ');
    tr.querySelector('.rssi').textContent = data.rssi ?? '';
    tr.querySelector('.snr').textContent = data.snr ?? '';
    tr.querySelector('.batt').textContent = data.battery ?? '';
    tr.querySelector('.ts').textContent = new Date(data.ts).toLocaleTimeString();
  }
  
  async function main() {
    await loadConfig();
    playHLS(state.cfg.camera.stream);
  
    const video = document.getElementById('video');
    video.addEventListener('loadedmetadata', resizeCanvas);
    video.addEventListener('play', resizeCanvas);
  
    const io_ = io();
    io_.on('up', (msg) => {
      state.latestByDev.set(msg.devId, msg);
      if (!state.selectedDev) state.selectedDev = msg.devId;
      upsertRow(msg.devId, msg);
      drawOverlay();
    });
  
    document.getElementById('btnTare').addEventListener('click', async () => {
      if (!state.selectedDev) return alert('Chưa chọn node');
      const r = await fetch('/api/tare', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ devId: state.selectedDev, fport:10, payloadHex:'00' })
      });
      alert(r.ok ? 'Đã gửi tare' : 'Gửi tare lỗi');
    });
  }
  main();
  