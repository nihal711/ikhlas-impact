import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dataDir = path.resolve(process.cwd(), "data");
const dbPath = path.join(dataDir, "ikhlas.db");
const logsDir = path.resolve(process.cwd(), "logs");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const db = new Database(dbPath);

export const STATUS_VALUES = ["pending_delivery", "placed_at_door", "delivered"];

db.exec(`
  CREATE TABLE IF NOT EXISTS volunteers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    last_seen_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clusters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS houses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    house_id TEXT NOT NULL,
    address TEXT NOT NULL,
    cluster_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_delivery',
    last_updated_by TEXT,
    last_updated_by_key TEXT,
    last_updated_at TEXT,
    FOREIGN KEY(cluster_id) REFERENCES clusters(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_houses_cluster_houseid
    ON houses(cluster_id, house_id);

  CREATE TABLE IF NOT EXISTS activity_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        TEXT NOT NULL,
    volunteer TEXT NOT NULL,
    status    TEXT NOT NULL,
    house_id  TEXT NOT NULL,
    address   TEXT NOT NULL,
    cluster   TEXT NOT NULL
  );
`);

export function normalizeNameKey(input) {
  return input.trim().toLowerCase();
}

export function ensureVolunteer(name) {
  const trimmed = name.trim();
  const key = normalizeNameKey(trimmed);
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO volunteers (display_name, name_key, last_seen_at)
     VALUES (?, ?, ?)
     ON CONFLICT(name_key) DO UPDATE SET
       display_name = excluded.display_name,
       last_seen_at = excluded.last_seen_at`
  ).run(trimmed, key, now);

  return db
    .prepare("SELECT id, display_name AS displayName, name_key AS nameKey FROM volunteers WHERE name_key = ?")
    .get(key);
}

export function getClusterSnapshot() {
  const clusterRows = db
    .prepare("SELECT id, name, sort_order AS sortOrder FROM clusters ORDER BY sort_order ASC, id ASC")
    .all();

  const houseRows = db
    .prepare(
      `SELECT id, house_id AS houseId, address, cluster_id AS clusterId, status,
              last_updated_by AS lastUpdatedBy, last_updated_at AS lastUpdatedAt
       FROM houses
       ORDER BY id ASC`
    )
    .all();

  return clusterRows.map((cluster) => {
    const houses = houseRows.filter((house) => house.clusterId === cluster.id);
    const totals = houses.reduce(
      (acc, house) => {
        acc[house.status] += 1;
        return acc;
      },
      { pending_delivery: 0, placed_at_door: 0, delivered: 0 }
    );

    return {
      id: cluster.id,
      name: cluster.name,
      totalHouses: houses.length,
      totals,
      houses
    };
  });
}

function appendLogFile(entry) {
  try {
    const date = entry.ts.slice(0, 10);
    const logPath = path.join(logsDir, `${date}.ndjson`);
    fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // Non-fatal — server keeps running even if log write fails
  }
}

export function updateHouseStatus(houseId, status, volunteerName) {
  const volunteer = ensureVolunteer(volunteerName);
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `UPDATE houses
       SET status = ?,
           last_updated_by = ?,
           last_updated_by_key = ?,
           last_updated_at = ?
       WHERE id = ?`
    )
    .run(status, volunteer.displayName, volunteer.nameKey, now, houseId);

  if (!result.changes) {
    return null;
  }

  const house = db
    .prepare(
      `SELECT h.id, h.house_id AS houseId, h.address, h.cluster_id AS clusterId,
              h.status, h.last_updated_by AS lastUpdatedBy, h.last_updated_at AS lastUpdatedAt,
              c.name AS clusterName
       FROM houses h
       JOIN clusters c ON c.id = h.cluster_id
       WHERE h.id = ?`
    )
    .get(houseId);

  if (house) {
    const logEntry = {
      ts: now,
      volunteer: volunteer.displayName,
      status,
      houseId: house.houseId,
      address: house.address,
      cluster: house.clusterName
    };

    db.prepare(
      `INSERT INTO activity_log (ts, volunteer, status, house_id, address, cluster)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(logEntry.ts, logEntry.volunteer, logEntry.status, logEntry.houseId, logEntry.address, logEntry.cluster);

    appendLogFile(logEntry);
  }

  // Return shape without clusterName to keep API response consistent
  return db
    .prepare(
      `SELECT id, house_id AS houseId, address, cluster_id AS clusterId, status,
              last_updated_by AS lastUpdatedBy, last_updated_at AS lastUpdatedAt
       FROM houses WHERE id = ?`
    )
    .get(houseId);
}

export function getActivityLog(limit = 300) {
  return db
    .prepare(
      `SELECT id, ts, volunteer, status, house_id AS houseId, address, cluster
       FROM activity_log
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(limit);
}

export function resetAllHouseStatuses() {
  return db
    .prepare(
      `UPDATE houses
       SET status = 'pending_delivery',
           last_updated_by = NULL,
           last_updated_by_key = NULL,
           last_updated_at = NULL`
    )
    .run();
}

export function clearActivityLog() {
  db.prepare("DELETE FROM activity_log").run();
  // Remove all daily ndjson log files
  try {
    for (const file of fs.readdirSync(logsDir)) {
      if (file.endsWith(".ndjson")) {
        fs.unlinkSync(path.join(logsDir, file));
      }
    }
  } catch {
    // Non-fatal
  }
}

export function wipeAndImportClusters(inputRows) {
  const transaction = db.transaction((rows) => {
    db.prepare("DELETE FROM houses").run();
    db.prepare("DELETE FROM clusters").run();

    const clusterNameToId = new Map();
    const insertCluster = db.prepare("INSERT INTO clusters (name, sort_order) VALUES (?, ?)");
    const insertHouse = db.prepare(
      "INSERT INTO houses (house_id, address, cluster_id, status) VALUES (?, ?, ?, 'pending_delivery')"
    );

    const orderedClusterNames = [...new Set(rows.map((row) => row.cluster.trim()))];
    orderedClusterNames.forEach((clusterName, index) => {
      const result = insertCluster.run(clusterName, index + 1);
      clusterNameToId.set(clusterName, Number(result.lastInsertRowid));
    });

    rows.forEach((row) => {
      const clusterId = clusterNameToId.get(row.cluster.trim());
      insertHouse.run(row.houseId.trim(), row.address.trim(), clusterId);
    });
  });

  transaction(inputRows);
}

export default db;
