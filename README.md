# 🍽️ Petal: Order Tracking & Live Support System

A full-stack web app that demonstrates four communication protocols working together: **REST, WebSockets (Socket.io), JSON-RPC 2.0 and Server-Sent Events (SSE)**. Customers place food orders and track them live, and chat one-on-one with a support agent.

## 🔗 Live Demo

| | Link |
|---|---|
| Frontend (Netlify) | https://stunning-elf-b76551.netlify.app |
| Backend API (Render) | https://order-tracker-0o4g.onrender.com |
| Health check | https://order-tracker-0o4g.onrender.com/health |

> The backend runs on Render's free plan and sleeps after 15 minutes of inactivity. The first request may take 30-50 seconds.

## ✨ Features

- Browse a food catalog and place orders
- Live order status updates (placed → packed → shipped → out for delivery → delivered)
- 1-on-1 chat between Customer and Support agent, with typing indicator and chat history
- Cancel orders through JSON-RPC
- Live system alerts shown as toast notifications (SSE)
- Two roles in one UI: switch between **Customer** and **Support agent**

## 🧱 Tech Stack

- **Backend:** Node.js, Express, Socket.io
- **Frontend:** Plain HTML, CSS, JavaScript (no build step)
- **Hosting:** Render (backend), Netlify (frontend)

## 📡 Protocols Overview

| Protocol | Endpoint | Used for |
|---|---|---|
| REST | `/api/v1/*` | Catalog and orders (list, create, update) |
| WebSocket (Socket.io) | same host as API | Live order status + customer/agent chat |
| JSON-RPC 2.0 | `POST /rpc` | `cancelOrder`, `advanceOrder`, `getOrder`, `listMethods` |
| SSE | `GET /events` | Live system alerts |

## 1. REST API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/catalog` | List catalog products |
| GET | `/api/v1/orders` | List all orders (`?ids=1001,1002` to filter) |
| GET | `/api/v1/orders/:id` | Get one order |
| POST | `/api/v1/orders` | Create order. Body: `{ "customer": "Ali", "items": [{ "productId": 1, "qty": 2 }] }` |
| PATCH | `/api/v1/orders/:id/status` | Update status. Body: `{ "status": "shipped" }` |
| GET | `/health` | Health check |

## 2. WebSocket Events (Socket.io)

Each order has its own room named `order:<orderId>`. Support agents also join a shared `agents` room.

| Event | Direction | Payload | Description |
|---|---|---|---|
| `agent:join` | client → server | none | Agent subscribes to all order updates and chat notifications |
| `chat:join` | client → server | `{ orderId, role, name }` | Join the chat room of an order |
| `chat:history` | server → client | `{ orderId, messages[] }` | Previous messages, sent right after joining |
| `chat:message` | client → server | `{ orderId, text }` | Send a chat message |
| `chat:message` | server → room | message object | New message delivered to both customer and agent |
| `chat:typing` | client → server | `{ orderId, typing }` | Typing started or stopped |
| `chat:typing` | server → other user | `{ orderId, role, typing }` | Shows "... is typing" |
| `chat:presence` | server → room | `{ orderId, text }` | Someone joined the chat |
| `chat:notify` | server → agents | `{ orderId, name }` | A customer sent a message |
| `chat:error` | server → client | string | Join failed (for example, order not found) |
| `order:status` | server → room + agents | order object | Order status changed (via REST, RPC or agent) |
| `order:new` | server → agents | order object | A new order was placed |

## 3. JSON-RPC 2.0 (`POST /rpc`)

Available methods: `cancelOrder`, `advanceOrder`, `getOrder`, `listMethods`. Batch requests are supported.

Request:
```json
{ "jsonrpc": "2.0", "id": 1, "method": "cancelOrder", "params": { "orderId": 1001 } }
```

Success response:
```json
{ "jsonrpc": "2.0", "id": 1, "result": { "id": 1001, "status": "cancelled" } }
```

Error codes:

| Code | Meaning |
|---|---|
| -32700 | Parse error |
| -32600 | Invalid request |
| -32601 | Method not found |
| -32001 | Order not found |
| -32002 | Action not allowed (for example, cancelling an order already out for delivery) |

Example with curl:
```bash
curl -X POST https://order-tracker-0o4g.onrender.com/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"listMethods"}'
```

## 4. Server-Sent Events (`GET /events`)

The server keeps the connection open and sends events named `alert`:
```
event: alert
data: {"id":1234,"level":"info","message":"Order #1001 is now shipped","at":"2026-09-28T16:00:00Z"}
```
Alerts are sent when an order is created or changes status, plus periodic system messages. The frontend shows them as toasts.

## 🗂️ Project Structure

```
├── client/          # Frontend (index.html, config.js)
├── server/          # Backend (index.js, package.json)
├── render.yaml      # Render config
└── README.md
```

## 🚀 Run Locally

Requirements: Node.js 18 or newer.

**1. Backend**
```bash
cd server
npm install
npm start
```
The API runs on http://localhost:4000

**2. Frontend** (in a second terminal)
```bash
cd client
npx serve .
```
Open the link it prints (usually http://localhost:3000).

In `client/config.js`, `API_URL` must point to the backend (`http://localhost:4000` locally).

**3. Try it:** open two browser tabs. Use **Customer** in one to place an order, and **Support agent** in the other to chat and advance the status.

## ☁️ Deployment

**Backend on Render**
1. New → Web Service → connect this GitHub repo
2. Root Directory: `server`
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Instance type: Free
6. Optional: set the env variable `CLIENT_URL` to the frontend URL to restrict CORS

**Frontend on Netlify**
1. Set `API_URL` in `client/config.js` to the Render URL
2. Upload the `client` folder using Netlify Drop, then click **Make public**
