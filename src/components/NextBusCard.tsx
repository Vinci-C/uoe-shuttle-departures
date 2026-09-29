import {
  BUSYNESS_COLORS,
  BUSYNESS_LABELS,
  agreementLabel,
  levelFromCount,
} from "../lib/busyness";
import type { BusynessLevel } from "../lib/runModel";
import "./Boarding.css";

interface NextBusCardProps {
  serviceLabel: string;
  destination: string;
  time: string;
  countdown: string;
  count: number;
  predicted: BusynessLevel;
  updatedAt: string | null;
  windowOpensAt: string;
}

/**
 * The booth's headline: what the model predicted for the next bus next to how many
 * people have actually tapped to board it.
 */
const NextBusCard: React.FC<NextBusCardProps> = ({
  serviceLabel,
  destination,
  time,
  countdown,
  count,
  predicted,
  updatedAt,
  windowOpensAt,
}) => {
  const actual = levelFromCount(count);
  const actualColor = BUSYNESS_COLORS[actual];

  return (
    <section className="next-bus-card" aria-label="Next bus: prediction and live count">
      <header className="next-bus-heading">
        <div>
          <p className="next-bus-kicker">Next bus · {serviceLabel}</p>
          <h2 className="next-bus-title">
            {time} <span className="next-bus-destination">to {destination}</span>
          </h2>
        </div>
        <span className="next-bus-countdown">{countdown}</span>
      </header>

      <div className="next-bus-compare">
        <div className="next-bus-figure">
          <span className="figure-label">Predicted (model)</span>
          <span
            className="figure-chip"
            style={{ backgroundColor: BUSYNESS_COLORS[predicted] }}
            title={BUSYNESS_LABELS[predicted]}
          >
            {predicted === 0 ? "No prediction" : BUSYNESS_LABELS[predicted]}
          </span>
        </div>

        <div className="next-bus-figure">
          <span className="figure-label">Live tap count</span>
          <span
            className="figure-chip figure-chip-count"
            style={{ backgroundColor: actualColor }}
            aria-live="polite"
          >
            <strong>{count}</strong> on board
          </span>
        </div>
      </div>

      <p className="next-bus-agreement">
        {count === 0
          ? `Boarding window opens at ${windowOpensAt} — waiting for the first tap.`
          : agreementLabel(predicted, actual)}
      </p>

      {updatedAt && (
        <p className="next-bus-updated">Last tap {updatedAt} · dataset counts reset as each bus leaves</p>
      )}
    </section>
  );
};

export default NextBusCard;
