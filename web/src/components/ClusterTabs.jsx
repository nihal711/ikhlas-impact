function getShortLabel(name) {
  // "Cluster 1: Jurong & Boon Lay (Far West)" → "C1" + "Jurong & Boon Lay"
  const match = name.match(/^Cluster\s+(\d+)(?::\s*(.+))?$/i);
  if (match) {
    const num = match[1];
    const rest = match[2] ?? "";
    // Strip parenthetical suffix like "(Far West)"
    const short = rest.replace(/\s*\(.*?\)\s*$/, "").trim();
    return { num: `C${num}`, area: short };
  }
  return { num: name.slice(0, 4), area: "" };
}

function ClusterTabs({ clusters, activeClusterId, onSelectCluster }) {
  return (
    <div className="tabs" role="tablist" aria-label="Cluster tabs">
      {clusters.map((cluster) => {
        const { num, area } = getShortLabel(cluster.name);
        return (
          <button
            key={cluster.id}
            role="tab"
            aria-selected={activeClusterId === cluster.id}
            aria-label={`${cluster.name} – ${cluster.totals.delivered} of ${cluster.totalHouses} delivered`}
            title={cluster.name}
            className={`tab ${activeClusterId === cluster.id ? "tab-active" : ""}`}
            onClick={() => onSelectCluster(cluster.id)}
          >
            <span className="tab-num">{num}</span>
            {area ? <span className="tab-name">{area}</span> : null}
            <span className="tab-count">{cluster.totals.delivered}/{cluster.totalHouses}</span>
          </button>
        );
      })}
    </div>
  );
}

export default ClusterTabs;
