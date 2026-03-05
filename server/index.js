import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  STATUS_VALUES,
  ensureVolunteer,
  getClusterSnapshot,
  getActivityLog,
  clearActivityLog,
  resetAllHouseStatuses,
  updateHouseStatus,
  normalizeNameKey,
  getAllocations,
  addAllocation,
  updateAllocation,
  deleteAllocation
} from "./db.js";

dotenv.config();

const appPasscode = process.env.APP_PASSCODE;
if (!appPasscode) {
  throw new Error("APP_PASSCODE is required. Set it in environment variables.");
}

const adminKeys = new Set(
  (process.env.ADMIN_NAMES ?? "")
    .split(",")
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean)
);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "../dist");

app.use(cors());
app.use(express.json());

function authFromHeaders(req, res, next) {
  const passcode = req.get("x-passcode");
  const volunteerName = req.get("x-volunteer-name");

  if (!passcode || passcode !== appPasscode || !volunteerName || !volunteerName.trim()) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.volunteerName = volunteerName.trim();
  req.volunteerNameKey = normalizeNameKey(volunteerName);
  req.isAdmin = adminKeys.has(req.volunteerNameKey);
  ensureVolunteer(req.volunteerName);
  return next();
}

function adminOnly(req, res, next) {
  if (!req.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }
  return next();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/session", (req, res) => {
  const { passcode, volunteerName } = req.body ?? {};

  if (!passcode || passcode !== appPasscode || !volunteerName || !volunteerName.trim()) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const volunteer = ensureVolunteer(volunteerName);
  const isAdmin = adminKeys.has(normalizeNameKey(volunteerName));
  return res.json({ volunteer, isAdmin });
});

app.get("/api/bootstrap", authFromHeaders, (_req, res) => {
  const clusters = getClusterSnapshot();
  const allocations = getAllocations();
  return res.json({ clusters, allocations });
});

app.get("/api/allocations", authFromHeaders, (_req, res) => {
  return res.json({ allocations: getAllocations() });
});

app.post("/api/allocations", authFromHeaders, adminOnly, (req, res) => {
  const { clusterId, name } = req.body ?? {};
  if (!clusterId || !name?.trim()) {
    return res.status(400).json({ error: "clusterId and name are required" });
  }
  const result = addAllocation(clusterId, name);
  if (!result) {
    return res.status(409).json({ error: "That name is already assigned to this cluster" });
  }
  const allocations = getAllocations();
  io.emit("allocations:updated", { allocations });
  return res.json({ allocations });
});

app.put("/api/allocations/:id", authFromHeaders, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const { name } = req.body ?? {};
  if (!Number.isInteger(id) || !name?.trim()) {
    return res.status(400).json({ error: "Invalid id or name" });
  }
  updateAllocation(id, name);
  const allocations = getAllocations();
  io.emit("allocations:updated", { allocations });
  return res.json({ allocations });
});

app.delete("/api/allocations/:id", authFromHeaders, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  deleteAllocation(id);
  const allocations = getAllocations();
  io.emit("allocations:updated", { allocations });
  return res.json({ allocations });
});

app.patch("/api/houses/:houseId/status", authFromHeaders, (req, res) => {
  const houseId = Number(req.params.houseId);
  const { status } = req.body ?? {};

  if (!Number.isInteger(houseId) || houseId <= 0) {
    return res.status(400).json({ error: "Invalid house id" });
  }

  if (!STATUS_VALUES.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const updatedHouse = updateHouseStatus(houseId, status, req.volunteerName);
  if (!updatedHouse) {
    return res.status(404).json({ error: "House not found" });
  }

  io.emit("house:updated", { house: updatedHouse });
  return res.json({ house: updatedHouse });
});

app.get("/api/logs", authFromHeaders, adminOnly, (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 300), 1000);
  const entries = getActivityLog(limit);
  return res.json({ entries });
});

app.delete("/api/logs", authFromHeaders, adminOnly, (_req, res) => {
  clearActivityLog();
  return res.json({ ok: true });
});

app.post("/api/houses/reset", authFromHeaders, adminOnly, (_req, res) => {
  const result = resetAllHouseStatuses();
  io.emit("houses:reset");
  return res.json({ ok: true, changed: result.changes });
});

io.use((socket, next) => {
  const passcode = socket.handshake.auth?.passcode;
  const volunteerName = socket.handshake.auth?.volunteerName;

  if (passcode !== appPasscode || !volunteerName || !String(volunteerName).trim()) {
    return next(new Error("Unauthorized"));
  }

  socket.data.volunteerName = String(volunteerName).trim();
  ensureVolunteer(socket.data.volunteerName);
  return next();
});

io.on("connection", (socket) => {
  socket.emit("welcome", { volunteerName: socket.data.volunteerName });
});

app.use(express.static(distDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

const port = Number(process.env.PORT || 3088);
server.listen(port, () => {
  console.log(`Ikhlas Impact tracker running on port ${port}`);
});
