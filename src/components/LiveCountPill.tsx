import "./Boarding.css";

interface LiveCountPillProps {
  count: number;
}

/**
 * Measured boardings for one service, shown beside the model's predicted busyness.
 * Decorative count only — the kiosk card is what gets announced to screen readers.
 */
const LiveCountPill: React.FC<LiveCountPillProps> = ({ count }) => {
  if (count <= 0) return null;

  return (
    <span
      className="live-count-pill"
      role="img"
      aria-label={`${count} passenger${count === 1 ? "" : "s"} tapped to board this service`}
    >
      <span aria-hidden="true">🎟</span> {count}
    </span>
  );
};

export default LiveCountPill;
