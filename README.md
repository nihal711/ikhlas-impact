# Ikhlas Impact Delivery Tracker

Real-time donation bag delivery tracking app for volunteer clusters. Built with React, Node.js, Express, Socket.IO and SQLite. Mobile-first, dark mode, live updates via WebSocket, admin activity logs.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite |
| Backend | Node.js + Express 4 |
| Real-time | Socket.IO 4 |
| Database | SQLite (better-sqlite3) |
| Deployment | Docker on Unraid |

---

## Quick start

### 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3088
APP_PASSCODE=your_passcode_here
ADMIN_NAMES=name1,name2,name3
```

`ADMIN_NAMES` is a comma-separated list of volunteer names who get access to the Logs tab.

### 2. Build and run

```bash
docker build -t ikhlas-impact-tracker:latest .
docker run -d \
  --name ikhlas-impact-tracker \
  --restart unless-stopped \
  -p 3088:3088 \
  -e APP_PASSCODE='your_passcode' \
  -e ADMIN_NAMES='name1,name2,name3' \
  -e PORT=3088 \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/imports:/app/imports" \
  -v "$(pwd)/logs:/app/logs" \
  --label "net.unraid.docker.webui=http://[IP]:3088" \
  --label "net.unraid.docker.icon=https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/mosque.png" \
  --label "net.unraid.docker.managed=dockerman" \
  --log-driver json-file \
  --log-opt max-size=10m \
  --log-opt max-file=5 \
  ikhlas-impact-tracker:latest
```

### 3. Import address data

Place your CSV in `imports/houses.csv` with headers: `house_id`, `cluster`, `address`

Then run inside the container:

```bash
docker exec ikhlas-impact-tracker node server/importCsv.js ./imports/houses.csv
```

The import script accepts any number of clusters (no hard limit).

### 4. Nginx Proxy Manager

- Host/IP: Unraid host IP
- Port: `3088`
- Enable WebSocket support (required for live updates)
- SSL: Let's Encrypt

---

## Unraid setup

### Template file

The Unraid Docker template is stored at:

```
/boot/config/plugins/dockerman/templates-user/my-ikhlas-impact-tracker.xml
```

This gives the container a WebUI button, Edit form, and icon in the Unraid Docker UI.

### Autostart

Unraid controls autostart via:

```
/boot/config/plugins/dockerman/userprefs.cfg
```

To add the container to the autostart list manually:

```bash
NEXT=$(grep -c '^[0-9]*=' /boot/config/plugins/dockerman/userprefs.cfg)
echo "${NEXT}=\"ikhlas-impact-tracker\"" >> /boot/config/plugins/dockerman/userprefs.cfg
```

Then refresh the Docker page in Unraid — the Autostart toggle will appear.

### Critical label — Edit button and "3rd Party" fix

Containers created via raw `docker run` outside Unraid's UI will show as **"3rd Party"** with no Edit button. This is because Unraid identifies its own managed containers by the label:

```
net.unraid.docker.managed=dockerman
```

If the container was created with `net.unraid.docker.managed=true` (or no label), Unraid will not show Edit, will not allow the Autostart toggle, and will report "No such container" when trying to manage it from the UI.

**Fix:** Recreate the container with the correct label:

```bash
docker stop ikhlas-impact-tracker && docker rm ikhlas-impact-tracker

docker run -d \
  --name ikhlas-impact-tracker \
  --restart unless-stopped \
  -p 3088:3088 \
  -e APP_PASSCODE='your_passcode' \
  -e ADMIN_NAMES='name1,name2,name3' \
  -e PORT=3088 \
  -v /mnt/user/appdata/ikhlas-impact/data:/app/data \
  -v /mnt/user/appdata/ikhlas-impact/imports:/app/imports \
  -v /mnt/user/appdata/ikhlas-impact/logs:/app/logs \
  --label "net.unraid.docker.webui=http://[IP]:3088" \
  --label "net.unraid.docker.icon=https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/mosque.png" \
  --label "net.unraid.docker.managed=dockerman" \
  --log-driver json-file \
  --log-opt max-size=10m \
  --log-opt max-file=5 \
  ikhlas-impact-tracker:latest
```

After refreshing the Docker page in Unraid, Edit, Logs, Restart, and the Autostart toggle all work correctly.

### Changing the passcode

The passcode is passed as an environment variable at container startup, not read from `.env` at runtime. To change it:

1. In Unraid Docker UI → click Edit on the container
2. Update the `APP_PASSCODE` variable
3. Click Apply — Unraid restarts the container automatically

Or from the terminal:

```bash
docker stop ikhlas-impact-tracker && docker rm ikhlas-impact-tracker
# Re-run the docker run command above with the new passcode
```

No rebuild is needed — only a restart.

### Rebuilding after code changes

```bash
cd /mnt/user/appdata/ikhlas-impact
docker stop ikhlas-impact-tracker && docker rm ikhlas-impact-tracker
docker build -t ikhlas-impact-tracker:latest .
# Then docker run ... as above
# Then re-import CSV if needed:
docker exec ikhlas-impact-tracker node server/importCsv.js ./imports/houses.csv
```

---

## Data persistence

All live data is stored on the Unraid host (bind-mounted), not inside the container image:

| Path on host | Mounted at | Contents |
|---|---|---|
| `appdata/ikhlas-impact/data/` | `/app/data` | `ikhlas.db` — SQLite database |
| `appdata/ikhlas-impact/logs/` | `/app/logs` | Daily NDJSON activity logs |
| `appdata/ikhlas-impact/imports/` | `/app/imports` | CSV import files |

Stopping, removing, or rebuilding the container never affects this data. The nightly Unraid appdata backup covers all three paths automatically.

---

## Status values

| Value | Meaning |
|---|---|
| `pending_delivery` | Not yet reached |
| `placed_at_door` | Left at door |
| `delivered` | Handed over |

"Placed at door" and "Delivered" both count as **Completed** in the metrics and progress bar.

---

## Admin / Logs tab

Volunteers whose names are listed in `ADMIN_NAMES` (case-insensitive) see a **Tracker | Logs** switcher after login. The Logs view shows a live reverse-chronological feed of all status changes, filterable by volunteer and status. Every status change is also written to a daily file at `logs/YYYY-MM-DD.ndjson`.
