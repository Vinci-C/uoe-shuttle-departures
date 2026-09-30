import React from "react";
import {
  BRISTO_SQUARE_DEPARTURES,
  KINGS_BUILDINGS_DEPARTURES,
  BUS_9_TO_KB,
  BUS_9_FROM_KB,
  type DepartureTime,
} from "../data/timetable";
import type { StopCode } from "../config";
import type { TimeFormat, BusFilter, CapacityParams } from "../App";
import { predictBusyness } from "../lib/runModel";
import type { BusynessLevel } from "../lib/runModel";
import { BUSYNESS_COLORS, BUSYNESS_LABELS } from "../lib/busyness";
import { attributeBoardings } from "../lib/attribution";
import { buildServiceWindows, makeServiceId } from "../lib/serviceId";
import type { BoardingRow } from "../lib/boardings";
import LiveCountPill from "./LiveCountPill";
import "./DepartureBoard.css";

interface Departure {
  id: string;
  serviceId: string;
  time: string;
  rawTime: string;
  timestamp: number;
  arrivalTime?: string;
  expectedArrivalTime?: string;
  type: string;
  destination: string;
  status: string;
  isLive?: boolean;
  isOvertaken?: boolean;
  busyness: BusynessLevel;
  expectedTime?: string;
}

const BusynessIndicator: React.FC<{
  level: BusynessLevel;
  hideTooltip?: boolean;
}> = ({ level, hideTooltip }) => {
  const color = BUSYNESS_COLORS[level];
  const label = BUSYNESS_LABELS[level];

  return (
    <div
      className={`busyness-indicator-wrapper ${hideTooltip ? "no-tooltip" : ""}`}
      role="img"
      aria-label={`Busyness level: ${label.charAt(0).toLowerCase()}${label.slice(1)}`}
    >
      <div className="busyness-indicator" style={{ backgroundColor: color }}>
        <div className="busyness-icons" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <svg
              key={i}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              className={level === 0 || i > level ? "faded" : ""}
            >
              <circle cx="12" cy="7" r="5" fill="currentColor" />
              <path
                d="M12 14c-4.4 0-8 3.6-8 8v1h16v-1c0-4.4-3.6-8-8-8z"
                fill="currentColor"
              />
            </svg>
          ))}
        </div>
      </div>
      {!hideTooltip && (
        <div className="busyness-tooltip" role="tooltip">
          {label}
        </div>
      )}
    </div>
  );
};

interface StopProps {
  name: string;
  subName?: string;
  departures: Departure[];
  isLimited: boolean;
  timeFormat: TimeFormat;
  boardings: Record<string, number>;
}

const StopColumn: React.FC<StopProps> = ({
  name,
  subName,
  departures,
  isLimited,
  timeFormat,
  boardings,
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia("(max-width: 900px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // On desktop, we always show all departures. On mobile, we only show 1 if not expanded.
  const visibleDepartures = (!isMobile || isExpanded) ? departures : departures.slice(0, 1);
  const hasMoreOnMobile = isMobile && departures.length > 1;

  return (
    <div className="stop-column">
      <div className="stop-header">
        <div className="stop-name">
          <h2>{name}</h2>
          {subName && <div className="stop-subname">{subName}</div>}
        </div>
        <div className="stop-label">DEPARTURES</div>
      </div>
      <div className="departure-list">
        {visibleDepartures.length > 0 ? (
          <>
            {visibleDepartures.map((dep) => (
              <div
                key={dep.id}
                className="departure-item"
              >
                <div className="time-container">
                  <div className="departure-time">
                    {dep.expectedTime && dep.expectedTime !== dep.time ? (
                      <>
                        <span className="new-time">{dep.expectedTime}</span>
                        <span className="strikethrough-time">{dep.time}</span>
                      </>
                    ) : (
                      dep.time
                    )}
                    {dep.isOvertaken && (
                      <span
                        className="overtake-icon"
                        title="This service will be overtaken by a later bus"
                        role="img"
                        aria-label="Overtaken by later service"
                      >
                        ⚠️
                      </span>
                    )}
                  </div>
                  <div
                    className={`status-indicator status-${dep.status.toLowerCase().replace(" ", "-")}`}
                  >
                    {dep.status}
                    {dep.isLive && (
                      <span className="live-radar-icon" title="Live information" role="img" aria-label="Live radar">
                        📡
                      </span>
                    )}
                  </div>
                </div>
                <div className="bus-type-container">
                  <span
                    className={`bus-type ${dep.type.toLowerCase().replace(" ", "-")}`}
                  >
                    {dep.type}
                  </span>
                </div>
                <div className="busyness-column">
                  <BusynessIndicator level={dep.busyness} />
                  <LiveCountPill count={boardings[dep.serviceId] ?? 0} />
                </div>

                <div className="destination-info">
                  <span className="destination">{dep.destination}</span>
                  {dep.arrivalTime && (
                    <span className="arrival-time">
                      {timeFormat === 'countdown' ? 'Arriving in ' : 'Arriving '}
                      {dep.expectedArrivalTime && dep.expectedArrivalTime !== dep.arrivalTime ? (
                        <>
                          <span className="new-time">{dep.expectedArrivalTime}</span>
                          <span className="strikethrough-time small">{dep.arrivalTime}</span>
                        </>
                      ) : (
                        dep.arrivalTime
                      )}
                    </span>
                  )}
                </div>
              </div>
            ))}
            
            {hasMoreOnMobile && (
              <button 
                className="expand-toggle" 
                onClick={() => setIsExpanded(!isExpanded)}
                aria-expanded={isExpanded}
              >
                <span>{isExpanded ? "Show less" : `Show ${departures.length - 1} more`}</span>
                <span className={`chevron ${isExpanded ? "up" : "down"}`}>▼</span>
              </button>
            )}

            {(!isMobile || isExpanded) && !isLimited && (
              <div className="all-departures-shown">
                All departures for today displayed
              </div>
            )}
          </>
        ) : (
          <div className="no-departures">No more departures today</div>
        )}
      </div>
    </div>
  );
};

interface DepartureBoardProps {
  timeFormat: TimeFormat;
  overrideDate: Date;
  busFilter: BusFilter;
  displayLimit: number;
  isManualTime: boolean;
  shuttleOperating: boolean;
  capacityParams: CapacityParams;
  /** Taps recorded at the booth; each row shows the count attributed to its service. */
  boardings?: BoardingRow[];
}

const BusynessLegend: React.FC = () => {
  const configs = [
    { level: 0 as BusynessLevel, label: "N/A" },
    { level: 1 as BusynessLevel, label: "Plenty of seats available" },
    { level: 2 as BusynessLevel, label: "Limited seats available" },
    { level: 3 as BusynessLevel, label: "Standing room only" },
    { level: 4 as BusynessLevel, label: "Bus expected to be full" },
  ];

  return (
    <div className="busyness-legend-container">
      <div className="busyness-legend">
        {configs.map((config) => (
          <div key={config.level} className="legend-item">
            <BusynessIndicator level={config.level} hideTooltip={true} />
            <span>{config.label}</span>
          </div>
        ))}
      </div>
      <div className="overtake-legend">
        <span className="live-count-pill" aria-hidden="true">
          🎟 12
        </span>
        <span>
          Passengers who tapped to board this service at the booth. Counts reset as each
          bus leaves.
        </span>
      </div>
      <div className="overtake-legend">
        <span className="overtake-icon">⚠️</span>
        <span>
          Indicates that this service will be overtaken by a later departing bus
        </span>
      </div>
      <div className="overtake-legend">
        <span className="live-radar-icon">📡</span>
        <span>
          Indicates that this service is being tracked in real-time
        </span>
      </div>
    </div>
  );
};

const DepartureBoard: React.FC<DepartureBoardProps> = ({
  timeFormat,
  overrideDate,
  busFilter,
  displayLimit,
  isManualTime,
  shuttleOperating,
  capacityParams,
  boardings = [],
}) => {
  const formatTime = React.useCallback((timeStr: string, format: TimeFormat): string => {
    const normalized = timeStr.replace(":", "");
    const hours = parseInt(normalized.substring(0, 2));
    const minutes = parseInt(normalized.substring(2));

    if (format === "countdown") {
      const targetDate = new Date(overrideDate);
      targetDate.setHours(hours, minutes, 0, 0);
      
      let diffMs = targetDate.getTime() - overrideDate.getTime();
      
      // If the time is more than 12 hours in the past, it's likely for the next day
      // (e.g., current time is 23:50 and bus is at 00:10)
      if (diffMs < -12 * 60 * 60 * 1000) {
        targetDate.setDate(targetDate.getDate() + 1);
        diffMs = targetDate.getTime() - overrideDate.getTime();
      } 
      // Conversely, if the time is more than 12 hours in the future, it might be from yesterday 
      // (e.g., current time is 00:10 and we're looking at a 23:50 bus)
      else if (diffMs > 12 * 60 * 60 * 1000) {
        targetDate.setDate(targetDate.getDate() - 1);
        diffMs = targetDate.getTime() - overrideDate.getTime();
      }

      const diffMins = Math.round(diffMs / 60000);
      
      if (diffMins < 0) return `${Math.abs(diffMins)} min ago`;
      if (diffMins === 0) return "NOW";
      return `${diffMins} min`;
    }

    if (format === "12h") {
      const h = hours % 12 || 12;
      const ampm = hours >= 12 ? "pm" : "am";
      return `${h}:${minutes.toString().padStart(2, "0")}${ampm}`;
    }

    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }, [overrideDate]);

  const getNextDepartures = React.useCallback((
    stopCode: StopCode,
    schedule: DepartureTime[],
    destination: string,
    bus9Schedule: DepartureTime[],
  ): Departure[] => {
    const getPredictedBusyness = (scheduledBaseCapacity?: number, hhmm?: string): BusynessLevel => {
      if (hhmm) {
        const busTime = `${hhmm.substring(0, 2)}:${hhmm.substring(2)}`;
        const temperatureF = Math.round(capacityParams.temperature * 9 / 5 + 32);
        const rain = capacityParams.rainfall;
        const isRaining: 0 | 1 | 2 = rain === 0 ? 0 : (rain >= 2 ? 2 : 1);

        const result = predictBusyness({
          temperatureF,
          isRaining,
          busTime,
          dayOfWeek: capacityParams.dayOfWeek,
          isBristoSquare: destination === "Kings Buildings",
          isKingsBuildings: destination === "Bristo Square",
          revisionOrFlexibleWeek: capacityParams.semesterWeek === -1,
          weekOfSemester: Math.max(1, capacityParams.semesterWeek),
        });
        return result;
      }

      if (scheduledBaseCapacity !== undefined) {
        if (scheduledBaseCapacity <= 40) return 1;
        if (scheduledBaseCapacity <= 60) return 2;
        if (scheduledBaseCapacity <= 70) return 3;
        return 4;
      }

      if (capacityParams.semesterWeek === -1) return 1;

      const hour = hhmm ? parseInt(hhmm.substring(0, 2)) : 12;
      let level: BusynessLevel = 1;

      if (destination === "Kings Buildings") {
        if (hour >= 8 && hour <= 9) level = 4;
        else if (hour === 10) level = 3;
        else if (hour === 11) level = 2;
      } else {
        if (hour >= 16 && hour <= 17) level = 4;
        else if (hour === 15 || hour === 18) level = 3;
        else if (hour === 14) level = 2;
      }

      if (capacityParams.rainfall > 1 && level < 4) {
        level = (level + 1) as BusynessLevel;
      }

      return level;
    };

    let departures: Departure[] = [];

    const getMinutes = (hhmm: string) => {
      const normalized = hhmm.replace(":", "");
      const h = parseInt(normalized.substring(0, 2));
      const m = parseInt(normalized.substring(2));
      return h * 60 + m;
    };

    const currentMins = overrideDate.getHours() * 60 + overrideDate.getMinutes();

    if (shuttleOperating && (busFilter === "all" || busFilter === "shuttle")) {
      const shuttleDeps = schedule
        .filter((d) => getMinutes(d.time) >= currentMins) // Shuttle usually has no live data, keep current behavior
        .map((d, index) => {
          let status = "Scheduled";
          if (index === 0 && !isManualTime) {
            const diff = getMinutes(d.time) - currentMins;
            if (diff <= 2 && diff >= 0) status = "Departing";
          }

          return {
            id: `shuttle-${destination}-${d.time}`,
            serviceId: makeServiceId("shuttle", stopCode, overrideDate, d.displayTime),
            time: formatTime(d.time, timeFormat),
            rawTime: d.time,
            timestamp: new Date(overrideDate.getFullYear(), overrideDate.getMonth(), overrideDate.getDate(), parseInt(d.time.substring(0, 2)), parseInt(d.time.substring(2))).getTime(),
            arrivalTime: d.arrivalTime ? formatTime(d.arrivalTime, timeFormat) : undefined,
            type: "Shuttle",
            destination,
            status,
            busyness: getPredictedBusyness(d.baseCapacity, d.time),
          };
        });
      departures = [...departures, ...shuttleDeps];
    }

    if (busFilter === "all" || busFilter === "bus9") {
      const timeToMinutes = (timeStr: string) => {
        const match = timeStr.replace(/\D/g, "").match(/.{1,2}/g);
        if (!match || match.length < 2) return 0;
        const [h, m] = match.map(Number);
        return h * 60 + m;
      };

      const scheduledBus9 = bus9Schedule
        .filter((d) => {
          const schedMins = getMinutes(d.time);
          // Include buses scheduled up to 15 minutes ago to catch delayed ones
          return schedMins >= currentMins - 15;
        })
        .map((d, index) => {
          const scheduledMins = timeToMinutes(d.displayTime);
          
          // There is no live feed, so the 9 is always shown at its scheduled time.
          let status = "Scheduled";

          if (scheduledMins < currentMins) return null;

          if (index === 0 && !isManualTime) {
            const diff = scheduledMins - currentMins;
            if (diff <= 3 && diff >= 0) status = "Departing";
          }

          return {
            id: `bus9-${destination}-${d.time}`,
            serviceId: makeServiceId("bus9", stopCode, overrideDate, d.displayTime),
            time: formatTime(d.time, timeFormat),
            rawTime: d.time,
            timestamp: new Date(overrideDate.getFullYear(), overrideDate.getMonth(), overrideDate.getDate(), parseInt(d.time.substring(0, 2)), parseInt(d.time.substring(2))).getTime(),
            arrivalTime: d.arrivalTime ? formatTime(d.arrivalTime, timeFormat) : undefined,
            type: "Lothian 9",
            destination: d.destination || (destination === "Kings Buildings" ? "Kings Buildings" : "Muirhouse"),
            status,
            busyness: 0 as BusynessLevel, 
          };
        })
        .filter((d) => d !== null) as Departure[];
      departures = [...departures, ...scheduledBus9];
    }

    const sorted = departures.sort((a, b) => a.timestamp - b.timestamp);

    const departuresWithOvertake = sorted.map((dep, index) => {
      if (!dep.arrivalTime) return dep;
      const depTimeMins = getMinutes(dep.rawTime);
      let depArrivalMins = getMinutes(dep.arrivalTime);
      if (depArrivalMins < depTimeMins) depArrivalMins += 1440;

      const isOvertaken = sorted.slice(index + 1).some((laterDep) => {
        if (!laterDep.arrivalTime) return false;
        let laterTimeMins = getMinutes(laterDep.rawTime);
        let laterArrivalMins = getMinutes(laterDep.arrivalTime);
        if (laterTimeMins < depTimeMins) {
          laterTimeMins += 1440;
          laterArrivalMins += 1440;
        } else if (laterArrivalMins < laterTimeMins) {
          laterArrivalMins += 1440;
        }
        if (laterTimeMins - depTimeMins > 120) return false;
        return laterArrivalMins < depArrivalMins;
      });

      return { ...dep, isOvertaken };
    });

    return departuresWithOvertake.slice(0, displayLimit);
  }, [overrideDate, capacityParams, timeFormat, formatTime, busFilter, isManualTime, shuttleOperating, displayLimit]);

  const departuresBristo = React.useMemo(() => getNextDepartures(
    "bristo",
    BRISTO_SQUARE_DEPARTURES,
    "Kings Buildings",
    BUS_9_TO_KB,
  ), [getNextDepartures]);

  const departuresKings = React.useMemo(() => getNextDepartures(
    "kings",
    KINGS_BUILDINGS_DEPARTURES,
    "Bristo Square",
    BUS_9_FROM_KB,
  ), [getNextDepartures]);

  // A tap belongs to the first departure from that stop at or after the tap, so each
  // bus starts counting from zero without anything having to reset it.
  const boardingsBristo = React.useMemo(
    () => attributeBoardings(boardings, buildServiceWindows("bristo", overrideDate), overrideDate),
    [boardings, overrideDate],
  );
  const boardingsKings = React.useMemo(
    () => attributeBoardings(boardings, buildServiceWindows("kings", overrideDate), overrideDate),
    [boardings, overrideDate],
  );

  return (
    <div className="departure-board-container">
      {!shuttleOperating && (
        <div className="shuttle-notice" role="status">
          <span className="shuttle-notice-icon" aria-hidden="true">ⓘ</span>
          <div className="shuttle-notice-text">
            <strong>Shuttle not in operation.</strong> The University shuttle bus
            runs Monday–Friday during semester time only and is currently not
            running. Lothian 9 service times are unaffected.<br />
            For the latest schedule, visit{" "}
            <a href="https://transport.ed.ac.uk/public-transport/shuttle-bus" target="_blank" rel="noopener noreferrer">transport.ed.ac.uk</a>.
          </div>
        </div>
      )}
      <div className="departure-board">
        <StopColumn
          name="Bristo Square"
          subName={
            busFilter !== "shuttle"
              ? "(including departures from Bristo Place)"
              : undefined
          }
          departures={departuresBristo}
          isLimited={departuresBristo.length === displayLimit}
          timeFormat={timeFormat}
          boardings={boardingsBristo.byServiceId}
        />
        <StopColumn
          name="Kings Buildings"
          departures={departuresKings}
          isLimited={departuresKings.length === displayLimit}
          timeFormat={timeFormat}
          boardings={boardingsKings.byServiceId}
        />
      </div>
      <BusynessLegend />
    </div>
  );
};

export default DepartureBoard;
