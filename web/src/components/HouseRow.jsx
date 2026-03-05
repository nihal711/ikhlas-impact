const STATUS_OPTIONS = [
  { key: "pending_delivery", label: "Pending" },
  { key: "placed_at_door", label: "Placed at Door" },
  { key: "delivered", label: "Delivered" }
];

function formatDate(dateText) {
  if (!dateText) {
    return "No updates yet";
  }
  const date = new Date(dateText);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function HouseRow({ house, onStatusChange, updating }) {
  return (
    <article className="house-card">
      <header className="house-header">
        <h3>{house.address}</h3>
        <span className={`status-pill status-${house.status}`}>{house.statusLabel}</span>
      </header>

      <p className="house-id">Ref: {house.houseId}</p>

      <div className="status-buttons" role="group" aria-label={`Status for ${house.address}`}>
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.key}
            className={`status-button ${house.status === option.key ? "status-selected" : ""}`}
            onClick={() => onStatusChange(house.id, option.key)}
            disabled={updating}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className="house-meta">
        {house.lastUpdatedBy
          ? `${house.lastUpdatedBy} · ${formatDate(house.lastUpdatedAt)}`
          : "Not yet updated"}
      </p>
    </article>
  );
}

export default HouseRow;
