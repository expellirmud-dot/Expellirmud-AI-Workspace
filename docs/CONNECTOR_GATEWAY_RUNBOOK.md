# Connector Gateway Runbook

The Connector Gateway is a read-only, separate service designed to serve Final Gate Packages to ChatGPT Custom GPT Actions safely. It ensures that your main Dashboard UI and task mutation endpoints are not exposed to the public internet via a tunnel.

## Running the Gateway

You must configure the `CHATGPT_CONNECTOR_TOKEN` environment variable before starting the gateway. This token is required to authenticate inbound requests from ChatGPT.

Start the gateway:
```bash
# Set your token
export CHATGPT_CONNECTOR_TOKEN="your-secure-token"

# Run the gateway service
npm run connector:gateway
```
The gateway runs on port 3000 by default (override with `PORT=...`).

## Testing the Gateway

You can verify the gateway behavior locally using `curl`:

1. **Missing Env** (Remove token, expect `503 Service Unavailable`):
   ```bash
   curl -i http://127.0.0.1:3000/api/task/final-gate-package/TASK-ID
   ```
2. **Wrong Token** (Expect `401 Unauthorized`):
   ```bash
   curl -i -H "Authorization: Bearer wrong-token" http://127.0.0.1:3000/api/task/final-gate-package/TASK-ID
   ```
3. **Correct Token but Not Exposed** (If task has `connector_exposed: false`, expect `403 Forbidden`):
   ```bash
   curl -i -H "Authorization: Bearer your-secure-token" http://127.0.0.1:3000/api/task/final-gate-package/TASK-ID
   ```
4. **Correct Token and Exposed** (Expect `200 OK` and a bounded JSON payload):
   ```bash
   curl -i -H "Authorization: Bearer your-secure-token" http://127.0.0.1:3000/api/task/final-gate-package/TASK-ID
   ```

## Security Warnings

> [!WARNING]
> **Tunnel Configuration:** Always ensure your tunnel (ngrok, Cloudflare) points ONLY to the Connector Gateway port (e.g., `3000`), NOT the main Dashboard port (`5173`).

> [!WARNING]
> **Never Expose Mutations:** Never expose `POST /api/task/expose` externally. The Gateway is designed to be read-only and explicitly omits all mutation routes. The exposure toggle must remain an owner-local action in the Dashboard.
