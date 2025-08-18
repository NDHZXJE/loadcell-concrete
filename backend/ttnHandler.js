// Kết nối MQTT tới The Things Stack (TTN) và chuẩn hoá dữ liệu uplink
const mqtt = require('mqtt');

let client; // giữ client để downlink

function extractWeights(decoded) {
  // Tuỳ payload thực tế của bạn — các nhánh phổ biến:
  if (!decoded) return [];
  if (Array.isArray(decoded.weights)) return decoded.weights.map(Number);
  if (Array.isArray(decoded.channels)) return decoded.channels.map(c => Number(c.weight ?? c.w ?? 0));
  if ('weight' in decoded) return [Number(decoded.weight)];
  if ('mean' in decoded && 'offset' in decoded && 'scale' in decoded) {
    return [Number((decoded.mean - decoded.offset) * decoded.scale)]; // 1 kênh
  }
  return [];
}

function initTTN(onUplink) {
  const host   = process.env.TTS_HOST;            // ví dụ: eu1.cloud.thethings.network
  const appId  = process.env.TTS_APP_ID;
  const tenant = process.env.TTS_TENANT || 'ttn';
  const user   = `${appId}@${tenant}`;
  const pass   = process.env.TTS_API_KEY;

  client = mqtt.connect(`mqtts://${host}:8883`, {
    username: user, password: pass, reconnectPeriod: 5000
  });

  client.on('connect', () => {
    const topic = `v3/${user}/devices/+/up`;
    client.subscribe(topic, err => {
      console.log(err ? 'TTN subscribe error: ' + err : 'TTN subscribed: ' + topic);
    });
  });

  client.on('message', (topic, payload) => {
    try {
      const msg = JSON.parse(payload.toString());
      const upl = msg?.uplink_message || {};
      const f   = upl.decoded_payload || {};
      const out = {
        devId: msg?.end_device_ids?.device_id,
        ts: upl.received_at || new Date().toISOString(),
        weights: extractWeights(f),
        battery: f.batt ?? f.battery ?? null,
        temp: f.temp ?? f.temperature ?? null,
        rssi: upl?.rx_metadata?.[0]?.rssi,
        snr:  upl?.rx_metadata?.[0]?.snr,
        raw: f
      };
      if (typeof onUplink === 'function') onUplink(out);
    } catch (e) {
      console.error('TTN parse uplink error', e);
    }
  });

  client.on('reconnect', () => console.log('TTN reconnecting...'));
  client.on('error', (e) => console.error('TTN MQTT error', e));
}

function sendDownlink({ devId, fport = 10, payloadHex = '00', confirmed = false }) {
  if (!client) throw new Error('TTN client not initialized');
  const appId  = process.env.TTS_APP_ID;
  const tenant = process.env.TTS_TENANT || 'ttn';
  const user   = `${appId}@${tenant}`;

  const topic = `v3/${user}/devices/${devId}/down/push`;
  const frm_payload = Buffer.from(payloadHex.replace(/[^0-9a-f]/ig,''), 'hex').toString('base64');

  const down = {
    downlinks: [{ f_port: Number(fport), frm_payload, priority: 'NORMAL', confirmed: !!confirmed }]
  };

  return new Promise((resolve, reject) => {
    client.publish(topic, JSON.stringify(down), { qos: 0 }, (err) => {
      if (err) reject(err); else resolve(true);
    });
  });
}

module.exports = { initTTN, sendDownlink };
