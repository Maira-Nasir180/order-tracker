# 🌸 Petal — Order Tracking & Live Support


Live app: https://stunning-elf-b76551.netlify.app
API: https://order-tracker-0o4g.onrender.com


One full-stack app showing four communication protocols side by side.

| Protocol | Where | Used for |
|---|---|---|
| REST | `/api/v1/*` | Catalog, create/list/update orders |
| WebSocket (Socket.io) | same host | Live status updates + 1-on-1 customer/agent chat |
| JSON-RPC 2.0 | `POST /rpc` | `cancelOrder`, `advanceOrder`, `getOrder`, `listMethods` |
| SSE | `GET /events` | Live system alerts (toasts) |

## Run locally
```bash
cd server && npm install && npm start      # http://localhost:4000
cd client && npx serve .                   # open the printed URL
```
Open two tabs: one as **Customer**, one as **Support agent**. Place an order, chat, advance status.

## REST
`GET /api/v1/catalog` · `GET /api/v1/orders[?ids=1,2]` · `GET /api/v1/orders/:id` · `POST /api/v1/orders {customer, items:[{productId, qty}]}` · `PATCH /api/v1/orders/:id/status {status}`

## JSON-RPC 2.0
```bash
curl -X POST $API/rpc -H 'Content-Type: application/json' \
 -d '{"jsonrpc":"2.0","id":1,"method":"cancelOrder","params":{"orderId":1001}}'
```
Errors: `-32700` parse, `-32600` invalid request, `-32601` unknown method, `-32001` order not found, `-32002` action not allowed. Batch requests supported.

## WebSocket events
| Event | Direction | Payload | Description |
|---|---|---|---|
| `agent:join` | client → server | – | Agent subscribes to all orders + chat notifications |
| `chat:join` | client → server | `{orderId, role, name}` | Join an order's chat room (`order:<id>`) |
| `chat:history` | server → client | `{orderId, messages[]}` | Sent after join |
| `chat:message` | both | `{orderId, text}` / message object | Send / receive a message |
| `chat:typing` | both | `{orderId, typing}` / `{orderId, role, typing}` | Typing indicator |
| `chat:presence` | server → client | `{orderId, text}` | Someone joined |
| `chat:notify` | server → agents | `{orderId, name}` | Customer wrote a message |
| `chat:error` | server → client | string | Join failed |
| `order:status` | server → room + agents | order object | Status changed (via REST, RPC or agent) |
| `order:new` | server → agents | order object | New order placed |

## SSE
`GET /events` emits `event: alert` with `{id, level, message, at}` on order changes and periodic system tips.

## Deploy
**Backend (Render):** New → Blueprint → select this repo (uses `render.yaml`), or a Web Service with root `server`, build `npm install`, start `npm start`.
**Frontend (Vercel/Netlify):** import the repo, set root/publish directory to `client`, no build command. First edit `client/config.js` and set `API_URL` to your Render URL. Then set `CLIENT_URL` on Render to your frontend URL to lock down CORS.

> Data is in-memory (resets on restart) to keep the demo simple; use a database for production.
