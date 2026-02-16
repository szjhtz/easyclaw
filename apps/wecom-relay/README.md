# WeCom Relay Server

WeCom (WeChat Work) Customer Service message relay. Receives messages from WeCom via HTTP webhook, routes them to gateway instances via WebSocket, and relays replies back.

## Architecture

```
WeCom User ──► WeCom API ──► [HTTP Webhook] Relay [WebSocket] ──► Gateway (EasyClaw Desktop)
                  ◄──────────────── [Send API] ◄───────────────── [Reply Frame]
```

The relay is stateless except for a small SQLite database that stores user-to-gateway bindings and the message sync cursor.

## Quick Start

```bash
cp .env.example .env   # Fill in your WeCom credentials
pnpm install
pnpm build
node dist/index.mjs
```

Or with Docker:

```bash
docker compose up -d
```

## Configuration

### Required

| Variable | Description |
|----------|-------------|
| `WECOM_CORPID` | WeCom Corp ID |
| `WECOM_APP_SECRET` | App secret for API token requests |
| `WECOM_TOKEN` | Webhook signature verification token |
| `WECOM_ENCODING_AES_KEY` | 43-char base64 AES key for webhook encryption |
| `WECOM_OPEN_KFID` | Customer Service account ID |
| `WECOM_KF_LINK_ID` | Customer Service link ID (for contact_way QR) |
| `RELAY_AUTH_SECRET` | Shared secret for gateway WebSocket authentication |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP webhook server port |
| `WS_PORT` | `3001` | WebSocket server port |
| `DATABASE_PATH` | `./data/relay.db` | SQLite database path |
| `LOCALE` | `zh` | Message locale (`zh` or `en`) |

## How It Works

### Message Flow

**Inbound (user to app):**

1. User sends message in WeCom
2. WeCom POSTs encrypted XML callback to `/webhook`
3. Relay decrypts, verifies signature, calls `syncMessages` API to fetch full message batch
4. For each message, looks up `external_userid` → `gateway_id` in the bindings table
5. Downloads media if image/voice (buffered in memory, base64-encoded)
6. Sends `inbound` frame to the gateway via WebSocket

**Outbound (app to user):**

1. Gateway sends `reply` or `image_reply` frame via WebSocket
2. Relay calls WeCom Send Message API (uploads media first if image)
3. User receives the reply in WeCom

### QR Code Binding

Bindings associate a WeCom user with a specific gateway instance:

```
Gateway                        Relay                       WeCom
   │                             │                            │
   ├─ create_binding ───────────►│                            │
   │                             ├─ Generate 4-byte token     │
   │                             ├─ Store in pending_bindings │
   │                             ├─ Get contact_way URL ─────►│
   │◄─ create_binding_ack ──────┤  (URL + token)             │
   │   (display QR code)         │                            │
   │                             │         [User scans QR]    │
   │                             │◄── enter_session callback ─┤
   │                             │    (scene_param = token)   │
   │                             ├─ Resolve token → binding   │
   │                             ├─ Send confirmation to user │
   │◄─ binding_resolved ────────┤                            │
   │   (ready for messages)      │                            │
```

Pending tokens expire after 10 minutes. Bindings persist across restarts.

### WebSocket Protocol

All frames are JSON-encoded strings. Gateway must authenticate within 5 seconds of connecting.

**Gateway → Relay:**

| Frame | Purpose |
|-------|---------|
| `hello` | Authenticate with `gateway_id` + `auth_token` |
| `reply` | Send text message to user |
| `image_reply` | Send image (base64) to user |
| `create_binding` | Request a new QR binding token |
| `unbind_all` | Disconnect all bound users |

**Relay → Gateway:**

| Frame | Purpose |
|-------|---------|
| `inbound` | Incoming user message (text/image/voice with optional `media_data`) |
| `binding_resolved` | User successfully bound to this gateway |
| `ack` | Acknowledgment of a request |
| `error` | Error response |
| `create_binding_ack` | Binding token + QR URL |

### Heartbeat

- Relay pings each connection every **30 seconds**
- If no pong within **10 seconds**, connection is terminated
- On reconnect, relay re-sends `binding_resolved` for all existing bindings

### Media Handling

Voice and image files are downloaded from WeCom's API on the relay, then base64-encoded and included inline in the `inbound` frame (`media_data` + `media_mime` fields). The gateway (EasyClaw Desktop) handles all further processing (e.g., voice-to-text transcription via STT providers).

## Database Schema

SQLite with WAL mode. Three tables:

```sql
-- User ↔ Gateway mapping (persisted)
CREATE TABLE bindings (
  external_userid TEXT PRIMARY KEY,
  gateway_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Temporary QR binding tokens (expire after 10 min)
CREATE TABLE pending_bindings (
  token TEXT PRIMARY KEY,
  gateway_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- Key-value store (sync cursor, etc.)
CREATE TABLE kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

## Project Structure

```
src/
├── index.ts              # Entry point, server startup, graceful shutdown
├── config.ts             # Environment variable validation (Zod)
├── types.ts              # WebSocket frame types & message interfaces
├── binding/
│   └── store.ts          # SQLite binding store
├── crypto/
│   ├── decrypt.ts        # AES-128-CBC decryption
│   ├── encoding-aes-key.ts
│   └── signature.ts      # SHA1 signature verification
├── relay/
│   ├── inbound.ts        # WeCom → Gateway message routing
│   └── outbound.ts       # Gateway → WeCom reply handling
├── wecom/
│   ├── access-token.ts   # Token caching with auto-refresh
│   ├── download-media.ts # Media download (returns Buffer)
│   ├── send-message.ts   # Text/image sending, media upload
│   ├── sync-messages.ts  # Batch message fetch from WeCom API
│   ├── message-parser.ts # XML parsing
│   └── webhook-handler.ts
└── ws/
    ├── server.ts         # WebSocket server & frame routing
    ├── registry.ts       # Connection registry (gateway_id → WebSocket)
    ├── heartbeat.ts      # Ping/pong keepalive (30s interval)
    └── protocol.ts       # JSON frame encode/decode
```

## Performance & Resource Estimates

All estimates assume 10 messages per gateway per hour at peak, with 85% text / 10% voice / 5% image.

### Per 1,000 Gateway Connections

| Resource | Idle | Peak |
|----------|------|------|
| **CPU** | ~2% single core | ~5-8% single core |
| **Memory** | ~60 MB | ~100 MB |
| **Bandwidth** | ~0.8 Mbps | ~2.3 Mbps |
| **Monthly traffic** | | ~250 GB |

### Bandwidth Breakdown (peak, 1,000 gateways)

| Traffic | Bandwidth | Notes |
|---------|-----------|-------|
| Heartbeat (ping/pong) | ~1 kbps | 33 pings/s, negligible |
| Text messages (WS) | ~6 kbps | ~300 B/frame |
| Voice messages (WS) | ~400 kbps | ~180 KB/frame (base64) |
| Image messages (WS) | ~1,000 kbps | ~900 KB/frame (base64) |
| WeCom API (download) | ~830 kbps | Binary media from WeCom |
| WeCom API (send) | ~33 kbps | Outbound replies |
| **Total** | **~2.3 Mbps** | |

### Scaling Reference

| Gateways | Msg/s | Memory | CPU | Bandwidth |
|----------|-------|--------|-----|-----------|
| 1,000 | 2.8 | 256 MB | 0.5 core | 5 Mbps |
| 5,000 | 14 | 512 MB - 1 GB | 1 core | 15 Mbps |
| 10,000 | 28 | 1 - 2 GB | 2 cores | 25 Mbps |
| 50,000 | 139 | 4 - 8 GB | 4 cores | 120 Mbps |

### Known Limits

- **Media is fully buffered in memory** (no streaming). A burst of large images can spike heap usage.
- **No message queue** between webhook and gateway. If a gateway is slow or disconnected, messages for that gateway are dropped.
- **Single-threaded Node.js**. CPU-bound operations (AES decryption, base64 encoding) run on the main event loop. At ~10,000+ connections, consider worker threads or multiple processes.
- **Linux `ulimit`**: Default is 1,024 file descriptors. Set to at least `4096` for 1,000+ connections.

### Recommended Minimum (1,000 gateways)

**0.5 vCPU / 256 MB RAM / 5 Mbps** — sufficient with 2-3x headroom.

## Testing

```bash
pnpm test
```

Unit tests cover:
- SQLite binding operations
- AES decryption & SHA1 signatures
- XML message parsing
- WebSocket frame encoding/decoding
