"use client";

import { useState, useEffect, useRef } from "react";

interface WeatherState {
  temperature: number;
  humidity: number;
  pressure: number;
  wind_speed: number;
  wind_dir: string;
  status: string;
  timestamp: number;
  predict_temp?: number;
  predict_humidity?: number;
  temp_model_loaded?: boolean;
  humidity_model_loaded?: boolean;
  arduino_connected?: boolean;
  alert: {
    title: string;
    message: string;
    severity: "info" | "warning" | "danger";
    timestamp: number;
  } | null;
}

interface ClientConnection {
  id: string;
  ip: string;
  user_agent: string;
  permission: string;
  connected_at: number;
}

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  category: "SEVERE" | "LOCAL" | "GLOBAL" | "CLIMATE";
  source: string;
  timestamp: number;
  timeAgo: string;
  link: string;
}

const safeSessionStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== "undefined") {
        return sessionStorage.getItem(key);
      }
    } catch (e) {
      console.warn("sessionStorage access denied:", e);
    }
    return null;
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== "undefined") {
        sessionStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn("sessionStorage write denied:", e);
    }
  },
  removeItem: (key: string): void => {
    try {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(key);
      }
    } catch (e) {
      console.warn("sessionStorage remove denied:", e);
    }
  }
};

export default function AdminConsole() {
  const [socketStatus, setSocketStatus] = useState<"CONNECTED" | "DISCONNECTED">("DISCONNECTED");
  const [weather, setWeather] = useState<WeatherState | null>(null);
  const [clients, setClients] = useState<ClientConnection[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);

  // Real-time telemetry chart history state
  interface HistoryEntry {
    temperature: number;
    humidity: number;
    time: string;
  }
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Base Station activity event log console state
  interface AdminLogEntry {
    text: string;
    type: "system" | "alert" | "success" | "warning";
    time: string;
  }
  const [adminLogs, setAdminLogs] = useState<AdminLogEntry[]>([]);

  // Authorization states
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [authPin, setAuthPin] = useState<string>("");
  const [pinError, setPinError] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const authorized = safeSessionStorage.getItem("base_station_authorized") === "true";
      setIsAuthorized(authorized);
    }
  }, []);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (authPin === "8822") {
      safeSessionStorage.setItem("base_station_authorized", "true");
      setIsAuthorized(true);
      setPinError(false);
    } else {
      setPinError(true);
      setTimeout(() => setPinError(false), 2000);
    }
  };

  const addAdminLog = (text: string, type: "system" | "alert" | "success" | "warning" = "system") => {
    setAdminLogs((prev) => [
      { text, type, time: new Date().toLocaleTimeString() },
      ...prev
    ].slice(0, 30));
  };

  // Scenario playlist state
  interface ScenarioState {
    active: boolean;
    name: string | null;
    step: number;
    ticks: number;
    totalSteps: number;
  }

  const [scenarioState, setScenarioState] = useState<ScenarioState>({
    active: false,
    name: null,
    step: 0,
    ticks: 0,
    totalSteps: 0
  });

  // Custom bulletin publisher state
  const [bulletinTitle, setBulletinTitle] = useState("");
  const [bulletinSummary, setBulletinSummary] = useState("");
  const [bulletinCategory, setBulletinCategory] = useState("LOCAL");

  // Custom Alert Form State
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertSeverity, setAlertSeverity] = useState<"info" | "warning" | "danger">("info");

  // Sensor Manual Override State
  const [manualMode, setManualMode] = useState(false);
  const [overrideTemp, setOverrideTemp] = useState(25.0);
  const [overrideHum, setOverrideHum] = useState(60);
  const [overrideWind, setOverrideWind] = useState(5.0);
  const [overridePress, setOverridePress] = useState(1013);
  const [overrideStatus, setOverrideStatus] = useState("Clear Skies");

  // Keep a Ref to prevent stale WebSocket message closures
  const manualModeRef = useRef(manualMode);
  useEffect(() => {
    manualModeRef.current = manualMode;
  }, [manualMode]);

  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);

  const connect = () => {
    if (typeof window === "undefined") return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.hostname}:8000/ws/admin`;

    console.log(`[Base Station] Connecting to WS: ${wsUrl}`);
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log("[Base Station] Connected to server.");
      setSocketStatus("CONNECTED");
      addAdminLog("FastAPI WebSocket link online.", "success");
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };

    ws.current.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "init") {
        setWeather(payload.weather);
        setClients(payload.clients);
        setManualMode(payload.manualMode || false);
        if (payload.news) {
          setNews(payload.news);
        }
        if (payload.weather) {
          setOverrideTemp(payload.weather.temperature);
          setOverrideHum(payload.weather.humidity);
          setOverrideWind(payload.weather.wind_speed);
          setOverridePress(payload.weather.pressure);
          setOverrideStatus(payload.weather.status);

          const timeLabel = new Date(payload.weather.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setHistory([{ temperature: payload.weather.temperature, humidity: payload.weather.humidity, time: timeLabel }]);
        }
        addAdminLog("Base Station telemetry sync packet loaded successfully.", "success");
      } else if (payload.type === "weather") {
        setWeather(payload.data);
        if (payload.manualMode !== undefined) {
          setManualMode(payload.manualMode);
        }
        if (payload.scenario) {
          setScenarioState(payload.scenario);
          if (payload.scenario.active) {
            setManualMode(false);
          }
        }
        // Only override sliders if base station isn't locked to manual slider controls
        if (!manualModeRef.current && payload.data) {
          setOverrideTemp(payload.data.temperature);
          setOverrideHum(payload.data.humidity);
          setOverrideWind(payload.data.wind_speed);
          setOverridePress(payload.data.pressure);
          setOverrideStatus(payload.data.status);
        }

        // Append to historical trend tracker
        if (payload.data) {
          const timeLabel = new Date(payload.data.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setHistory((prev) => [
            ...prev,
            {
              temperature: payload.data.temperature,
              humidity: payload.data.humidity,
              time: timeLabel
            }
          ].slice(-10));
        }
      } else if (payload.type === "client_list") {
        setClients(payload.clients);
        addAdminLog(`Connected clients count updated: ${payload.clients.length} nodes active.`, "system");
      } else if (payload.type === "news_update") {
        setNews(payload.data);
        addAdminLog("Station weather bulletin news ticker updated.", "success");
      }
    };

    ws.current.onclose = () => {
      console.log("[Base Station] Disconnected. Retrying connection in 3 seconds...");
      setSocketStatus("DISCONNECTED");
      addAdminLog("FastAPI WebSocket connection lost. Attempting reconnect...", "alert");
      reconnectTimeout.current = setTimeout(connect, 3000);
    };

    ws.current.onerror = (err) => {
      console.error("[Base Station] WebSocket Error:", err);
      addAdminLog("WebSocket channel connection error.", "alert");
    };
  };

  useEffect(() => {
    if (!isAuthorized) return;

    addAdminLog("Base Station Aggregator online. Monitoring port 8000...", "system");
    connect();

    const fetchNews = async () => {
      try {
        const res = await fetch(`http://${window.location.hostname}:8000/api/news`);
        const data = await res.json();
        setNews(data);
      } catch (err) {
        console.error("Failed to fetch news feed in admin:", err);
      }
    };
    fetchNews();

    return () => {
      if (ws.current) {
        ws.current.onclose = null; // Clean cleanup to prevent trigger on intentional closes
        ws.current.close();
      }
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, [isAuthorized]); // Re-connect only if authorization status changes

  const startScenario = (name: string) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: "start_scenario",
          name: name
        })
      );
      addAdminLog(`Requested automation scenario playlist: ${name.replace("_", " ")}`, "system");
    }
  };

  const stopScenario = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: "stop_scenario"
        })
      );
      addAdminLog("Requested simulator scenario halt.", "warning");
    }
  };

  const toggleManualMode = (enabled: boolean) => {
    setManualMode(enabled);
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: "set_manual_mode",
          enabled: enabled,
        })
      );
      addAdminLog(`Manual Override mode switched: ${enabled ? "ENABLED" : "DISABLED"}`, "warning");
    }
  };

  const dispatchOverride = (
    temp: number,
    hum: number,
    wind: number,
    press: number,
    status: string
  ) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: "override_telemetry",
          temperature: temp,
          humidity: hum,
          wind_speed: wind,
          pressure: press,
          status: status,
        })
      );
    }
  };

  const sendPreset = (type: "storm" | "heatwave" | "rain" | "clear") => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      alert("Cannot dispatch broadcast. Connection to FastAPI server is offline.");
      return;
    }

    if (type === "clear") {
      ws.current.send(JSON.stringify({ type: "clear_alert" }));
      addAdminLog("Cleared all network weather warnings.", "success");
      return;
    }

    let title = "";
    let message = "";
    let severity: "info" | "warning" | "danger" = "info";

    if (type === "storm") {
      title = "⚡ SEVERE STORM & TORNADO ALERT";
      message = "A highly unstable pressure cell is approaching. High-velocity winds and severe thunderstorm conditions are active. Seek sub-surface shelter immediately.";
      severity = "danger";
    } else if (type === "heatwave") {
      title = "🔥 EXTREME HEAT ADVISORY";
      message = "Ambient temperature has climbed above safety thresholds. Hydrate frequently, remain indoors under cooling, and minimize physical exertion.";
      severity = "warning";
    } else if (type === "rain") {
      title = "🌧️ FLOOD ACCUMULATION ALERT";
      message = "Continuous heavy precipitations have caused urban drainage systems to exceed capability. Avoid flooded roads and low-level basements.";
      severity = "info";
    }

    ws.current.send(
      JSON.stringify({
        type: "trigger_alert",
        title,
        message,
        severity,
      })
    );
    addAdminLog(`Dispatched alert preset: ${title} (${severity.toUpperCase()})`, "alert");
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      alert("Cannot dispatch broadcast. Connection offline.");
      return;
    }

    ws.current.send(
      JSON.stringify({
        type: "trigger_alert",
        title: alertTitle,
        message: alertMessage,
        severity: alertSeverity,
      })
    );

    addAdminLog(`Dispatched custom warning: ${alertTitle} (${alertSeverity.toUpperCase()})`, "alert");
    setAlertTitle("");
    setAlertMessage("");
    alert("Alert successfully broadcasted!");
  };

  const handleBulletinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      alert("Cannot publish bulletin. Connection offline.");
      return;
    }
    ws.current.send(
      JSON.stringify({
        type: "publish_news",
        title: bulletinTitle,
        summary: bulletinSummary,
        category: bulletinCategory,
      })
    );
    addAdminLog(`Published station news bulletin: "${bulletinTitle}"`, "success");
    setBulletinTitle("");
    setBulletinSummary("");
    alert("Station bulletin broadcasted successfully to all nodes!");
  };

  const getUpdateString = () => {
    if (!weather) return "Never";
    return new Date(weather.timestamp * 1000).toLocaleTimeString();
  };

  const getForecast = () => {
    if (!weather) return { temp: "--.-", hum: "--", status: "Computing..." };
    if (weather.predict_temp !== undefined && weather.predict_humidity !== undefined) {
      let fStatus = weather.status;
      if (weather.predict_humidity > 85) fStatus = "Rain Expected";
      else if (weather.predict_humidity < 35) fStatus = "Dry/High Evap";
      else if (weather.predict_temp > weather.temperature + 0.5) fStatus = "Warming Trend";
      else if (weather.predict_temp < weather.temperature - 0.5) fStatus = "Cooling Trend";
      return { temp: weather.predict_temp.toFixed(1), hum: weather.predict_humidity.toString(), status: fStatus };
    }
    const fTemp = (weather.temperature + 0.3).toFixed(1);
    const fHum = Math.max(10, Math.min(100, weather.humidity - 1));
    return { temp: fTemp, hum: fHum.toString(), status: weather.status };
  };

  const forecast = getForecast();

  const generateSvgPath = (key: "temperature" | "humidity") => {
    if (history.length < 2) return "";
    const maxVal = key === "temperature" ? 45 : 100;
    const minVal = key === "temperature" ? 5 : 0;
    const height = 110;
    const padding = 10;

    return history.map((entry, idx) => {
      const val = entry[key];
      const x = (idx / (history.length - 1)) * 480 + 10;
      const y = height - ((val - minVal) / (maxVal - minVal)) * (height - 2 * padding) - padding;
      return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");
  };

  if (!isAuthorized) {
    return (
      <div className="security-login-container">
        <div className="security-card">
          <h1 className="security-title">Base Station Login</h1>
          <p className="security-subtitle">Weather Monitoring Admin Console</p>

          <form onSubmit={handleLoginSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="form-group">
              <label htmlFor="passcode-input" style={{ fontSize: "0.85rem", marginBottom: "4px" }}>
                Admin Passcode (8822 to demo):
              </label>
              <input
                id="passcode-input"
                type="password"
                className="form-input"
                placeholder="Enter Passcode..."
                value={authPin}
                onChange={(e) => setAuthPin(e.target.value)}
                autoFocus
                required
              />
            </div>

            {pinError && (
              <span style={{ color: "var(--color-danger)", fontSize: "0.8rem", textAlign: "center" }}>
                ❌ Invalid passcode. Try again.
              </span>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: "0.5rem" }}>
              Access Console
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header>
        <div>
          <h1>Weather Station Base</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginTop: "0.25rem" }}>
            Central telemetry aggregator and client socket hub (Next.js Node)
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {weather?.arduino_connected ? (
            <div className="status-badge" style={{ borderColor: "var(--color-success)", background: "rgba(16, 185, 129, 0.08)", color: "var(--color-success)" }}>
              <span className="status-dot online" style={{ background: "var(--color-success)", boxShadow: "0 0 8px var(--color-success)" }}></span>
              <span> Live USB Hardware Stream</span>
            </div>
          ) : (
            <div className="status-badge" style={{ borderColor: "var(--text-dim)", opacity: 0.7 }}>
              <span className="status-dot" style={{ background: "var(--text-dim)" }}></span>
              <span>Simulated Telemetry</span>
            </div>
          )}
          <div className="status-badge">
            Clients: <span style={{ color: "var(--color-primary)", fontWeight: 800 }}>{clients.length}</span>
          </div>
          <div className="status-badge">
            <span className={`status-dot ${socketStatus === "CONNECTED" ? "online" : "offline"}`}></span>
            <span>{socketStatus === "CONNECTED" ? "CONNECTED (API)" : "DISCONNECTED"}</span>
          </div>
          <button
            className="logout-btn-header"
            onClick={() => {
              safeSessionStorage.removeItem("base_station_authorized");
              setIsAuthorized(false);
              setAuthPin("");
            }}
          >
            🔒 Lock Dashboard
          </button>
        </div>
      </header>

      <div className="grid-admin-two-col">
        {/* Left Column: Live Monitoring & Status */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Live Sensor Grid */}
          <div className="card">
            <h2>Live Telemetry Readings</h2>
            <div className="grid-metrics" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "0" }}>
              {/* Temperature */}
              <div className="metric-card card" style={{ padding: "1.2rem" }}>
                <div className="metric-label">Temperature</div>
                <div className="metric-value" style={{ fontSize: "2rem" }}>
                  {weather ? weather.temperature.toFixed(1) : "--.-"}
                  <span className="metric-unit">°C</span>
                </div>
                <div className="metric-sub" style={{ fontSize: "0.7rem" }}>Sensor grid node</div>
              </div>

              {/* Humidity */}
              <div className="metric-card card" style={{ padding: "1.2rem" }}>
                <div className="metric-label">Humidity</div>
                <div className="metric-value" style={{ fontSize: "2rem" }}>
                  {weather ? weather.humidity : "--"}
                  <span className="metric-unit">%</span>
                </div>
                <div className="metric-sub" style={{ fontSize: "0.7rem" }}>Capacitive matrix</div>
              </div>

              {/* Wind Speed */}
              <div className="metric-card card" style={{ padding: "1.2rem" }}>
                <div className="metric-label">Wind Speed</div>
                <div className="metric-value" style={{ fontSize: "2rem" }}>
                  {weather ? weather.wind_speed.toFixed(1) : "--.-"}
                  <span className="metric-unit">m/s</span>
                </div>
                <div className="metric-sub" style={{ fontSize: "0.7rem" }}>
                  Vector: {weather ? weather.wind_dir : "--"}
                </div>
              </div>

              {/* Pressure */}
              <div className="metric-card card" style={{ padding: "1.2rem" }}>
                <div className="metric-label">Atm Pressure</div>
                <div className="metric-value" style={{ fontSize: "2rem" }}>
                  {weather ? weather.pressure : "----"}
                  <span className="metric-unit">hPa</span>
                </div>
                <div className="metric-sub" style={{ fontSize: "0.7rem" }}>Barometric logs</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.25rem", paddingTop: "0.75rem", borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: "0.8rem" }}>
              <div style={{ color: "var(--text-secondary)" }}>
                Status: <strong style={{ color: "var(--color-primary)", textTransform: "uppercase" }}>{weather ? weather.status : "Unknown"}</strong>
              </div>
              <div style={{ color: "var(--text-dim)" }}>
                Refreshed: {getUpdateString()}
              </div>
            </div>
          </div>

          {/* Telemetry Trend History Graph */}
          <div className="card chart-card-glow">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <h2>Telemetry Historical Trends</h2>
              <div style={{ display: "flex", gap: "0.8rem", fontSize: "0.78rem" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-primary)" }}></span>
                  Temp
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-success)" }}></span>
                  Humidity
                </span>
              </div>
            </div>

            {history.length < 2 ? (
              <div style={{ height: "130px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontSize: "0.82rem" }}>
                Accumulating sensor readings to render trend curves...
              </div>
            ) : (
              <div style={{ position: "relative", width: "100%", height: "135px", marginTop: "0.5rem" }}>
                <svg viewBox="0 0 500 120" style={{ width: "100%", height: "100%", overflow: "visible" }}>
                  <line x1="10" y1="10" x2="490" y2="10" className="chart-grid-line" />
                  <line x1="10" y1="35" x2="490" y2="35" className="chart-grid-line" />
                  <line x1="10" y1="60" x2="490" y2="60" className="chart-grid-line" />
                  <line x1="10" y1="85" x2="490" y2="85" className="chart-grid-line" />
                  <line x1="10" y1="110" x2="490" y2="110" className="chart-axis-line" />

                  <path d={generateSvgPath("temperature")} className="chart-line-temp" />
                  <path d={generateSvgPath("humidity")} className="chart-line-hum" />

                  {history.map((entry, idx) => {
                    const temp = entry.temperature;
                    const hum = entry.humidity;
                    const x = (idx / (history.length - 1)) * 480 + 10;

                    const tempY = 110 - ((temp - 5) / (45 - 5)) * 90 - 10;
                    const humY = 110 - (hum / 100) * 90 - 10;

                    return (
                      <g key={idx}>
                        <circle cx={x} cy={tempY} r="3.5" className="chart-marker-temp">
                          <title>{`Temp: ${temp}°C at ${entry.time}`}</title>
                        </circle>
                        <circle cx={x} cy={humY} r="3.5" className="chart-marker-hum">
                          <title>{`Humidity: ${hum}% at ${entry.time}`}</title>
                        </circle>
                      </g>
                    );
                  })}
                </svg>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.50rem", color: "var(--text-dim)", fontSize: "8px", fontFamily: "monospace" }}>
                  <span>{history[0]?.time}</span>
                  <span>{history[Math.floor(history.length / 2)]?.time}</span>
                  <span>{history[history.length - 1]?.time}</span>
                </div>
              </div>
            )}
          </div>

          {/* 15-Minute Forecast Predictions (Real AI model values) */}
          <div className="card" style={{ padding: "1.2rem", background: "linear-gradient(135deg, rgba(0,210,255,0.03) 0%, rgba(18,24,41,0.7) 100%)", border: "1px solid rgba(0, 210, 255, 0.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <div className="metric-label" style={{ margin: 0, fontSize: "0.78rem", color: "var(--color-primary)" }}>🔮 AI FORECAST (15-Min Prediction)</div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span className="status-dot" style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: (weather?.temp_model_loaded && weather?.humidity_model_loaded) ? "var(--color-success)" : "var(--color-warning)",
                  boxShadow: (weather?.temp_model_loaded && weather?.humidity_model_loaded) ? "0 0 8px var(--color-success)" : "0 0 8px var(--color-warning)",
                  animation: (weather?.temp_model_loaded && weather?.humidity_model_loaded) ? "pulse 2s infinite" : "none"
                }}></span>
                <span style={{
                  fontSize: "0.68rem",
                  fontWeight: 800,
                  color: (weather?.temp_model_loaded && weather?.humidity_model_loaded) ? "var(--color-success)" : "var(--color-warning)",
                  letterSpacing: "0.05em"
                }}>
                  {(weather?.temp_model_loaded && weather?.humidity_model_loaded) ? "XGBOOST AI ACTIVE" : "SIMULATED FORECAST"}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem" }}>
              <div>
                <div style={{ fontSize: "1.2rem", fontWeight: "bold" }}>{forecast.temp}°C</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Expected Temp</div>
              </div>
              <div>
                <div style={{ fontSize: "1.2rem", fontWeight: "bold" }}>{forecast.hum}%</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Expected Humidity</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "1.05rem", fontWeight: "bold", color: "var(--color-primary)", textTransform: "capitalize" }}>{forecast.status}</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Expected Status</div>
              </div>
            </div>
          </div>

          {/* Connected LAN Clients Monitor */}
          <div className="card" style={{ padding: "1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
              <h2>Linked Monitor Nodes</h2>
              <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>WebSocket Connections</span>
            </div>

            <div className="clients-table-container" style={{ maxHeight: "165px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "8px" }}>
              <table className="clients-table" style={{ fontSize: "0.78rem" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.01)" }}>
                    <th style={{ padding: "0.4rem 0.6rem" }}>Client ID</th>
                    <th style={{ padding: "0.4rem 0.6rem" }}>Browser User Agent</th>
                    <th style={{ padding: "0.4rem 0.6rem" }}>Alert Permissions</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: "center", color: "var(--text-dim)", padding: "1.5rem 0" }}>
                        No client dashboard nodes connected.
                      </td>
                    </tr>
                  ) : (
                    clients.map((c) => {
                      let permClass = "pending";
                      let permText = "Pending";
                      if (c.permission === "granted") {
                        permClass = "granted";
                        permText = "OK";
                      } else if (c.permission === "denied") {
                        permClass = "denied";
                        permText = "Mute";
                      }

                      return (
                        <tr key={c.id}>
                          <td style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--color-primary)", padding: "0.4rem 0.6rem" }}>
                            {c.id}
                          </td>
                          <td style={{ padding: "0.4rem 0.6rem", color: "var(--text-secondary)" }}>{c.user_agent}</td>
                          <td style={{ padding: "0.4rem 0.6rem" }}>
                            <span className={`perm-badge ${permClass}`} style={{ fontSize: "0.62rem", padding: "0.1rem 0.3rem" }}>{permText}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Right Column: Base Station Control Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Manual Telemetry Override Slider Panel */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2>Telemetry Override</h2>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  id="manual-mode-toggle"
                  style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  checked={manualMode}
                  onChange={(e) => toggleManualMode(e.target.checked)}
                />
                <label htmlFor="manual-mode-toggle" style={{ fontSize: "0.85rem", cursor: "pointer", fontWeight: 600 }}>
                  <span className={`override-indicator-pill ${manualMode ? "active" : ""}`}>
                    {manualMode ? "● ACTIVE" : "● OFF"}
                  </span>
                </label>
              </div>
            </div>

            <p style={{ color: "var(--text-secondary)", fontSize: "0.80rem", marginBottom: "1.25rem", lineHeight: "1.4" }}>
              Toggle manual mode and adjust the sliders to override simulator values. Client gauges will adjust in real-time.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", opacity: manualMode ? 1 : 0.45, pointerEvents: manualMode ? "auto" : "none", transition: "opacity 0.2s" }}>

              {/* Temperature Slider */}
              <div className="form-group">
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "4px" }}>
                  <label style={{ color: "var(--text-secondary)" }}>Temperature</label>
                  <span style={{ color: "var(--color-primary)", fontWeight: "bold" }}>{overrideTemp.toFixed(1)}°C</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="45"
                  step="0.5"
                  className="glow-slider"
                  value={overrideTemp}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setOverrideTemp(val);
                    dispatchOverride(val, overrideHum, overrideWind, overridePress, overrideStatus);
                  }}
                />
              </div>

              {/* Humidity Slider */}
              <div className="form-group">
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "4px" }}>
                  <label style={{ color: "var(--text-secondary)" }}>Humidity</label>
                  <span style={{ color: "var(--color-success)", fontWeight: "bold" }}>{overrideHum}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="1"
                  className="glow-slider success"
                  value={overrideHum}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setOverrideHum(val);
                    dispatchOverride(overrideTemp, val, overrideWind, overridePress, overrideStatus);
                  }}
                />
              </div>

              {/* Wind Speed Slider */}
              <div className="form-group">
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "4px" }}>
                  <label style={{ color: "var(--text-secondary)" }}>Wind Speed</label>
                  <span style={{ color: "var(--color-primary)", fontWeight: "bold" }}>{overrideWind.toFixed(1)} m/s</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="35"
                  step="0.5"
                  className="glow-slider"
                  value={overrideWind}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setOverrideWind(val);
                    dispatchOverride(overrideTemp, overrideHum, val, overridePress, overrideStatus);
                  }}
                />
              </div>

              {/* Barometric Pressure Slider */}
              <div className="form-group">
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "4px" }}>
                  <label style={{ color: "var(--text-secondary)" }}>Atm Pressure</label>
                  <span style={{ color: "var(--text-primary)", fontWeight: "bold" }}>{overridePress} hPa</span>
                </div>
                <input
                  type="range"
                  min="960"
                  max="1040"
                  step="1"
                  className="glow-slider"
                  value={overridePress}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setOverridePress(val);
                    dispatchOverride(overrideTemp, overrideHum, overrideWind, val, overrideStatus);
                  }}
                />
              </div>

              {/* Status Select dropdown */}
              <div className="form-group">
                <label style={{ color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>Atmospheric Status</label>
                <select
                  className="form-select"
                  value={overrideStatus}
                  onChange={(e) => {
                    const val = e.target.value;
                    setOverrideStatus(val);
                    dispatchOverride(overrideTemp, overrideHum, overrideWind, overridePress, val);
                  }}
                >
                  <option value="Clear Skies">Clear Skies</option>
                  <option value="Partly Cloudy">Partly Cloudy</option>
                  <option value="Overcast">Overcast</option>
                  <option value="Rainy">Rainy</option>
                  <option value="Extreme Heat">Extreme Heat</option>
                  <option value="Severe Storm">Severe Storm</option>
                </select>
              </div>

            </div>
          </div>

          {/* Quick Preset Card */}
          <div className="card">
            <h2>Presets Broadcast</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginBottom: "1rem" }}>
              Clicking a preset will immediately broadcast alerts to all connected clients.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <button className="btn btn-danger" style={{ fontSize: "0.85rem", padding: "0.6rem" }} onClick={() => sendPreset("storm")}>
                ⚡ Tornado/Storm Alert
              </button>
              <button className="btn btn-warning" style={{ fontSize: "0.85rem", padding: "0.6rem" }} onClick={() => sendPreset("heatwave")}>
                🔥 Heat Wave Advisory
              </button>
              <button className="btn btn-primary" style={{ fontSize: "0.85rem", padding: "0.6rem" }} onClick={() => sendPreset("rain")}>
                🌧️ Flood Warning
              </button>
              <button className="btn btn-secondary" style={{ fontSize: "0.85rem", padding: "0.6rem", color: "var(--color-success)", borderColor: "rgba(16,185,129,0.3)" }} onClick={() => sendPreset("clear")}>
                🟢 Restore normal
              </button>
            </div>
          </div>

          {/* Scenario Playlists */}
          <div className="card">
            <h2>Scenario Playlists</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginBottom: "1.25rem" }}>
              Run automated progressions to simulate weather cycles on connected clients.
            </p>

            <div style={{ display: "flex", gap: "1rem" }}>
              <button
                className={`btn btn-secondary ${scenarioState.active && scenarioState.name === "monsoon_arrival" ? "active" : ""}`}
                style={{ flex: 1, padding: "0.6rem" }}
                onClick={() => startScenario("monsoon_arrival")}
              >
                🌧️ Monsoon
              </button>
              <button
                className={`btn btn-secondary ${scenarioState.active && scenarioState.name === "heatwave_peak" ? "active" : ""}`}
                style={{ flex: 1, padding: "0.6rem" }}
                onClick={() => startScenario("heatwave_peak")}
              >
                🔥 Heatwave
              </button>
            </div>

            {scenarioState.active && (
              <div className="scenario-timeline-box" style={{ marginTop: "1rem", background: "rgba(0,0,0,0.2)", padding: "0.8rem", borderRadius: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.4rem" }}>
                  <span style={{ textTransform: "uppercase", color: "var(--color-primary)", fontWeight: "bold" }}>
                    {scenarioState.name?.replace("_", " ")}
                  </span>
                  <span>
                    {scenarioState.step + 1}/{scenarioState.totalSteps}
                  </span>
                </div>
                <div style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.05)", borderRadius: "3px", overflow: "hidden" }}>
                  <div
                    style={{ height: "100%", background: "var(--color-primary)", width: `${((scenarioState.step + 1) / scenarioState.totalSteps) * 100}%`, transition: "width 0.3s" }}
                  ></div>
                </div>
                <div style={{ marginTop: "0.6rem", display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn btn-danger" style={{ padding: "0.3rem 0.75rem", fontSize: "0.75rem" }} onClick={stopScenario}>
                    Stop Scenario
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Advisory Broadcaster */}
          <div className="card" style={{ padding: "1.25rem" }}>
            <h2>Advisory Broadcaster</h2>
            <form onSubmit={handleCustomSubmit} className="alert-form" style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
              <div className="form-group">
                <input
                  type="text"
                  className="form-input"
                  placeholder="Alert Title (e.g. Flash Flood)"
                  value={alertTitle}
                  onChange={(e) => setAlertTitle(e.target.value)}
                  required
                  style={{ padding: "0.5rem 0.75rem", fontSize: "0.82rem" }}
                />
              </div>
              <div className="form-group">
                <textarea
                  className="form-textarea"
                  placeholder="Detailed warning message to clients..."
                  value={alertMessage}
                  onChange={(e) => setAlertMessage(e.target.value)}
                  required
                  style={{ padding: "0.5rem 0.75rem", fontSize: "0.82rem", height: "55px" }}
                />
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <select
                  className="form-select"
                  value={alertSeverity}
                  onChange={(e) => setAlertSeverity(e.target.value as any)}
                  style={{ padding: "0.4rem", fontSize: "0.82rem", flex: 1 }}
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="danger">Critical Danger</option>
                </select>
                <button type="submit" className="btn btn-primary" style={{ padding: "0.45rem 1rem", fontSize: "0.82rem" }}>
                  Broadcast
                </button>
              </div>
            </form>
          </div>

          {/* News Ticker Publisher */}
          <div className="card" style={{ padding: "1.25rem" }}>
            <h2>News Ticker Publisher</h2>
            <form onSubmit={handleBulletinSubmit} className="alert-form" style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
              <div className="form-group">
                <input
                  type="text"
                  className="form-input"
                  placeholder="Bulletin Headline (e.g. Heavy Rain)"
                  value={bulletinTitle}
                  onChange={(e) => setBulletinTitle(e.target.value)}
                  required
                  style={{ padding: "0.5rem 0.75rem", fontSize: "0.82rem" }}
                />
              </div>
              <div className="form-group">
                <textarea
                  className="form-textarea"
                  placeholder="Headline summary to scroll on marquee..."
                  value={bulletinSummary}
                  onChange={(e) => setBulletinSummary(e.target.value)}
                  required
                  style={{ padding: "0.5rem 0.75rem", fontSize: "0.82rem", height: "55px" }}
                />
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <select
                  className="form-select"
                  value={bulletinCategory}
                  onChange={(e) => setBulletinCategory(e.target.value)}
                  style={{ padding: "0.4rem", fontSize: "0.82rem", flex: 1 }}
                >
                  <option value="LOCAL">Local</option>
                  <option value="SEVERE">Severe</option>
                  <option value="GLOBAL">Global</option>
                  <option value="CLIMATE">Climate</option>
                </select>
                <button type="submit" className="btn btn-primary" style={{ padding: "0.45rem 1rem", fontSize: "0.82rem" }}>
                  Publish
                </button>
              </div>
            </form>
          </div>

          {/* Base Station Event Console Log */}
          <div className="card" style={{ display: "flex", flexDirection: "column", padding: "1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h2>Recent Activities</h2>
              <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Log</span>
            </div>

            <div className="admin-log-console">
              {adminLogs.map((log, idx) => (
                <div key={idx} className={`admin-log-entry ${log.type}`}>
                  <span className="admin-log-time">[{log.time}]</span>
                  <span className="admin-log-text">{log.text}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

