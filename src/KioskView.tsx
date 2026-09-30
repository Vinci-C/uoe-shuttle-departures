import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import "./KioskView.css";
import { isShuttleOperating } from "./data/timetable";
import { useBoothConfig } from "./hooks/useBoothConfig";
import { useBoardings } from "./hooks/useBoardings";
import { useCapacityParams } from "./hooks/useCapacityParams";
import { useReader } from "./hooks/useReader";
import { envConnection } from "./config";
import {
  recordBoarding,
  flushOutbox,
  getOutboxCount,
  clearOutbox,
  randomCardId,
} from "./lib/boardings";
import { predictServiceBusyness } from "./lib/busyness";
import { attributeBoardings } from "./lib/attribution";
import { buildShuttleWindows, londonDateKey, londonMinutes, type ServiceWindow } from "./lib/serviceId";
import DepartureBoard from "./components/DepartureBoard";
import NextBusCard from "./components/NextBusCard";
import ReaderPanel from "./components/ReaderPanel";
import type { WriteState } from "./components/ReaderPanel";
import type { BusynessLevel } from "./lib/runModel";

const londonNow = (): Date => new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/London" }));

function KioskView() {
  const [now, setNow] = useState(londonNow);
  const [theme, setTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem("boarding-demo-theme") as "dark" | "light") ?? "dark",
  );
  const [timeFormat, setTimeFormat] = useState<"24h" | "12h">("24h");
  const [writeState, setWriteState] = useState<WriteState>({ ok: null, message: null });
  const [outboxPending, setOutboxPending] = useState(0);

  const config = useBoothConfig();
  const capacityParams = useCapacityParams(now);
  const boardings = useBoardings(config.activeConnection, config.dataset);

  // The booth page reads the same dataset as the visitor board: ?dataset= wins, then the
  // saved choice, then the default.
  const dayKey = londonDateKey(now);
  const serviceDate = useMemo(() => new Date(`${dayKey}T12:00:00Z`), [dayKey]);
  const windows = useMemo(
    () => buildShuttleWindows(config.stop, serviceDate),
    [config.stop, serviceDate],
  );
  const currentMinutes = londonMinutes(now.toISOString());

  const nextShuttle: ServiceWindow | undefined = useMemo(
    () => windows.find((window) => window.departureMinutes >= currentMinutes),
    [windows, currentMinutes],
  );

  const previousShuttle = useMemo(
    () => [...windows].reverse().find((window) => window.departureMinutes < currentMinutes),
    [windows, currentMinutes],
  );

  const recordTap = useCallback(
    async (cardId: string) => {
      const connection = config.activeConnection;
      if (!connection) {
        setWriteState({ ok: false, message: "No database configured — add a connection first" });
        return;
      }

      // The service hint is only for humans reading the raw row; the board always
      // re-attributes taps from tapped_at, so this can lag behind by a bus.
      const result = await recordBoarding(connection, {
        dataset: config.dataset,
        stop: config.stop,
        service_id: nextShuttle?.serviceId ?? null,
        service_kind: "shuttle",
        card_id: cardId,
        tapped_at: new Date().toISOString(),
      });

      if (result.outcome === "recorded") {
        setWriteState({ ok: true, message: `Tap recorded (${cardId})` });
      } else if (result.outcome === "rejected") {
        // Not queued on purpose: a bad token fails identically forever, so the operator
        // has to see it instead of it hiding behind "retrying" every 20 seconds.
        setWriteState({ ok: false, message: result.detail ?? "Write rejected", fatal: true });
      } else {
        setWriteState({
          ok: false,
          message: `Saved locally, retrying: ${result.error ?? "network error"}`,
        });
      }
      setOutboxPending(getOutboxCount(connection.id));
    },
    [config, nextShuttle],
  );

  const reader = useReader(recordTap);

  useEffect(() => {
    const timer = setInterval(() => setNow(londonNow()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem("boarding-demo-theme", theme);
  }, [theme]);

  const stopAttribution = useMemo(
    () => attributeBoardings(boardings.rows, windows, now),
    [boardings.rows, windows, now],
  );

  const nextCount = nextShuttle ? (stopAttribution.byServiceId[nextShuttle.serviceId] ?? 0) : 0;
  const nextPredicted: BusynessLevel = nextShuttle
    ? predictServiceBusyness({
        time: nextShuttle.displayTime,
        stop: config.stop,
        temperature: capacityParams.temperature,
        rainfall: capacityParams.rainfall,
        dayOfWeek: capacityParams.dayOfWeek,
        semesterWeek: capacityParams.semesterWeek,
      })
    : 0;

  // Venue wifi drops, so queued taps are retried on a timer and on reconnect. The timer
  // stays running through a configuration fault so a fixed token delivers without
  // anybody pressing anything; it deliberately does not touch writeState, so a bad
  // connection cannot be papered over by a silent background retry.
  useEffect(() => {
    const connection = config.activeConnection;
    if (!connection) return;

    const retry = () => {
      void flushOutbox(connection).finally(() => setOutboxPending(getOutboxCount(connection.id)));
    };
    const onOnline = () => retry();
    const interval = setInterval(retry, 20_000);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
    };
  }, [config.activeConnection]);

  const retryOutbox = useCallback(async () => {
    const connection = config.activeConnection;
    if (!connection) return;

    const result = await flushOutbox(connection);
    setOutboxPending(getOutboxCount(connection.id));

    if (result.delivered > 0) {
      setWriteState({
        ok: true,
        message: `Outbox retried: ${result.delivered} tap${result.delivered === 1 ? "" : "s"} delivered`,
      });
      return;
    }
    if (getOutboxCount(connection.id) === 0) {
      setWriteState({ ok: true, message: "Outbox is empty" });
      return;
    }
    setWriteState({
      ok: false,
      message: result.detail ?? `Still waiting on the network: ${result.error ?? "unknown error"}`,
      fatal: Boolean(result.detail),
    });
  }, [config.activeConnection]);

  // Only for a misconfigured booth: these taps can never be written, and leaving them
  // parked would push real taps out of the outbox once it reaches its cap.
  const discardOutbox = useCallback(() => {
    const connection = config.activeConnection;
    if (!connection) return;
    const dropped = clearOutbox(connection.id);
    setOutboxPending(getOutboxCount(connection.id));
    setWriteState({
      ok: dropped > 0 ? null : false,
      message:
        dropped > 0
          ? `Discarded ${dropped} queued tap${dropped === 1 ? "" : "s"}`
          : "Nothing to discard",
    });
  }, [config.activeConnection]);

  const simulateTap = useCallback(() => void recordTap(randomCardId()), [recordTap]);

  const displayTime = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });

  const countdown = (() => {
    if (!nextShuttle) return "No more services";
    const minutes = nextShuttle.departureMinutes - currentMinutes;
    if (minutes <= 0) return "Departing";
    if (minutes < 60) return `in ${minutes} min`;
    return `in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  })();

  const formatClock = (value: string) =>
    new Date(value).toLocaleTimeString("en-GB", { timeZone: "Europe/London" });

  return (
    <div className="board-container kiosk-container">
      <header className="board-header">
        <div className="board-title">
          <h1>Booth Kiosk</h1>
          <span className="subtitle">
            Tap a card to simulate boarding · {envConnection() ? "default database" : "no default database"}
          </span>
        </div>
        <div className="location-info">
          <span className="current-date">{now.toLocaleDateString("en-GB", { weekday: "long", month: "long", day: "numeric" })}</span>
          <span className="current-time">{displayTime}</span>
        </div>
      </header>

      <main className="board-content kiosk-content">
        <ReaderPanel
          reader={reader}
          config={config}
          boardingsStatus={boardings.status}
          outboxPending={outboxPending}
          writeState={writeState}
          onSimulateTap={simulateTap}
          onFlushOutbox={() => void retryOutbox()}
          onDiscardOutbox={discardOutbox}
        />

        {nextShuttle && (
          <NextBusCard
            serviceLabel={nextShuttle.serviceLabel}
            destination={nextShuttle.destination}
            time={nextShuttle.displayTime}
            countdown={countdown}
            count={nextCount}
            predicted={nextPredicted}
            updatedAt={boardings.lastTapAt ? formatClock(boardings.lastTapAt) : null}
            windowOpensAt={previousShuttle ? `${previousShuttle.displayTime} (previous bus)` : "first service of the day"}
          />
        )}

        <div className="kiosk-toolbar">
          <div className="setting-group">
            <label htmlFor="kiosk-theme">Theme:</label>
            <button id="kiosk-theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? "🌞 Light Mode" : "🌙 Dark Mode"}
            </button>
          </div>
          <div className="setting-group">
            <label htmlFor="kiosk-format">Time:</label>
            <select
              id="kiosk-format"
              value={timeFormat}
              onChange={(e) => setTimeFormat(e.target.value as "24h" | "12h")}
            >
              <option value="24h">24 Hour</option>
              <option value="12h">12 Hour</option>
            </select>
          </div>
          <div className="setting-group">
            <span className="kiosk-stat">
              Taps in the last hour: <strong>{boardings.lastHourCount}</strong>
            </span>
          </div>
          {stopAttribution.unassigned > 0 && (
            <div className="setting-group">
              <span className="kiosk-stat kiosk-stat-dim">
                {stopAttribution.unassigned} tap(s) after the last shuttle of the day
              </span>
            </div>
          )}
        </div>

        <DepartureBoard
          timeFormat={timeFormat}
          overrideDate={now}
          busFilter="all"
          displayLimit={6}
          isManualTime={false}
          shuttleOperating={isShuttleOperating(now)}
          capacityParams={capacityParams}
          boardings={boardings.rows}
        />
      </main>

      <footer className="board-footer">
        <p className="disclaimer-text">
          Demo build. The reader cannot tell a student card from any other contactless card,
          so a tap is an anonymous boarding event: only a hash of the card id is stored, never
          the card itself. Live counts come from taps recorded at the booth and reset as each
          bus leaves. Passenger-load figures are model estimates.
        </p>
      </footer>
    </div>
  );
}

export default KioskView;
