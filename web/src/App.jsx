import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import ClusterTabs from "./components/ClusterTabs";
import HouseRow from "./components/HouseRow";
import DarkModeToggle from "./components/DarkModeToggle";
import LogsView from "./components/LogsView";
import AllocationView from "./components/AllocationView";
import LoginWaves from "./components/LoginWaves";
import Logo from "./components/Logo";

function getInitialDark() {
  const stored = localStorage.getItem("ikhlas-dark");
  if (stored !== null) return stored === "true";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

const STATUS_LABELS = {
  pending_delivery: "Pending Delivery",
  placed_at_door: "Placed At Door",
  delivered: "Delivered"
};

function normalizeNameInput(name) {
  return name.trim();
}

function App() {
  const [dark, setDark] = useState(getInitialDark);

  function toggleDark() {
    setDark((d) => !d);
  }

  const [session, setSession] = useState(() => {
    const raw = localStorage.getItem("ikhlas-session");
    return raw ? JSON.parse(raw) : null;
  });
  const [passcodeInput, setPasscodeInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [clusters, setClusters] = useState([]);
  const [activeClusterId, setActiveClusterId] = useState(null);
  const [activeView, setActiveView] = useState("tracker"); // "tracker" | "allocation" | "logs"
  const [allocations, setAllocations] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "pending" | "completed"
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatingHouseId, setUpdatingHouseId] = useState(null);
  const logsViewRef = useRef(null);

  // Reorder mode
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderList, setReorderList] = useState([]);
  const [dragActiveId, setDragActiveId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [renames, setRenames] = useState({}); // { houseId: newAddress }
  const [editingId, setEditingId] = useState(null);
  const reorderListRef = useRef(null);
  const activeDragRef = useRef(null); // { id, overId }

  const activeCluster = useMemo(
    () => clusters.find((cluster) => cluster.id === activeClusterId) ?? null,
    [clusters, activeClusterId]
  );

  // Reset search, filter, and reorder mode when cluster changes
  useEffect(() => {
    setSearchQuery("");
    setStatusFilter("all");
    setReorderMode(false);
    setDragActiveId(null);
    setDragOverId(null);
    setRenames({});
    setEditingId(null);
  }, [activeClusterId]);

  async function handleLogin(event) {
    event.preventDefault();
    const volunteerName = normalizeNameInput(nameInput);

    if (!passcodeInput || !volunteerName) {
      setError("Passcode and volunteer name are required.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcodeInput, volunteerName })
      });

      if (!response.ok) {
        throw new Error("Invalid passcode or name.");
      }

      const data = await response.json();
      const nextSession = {
        passcode: passcodeInput,
        volunteerName: data.volunteer.displayName,
        isAdmin: data.isAdmin ?? false
      };
      localStorage.setItem("ikhlas-session", JSON.stringify(nextSession));
      setSession(nextSession);
      setPasscodeInput("");
      setNameInput("");
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadData(currentSession) {
    const response = await fetch("/api/bootstrap", {
      headers: {
        "x-passcode": currentSession.passcode,
        "x-volunteer-name": currentSession.volunteerName
      }
    });

    if (response.status === 401) {
      throw new Error("Unauthorized. Please log in again.");
    }

    if (!response.ok) {
      throw new Error("Unable to load tracker data.");
    }

    const payload = await response.json();
    const incomingAllocations = payload.allocations ?? [];
    setClusters(payload.clusters);
    setAllocations(incomingAllocations);

    // Auto-jump: if this user is allocated to a cluster, select it on first load
    const myName = currentSession.volunteerName.toLowerCase().trim();
    const myAlloc = incomingAllocations.find(
      (a) => a.name.toLowerCase().trim() === myName
    );
    setActiveClusterId((previous) => {
      if (previous !== null) return previous;
      return myAlloc?.clusterId ?? payload.clusters[0]?.id ?? null;
    });
  }

  useEffect(() => {
    if (!session) {
      return undefined;
    }

    let socket;

    loadData(session).catch((loadError) => {
      setError(loadError.message);
      if (loadError.message.includes("Unauthorized")) {
        localStorage.removeItem("ikhlas-session");
        setSession(null);
      }
    });

    socket = io({
      auth: {
        passcode: session.passcode,
        volunteerName: session.volunteerName
      }
    });

    socket.on("houses:reset", () => {
      loadData(session).catch(() => {});
    });

    socket.on("clusters:reordered", ({ clusters: updated }) => {
      setClusters(updated);
    });

    socket.on("allocations:updated", ({ allocations: updated }) => {
      setAllocations(updated);
    });

    socket.on("house:updated", ({ house }) => {
      setClusters((currentClusters) =>
        currentClusters.map((cluster) => {
          if (cluster.id !== house.clusterId) {
            return cluster;
          }

          const updatedHouses = cluster.houses.map((entry) =>
            entry.id === house.id ? house : entry
          );

          const totals = updatedHouses.reduce(
            (acc, currentHouse) => {
              acc[currentHouse.status] += 1;
              return acc;
            },
            { pending_delivery: 0, placed_at_door: 0, delivered: 0 }
          );

          return {
            ...cluster,
            houses: updatedHouses,
            totals
          };
        })
      );

      // Forward live updates to the Logs view if it is mounted
      if (logsViewRef.current?.addEntry) {
        logsViewRef.current.addEntry({
          id: `live-${Date.now()}`,
          ts: house.lastUpdatedAt,
          volunteer: house.lastUpdatedBy ?? "Unknown",
          status: house.status,
          houseId: house.houseId,
          address: house.address ?? "",
          cluster: clusters.find((c) => c.id === house.clusterId)?.name ?? ""
        });
      }
    });

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [session]);

  function enterReorderMode() {
    setReorderList([...(activeCluster?.houses ?? [])]);
    setRenames({});
    setEditingId(null);
    setReorderMode(true);
  }

  function cancelReorder() {
    setReorderMode(false);
    setDragActiveId(null);
    setDragOverId(null);
    setRenames({});
    setEditingId(null);
  }

  async function saveReorder() {
    const orderedIds = reorderList.map((h) => h.id);
    try {
      await fetch(`/api/clusters/${activeClusterId}/houses/order`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-passcode": session.passcode,
          "x-volunteer-name": session.volunteerName
        },
        body: JSON.stringify({ houseIds: orderedIds, renames })
      });
    } catch {
      setError("Failed to save order.");
    }
    setReorderMode(false);
    setDragActiveId(null);
    setDragOverId(null);
    setRenames({});
    setEditingId(null);
  }

  function moveReorderItem(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= reorderList.length) return;
    const next = [...reorderList];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setReorderList(next);
  }

  function handleDragPointerDown(e, id) {
    e.currentTarget.setPointerCapture(e.pointerId);
    activeDragRef.current = { id, overId: null };
    setDragActiveId(id);
    setDragOverId(null);
  }

  function handleDragPointerMove(e) {
    if (!activeDragRef.current) return;
    e.preventDefault();
    const cards = reorderListRef.current?.querySelectorAll("[data-reorder-id]");
    if (!cards) return;
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const targetId = Number(card.dataset.reorderId);
        if (targetId !== activeDragRef.current.id) {
          activeDragRef.current.overId = targetId;
          setDragOverId(targetId);
        }
        break;
      }
    }
  }

  function handleDragPointerUp() {
    if (!activeDragRef.current) return;
    const { id: activeId, overId } = activeDragRef.current;
    activeDragRef.current = null;
    if (activeId && overId && activeId !== overId) {
      setReorderList((list) => {
        const from = list.findIndex((h) => h.id === activeId);
        const to = list.findIndex((h) => h.id === overId);
        if (from === -1 || to === -1) return list;
        const next = [...list];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      });
    }
    setDragActiveId(null);
    setDragOverId(null);
  }

  async function changeHouseStatus(houseId, status) {
    if (!session) {
      return;
    }

    setUpdatingHouseId(houseId);

    try {
      const response = await fetch(`/api/houses/${houseId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-passcode": session.passcode,
          "x-volunteer-name": session.volunteerName
        },
        body: JSON.stringify({ status })
      });

      if (!response.ok) {
        throw new Error("Could not update status.");
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setUpdatingHouseId(null);
    }
  }

  function logout() {
    localStorage.removeItem("ikhlas-session");
    setSession(null);
    setClusters([]);
    setAllocations([]);
    setActiveClusterId(null);
    setActiveView("tracker");
  }

  if (!session) {
    return (
      <main className="login-screen">
        <LoginWaves />
        <div className="login-screen-toggle">
          <DarkModeToggle dark={dark} onToggle={toggleDark} />
        </div>
        <section className="login-card">
          <div className="login-top-row">
            <Logo dark={dark} className="brand-logo" />
          </div>
          <form onSubmit={handleLogin}>
            <label>
              Shared Passcode
              <input
                type="password"
                value={passcodeInput}
                onChange={(event) => setPasscodeInput(event.target.value)}
                autoComplete="off"
              />
            </label>

            <label>
              Volunteer Name
              <input
                type="text"
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                autoComplete="name"
              />
            </label>

            <button type="submit" disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>

          {error ? <p className="error-text">{error}</p> : null}

          <div className="social-links">
            <a href="https://www.instagram.com/ikhlasimpact/" target="_blank" rel="noopener noreferrer" className="social-link">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="20" height="20" rx="5.5" ry="5.5" stroke="currentColor" strokeWidth="1.8" fill="none"/>
                <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" fill="none"/>
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>
              </svg>
              Instagram
            </a>
            <a href="https://chat.whatsapp.com/GisK3V2b1H9JMj2mGkNCXH?mode=gi_t" target="_blank" rel="noopener noreferrer" className="social-link">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.656 1.438 5.168L2 22l4.978-1.418A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" stroke="currentColor" strokeWidth="1.8" fill="none"/>
                <path d="M8.5 9.5c.2.8.8 2.2 2 3.4 1.2 1.2 2.7 1.9 3.5 2.1l1.2-1.2c.2-.2.5-.2.7-.1.6.3 1.3.5 1.8.6.3.1.5.4.5.7v2c0 .4-.3.7-.7.7C9.8 17.7 6.3 14.2 6 8.7c0-.4.3-.7.7-.7h2c.3 0 .6.2.7.5.1.5.3 1.2.6 1.8.1.2.1.5-.1.7L8.5 9.5z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              </svg>
              WhatsApp
            </a>
          </div>
        </section>
      </main>
    );
  }

  const q = searchQuery.toLowerCase();
  const filteredHouses = activeCluster
    ? activeCluster.houses.filter((h) => {
        const matchSearch =
          !q ||
          h.address.toLowerCase().includes(q) ||
          h.houseId.toLowerCase().includes(q);

        const matchStatus =
          statusFilter === "all" ||
          (statusFilter === "pending" && h.status === "pending_delivery") ||
          (statusFilter === "completed" &&
            (h.status === "placed_at_door" || h.status === "delivered"));

        return matchSearch && matchStatus;
      })
    : [];

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="brand-logo">
          <Logo dark={dark} className="brand-logo--header" />
        </div>

        <div className="volunteer-block">
          <span>{session.volunteerName}</span>
          <div className="volunteer-actions">
            <DarkModeToggle dark={dark} onToggle={toggleDark} />
            <button onClick={logout}>Logout</button>
          </div>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="view-switcher" role="tablist">
        <button
          role="tab"
          aria-selected={activeView === "tracker"}
          className={`view-tab ${activeView === "tracker" ? "view-tab-active" : ""}`}
          onClick={() => setActiveView("tracker")}
        >
          Tracker
        </button>
        <button
          role="tab"
          aria-selected={activeView === "allocation"}
          className={`view-tab ${activeView === "allocation" ? "view-tab-active" : ""}`}
          onClick={() => setActiveView("allocation")}
        >
          Allocation
        </button>
        {session.isAdmin && (
          <button
            role="tab"
            aria-selected={activeView === "logs"}
            className={`view-tab ${activeView === "logs" ? "view-tab-active" : ""}`}
            onClick={() => setActiveView("logs")}
          >
            Logs
          </button>
        )}
      </div>

      {activeView === "logs" && session.isAdmin ? (
        <LogsView session={session} ref={logsViewRef} />
      ) : activeView === "allocation" ? (
        <AllocationView
          session={session}
          clusters={clusters}
          allocations={allocations}
          isAdmin={session.isAdmin}
          onAllocationsChange={setAllocations}
        />
      ) : (
        <>
          <ClusterTabs
            clusters={clusters}
            activeClusterId={activeClusterId}
            onSelectCluster={setActiveClusterId}
          />

          {activeCluster ? (
            <section className="cluster-panel">
              <p className="cluster-heading">{activeCluster.name}</p>

              {(() => {
                const completed =
                  activeCluster.totals.placed_at_door + activeCluster.totals.delivered;
                const pct =
                  activeCluster.totalHouses > 0
                    ? Math.round((completed / activeCluster.totalHouses) * 100)
                    : 0;
                return (
                  <>
                    <div
                      className="progress-bar-wrap"
                      role="progressbar"
                      aria-valuenow={completed}
                      aria-valuemax={activeCluster.totalHouses}
                    >
                      <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                    </div>

                    <div className="cluster-metrics">
                      <span>Pending: {activeCluster.totals.pending_delivery}</span>
                      <span>Completed: {completed}</span>
                      <span>Total: {activeCluster.totalHouses}</span>
                    </div>
                  </>
                );
              })()}

              <div className="search-bar-wrap">
                <input
                  className="search-input"
                  type="search"
                  placeholder="Search by address or unit no…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="status-filter-row">
                {!reorderMode && [
                  { key: "all", label: "All" },
                  { key: "pending", label: "Pending" },
                  { key: "completed", label: "Completed" }
                ].map((f) => (
                  <button
                    key={f.key}
                    className={`filter-pill ${statusFilter === f.key ? "filter-pill-active" : ""}`}
                    onClick={() => setStatusFilter(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
                {!reorderMode && (searchQuery || statusFilter !== "all") && (
                  <span className="search-count">
                    {filteredHouses.length} of {activeCluster.houses.length}
                  </span>
                )}
                <div className="reorder-actions">
                  {reorderMode ? (
                    <>
                      <button className="reorder-done-btn" onClick={saveReorder}>Done</button>
                      <button className="reorder-cancel-btn" onClick={cancelReorder}>Cancel</button>
                    </>
                  ) : (
                    <button className="reorder-btn" onClick={enterReorderMode} title="Edit houses">
                      <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14">
                        <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      </svg>
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {reorderMode ? (
                <div className="house-list reorder-list" ref={reorderListRef}>
                  {reorderList.map((house, index) => (
                    <div
                      key={house.id}
                      data-reorder-id={house.id}
                      className={`house-card reorder-card${dragActiveId === house.id ? " reorder-dragging" : ""}${dragOverId === house.id ? " reorder-drag-over" : ""}`}
                    >
                      <div
                        className="drag-handle"
                        aria-label="Drag to reorder"
                        onPointerDown={(e) => handleDragPointerDown(e, house.id)}
                        onPointerMove={handleDragPointerMove}
                        onPointerUp={handleDragPointerUp}
                        onPointerCancel={handleDragPointerUp}
                      >
                        <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
                          <circle cx="7" cy="5"  r="1.4" fill="currentColor"/>
                          <circle cx="13" cy="5"  r="1.4" fill="currentColor"/>
                          <circle cx="7" cy="10" r="1.4" fill="currentColor"/>
                          <circle cx="13" cy="10" r="1.4" fill="currentColor"/>
                          <circle cx="7" cy="15" r="1.4" fill="currentColor"/>
                          <circle cx="13" cy="15" r="1.4" fill="currentColor"/>
                        </svg>
                      </div>
                      <div className="reorder-card-body">
                        {editingId === house.id ? (
                          <input
                            className="reorder-card-input"
                            autoFocus
                            defaultValue={renames[house.id] ?? house.address}
                            onBlur={(e) => {
                              const val = e.target.value.trim();
                              if (val && val !== house.address) {
                                setRenames((prev) => ({ ...prev, [house.id]: val }));
                              } else if (!val) {
                                setRenames((prev) => { const n = { ...prev }; delete n[house.id]; return n; });
                              }
                              setEditingId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.target.blur();
                              if (e.key === "Escape") { setEditingId(null); }
                            }}
                          />
                        ) : (
                          <span
                            className={`reorder-card-address${renames[house.id] ? " reorder-renamed" : ""}`}
                          >
                            {renames[house.id] ?? house.address}
                          </span>
                        )}
                        <span className="reorder-card-id">#{house.houseId}</span>
                      </div>
                      <div className="reorder-card-actions">
                        <button
                          className="reorder-edit-btn"
                          onClick={() => setEditingId(editingId === house.id ? null : house.id)}
                          aria-label="Edit address"
                          title="Rename"
                        >
                          <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="13" height="13">
                            <path d="M13.5 3.5l3 3-9 9H4.5v-3l9-9z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                            <path d="M11.5 5.5l3 3" stroke="currentColor" strokeWidth="1.6"/>
                          </svg>
                        </button>
                        <button
                          className="reorder-move-btn"
                          onClick={() => moveReorderItem(index, index - 1)}
                          disabled={index === 0}
                          aria-label="Move up"
                        >▲</button>
                        <button
                          className="reorder-move-btn"
                          onClick={() => moveReorderItem(index, index + 1)}
                          disabled={index === reorderList.length - 1}
                          aria-label="Move down"
                        >▼</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="house-list">
                  {filteredHouses.length > 0 ? (
                    filteredHouses.map((house) => (
                      <HouseRow
                        key={house.id}
                        house={{ ...house, statusLabel: STATUS_LABELS[house.status] }}
                        onStatusChange={changeHouseStatus}
                        updating={updatingHouseId === house.id}
                      />
                    ))
                  ) : (
                    <p className="logs-empty">No houses match your search.</p>
                  )}
                </div>
              )}
            </section>
          ) : (
            <section className="cluster-panel">
              <p>No cluster data loaded yet.</p>
            </section>
          )}
        </>
      )}
    </main>
  );
}

export default App;
