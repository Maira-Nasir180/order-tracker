// Order Tracking & Live Support — REST + Socket.io + JSON-RPC 2.0 + SSE
const express = require('express'), http = require('http'), cors = require('cors');
const { Server } = require('socket.io');

const CLIENT = process.env.CLIENT_URL || '*';
const app = express();
app.use(cors({ origin: CLIENT }), express.json());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CLIENT } });

const FLOW = ['placed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
const catalog = [
  { id: 1, name: 'Chicken Biryani', price: 8, emoji: '🍛' },
  { id: 2, name: 'Cheese Burger', price: 6, emoji: '🍔' },
  { id: 3, name: 'Margherita Pizza', price: 10, emoji: '🍕' },
  { id: 4, name: 'Chicken Shawarma', price: 5, emoji: '🌯' },
  { id: 5, name: 'Crispy Fries', price: 3, emoji: '🍟' },
  { id: 6, name: 'Chocolate Brownie', price: 4, emoji: '🍫' },
  { id: 7, name: 'Fresh Mango Shake', price: 4, emoji: '🥭' },
  { id: 8, name: 'Iced Coffee', price: 3, emoji: '☕' },
  { id: 9, name: 'Chicken Karahi', price: 12, emoji: '🍲' },
  { id: 10, name: 'Beef Seekh Kebab', price: 7, emoji: '🍢' },
  { id: 11, name: 'Chicken Nuggets', price: 5, emoji: '🍗' },
  { id: 12, name: 'Pasta Alfredo', price: 9, emoji: '🍝' },
  { id: 13, name: 'Vanilla Ice Cream', price: 3, emoji: '🍨' },
  { id: 14, name: 'Glazed Donut', price: 2, emoji: '🍩' },
  { id: 15, name: 'Fresh Lemonade', price: 2, emoji: '🍋' },
];
const orders = [];
const chats = {};
let seq = 1000;
const sse = new Set();

function alertAll(level, message) {
  const a = { id: Date.now(), level, message, at: new Date().toISOString() };
  for (const res of sse) res.write(`event: alert\ndata: ${JSON.stringify(a)}\n\n`);
}
function setStatus(o, status) {
  o.status = status;
  o.history.push({ status, at: new Date().toISOString() });
  io.to('order:' + o.id).to('agents').emit('order:status', o);
  alertAll(status === 'cancelled' ? 'warn' : 'info', `Order #${o.id} is now ${status.replace(/_/g, ' ')}`);
}
const find = id => orders.find(o => o.id === Number(id));

// ---------- REST /api/v1 ----------
const api = express.Router();
api.get('/catalog', (_, res) => res.json(catalog));
api.get('/orders', (req, res) => {
  const ids = req.query.ids ? req.query.ids.split(',').map(Number) : null;
  res.json(ids ? orders.filter(o => ids.includes(o.id)) : orders);
});
api.get('/orders/:id', (req, res) => { const o = find(req.params.id); o ? res.json(o) : res.status(404).json({ error: 'Order not found' }); });
api.post('/orders', (req, res) => {
  const { customer, items } = req.body || {};
  if (!customer || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'customer and items[] required' });
  const lines = items.map(i => ({ ...catalog.find(c => c.id === i.productId), qty: Math.max(1, +i.qty || 1) })).filter(l => l.id);
  if (!lines.length) return res.status(400).json({ error: 'No valid products' });
  const o = { id: ++seq, customer, items: lines, total: lines.reduce((s, l) => s + l.price * l.qty, 0), status: 'placed', history: [{ status: 'placed', at: new Date().toISOString() }] };
  orders.unshift(o);
  io.to('agents').emit('order:new', o);
  alertAll('info', `New order #${o.id} from ${customer}`);
  res.status(201).json(o);
});
api.patch('/orders/:id/status', (req, res) => {
  const o = find(req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  if (![...FLOW, 'cancelled'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' });
  setStatus(o, req.body.status); res.json(o);
});
app.use('/api/v1', api);
app.get('/health', (_, res) => res.json({ ok: true }));

// ---------- JSON-RPC 2.0 /rpc ----------
class RpcError extends Error { constructor(code, message) { super(message); this.code = code; } }
const need = id => { const o = find(id); if (!o) throw new RpcError(-32001, 'Order not found'); return o; };
const methods = {
  listMethods: () => Object.keys(methods),
  getOrder: ({ orderId }) => need(orderId),
  cancelOrder: ({ orderId }) => {
    const o = need(orderId);
    if (['out_for_delivery', 'delivered', 'cancelled'].includes(o.status)) throw new RpcError(-32002, `Cannot cancel an order that is ${o.status.replace(/_/g, ' ')}`);
    setStatus(o, 'cancelled'); return o;
  },
  advanceOrder: ({ orderId }) => {
    const o = need(orderId);
    const next = FLOW[FLOW.indexOf(o.status) + 1];
    if (!next) throw new RpcError(-32002, 'Order cannot advance further');
    setStatus(o, next); return o;
  },
};
function handleRpc(r) {
  if (!r || r.jsonrpc !== '2.0' || typeof r.method !== 'string') return { jsonrpc: '2.0', id: r?.id ?? null, error: { code: -32600, message: 'Invalid Request' } };
  const fn = methods[r.method];
  if (!fn) return { jsonrpc: '2.0', id: r.id ?? null, error: { code: -32601, message: 'Method not found' } };
  try { const result = fn(r.params || {}); return r.id === undefined ? null : { jsonrpc: '2.0', id: r.id, result }; }
  catch (e) { return { jsonrpc: '2.0', id: r.id ?? null, error: { code: e.code || -32603, message: e.message } }; }
}
app.post('/rpc', (req, res) => {
  const out = Array.isArray(req.body) ? req.body.map(handleRpc).filter(Boolean) : handleRpc(req.body);
  (out === null || (Array.isArray(out) && !out.length)) ? res.status(204).end() : res.json(out);
});
app.use((err, req, res, next) => res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));

// ---------- SSE /events ----------
const tips = ['All systems operational', 'Support agents are online', 'Free shipping on orders over $50'];
app.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders(); res.write('retry: 3000\n\n');
  sse.add(res);
  res.write(`event: alert\ndata: ${JSON.stringify({ id: Date.now(), level: 'info', message: 'Live alerts connected', at: new Date().toISOString() })}\n\n`);
  req.on('close', () => sse.delete(res));
});
setInterval(() => alertAll('info', tips[Math.floor(Math.random() * tips.length)]), 30000);
setInterval(() => { for (const r of sse) r.write(': ping\n\n'); }, 20000);

// ---------- Socket.io ----------
io.on('connection', socket => {
  socket.on('agent:join', () => socket.join('agents'));
  socket.on('chat:join', ({ orderId, role, name }) => {
    if (!find(orderId)) return socket.emit('chat:error', 'Order not found');
    socket.join('order:' + orderId);
    socket.data = { orderId, role, name };
    socket.emit('chat:history', { orderId, messages: chats[orderId] || [] });
    socket.to('order:' + orderId).emit('chat:presence', { orderId, text: `${name} (${role}) joined` });
  });
  socket.on('chat:message', ({ orderId, text }) => {
    const { role, name } = socket.data || {};
    if (!role || !text?.trim() || String(orderId) !== String(socket.data.orderId)) return;
    const msg = { id: Date.now() + Math.random(), orderId, role, name, text: text.trim().slice(0, 500), at: new Date().toISOString() };
    (chats[orderId] ||= []).push(msg);
    io.to('order:' + orderId).emit('chat:message', msg);
    if (role === 'customer') io.to('agents').emit('chat:notify', { orderId, name });
  });
  socket.on('chat:typing', ({ orderId, typing }) => socket.to('order:' + orderId).emit('chat:typing', { orderId, role: socket.data?.role, typing }));
});

server.listen(process.env.PORT || 4000, () => console.log('API on', process.env.PORT || 4000));
