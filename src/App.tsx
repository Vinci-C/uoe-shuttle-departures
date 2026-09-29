import React, { useState, useEffect } from "react";
import "./App.css";
import DepartureBoard from "./components/DepartureBoard";
import { isShuttleOperating } from "./data/timetable";
import { envConnection, getDataset } from "./config";
import { useBoardings } from "./hooks/useBoardings";
import { useCapacityParams } from "./hooks/useCapacityParams";

export type TimeFormat = "24h" | "12h" | "countdown";
export type Theme = "dark" | "light";
export type BusFilter = "all" | "shuttle" | "bus9";

export interface CapacityParams {
  dayOfWeek: number;
  semesterWeek: number;
  temperature: number;
  rainfall: number;
}

// Module scope, not per render. The `bus-board-` key prefix is kept as-is because
// renaming it would discard everyone's saved preferences on the next deploy.
const getStored = <T,>(key: string, defaultValue: T): T => {
  const val = localStorage.getItem(`bus-board-${key}`);
  if (val === null) return defaultValue;
  try {
    return JSON.parse(val) as T;
  } catch {
    return val as T;
  }
};

const saveStored = (key: string, value: unknown): void => {
  localStorage.setItem(`bus-board-${key}`, JSON.stringify(value));
};

function App() {
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(() => getStored("timeFormat", "24h"));
  const [theme, setTheme] = useState<Theme>(() => getStored("theme", "dark"));
  const [busFilter, setBusFilter] = useState<BusFilter>(() => getStored("busFilter", "all"));
  const [displayLimit, setDisplayLimit] = useState<number>(() => getStored("displayLimit", 6));
  const [showSettings, setShowSettings] = useState(false);
  const [isManualTime, setIsManualTime] = useState(false);
  const [manualTime, setManualTime] = useState("");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [cookieAccepted, setCookieAccepted] = useState(() => getStored("cookieAccepted", false));
  const [visitorCount, setVisitorCount] = useState<number | null>(null);

  // The visitor board reads the dataset named in the URL, falling back to the default.
  const connection = envConnection();
  const dataset = getDataset();
  const boardings = useBoardings(connection, dataset);
  const capacityParams = useCapacityParams(currentDate);

  // Save settings when they change
  useEffect(() => {
    saveStored("timeFormat", timeFormat);
    saveStored("theme", theme);
    saveStored("busFilter", busFilter);
    saveStored("displayLimit", displayLimit);
  }, [timeFormat, theme, busFilter, displayLimit]);

  const acceptCookies = () => {
    setCookieAccepted(true);
    saveStored("cookieAccepted", true);
  };

  useEffect(() => {
    fetch("https://api.countapi.xyz/hit/uoe-bus-tracker/visitors")
      .then((res) => res.json())
      .then((data) => setVisitorCount(data.value))
      .catch(() => {});
  }, []);

  // Update system time every second unless in manual mode
  useEffect(() => {
    const timer = setInterval(() => {
      if (!isManualTime) {
        // Get current time in London
        const now = new Date();
        const londonTimeStr = now.toLocaleString("en-US", { timeZone: "Europe/London" });
        setCurrentDate(new Date(londonTimeStr));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isManualTime]);

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (showSettings) {
      document.body.classList.add("no-scroll");
    } else {
      document.body.classList.remove("no-scroll");
    }
  }, [showSettings]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [hours, minutes] = e.target.value.split(":");
    const newDate = new Date(currentDate);
    newDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    setCurrentDate(newDate);
    setManualTime(e.target.value);
    setIsManualTime(true);
  };

  const resetToCurrentTime = () => {
    setIsManualTime(false);
    // Reset to London time
    const now = new Date();
    const londonTimeStr = now.toLocaleString("en-US", { timeZone: "Europe/London" });
    setCurrentDate(new Date(londonTimeStr));
    setManualTime("");
  };

  const shuttleOperating = isShuttleOperating(currentDate);

  const displayTime = currentDate.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London"
  });
  const displayDate = currentDate.toLocaleDateString("en-GB", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "Europe/London"
  });

  return (
    <div className="board-container">
      <header className={`board-header ${showSettings ? "settings-open" : ""}`}>
        <button
          className="menu-toggle"
          onClick={() => setShowSettings(!showSettings)}
          aria-label={showSettings ? "Close settings" : "Open settings"}
          aria-expanded={showSettings}
        >
          <div className={`hamburger ${showSettings ? "open" : ""}`}>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </button>
        <div className="board-title">
          <h1>
            Next Departures{" "}
            {isManualTime && <span className="manual-badge">(Simulated)</span>}
          </h1>
          <span className="subtitle">
            From Bristo Square and Kings Buildings
          </span>
        </div>
        <div className="location-info">
          {boardings.enabled && (
            <div className="live-summary" role="status" aria-live="polite">
              <span className="live-summary-value">{boardings.lastHourCount}</span>
              <span className="live-summary-label">
                taps in the last hour
                {boardings.status === "reconnecting" ? " (reconnecting)" : ""}
              </span>
            </div>
          )}
          <span className="current-date">{displayDate}</span>
          <span className="current-time">{displayTime}</span>
        </div>
      </header>

      <div
        className={`settings-bar ${showSettings ? "show" : ""}`}
        role="toolbar"
        aria-label="Board settings"
      >
        <div className="setting-group">
          <label htmlFor="theme-toggle">Theme:</label>
          <button id="theme-toggle" onClick={toggleTheme}>
            {theme === "dark" ? "🌞 Light Mode" : "🌙 Dark Mode"}
          </button>
        </div>
        <div className="setting-group">
          <label htmlFor="bus-filter">Bus:</label>
          <select
            id="bus-filter"
            value={busFilter}
            onChange={(e) => setBusFilter(e.target.value as BusFilter)}
          >
            <option value="all">All Services</option>
            <option value="shuttle">Shuttle Only</option>
            <option value="bus9">Lothian 9 Only</option>
          </select>
        </div>
        <div className="setting-group">
          <label htmlFor="manual-time">Time:</label>
          <input
            id="manual-time"
            type="time"
            value={
              manualTime ||
              currentDate.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })
            }
            onChange={handleTimeChange}
          />
        </div>
        <div className="setting-group">
          <label htmlFor="display-limit">Show:</label>
          <select
            id="display-limit"
            value={displayLimit}
            onChange={(e) => setDisplayLimit(Number(e.target.value))}
          >
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {n} rows
              </option>
            ))}
          </select>
        </div>
        <div className="setting-group">
          <label htmlFor="time-format">Format:</label>
          <select
            id="time-format"
            value={timeFormat}
            onChange={(e) => setTimeFormat(e.target.value as TimeFormat)}
          >
            <option value="24h">24 Hour</option>
            <option value="12h">12 Hour</option>
            <option value="countdown">Countdown</option>
          </select>
        </div>
        {isManualTime && (
          <div className="setting-group">
            <button
              className="reset-btn"
              onClick={resetToCurrentTime}
              aria-label="Reset to current system time"
            >
              Reset ↺
            </button>
          </div>
        )}
      </div>

      <main className="board-content">
        <DepartureBoard
          timeFormat={timeFormat}
          overrideDate={currentDate}
          busFilter={busFilter}
          displayLimit={displayLimit}
          isManualTime={isManualTime}
          shuttleOperating={shuttleOperating}
          capacityParams={capacityParams}
          boardings={boardings.rows}
        />
      </main>

      <footer className="board-footer">
        <div className="visitor-counter">
          Visitors: <span className="visitor-count">{visitorCount}</span>
        </div>
        <div className="compliance-badge">
          <a
            href="https://www.w3.org/TR/WCAG22/"
            title="W3C Web Content Accessibility Guidelines (WCAG) 2.2 Specification"
          >
            <img
              src="https://www.w3.org/WAI/WCAG22/wcag2.2AA"
              alt="Level AA conformance, W3C WAI Web Content Accessibility Guidelines 2.2"
              width="88"
              height="32"
            />
          </a>
          <span className="compliance-text">WCAG 2.2 AA Conformance Claim</span>
        </div>
        <div className="disclaimer-text">
          Capacity information is derived from historical data. Arrival times
          are scheduled estimates and may vary due to traffic. The site owner
          does not accept liability for any inaccuracies in the information
          provided.
        </div>
        <div className="disclaimer-text">
          Live boarding counts come from anonymous taps recorded at the expo booth
          for this dataset ({dataset}) and are aggregated per service. The reader
          cannot tell a student card from any other contactless card, so a tap is
          treated as a boarding event. Passenger-load figures are model estimates.
        </div>
      </footer>

      {!cookieAccepted && (
        <div className="cookie-banner" role="alert">
          <div className="cookie-content">
            <span role="img" aria-label="Cookie">🍪</span>
            <p>
              We use cookies to remember your preferences like theme, bus filter, and time format. 
              By continuing to use this site, you agree to our use of cookies.
            </p>
            <button onClick={acceptCookies} className="cookie-btn">Got it!</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
