# Ikhlas Impact Delivery Tracker

Real-time delivery tracking web app for 8 house clusters.

## Quick start

1. Copy env file:

```bash
cp .env.example .env
```

2. Set your shared passcode in `.env`.

3. Install dependencies and build:

```bash
npm install
npm run build
```

4. Import your CSV:

```bash
npm run import:csv -- ./imports/houses.csv
```

CSV headers required:
- `cluster`
- `house_id`
- `address`

5. Run with Docker Compose (if available):

```bash
docker compose up -d --build
```

If Compose is not installed, run directly:

```bash
docker build -t ikhlas-impact-tracker:latest .
docker rm -f ikhlas-impact-tracker >/dev/null 2>&1 || true
docker run -d \
  --name ikhlas-impact-tracker \
  --restart unless-stopped \
  -p 3088:3088 \
  --env-file .env \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/imports:/app/imports" \
  ikhlas-impact-tracker:latest
```

6. Nginx Proxy Manager target:
- Host/IP: your Unraid host IP
- Port: `3088`
- Enable WebSocket support
- SSL: Let's Encrypt

## Status values
- `pending_delivery`
- `placed_at_door`
- `delivered`
