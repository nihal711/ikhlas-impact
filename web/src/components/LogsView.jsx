import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

const STATUS_LABELS = {
  pending_delivery: "Pending",
  placed_at_door: "Placed at Door",
  delivered: "Delivered"
};

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

const LogsView = forwardRef(function LogsView({ session }, ref) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [volunteerFilter, setVolunteerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useImperativeHandle(ref, () => ({
    addEntry(entry) {
      setEntries((prev) => [entry, ...prev]);
    }
  }));

  useEffect(() => {
    async function fetchLogs() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/logs?limit=500", {
          headers: {
            "x-passcode": session.passcode,
            "x-volunteer-name": session.volunteerName
          }
        });
        if (!res.ok) throw new Error("Could not load logs.");
        const data = await res.json();
        setEntries(data.entries);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, [session]);

  const volunteers = ["all", ...Array.from(new Set(entries.map((e) => e.volunteer))).sort()];

  const filtered = entries.filter((e) => {
    const matchVol = volunteerFilter === "all" || e.volunteer === volunteerFilter;
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "completed" &&
        (e.status === "placed_at_door" || e.status === "delivered")) ||
      (statusFilter === "pending" && e.status === "pending_delivery");
    return matchVol && matchStatus;
  });

  return (
    <div className="logs-view">
      <div className="logs-filters">
        <div className="filter-group">
          <span className="filter-label">Volunteer</span>
          <div className="filter-pills">
            {volunteers.map((v) => (
              <button
                key={v}
                className={`filter-pill ${volunteerFilter === v ? "filter-pill-active" : ""}`}
                onClick={() => setVolunteerFilter(v)}
              >
                {v === "all" ? "All" : v}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <span className="filter-label">Status</span>
          <div className="filter-pills">
            {[
              { key: "all", label: "All" },
              { key: "pending", label: "Pending" },
              { key: "completed", label: "Completed" }
            ].map((s) => (
              <button
                key={s.key}
                className={`filter-pill ${statusFilter === s.key ? "filter-pill-active" : ""}`}
                onClick={() => setStatusFilter(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <p className="logs-empty">Loading logs...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && filtered.length === 0 && (
        <p className="logs-empty">No entries match the current filters.</p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="log-list">
          {filtered.map((entry) => (
            <div key={entry.id} className="log-entry">
              <div className="log-entry-top">
                <span className="log-time">{formatTime(entry.ts)}</span>
                <span className={`status-pill status-${entry.status}`}>
                  {STATUS_LABELS[entry.status] ?? entry.status}
                </span>
              </div>
              <div className="log-volunteer">{entry.volunteer}</div>
              <div className="log-address">{entry.address}</div>
              <div className="log-cluster">{entry.cluster}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default LogsView;
