import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

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
  const [clearing, setClearing] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [clearError, setClearError] = useState("");
  const confirmInputRef = useRef(null);

  const [resetting, setResetting] = useState(false);
  const [resetText, setResetText] = useState("");
  const [resetError, setResetError] = useState("");
  const resetInputRef = useRef(null);

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

  async function handleClearLogs() {
    if (confirmText.trim().toLowerCase() !== "yes") {
      setClearError('Type "yes" to confirm.');
      confirmInputRef.current?.focus();
      return;
    }
    setClearError("");
    try {
      const res = await fetch("/api/logs", {
        method: "DELETE",
        headers: {
          "x-passcode": session.passcode,
          "x-volunteer-name": session.volunteerName
        }
      });
      if (!res.ok) throw new Error("Failed to clear logs.");
      setEntries([]);
      setClearing(false);
      setConfirmText("");
    } catch (err) {
      setClearError(err.message);
    }
  }

  async function handleResetStatuses() {
    if (resetText.trim().toLowerCase() !== "yes") {
      setResetError('Type "yes" to confirm.');
      resetInputRef.current?.focus();
      return;
    }
    setResetError("");
    try {
      const res = await fetch("/api/houses/reset", {
        method: "POST",
        headers: {
          "x-passcode": session.passcode,
          "x-volunteer-name": session.volunteerName
        }
      });
      if (!res.ok) throw new Error("Failed to reset statuses.");
      setResetting(false);
      setResetText("");
    } catch (err) {
      setResetError(err.message);
    }
  }

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

      <div className="logs-clear-row">
        {!clearing ? (
          <button className="clear-logs-btn" onClick={() => { setClearing(true); setConfirmText(""); setClearError(""); }}>
            Clear all logs
          </button>
        ) : (
          <div className="clear-confirm-wrap">
            <span className="clear-confirm-label">Type <strong>yes</strong> to confirm:</span>
            <input
              ref={confirmInputRef}
              className="clear-confirm-input"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleClearLogs()}
              placeholder="yes"
              autoFocus
            />
            <button className="clear-confirm-btn" onClick={handleClearLogs}>Confirm</button>
            <button className="clear-cancel-btn" onClick={() => { setClearing(false); setConfirmText(""); setClearError(""); }}>Cancel</button>
            {clearError && <span className="clear-error">{clearError}</span>}
          </div>
        )}
      </div>

      <div className="logs-clear-row">
        {!resetting ? (
          <button className="clear-logs-btn" onClick={() => { setResetting(true); setResetText(""); setResetError(""); }}>
            Reset all statuses
          </button>
        ) : (
          <div className="clear-confirm-wrap">
            <span className="clear-confirm-label">Type <strong>yes</strong> to confirm:</span>
            <input
              ref={resetInputRef}
              className="clear-confirm-input"
              type="text"
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleResetStatuses()}
              placeholder="yes"
              autoFocus
            />
            <button className="clear-confirm-btn" onClick={handleResetStatuses}>Confirm</button>
            <button className="clear-cancel-btn" onClick={() => { setResetting(false); setResetText(""); setResetError(""); }}>Cancel</button>
            {resetError && <span className="clear-error">{resetError}</span>}
          </div>
        )}
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
