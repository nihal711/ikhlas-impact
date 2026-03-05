import { useMemo, useRef, useState } from "react";

function getShortName(clusterName) {
  const match = clusterName.match(/Cluster\s+(\d+)/i);
  return match ? `C${match[1]}` : clusterName.slice(0, 3);
}

function getAreaName(clusterName) {
  return clusterName.replace(/^Cluster\s+\d+:\s*/i, "");
}

export default function AllocationView({ session, clusters, allocations, isAdmin, onAllocationsChange }) {
  const [addingToClusterId, setAddingToClusterId] = useState(null);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState("");

  const addInputRef = useRef(null);

  const allocationsByCluster = useMemo(() => {
    const map = new Map();
    for (const a of allocations) {
      if (!map.has(a.clusterId)) map.set(a.clusterId, []);
      map.get(a.clusterId).push(a);
    }
    return map;
  }, [allocations]);

  const myName = session.volunteerName.toLowerCase().trim();

  async function handleAdd(clusterId) {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAddError("");
    try {
      const res = await fetch("/api/allocations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-passcode": session.passcode,
          "x-volunteer-name": session.volunteerName
        },
        body: JSON.stringify({ clusterId, name: trimmed })
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error ?? "Failed to add"); return; }
      onAllocationsChange(data.allocations);
      setNewName("");
      setAddingToClusterId(null);
    } catch {
      setAddError("Failed to add");
    }
  }

  async function handleDelete(id) {
    try {
      const res = await fetch(`/api/allocations/${id}`, {
        method: "DELETE",
        headers: {
          "x-passcode": session.passcode,
          "x-volunteer-name": session.volunteerName
        }
      });
      if (!res.ok) return;
      const data = await res.json();
      onAllocationsChange(data.allocations);
      if (editingId === id) { setEditingId(null); setEditValue(""); }
    } catch {}
  }

  async function handleSaveEdit(id) {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    setEditError("");
    try {
      const res = await fetch(`/api/allocations/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-passcode": session.passcode,
          "x-volunteer-name": session.volunteerName
        },
        body: JSON.stringify({ name: trimmed })
      });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error ?? "Failed to update"); return; }
      onAllocationsChange(data.allocations);
      setEditingId(null);
      setEditValue("");
    } catch {
      setEditError("Failed to update");
    }
  }

  function startAdd(clusterId) {
    setAddingToClusterId(clusterId);
    setNewName("");
    setAddError("");
    setEditingId(null);
  }

  function cancelAdd() {
    setAddingToClusterId(null);
    setNewName("");
    setAddError("");
  }

  function startEdit(alloc) {
    setEditingId(alloc.id);
    setEditValue(alloc.name);
    setEditError("");
    setAddingToClusterId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue("");
    setEditError("");
  }

  if (!clusters.length) {
    return (
      <div className="alloc-view">
        <p className="logs-empty">No cluster data loaded yet.</p>
      </div>
    );
  }

  return (
    <div className="alloc-view">
      {clusters.map((cluster) => {
        const names = allocationsByCluster.get(cluster.id) ?? [];
        const isMyCluster = names.some((a) => a.name.toLowerCase().trim() === myName);

        return (
          <div key={cluster.id} className={`alloc-cluster${isMyCluster ? " alloc-cluster-mine" : ""}`}>
            <div className="alloc-cluster-header">
              <span className="alloc-cluster-badge">{getShortName(cluster.name)}</span>
              <span className="alloc-cluster-label">{getAreaName(cluster.name)}</span>
              {isMyCluster && <span className="alloc-you-badge">You</span>}
            </div>

            <div className="alloc-names">
              {names.map((alloc) => {
                const isMe = alloc.name.toLowerCase().trim() === myName;

                if (editingId === alloc.id) {
                  return (
                    <div key={alloc.id} className="alloc-edit-row">
                      <input
                        className="alloc-edit-input"
                        value={editValue}
                        onChange={(e) => { setEditValue(e.target.value); setEditError(""); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(alloc.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        autoFocus
                      />
                      <button className="alloc-save-btn" onClick={() => handleSaveEdit(alloc.id)}>Save</button>
                      <button className="alloc-cancel-btn" onClick={cancelEdit}>✕</button>
                      {editError && <span className="alloc-error">{editError}</span>}
                    </div>
                  );
                }

                return (
                  <div key={alloc.id} className={`alloc-chip${isMe ? " alloc-chip-me" : ""}`}>
                    <span
                      className={isAdmin ? "alloc-chip-name alloc-chip-name-editable" : "alloc-chip-name"}
                      onClick={isAdmin ? () => startEdit(alloc) : undefined}
                      title={isAdmin ? "Click to edit" : undefined}
                    >
                      {alloc.name}
                    </span>
                    {isAdmin && (
                      <button
                        className="alloc-delete-btn"
                        onClick={() => handleDelete(alloc.id)}
                        aria-label={`Remove ${alloc.name}`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}

              {isAdmin && addingToClusterId === cluster.id ? (
                <div className="alloc-add-row">
                  <input
                    ref={addInputRef}
                    className="alloc-add-input"
                    value={newName}
                    onChange={(e) => { setNewName(e.target.value); setAddError(""); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAdd(cluster.id);
                      if (e.key === "Escape") cancelAdd();
                    }}
                    placeholder="Name…"
                    autoFocus
                  />
                  <button className="alloc-save-btn" onClick={() => handleAdd(cluster.id)}>Add</button>
                  <button className="alloc-cancel-btn" onClick={cancelAdd}>✕</button>
                  {addError && <span className="alloc-error">{addError}</span>}
                </div>
              ) : isAdmin ? (
                <button className="alloc-add-btn" onClick={() => startAdd(cluster.id)}>
                  + Add
                </button>
              ) : names.length === 0 ? (
                <span className="alloc-empty">No one assigned yet</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
