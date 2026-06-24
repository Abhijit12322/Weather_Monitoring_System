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

interface AlertLogEntry {
  title: string;
  message: string;
  severity: "info" | "warning" | "danger";
  time: string;
}

interface HistoryEntry {
  temperature: number;
  humidity: number;
  time: string;
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

type ViewState = "splash" | "login" | "dashboard" | "profile";

interface RadarProps {
  status: string;
}

function WeatherRadar({ status }: RadarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    const statusLower = status.toLowerCase();

    // Generate some random storm cells/echoes
    const echoes: Array<{ x: number, y: number, radius: number, intensity: number, vx: number, vy: number }> = [];

    // Populate echoes based on weather status
    const numEchoes = statusLower.includes("storm") ? 8 : statusLower.includes("rain") ? 12 : statusLower.includes("cloud") || statusLower.includes("overcast") ? 5 : 2;
    for (let i = 0; i < numEchoes; i++) {
      const dist = Math.random() * 80 + 20;
      const a = Math.random() * Math.PI * 2;
      echoes.push({
        x: Math.cos(a) * dist,
        y: Math.sin(a) * dist,
        radius: Math.random() * 15 + (statusLower.includes("storm") ? 15 : 5),
        intensity: Math.random() * 0.5 + 0.5,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2
      });
    }

    let sweepAngle = 0;

    const draw = () => {
      // Clear with slight opacity to create fade trail effect
      ctx.fillStyle = "rgba(7, 10, 19, 0.15)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const r = Math.min(cx, cy) - 15;

      // Draw grid rings
      ctx.strokeStyle = "rgba(0, 210, 255, 0.08)";
      ctx.lineWidth = 1;
      for (let ring = 1; ring <= 4; ring++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (r / 4) * ring, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw crosshairs
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
      ctx.stroke();

      // Draw compass text (N, S, E, W)
      ctx.fillStyle = "rgba(0, 210, 255, 0.4)";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("N", cx, cy - r - 8);
      ctx.fillText("S", cx, cy + r + 8);
      ctx.fillText("E", cx + r + 8, cy);
      ctx.fillText("W", cx - r - 8, cy);

      // Update and draw echoes (precipitation blocks)
      echoes.forEach((echo) => {
        // Move echo slightly
        echo.x += echo.vx;
        echo.y += echo.vy;

        // Wrap around range limit
        const dist = Math.sqrt(echo.x * echo.x + echo.y * echo.y);
        if (dist > r) {
          echo.x = -echo.x * 0.9;
          echo.y = -echo.y * 0.9;
        }

        // Calculate angle to echo from center
        let echoAngle = Math.atan2(echo.y, echo.x);
        if (echoAngle < 0) echoAngle += Math.PI * 2;

        // Calculate angular distance between sweep line and echo
        let angleDiff = sweepAngle - echoAngle;
        if (angleDiff < 0) angleDiff += Math.PI * 2;

        // Echo glows brightly when swept, then decays
        let brightness = 0;
        if (angleDiff < 0.15) {
          brightness = 1.0;
        } else if (angleDiff < Math.PI * 0.75) {
          brightness = 1.0 - (angleDiff / (Math.PI * 0.75));
        }

        if (brightness > 0.05) {
          const grad = ctx.createRadialGradient(
            cx + echo.x, cy + echo.y, 0,
            cx + echo.x, cy + echo.y, echo.radius
          );

          let colorString = "0, 210, 255"; // cyan for light rain/cloud
          if (statusLower.includes("storm")) {
            colorString = "239, 68, 68"; // red for severe storm
          } else if (statusLower.includes("rain")) {
            colorString = "16, 185, 129"; // green for rain
          } else if (statusLower.includes("heat")) {
            colorString = "245, 158, 11"; // orange for heat
          }

          grad.addColorStop(0, `rgba(${colorString}, ${echo.intensity * brightness * 0.7})`);
          grad.addColorStop(0.5, `rgba(${colorString}, ${echo.intensity * brightness * 0.3})`);
          grad.addColorStop(1, "rgba(0, 0, 0, 0)");

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx + echo.x, cy + echo.y, echo.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Draw sweep line
      const sweepX = cx + Math.cos(sweepAngle) * r;
      const sweepY = cy + Math.sin(sweepAngle) * r;

      // Sweep gradient
      const sweepGrad = ctx.createLinearGradient(cx, cy, sweepX, sweepY);
      sweepGrad.addColorStop(0, "rgba(0, 210, 255, 0)");
      sweepGrad.addColorStop(1, "rgba(0, 210, 255, 0.4)");

      ctx.strokeStyle = sweepGrad;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(sweepX, sweepY);
      ctx.stroke();

      // Add sweep line head glow
      ctx.fillStyle = "rgba(0, 210, 255, 0.8)";
      ctx.beginPath();
      ctx.arc(sweepX, sweepY, 3, 0, Math.PI * 2);
      ctx.fill();

      // Increment sweep angle
      const speed = statusLower.includes("storm") ? 0.025 : 0.012; // scan faster in storms!
      sweepAngle = (sweepAngle + speed) % (Math.PI * 2);

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [status]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: "260px", background: "#060913", borderRadius: "14px", overflow: "hidden", border: "1px solid var(--border-color)", display: "flex", justifyContent: "center", alignItems: "center" }}>
      <canvas ref={canvasRef} width="320" height="260" style={{ display: "block" }} />
      {/* Radar Overlay Status Info */}
      <div style={{ position: "absolute", bottom: "10px", left: "10px", fontFamily: "monospace", fontSize: "10px", color: "var(--color-primary)", pointerEvents: "none", display: "flex", flexDirection: "column", gap: "2px" }}>
        <div>RADAR MODE: {status.toUpperCase()}</div>
        <div>SCAN FREQ: {status.toLowerCase().includes("storm") ? "2.4 GHz" : "1.2 GHz"}</div>
        <div>FILTER: NEXRAD-III</div>
      </div>
      <div style={{ position: "absolute", top: "10px", right: "10px", fontFamily: "monospace", fontSize: "10px", color: "var(--color-primary)", pointerEvents: "none" }}>
        RANGE: 250 KM
      </div>
    </div>
  );
}

interface WeatherParticlesProps {
  status: string;
}

function WeatherParticles({ status }: WeatherParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    const statusLower = status.toLowerCase();

    // Rain/Storm particles
    const drops: Array<{ x: number; y: number; length: number; speed: number; opacity: number }> = [];
    const numDrops = statusLower.includes("storm") ? 140 : statusLower.includes("rain") ? 60 : 0;
    for (let i = 0; i < numDrops; i++) {
      drops.push({
        x: Math.random() * width,
        y: Math.random() * height - height,
        length: Math.random() * 15 + 10,
        speed: Math.random() * 15 + (statusLower.includes("storm") ? 20 : 10),
        opacity: Math.random() * 0.3 + 0.1
      });
    }

    // Heat haze thermals
    const thermals: Array<{ x: number; y: number; radius: number; speed: number; angle: number; angleSpeed: number; opacity: number }> = [];
    const numThermals = statusLower.includes("heat") ? 40 : 0;
    for (let i = 0; i < numThermals; i++) {
      thermals.push({
        x: Math.random() * width,
        y: Math.random() * height + height / 2,
        radius: Math.random() * 2 + 1,
        speed: Math.random() * 0.8 + 0.3,
        angle: Math.random() * Math.PI * 2,
        angleSpeed: Math.random() * 0.02 - 0.01,
        opacity: Math.random() * 0.25 + 0.05
      });
    }

    // Floating overcast/mist clouds
    const clouds: Array<{ x: number; y: number; radius: number; vx: number; opacity: number }> = [];
    const numClouds = (statusLower.includes("cloud") || statusLower.includes("overcast") || statusLower.includes("unsettled")) ? 10 : 0;
    for (let i = 0; i < numClouds; i++) {
      clouds.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 120 + 80,
        vx: Math.random() * 0.2 + 0.05,
        opacity: Math.random() * 0.04 + 0.02
      });
    }

    // Twinkling stars
    const stars: Array<{ x: number; y: number; radius: number; twinkleSpeed: number; angle: number; opacity: number }> = [];
    const numStars = (statusLower.includes("clear") || statusLower.includes("skies")) ? 50 : 0;
    for (let i = 0; i < numStars; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.2 + 0.4,
        twinkleSpeed: Math.random() * 0.03 + 0.01,
        angle: Math.random() * Math.PI * 2,
        opacity: Math.random() * 0.6 + 0.1
      });
    }

    let lightningIntensity = 0;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // 1. Storm / Rain Particles
      if (statusLower.includes("storm") || statusLower.includes("rain")) {
        ctx.strokeStyle = statusLower.includes("storm") ? "rgba(165, 180, 252, 0.4)" : "rgba(0, 210, 255, 0.35)";
        ctx.lineWidth = statusLower.includes("storm") ? 1.5 : 1;
        ctx.lineCap = "round";

        drops.forEach((d) => {
          ctx.beginPath();
          const dx = statusLower.includes("storm") ? 3 : 0;
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + dx, d.y + d.length);
          ctx.stroke();

          d.y += d.speed;
          d.x += dx;

          if (d.y > height) {
            d.y = -d.length;
            d.x = Math.random() * width;
          }
        });

        if (statusLower.includes("storm")) {
          if (Math.random() < 0.003 && lightningIntensity === 0) {
            lightningIntensity = Math.random() * 0.8 + 0.2;
          }
          if (lightningIntensity > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${lightningIntensity})`;
            ctx.fillRect(0, 0, width, height);
            lightningIntensity -= 0.08;
            if (lightningIntensity < 0) lightningIntensity = 0;
          }
        }
      }

      // 2. Heat Haze thermals
      if (statusLower.includes("heat")) {
        thermals.forEach((t) => {
          t.angle += t.angleSpeed;
          t.x += Math.sin(t.angle) * 0.3;
          t.y -= t.speed;

          ctx.fillStyle = `rgba(245, 158, 11, ${t.opacity})`;
          ctx.beginPath();
          ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
          ctx.fill();

          if (t.y < -t.radius) {
            t.y = height + Math.random() * 20;
            t.x = Math.random() * width;
          }
        });
      }

      // 3. Clouds
      if (statusLower.includes("cloud") || statusLower.includes("overcast") || statusLower.includes("unsettled")) {
        clouds.forEach((c) => {
          const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.radius);
          grad.addColorStop(0, `rgba(148, 163, 184, ${c.opacity})`);
          grad.addColorStop(0.5, `rgba(71, 85, 105, ${c.opacity * 0.5})`);
          grad.addColorStop(1, "rgba(0, 0, 0, 0)");

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
          ctx.fill();

          c.x += c.vx;
          if (c.x - c.radius > width) {
            c.x = -c.radius;
            c.y = Math.random() * height;
          }
        });
      }

      // 4. Twinkling Stars
      if (statusLower.includes("clear") || statusLower.includes("skies")) {
        stars.forEach((s) => {
          s.angle += s.twinkleSpeed;
          const currentOpacity = s.opacity * (0.6 + 0.4 * Math.sin(s.angle));

          ctx.fillStyle = `rgba(255, 255, 255, ${currentOpacity})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationId);
    };
  }, [status]);

  return <canvas ref={canvasRef} className="ambient-canvas" />;
}

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== "undefined") {
        return localStorage.getItem(key);
      }
    } catch (e) {
      console.warn("localStorage access denied:", e);
    }
    return null;
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn("localStorage write denied:", e);
    }
  },
  removeItem: (key: string): void => {
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn("localStorage remove denied:", e);
    }
  }
};

export default function ClientConsole() {
  const [viewState, setViewState] = useState<ViewState>("splash");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [activeSlide, setActiveSlide] = useState(0);
  const [darkMode, setDarkMode] = useState(true);

  // Connection/Telemetry States
  const [socketStatus, setSocketStatus] = useState<"CONNECTED" | "DISCONNECTED">("DISCONNECTED");
  const [clientId, setClientId] = useState<string>("--");
  const [nodeIp, setNodeIp] = useState<string>("Connecting...");
  const [weather, setWeather] = useState<WeatherState | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);

  const [forecastData, setForecastData] = useState<any>(null);
  const [username, setUsername] = useState("Guest");

  // Alert States
  const [currentAlert, setCurrentAlert] = useState<WeatherState["alert"]>(null);
  const activeAlertTimestampRef = useRef<number | null>(null);
  const [hasAcknowledgedDanger, setHasAcknowledgedDanger] = useState(false);
  const [alertLogs, setAlertLogs] = useState<AlertLogEntry[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    "App initialized. Awaiting connection..."
  ]);
  const [notificationPermission, setNotificationPermission] = useState<string>("default");

  const [alertsMuted, setAlertsMuted] = useState<boolean>(() => {
    return safeLocalStorage.getItem("weather_alerts_muted") === "true";
  });

  const alertsMutedRef = useRef(alertsMuted);
  useEffect(() => {
    alertsMutedRef.current = alertsMuted;
  }, [alertsMuted]);

  const toggleMute = () => {
    const newVal = !alertsMuted;
    setAlertsMuted(newVal);
    safeLocalStorage.setItem("weather_alerts_muted", String(newVal));
    addConsoleLog(`Alert audio/push notifications ${newVal ? "muted" : "unmuted"}.`);
  };


  // Auto-login from localStorage on mount
  useEffect(() => {
    const savedUser = safeLocalStorage.getItem("weather_user");
    if (savedUser) {
      setUsername(savedUser);
      setViewState("dashboard");
    }
  }, []);

  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);

  // Splash Screen Timeout
  useEffect(() => {
    const timer = setTimeout(() => {
      setViewState((prev) => (prev === "splash" ? "login" : prev));
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Welcome Slideshow Auto-Transition
  useEffect(() => {
    if (viewState !== "login") return;
    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % 3);
    }, 3500);
    return () => clearInterval(interval);
  }, [viewState]);

  function addConsoleLog(msg: string, type: "SYSTEM" | "ALERT" | "ERROR" = "SYSTEM") {
    const timeStr = new Date().toLocaleTimeString();
    let prefix = `[${timeStr}] [SYS] `;
    if (type === "ALERT") prefix = `[${timeStr}] [ALERT] ⚠️ `;
    if (type === "ERROR") prefix = `[${timeStr}] [ERR] 🔴 `;

    setConsoleLogs((prev) => [...prev, `${prefix}${msg}`].slice(-25));
  }

  // Synthesize digital chime
  const playChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(880, ctx.currentTime);
      gain1.gain.setValueAtTime(0.08, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.15);

      setTimeout(() => {
        if (ctx.state === "closed") return;
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(1109, ctx.currentTime);
        gain2.gain.setValueAtTime(0.08, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.25);
      }, 120);
    } catch (err) {
      console.log("Audio synthesis blocked or failed:", err);
    }
  };

  const syncPermissionState = () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);
    sendPermissionToServer(Notification.permission);
  };

  const requestNotificationPermission = () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    Notification.requestPermission().then((permission) => {
      addConsoleLog(`Push notifications permission: ${permission}`);
      setNotificationPermission(permission);
      sendPermissionToServer(permission);
    });
  };

  const sendPermissionToServer = (state: string) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: "permission_update",
          permission: state,
        })
      );
    }
  };

  const connect = () => {
    if (typeof window === "undefined") return;

    // Close existing socket if any to prevent duplicate connection channels
    if (ws.current) {
      try {
        ws.current.close();
      } catch (err) { }
    }

    const host = window.location.hostname;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${host}:8000/ws/client`;

    addConsoleLog(`Connecting to base station: ${wsUrl}`);
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      addConsoleLog("WebSocket link online.", "SYSTEM");
      setSocketStatus("CONNECTED");
      setNodeIp(host);
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);

      const perm = ("Notification" in window) ? Notification.permission : "default";
      sendPermissionToServer(perm);
    };

    ws.current.onmessage = (event) => {
      const payload = JSON.parse(event.data);

      if (payload.type === "config") {
        setClientId(payload.clientId);
        addConsoleLog(`Assigned Client ID: ${payload.clientId}`);
        updateWeatherTelemetry(payload.weather);
        if (payload.forecast) {
          setForecastData(payload.forecast);
        }
        if (payload.news) {
          setNews(payload.news);
        }
      } else if (payload.type === "weather") {
        updateWeatherTelemetry(payload.data);
        if (payload.forecast) {
          setForecastData(payload.forecast);
        }
      } else if (payload.type === "news_update") {
        setNews(payload.data);
        addConsoleLog("Weather news bulletin board updated by base station.");
      }
    };

    ws.current.onclose = () => {
      addConsoleLog("Connection lost. Awaiting reconnect...", "ERROR");
      setSocketStatus("DISCONNECTED");
      setClientId("--");
      reconnectTimeout.current = setTimeout(connect, 3000);
    };

    ws.current.onerror = () => {
      addConsoleLog("Websocket connection error.", "ERROR");
    };
  };

  const updateWeatherTelemetry = (data: WeatherState) => {
    setWeather(data);

    const timeLabel = new Date(data.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setHistory((prev) => [
      ...prev,
      {
        temperature: data.temperature,
        humidity: data.humidity,
        time: timeLabel
      }
    ].slice(-10));

    handleAlertState(data.alert);
  };

  const handleAlertState = (alertData: WeatherState["alert"]) => {
    if (!alertData) {
      setCurrentAlert(null);
      activeAlertTimestampRef.current = null;
      return;
    }

    const isNew = activeAlertTimestampRef.current !== alertData.timestamp;
    if (isNew) {
      activeAlertTimestampRef.current = alertData.timestamp;
      setCurrentAlert(alertData);

      addConsoleLog(`Advisory received: ${alertData.title}`, "ALERT");

      if (!alertsMutedRef.current) {
        playChime();
      }

      setAlertLogs((prev) => [
        {
          title: alertData.title,
          message: alertData.message,
          severity: alertData.severity,
          time: new Date().toLocaleTimeString(),
        },
        ...prev,
      ].slice(0, 10));

      if (!alertsMutedRef.current && "Notification" in window && Notification.permission === "granted") {
        new Notification(alertData.title, { body: alertData.message });
      }

      if (alertData.severity === "danger") {
        setHasAcknowledgedDanger(false);
      }
    }
  };

  useEffect(() => {
    syncPermissionState();
    connect();

    const fetchNews = async () => {
      try {
        const host = window.location.hostname;
        const res = await fetch(`http://${host}:8000/api/news`);
        const data = await res.json();
        setNews(data);
      } catch (err) {
        console.error("Failed to fetch initial news:", err);
      }
    };
    fetchNews();

    return () => {
      if (ws.current) {
        ws.current.onclose = null;
        ws.current.close();
      }
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, []);

  const acknowledgeEmergency = () => {
    setHasAcknowledgedDanger(true);
    addConsoleLog("Critical emergency alarm overlay dismissed by user.");
  };

  const getWeatherBgClass = () => {
    if (currentAlert && currentAlert.severity === "danger" && !hasAcknowledgedDanger) {
      return "weather-bg-storm";
    }
    if (weather) {
      if (weather.alert?.severity === "warning" && weather.alert.title.includes("Heat")) {
        return "weather-bg-heat";
      }
      if (weather.alert?.severity === "danger") {
        return "weather-bg-storm";
      }

      const stat = weather.status.toLowerCase();
      if (stat.includes("rain") || stat.includes("storm")) return "weather-bg-rainy";
      if (stat.includes("overcast") || stat.includes("cloudy")) return "weather-bg-overcast";
      if (stat.includes("heat")) return "weather-bg-heat";
    }
    return "weather-bg-clear";
  };

  useEffect(() => {
    if (typeof document !== "undefined") {
      const bg = getWeatherBgClass();
      document.body.className = bg;
    }
  }, [weather, currentAlert, hasAcknowledgedDanger, viewState]);

  const getStrokeDashoffset = (val: number, maxVal: number) => {
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const percentage = Math.min(Math.max(val / maxVal, 0), 1);
    return circumference - percentage * circumference;
  };

  const getWindRotation = (dir: string | undefined) => {
    if (!dir) return 0;
    const mapping: Record<string, number> = {
      N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315
    };
    return mapping[dir.toUpperCase()] || 0;
  };

  // Weather icons
  const renderWeatherIcon = () => {
    if (!weather) return null;
    const stat = weather.status.toLowerCase();

    if (weather.alert?.severity === "danger" || stat.includes("storm")) {
      return (
        <svg viewBox="0 0 64 64" width="70" height="70">
          <path d="M46,30a10,10,0,0,0-17.7-6,8,8,0,0,0-12.3,6.8,8.2,8.2,0,0,0,.1,1.2,10,10,0,0,0,2,19.8H46a10,10,0,0,0,0-20Z" fill="none" stroke="var(--color-danger)" strokeWidth="4" strokeLinejoin="round" />
          <polygon points="30,44 24,52 32,52 28,60 38,50 30,50" fill="var(--color-warning)" stroke="var(--color-warning)" strokeWidth="2" style={{ animation: "flash 1.5s infinite" }} />
        </svg>
      );
    }

    if (stat.includes("rain")) {
      return (
        <svg viewBox="0 0 64 64" width="70" height="70">
          <path d="M46,30a10,10,0,0,0-17.7-6,8,8,0,0,0-12.3,6.8,8.2,8.2,0,0,0,.1,1.2,10,10,0,0,0,2,19.8H46a10,10,0,0,0,0-20Z" fill="none" stroke="var(--color-primary)" strokeWidth="4" strokeLinejoin="round" />
          <g stroke="var(--color-primary)" strokeWidth="3.5" strokeLinecap="round">
            <line x1="22" y1="48" x2="20" y2="54" style={{ animation: "fall 0.8s linear infinite" }} />
            <line x1="32" y1="48" x2="30" y2="54" style={{ animation: "fall 0.8s linear infinite", animationDelay: "0.25s" }} />
            <line x1="42" y1="48" x2="40" y2="54" style={{ animation: "fall 0.8s linear infinite", animationDelay: "0.5s" }} />
          </g>
          <style>{`
            @keyframes fall {
              0% { transform: translateY(-3px); opacity: 0; }
              50% { opacity: 1; }
              100% { transform: translateY(5px); opacity: 0; }
            }
          `}</style>
        </svg>
      );
    }

    if (stat.includes("overcast") || stat.includes("cloudy")) {
      return (
        <svg viewBox="0 0 64 64" width="70" height="70">
          <path d="M46,30a10,10,0,0,0-17.7-6,8,8,0,0,0-12.3,6.8,8.2,8.2,0,0,0,.1,1.2,10,10,0,0,0,2,19.8H46a10,10,0,0,0,0-20Z" fill="none" stroke="#9ca3af" strokeWidth="4" strokeLinejoin="round" />
          <path d="M36,24a7,7,0,0,0-12.4-4.2,5.6,5.6,0,0,0-8.6,4.8,5.7,5.7,0,0,0,.1.8A7,7,0,0,0,16,38.8H36a7,7,0,0,0,0-14Z" fill="none" stroke="#4b5563" strokeWidth="3" strokeLinejoin="round" transform="translate(8, -5)" />
        </svg>
      );
    }

    if (stat.includes("heat")) {
      return (
        <svg viewBox="0 0 64 64" width="70" height="70" style={{ animation: "pulse 2s infinite" }}>
          <circle cx="32" cy="32" r="16" fill="none" stroke="var(--color-danger)" strokeWidth="4" />
          <g stroke="var(--color-warning)" strokeWidth="3" strokeLinecap="round">
            <line x1="32" y1="6" x2="32" y2="12" />
            <line x1="32" y1="52" x2="32" y2="58" />
            <line x1="6" y1="32" x2="12" y2="32" />
            <line x1="52" y1="32" x2="58" y2="32" />
          </g>
        </svg>
      );
    }

    return (
      <svg className="rotating-sun" viewBox="0 0 64 64" width="70" height="70">
        <circle cx="32" cy="32" r="12" fill="none" stroke="var(--color-warning)" strokeWidth="4" />
        <g stroke="var(--color-warning)" strokeWidth="4" strokeLinecap="round">
          <line x1="32" y1="6" x2="32" y2="12" />
          <line x1="32" y1="52" x2="32" y2="58" />
          <line x1="6" y1="32" x2="12" y2="32" />
          <line x1="52" y1="32" x2="58" y2="32" />
          <line x1="14" y1="14" x2="19" y2="19" />
          <line x1="45" y1="45" x2="50" y2="50" />
          <line x1="14" y1="50" x2="19" y2="45" />
          <line x1="45" y1="19" x2="50" y2="14" />
        </g>
        <style>{`
          .rotating-sun { animation: spin 15s linear infinite; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </svg>
    );
  };

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

  // Submit dynamic rating feedback log
  const handleRate = (stars: number) => {
    setRating(stars);
    addConsoleLog(`Rating scale submitted: ${stars} Stars! Thank you for rating the weather center!`);
    alert(`Thank you for rating us ${stars} Stars!`);
  };

  // 15-Minute Forecast (Real AI model values with manual math fallbacks)
  const getSimulatedForecast = () => {
    if (!weather) return { temp: "--.-", hum: "--", status: "Computing..." };

    // If real AI model predictions are received from python server, render them
    if (weather.predict_temp !== undefined && weather.predict_humidity !== undefined) {
      let fStatus = weather.status;
      if (weather.predict_humidity > 85) fStatus = "Rain Expected";
      else if (weather.predict_humidity < 35) fStatus = "Dry/High Evap";
      else if (weather.predict_temp > weather.temperature + 0.5) fStatus = "Warming Trend";
      else if (weather.predict_temp < weather.temperature - 0.5) fStatus = "Cooling Trend";

      return {
        temp: weather.predict_temp.toFixed(1),
        hum: weather.predict_humidity.toString(),
        status: fStatus
      };
    }

    // Check trend rate of change
    let tempDiff = 0.3;
    let humDiff = -1;
    if (history.length > 2) {
      const last = history[history.length - 1];
      const prev = history[history.length - 2];
      tempDiff = Number((last.temperature - prev.temperature).toFixed(1));
      humDiff = last.humidity - prev.humidity;
    }

    const fTemp = (weather.temperature + (tempDiff * 3)).toFixed(1);
    const fHum = Math.max(10, Math.min(100, weather.humidity + (humDiff * 3)));

    let fStatus = weather.status;
    if (fHum > 85) fStatus = "Showers Expected";
    else if (fHum < 30) fStatus = "Dry/High Evap";
    else if (tempDiff > 0.5) fStatus = "Rapid Warming";

    return { temp: fTemp, hum: fHum.toString(), status: fStatus };
  };

  const forecast = getSimulatedForecast();

  // AI Weather Assistant state and conversational logic
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "user" | "assistant"; text: string }>>([
    { sender: "assistant", text: "Hello! I am your AI Weather Companion. Ask me anything about current temperature, humidity, wind patterns, or alerts!" }
  ]);
  const [chatInput, setChatInput] = useState("");

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const query = chatInput.trim();
    const userMsg = { sender: "user" as const, text: query };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");

    setTimeout(() => {
      let response = "I'm sorry, I didn't quite catch that. I can provide weather summaries, forecast updates, or explain active warnings. Try asking 'Is it going to rain?' or 'Give me a weather summary'.";
      const q = query.toLowerCase();

      if (q.includes("rain") || q.includes("wet") || q.includes("precipitation")) {
        if (weather) {
          if (weather.humidity > 80) {
            response = `Yes, current relative humidity is very high at ${weather.humidity}%. Dynamic prediction models suggest rainfall or showers are active or imminent. Please plan accordingly!`;
          } else if (weather.humidity > 60) {
            response = `Current humidity is ${weather.humidity}%. There is a moderate risk of overcast skies or light rain, but no severe precipitation is currently expected.`;
          } else {
            response = `No, current humidity is low (${weather.humidity}%). Clear, dry conditions are expected.`;
          }
        } else {
          response = "I cannot access live sensor feeds right now, but I will monitor humidity once base station link restores.";
        }
      } else if (q.includes("temp") || q.includes("hot") || q.includes("cold") || q.includes("warm")) {
        if (weather) {
          response = `The ambient temperature at the station grid is currently ${weather.temperature.toFixed(1)}°C. Short-term models expect it to transition to ${forecast.temp}°C in 15 minutes.`;
        } else {
          response = "I cannot retrieve current temperature readings at this moment.";
        }
      } else if (q.includes("summary") || q.includes("status") || q.includes("condition")) {
        if (weather) {
          response = `Weather Station Summary: Current status is '${weather.status}' with temperature at ${weather.temperature.toFixed(1)}°C, humidity at ${weather.humidity}%, pressure at ${weather.pressure} hPa, and wind vector clocking ${weather.wind_speed} m/s ${weather.wind_dir}.`;
        } else {
          response = "The base station telemetry link is currently offline. Please wait for reconnect.";
        }
      } else if (q.includes("wind") || q.includes("blow") || q.includes("breeze")) {
        if (weather) {
          response = `Wind direction is pointing ${weather.wind_dir} with velocity of ${weather.wind_speed.toFixed(1)} m/s. Convective force remains within normal ranges.`;
        } else {
          response = "Wind metrics are currently unavailable.";
        }
      } else if (q.includes("pressure") || q.includes("barometer")) {
        if (weather) {
          response = `Atmospheric pressure is measured at ${weather.pressure} hPa. Pressure metrics are helpful for mapping incoming low-convective storm cells.`;
        } else {
          response = "Barometric logs are currently offline.";
        }
      } else if (q.includes("alert") || q.includes("warning") || q.includes("severe")) {
        if (weather && weather.alert) {
          response = `ACTIVE METEOROLOGICAL ADVISORY: ${weather.alert.title}. Message: ${weather.alert.message} (Severity: ${weather.alert.severity})`;
        } else {
          response = "There are no active warning alerts logged on the telemetry grid right now. The local area report remains clear.";
        }
      } else if (q.includes("hello") || q.includes("hi") || q.includes("hey")) {
        response = `Hello! How can I assist you with the meteorological metrics today? Ask me about 'rain', 'temperature', or a 'weather summary'.`;
      } else if (q.includes("help") || q.includes("what can you")) {
        response = "I am a virtual companion linked to the weather base station. You can ask me questions like 'Is it going to rain?', 'What is the temperature?', 'Explain active alerts', or 'Give me a weather summary'.";
      }

      setChatMessages((prev) => [...prev, { sender: "assistant" as const, text: response }]);
    }, 600);
  };

  // Mock navigation logout
  const handleLogout = () => {
    safeLocalStorage.removeItem("weather_user");
    safeLocalStorage.removeItem("weather_phone");
    safeLocalStorage.removeItem("weather_host");
    setUsername("Guest");
    addConsoleLog("Session terminated. User logged out.");
    setViewState("login");
  };



  // Mock signup/forgot actions
  const handleMockInfo = (msg: string) => {
    alert(msg);
  };

  return (
    <div>
      {/* 1. Splash Screen View */}
      {viewState === "splash" && (
        <div className="splash-overlay">
          <div className="splash-spinner"></div>
          <h1 style={{ fontSize: "2.4rem", fontWeight: 800, marginBottom: "0.5rem" }}>
            WEATHER MONITOR
          </h1>
          <p style={{ color: "var(--text-secondary)", letterSpacing: "0.05em", fontSize: "0.95rem" }}>
            Initializing client telemetry node...
          </p>
        </div>
      )}

      {/* 2. Welcome Landing Screen View (Replaces Login Screen) */}
      {viewState === "login" && (() => {
        const slides = [
          {
            title: "Real-time Telemetry Hub",
            desc: "Aggregating weather sensor inputs from the base station across the local LAN.",
            visual: (
              <svg viewBox="0 0 100 100" width="100%" height="120" style={{ overflow: "visible" }}>
                <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(0, 210, 255, 0.15)" strokeWidth="1" />
                <circle cx="50" cy="50" r="25" fill="none" stroke="rgba(0, 210, 255, 0.1)" strokeWidth="1" />
                <circle cx="50" cy="50" r="10" fill="none" stroke="rgba(0, 210, 255, 0.08)" strokeWidth="1" />
                <line x1="50" y1="50" x2="50" y2="10" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" style={{
                  transformOrigin: "50px 50px",
                  animation: "spin 4s linear infinite"
                }} />
                <circle cx="30" cy="35" r="2" fill="var(--color-success)" style={{ animation: "flash-dot 1.5s infinite" }} />
                <circle cx="75" cy="45" r="2.5" fill="var(--color-primary)" style={{ animation: "flash-dot 1.5s infinite", animationDelay: "0.5s" }} />
                <circle cx="45" cy="70" r="2" fill="var(--color-danger)" style={{ animation: "flash-dot 1.5s infinite", animationDelay: "1s" }} />
                <circle cx="50" cy="50" r="4" fill="#ffffff" />
                <style>{`
                  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                  @keyframes flash-dot { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
                `}</style>
              </svg>
            )
          },
          {
            title: "15-Min Prediction Engine",
            desc: "Running advanced XGBoost regressors for short-term forecast estimations.",
            visual: (
              <svg viewBox="0 0 120 80" width="100%" height="120" style={{ overflow: "visible" }}>
                <g stroke="rgba(0, 210, 255, 0.2)" strokeWidth="1">
                  <line x1="20" y1="40" x2="60" y2="20" />
                  <line x1="20" y1="40" x2="60" y2="60" />
                  <line x1="60" y1="20" x2="100" y2="15" />
                  <line x1="60" y1="20" x2="100" y2="35" />
                  <line x1="60" y1="60" x2="100" y2="55" />
                  <line x1="60" y1="60" x2="100" y2="75" />
                </g>
                <circle cx="20" cy="40" r="4" fill="var(--color-primary)" />
                <circle cx="60" cy="20" r="5" fill="var(--color-primary-glow)" />
                <circle cx="60" cy="60" r="5" fill="var(--color-primary-glow)" />
                <circle cx="100" cy="15" r="3" fill="var(--color-success)" />
                <circle cx="100" cy="35" r="3" fill="var(--color-success)" />
                <circle cx="100" cy="55" r="3" fill="var(--color-success)" />
                <circle cx="100" cy="75" r="3" fill="var(--color-success)" />
                <text x="25" y="44" fill="#ffffff" fontSize="5" fontFamily="monospace">Current</text>
                <text x="65" y="24" fill="var(--text-secondary)" fontSize="5" fontFamily="monospace">XGB1</text>
                <text x="65" y="64" fill="var(--text-secondary)" fontSize="5" fontFamily="monospace">XGB2</text>
                <text x="106" y="18" fill="var(--color-success)" fontSize="5" fontFamily="monospace">Temp +15m</text>
                <text x="106" y="58" fill="var(--color-success)" fontSize="5" fontFamily="monospace">Humid +15m</text>
              </svg>
            )
          },
          {
            title: "Broadcast Alerts Overlay",
            desc: "Receiving emergency safety advisories and real-time push warnings instantly.",
            visual: (
              <svg viewBox="0 0 100 100" width="100%" height="120" style={{ overflow: "visible" }}>
                <circle cx="50" cy="60" r="10" fill="none" stroke="var(--color-danger)" strokeWidth="1.5">
                  <animate attributeName="r" values="10;40" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="1;0" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle cx="50" cy="60" r="10" fill="none" stroke="var(--color-danger)" strokeWidth="1" style={{ animationDelay: "0.8s" }}>
                  <animate attributeName="r" values="10;40" dur="2s" begin="0.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="1;0" dur="2s" begin="0.8s" repeatCount="indefinite" />
                </circle>
                <path d="M45,85 L48,55 L52,55 L55,85 Z" fill="rgba(255,255,255,0.15)" stroke="var(--border-color)" strokeWidth="1" />
                <circle cx="50" cy="53" r="5" fill="var(--color-danger)" />
              </svg>
            )
          }
        ];

        return (
          <div className="login-overlay" style={{ background: "radial-gradient(circle at center, rgba(10,18,40,0.94) 0%, rgba(3,5,15,0.98) 100%)" }}>
            <div className="login-card" style={{ maxWidth: "800px", padding: "0", display: "grid", gridTemplateColumns: "1.2fr 1fr", overflow: "hidden", border: "1px solid rgba(0, 210, 255, 0.15)" }}>

              {/* Left Column: Image Slideshow */}
              <div style={{ background: "rgba(0,0,0,0.3)", padding: "2.5rem 1.5rem", borderRight: "1px solid var(--border-color)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                <div style={{ width: "100%", height: "130px", display: "flex", justifyContent: "center", alignItems: "center", marginBottom: "1.25rem" }}>
                  {slides[activeSlide].visual}
                </div>
                <div style={{ textAlign: "center", minHeight: "75px" }}>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--color-primary)", marginBottom: "0.4rem" }}>
                    {slides[activeSlide].title}
                  </h3>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: "1.4", padding: "0 0.5rem" }}>
                    {slides[activeSlide].desc}
                  </p>
                </div>

                {/* Slideshow Dots */}
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem" }}>
                  {slides.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveSlide(idx)}
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        border: "none",
                        backgroundColor: idx === activeSlide ? "var(--color-primary)" : "rgba(255,255,255,0.15)",
                        boxShadow: idx === activeSlide ? "0 0 6px var(--color-primary)" : "none",
                        cursor: "pointer",
                        transition: "all 0.3s"
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Right Column: Welcome and Enter Button */}
              <div style={{ padding: "2.5rem 2rem", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
                <div style={{ fontSize: "2.8rem", marginBottom: "0.5rem" }}>📡</div>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#ffffff", background: "none", WebkitTextFillColor: "initial", margin: "0 0 0.4rem 0", lineHeight: "1.2" }}>
                  Weather Portal
                </h1>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem", margin: "0 0 1.5rem 0", lineHeight: "1.4" }}>
                  Welcome to the Intelligent Weather Monitoring and Forecasting System
                </p>

                {/* Connection Status Badge */}
                <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.35rem 0.75rem", borderRadius: "20px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-color)", marginBottom: "1.5rem", fontSize: "0.75rem" }}>
                  <span className="status-dot" style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor: socketStatus === "CONNECTED" ? "var(--color-success)" : "var(--color-warning)",
                    boxShadow: socketStatus === "CONNECTED" ? "0 0 6px var(--color-success)" : "0 0 6px var(--color-warning)",
                    animation: socketStatus === "CONNECTED" ? "pulse 2s infinite" : "none"
                  }}></span>
                  <span style={{ color: socketStatus === "CONNECTED" ? "#ffffff" : "var(--text-secondary)", fontWeight: 600 }}>
                    {socketStatus === "CONNECTED" ? "Base Station Online" : "Connecting to base..."}
                  </span>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (username.trim()) {
                      safeLocalStorage.setItem("weather_user", username.trim());
                      safeLocalStorage.removeItem("weather_phone");
                      safeLocalStorage.removeItem("weather_host");
                      setViewState("dashboard");
                      // Reconnect to websocket immediately
                      connect();
                      addConsoleLog(`Session initialized for user: ${username.trim()}`);
                    } else {
                      alert("Please enter a valid profile name.");
                    }
                  }}
                  style={{ width: "100%", display: "flex", flexDirection: "column", gap: "1rem" }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", textAlign: "left", width: "100%" }}>
                    <label style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 600 }}>Enter Profile Name:</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Abhijit"
                      value={username === "Guest" ? "" : username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      style={{ width: "100%" }}
                    />
                  </div>

                  {/* Phone alert input field removed */}

                  {/* Base station host IP customization input removed */}

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{
                      width: "100%",
                      padding: "0.85rem",
                      fontSize: "0.92rem",
                      borderRadius: "12px",
                      boxShadow: "0 0 15px var(--color-primary-glow)",
                      letterSpacing: "0.02em"
                    }}
                  >
                    Launch Telemetry Console
                  </button>
                </form>
              </div>

            </div>
          </div>
        );
      })()}

      {(viewState === "dashboard" || viewState === "profile") && (
        <>
          <div className={`drawer-overlay ${drawerOpen ? "open" : ""}`} onClick={() => setDrawerOpen(false)}></div>

          <div className={`sidebar-drawer ${drawerOpen ? "open" : ""}`}>
            <div>
              {/* Profile Card inside drawer */}
              <div className="drawer-profile">
                <div className="drawer-avatar">{username ? username.charAt(0).toUpperCase() : "G"}</div>
                <h3 style={{ color: "#ffffff", fontSize: "1.1rem" }}>{username}</h3>
                <span style={{ color: "var(--text-dim)", fontSize: "0.78rem", fontFamily: "monospace" }}>ID: {clientId}</span>
              </div>

              {/* Menu items */}
              <ul className="drawer-menu">
                <li className={`drawer-item ${viewState === "dashboard" ? "active" : ""}`} onClick={() => { setViewState("dashboard"); setDrawerOpen(false); }}>
                  <span>📊</span> Dashboard Portal
                </li>
                <li className={`drawer-item ${viewState === "profile" ? "active" : ""}`} onClick={() => { setViewState("profile"); setDrawerOpen(false); }}>
                  <span>👤</span> Profile Details
                </li>

                <li style={{ borderTop: "1px solid var(--border-color)", margin: "0.8rem 0", padding: "0.8rem 0" }}>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 600, paddingLeft: "1.25rem", marginBottom: "0.4rem" }}>
                    RATE THIS WORK
                  </div>
                  <div style={{ paddingLeft: "1.25rem" }}>
                    <div className="rating-container">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          className={`star-btn ${rating >= star ? "active" : ""}`}
                          onClick={() => handleRate(star)}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>
                </li>

                <li style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: "1.25rem", marginTop: "0.5rem" }}>
                  <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                    DARK MODE
                  </span>
                  <input
                    type="checkbox"
                    checked={darkMode}
                    onChange={(e) => {
                      setDarkMode(e.target.checked);
                      addConsoleLog(`Theme switched: ${e.target.checked ? "Dark Mode" : "Light Mode (Standard)"}`);
                    }}
                    style={{ cursor: "pointer", marginRight: "1.25rem" }}
                  />
                </li>
              </ul>
            </div>

            <button className="btn btn-secondary" style={{ width: "100%" }} onClick={handleLogout}>
              🚪 Logout Node
            </button>
          </div>
        </>
      )}

      {/* Main Views Container */}
      {(viewState === "dashboard" || viewState === "profile") && (
        <>
          <WeatherParticles status={weather ? weather.status : "Clear"} />
          <div className="container" style={{ filter: darkMode ? "none" : "invert(0.9) hue-rotate(180deg)", transition: "filter 0.3s" }}>

            {/* Header with hamburger menu */}
            <header>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <button className="hamburger-btn" onClick={() => setDrawerOpen(true)}>☰</button>
                <div>
                  <h1> Dashboard</h1>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginTop: "0.25rem" }}>
                    Node Host: <span style={{ color: "#ffffff", fontWeight: 600 }}>{nodeIp}</span> |
                    ID: <span style={{ color: "var(--color-primary)", fontWeight: 600 }}>{clientId}</span>
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                {weather?.arduino_connected && (
                  <div className="status-badge" style={{ borderColor: "var(--color-success)", background: "rgba(16, 185, 129, 0.08)", color: "var(--color-success)" }}>
                    <span className="status-dot online" style={{ background: "var(--color-success)", boxShadow: "0 0 8px var(--color-success)" }}></span>
                    <span>Live USB Sensor Feed</span>
                  </div>
                )}
                <div className="status-badge">
                  <span className={`status-dot ${socketStatus === "CONNECTED" ? "online" : "offline"}`}></span>
                  <span>{socketStatus === "CONNECTED" ? "CONNECTED TO BASE" : "OFFLINE"}</span>
                </div>
              </div>
            </header>

            {/* Alarm full screen modal */}
            {currentAlert && currentAlert.severity === "danger" && !hasAcknowledgedDanger && (
              <div className="overlay-alarm">
                <div className="alarm-box">
                  <div className="alarm-icon">🚨</div>
                  <div className="alarm-title">{currentAlert.title}</div>
                  <div className="alarm-message">{currentAlert.message}</div>
                  <button
                    className="btn btn-danger"
                    style={{ padding: "1rem 2rem", fontSize: "1.1rem" }}
                    onClick={acknowledgeEmergency}
                  >
                    Acknowledge Alert & Mute
                  </button>
                </div>
              </div>
            )}

            {/* Alert notifications opt-in bar */}
            {viewState === "dashboard" && notificationPermission === "default" && !alertsMuted && (
              <div className="permission-box card">
                <div className="permission-text">
                  <h4>Enable Live Push Alerts?</h4>
                  <p>Allow browser notifications to receive critical safety alerts from the Base Station.</p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="btn btn-secondary" onClick={() => setNotificationPermission("denied")}>Block</button>
                  <button className="btn btn-primary" onClick={requestNotificationPermission}>Enable Alerts</button>
                </div>
              </div>
            )}

            {/* Dashboard Main Telemetry View (Original inside kept same) */}
            {viewState === "dashboard" && (
              <>
                {/* Scrolling News Ticker */}
                {news.length > 0 && (
                  <div className="news-ticker-container">
                    <div className="news-ticker-label">News Flash</div>
                    <div className="news-marquee-wrapper">
                      <div className="news-marquee-content">
                        {[...news, ...news].map((item, idx) => (
                          <span key={`${item.id}-${idx}`} className={`ticker-item ${item.category === "SEVERE" ? "severe-bullet" : ""}`}>
                            <span className="bullet"></span>
                            <strong style={{ color: item.category === "SEVERE" ? "var(--color-danger)" : "var(--color-primary)" }}>
                              [{item.category}]
                            </strong>{" "}
                            {item.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {currentAlert && (
                  <div className={`client-alert-banner ${currentAlert.severity}`}>
                    <div style={{ fontSize: "1.5rem", lineHeight: "1" }}>⚠️</div>
                    <div className="alert-content">
                      <h3>{currentAlert.title}</h3>
                      <p>{currentAlert.message}</p>
                    </div>
                  </div>
                )}

                {/* Grid: circular dials & compass/forecast */}
                <div className="grid-main" style={{ gridTemplateColumns: "1.7fr 1fr", marginBottom: "1.5rem" }}>

                  {/* Left Side: Gauges */}
                  <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                      <h2>Live Telemetry Gauges</h2>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>SVG Smooth Handshakes</span>
                    </div>

                    <div className="gauges-container">
                      {/* Temp Gauge */}
                      <div className="gauge-box">
                        <svg width="150" height="150" className="gauge-svg">
                          <circle cx="75" cy="75" r="60" className="gauge-bg-circle" />
                          <circle
                            cx="75"
                            cy="75"
                            r="60"
                            className="gauge-value-circle"
                            stroke="url(#tempGrad)"
                            strokeDasharray={`${2 * Math.PI * 60}`}
                            strokeDashoffset={getStrokeDashoffset(weather ? weather.temperature : 0, 50)}
                          />
                          <defs>
                            <linearGradient id="tempGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="var(--color-primary)" />
                              <stop offset="100%" stopColor="var(--color-danger)" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="gauge-text">
                          <span className="gauge-number">
                            {weather ? weather.temperature.toFixed(1) : "--.-"}
                          </span>
                          <span className="gauge-unit">°C</span>
                        </div>
                        <span className="gauge-label">Temperature</span>
                      </div>

                      {/* Humidity Gauge */}
                      <div className="gauge-box">
                        <svg width="150" height="150" className="gauge-svg">
                          <circle cx="75" cy="75" r="60" className="gauge-bg-circle" />
                          <circle
                            cx="75"
                            cy="75"
                            r="60"
                            className="gauge-value-circle"
                            stroke="url(#humGrad)"
                            strokeDasharray={`${2 * Math.PI * 60}`}
                            strokeDashoffset={getStrokeDashoffset(weather ? weather.humidity : 0, 100)}
                          />
                          <defs>
                            <linearGradient id="humGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="var(--color-primary)" />
                              <stop offset="100%" stopColor="var(--color-success)" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="gauge-text">
                          <span className="gauge-number">
                            {weather ? weather.humidity : "--"}
                          </span>
                          <span className="gauge-unit">%</span>
                        </div>
                        <span className="gauge-label">Humidity</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Icons, Wind Compass & 15-Minute Forecast */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

                    {/* Condition Card */}
                    <div className="card" style={{ display: "flex", alignItems: "center", gap: "1.25rem", padding: "1.2rem" }}>
                      <div style={{ background: "rgba(0,0,0,0.2)", padding: "0.6rem", borderRadius: "14px", display: "flex", justifyContent: "center", alignItems: "center" }}>
                        {renderWeatherIcon()}
                      </div>
                      <div>
                        <div className="metric-label" style={{ marginBottom: "0.1rem", fontSize: "0.78rem" }}>Current Status</div>
                        <h2 style={{ margin: 0, fontSize: "1.3rem", textTransform: "capitalize" }}>
                          {weather ? weather.status : "Connecting..."}
                        </h2>
                      </div>
                    </div>

                    {/* Wind Compass */}
                    <div className="card" style={{ display: "flex", alignItems: "center", gap: "1.25rem", padding: "1.2rem" }}>
                      <div style={{ position: "relative", width: "60px", height: "60px", background: "rgba(0,0,0,0.25)", borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", border: "1px solid var(--border-color)" }}>
                        <div style={{ position: "absolute", fontSize: "8px", fontWeight: "bold", top: "1px", color: "var(--text-dim)" }}>N</div>
                        <div style={{ position: "absolute", fontSize: "8px", fontWeight: "bold", bottom: "1px", color: "var(--text-dim)" }}>S</div>
                        <svg
                          viewBox="0 0 24 24"
                          width="26"
                          height="26"
                          style={{
                            transform: `rotate(${getWindRotation(weather?.wind_dir)}deg)`,
                            transition: "transform 1.2s cubic-bezier(0.4, 0, 0.2, 1)",
                            transformOrigin: "center"
                          }}
                        >
                          <polygon points="12,2 17,21 12,16 7,21" fill="var(--color-primary)" />
                        </svg>
                      </div>

                      <div>
                        <div className="metric-label" style={{ marginBottom: "0.1rem", fontSize: "0.78rem" }}>Wind Speed</div>
                        <h2 style={{ margin: 0, fontSize: "1.3rem" }}>
                          {weather ? `${weather.wind_speed.toFixed(1)} m/s` : "--.-"}
                        </h2>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "1px" }}>
                          Vector: <strong style={{ color: "var(--color-primary)" }}>{weather ? weather.wind_dir : "--"}</strong>
                        </p>
                      </div>
                    </div>

                    {/* 15-Minute Forecast Predictions (Workflow flowchart item) */}
                    <div className="card" style={{ padding: "1.2rem", background: "linear-gradient(135deg, rgba(0,210,255,0.05) 0%, rgba(18,24,41,0.7) 100%)", border: "1px solid rgba(0, 210, 255, 0.15)" }}>
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
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontSize: "1.1rem", fontWeight: "bold" }}>{forecast.temp}°C</div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Temperature</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "1.1rem", fontWeight: "bold" }}>{forecast.hum}%</div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Humidity</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "0.95rem", fontWeight: "bold", color: "#ffffff", textTransform: "capitalize" }}>{forecast.status}</div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Expected Status</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detailed 24-Hour & 7-Day Forecast Grid */}
                {forecastData && (
                  <div className="card" style={{ marginBottom: "1.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                      <div>
                        <h2>Meteorological Projections & Forecast Grid</h2>
                        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
                          Aggregated 24-hour hourly projections and 7-day cyclical meteorological trend matrices.
                        </p>
                      </div>
                    </div>

                    <div className="forecast-section">
                      <div>
                        <h3 style={{ fontSize: "1rem", color: "var(--color-primary)", marginBottom: "0.75rem", fontWeight: 600 }}>24-Hour Hourly Outlook</h3>
                        <div className="hourly-container">
                          {forecastData.hourly.map((h: any, idx: number) => (
                            <div key={idx} className="hourly-card">
                              <span className="hourly-time">{h.time}</span>
                              <span className="hourly-temp">{h.temp}°C</span>
                              <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "capitalize" }}>{h.status}</span>
                              <span className="hourly-pop">💧 {h.humidity}%</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h3 style={{ fontSize: "1rem", color: "var(--color-primary)", marginBottom: "0.75rem", fontWeight: 600 }}>7-Day Meteorological Outlook</h3>
                        <div className="daily-list">
                          {forecastData.daily.map((d: any, idx: number) => (
                            <div key={idx} className="daily-row">
                              <span className="daily-day">{d.day}</span>
                              <div className="daily-status-container">
                                <span>💧 {d.rainChance}% rain</span>
                                <span style={{ textTransform: "capitalize" }}>({d.status})</span>
                              </div>
                              <span className="daily-rain-chance">Hum: {d.humidity}%</span>
                              <div className="daily-temps">
                                <span className="daily-temp-max">{d.maxTemp}°C</span>
                                <span className="daily-temp-min">{d.minTemp}°C</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Live Broadcast & bulletins section */}
                <div className="card" style={{ marginBottom: "1.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                    <div>
                      <h2>Live Weather Center & Broadcast Hub</h2>
                      <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
                        Watch live local radar streams, emergency forecasts, and review active station bulletins.
                      </p>
                    </div>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-dim)", fontWeight: 600 }}>Aggregated bulletins ({news.length})</span>
                  </div>

                  <div className="dashboard-news-section">
                    {/* Left Column: Procedural Weather Radar Visualizer */}
                    <div>
                      <div style={{ position: "relative" }}>
                        <div className="live-feed-badge">
                          <span className="live-feed-dot"></span>
                          LIVE RADAR SCAN
                        </div>
                        <WeatherRadar status={weather ? weather.status : "Clear Skies"} />
                      </div>
                    </div>

                    {/* Right Column: Latest news list */}
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <h3 style={{ fontSize: "1.05rem", marginBottom: "0.75rem", color: "#ffffff", fontWeight: 600 }}>
                        Latest News & Bulletins
                      </h3>
                      {news.length === 0 ? (
                        <div style={{ textAlign: "center", color: "var(--text-dim)", padding: "4rem 0", fontSize: "0.85rem", background: "rgba(0,0,0,0.15)", borderRadius: "12px", border: "1px dashed var(--border-color)", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                          No active weather news bulletins. Connecting to base station feeds...
                        </div>
                      ) : (
                        <div className="dashboard-news-list">
                          {news.map((item) => (
                            <div
                              key={item.id}
                              className={`dashboard-news-item ${item.category.toLowerCase()}`}
                              onClick={() => setSelectedNews(item)}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                                <span className={`category-badge ${item.category.toLowerCase()}`} style={{ fontSize: "0.62rem", padding: "0.15rem 0.45rem" }}>
                                  {item.category}
                                </span>
                                <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                                  {item.timeAgo || "Recent"}
                                </span>
                              </div>
                              <h4 style={{ fontSize: "0.95rem", color: "#ffffff", fontWeight: 700, marginBottom: "0.25rem", lineHeight: "1.3" }}>
                                {item.title}
                              </h4>
                              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: "1.4" }}>
                                {item.summary}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Alert Preferences Settings */}
                <div className="card" style={{ marginBottom: "1.5rem", background: "linear-gradient(135deg, rgba(255,255,255,0.01) 0%, rgba(18,24,41,0.6) 100%)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
                    <div>
                      <h2>Alert Preferences</h2>
                      <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
                        Mute or unmute real-time alarms and push alerts for this session.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.25rem" }}>
                    <div style={{ background: "rgba(0,0,0,0.2)", padding: "1.2rem", borderRadius: "12px", border: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
                      <div>
                        <h4 style={{ fontSize: "0.9rem", color: alertsMuted ? "var(--color-warning)" : "var(--color-primary)", marginBottom: "0.25rem" }}>
                          {alertsMuted ? "🔕 ALERTS MUTED" : "🔔 ALERTS ACTIVE"}
                        </h4>
                        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: 0 }}>
                          {alertsMuted
                            ? "Sound chimes and browser push alerts are silenced."
                            : "You will receive sound chimes and browser push alerts."}
                        </p>
                      </div>

                      <button
                        onClick={toggleMute}
                        className={`btn ${alertsMuted ? "btn-primary" : "btn-secondary"}`}
                        style={{ padding: "0.5rem 1rem", fontSize: "0.85rem", whiteSpace: "nowrap" }}
                      >
                        {alertsMuted ? "Unmute Alerts" : "Mute Alerts"}
                      </button>
                    </div>
                  </div>
                </div>



                {/* Logs card */}
                <div className="grid-main" style={{ gridTemplateColumns: "1.2fr 1fr" }}>
                  <div className="card" style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                      <h2>Connection Log Console</h2>
                      <a
                        href={`http://${nodeIp}:8000/api/logs/download`}
                        className="db-download-btn"
                        download
                      >
                        📥 Download Telemetry Logs (CSV)
                      </a>
                    </div>
                    <div style={{ background: "rgba(0,0,0,0.35)", borderRadius: "10px", padding: "1rem", fontFamily: "monospace", fontSize: "0.85rem", height: "135px", overflowY: "auto", border: "1px solid rgba(255,255,255,0.05)", flex: 1 }}>
                      {consoleLogs.map((log, idx) => (
                        <div key={idx} style={{ marginBottom: "3px" }}>{log}</div>
                      ))}
                    </div>
                  </div>

                  <div className="card" style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem", minHeight: "34px" }}>
                      <h2>Advisory Broadcast History</h2>
                    </div>
                    <div style={{ height: "135px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1 }}>
                      {alertLogs.length === 0 ? (
                        <div style={{ color: "var(--text-dim)", fontSize: "0.85rem", textAlign: "center", paddingTop: "2.5rem" }}>
                          No past alerts in this session.
                        </div>
                      ) : (
                        alertLogs.map((log, idx) => (
                          <div key={idx} style={{ background: "rgba(255,255,255,0.02)", padding: "0.5rem 0.75rem", borderRadius: "8px", borderLeft: `3px solid var(--color-${log.severity})`, fontSize: "0.8rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                              <span style={{ color: `var(--color-${log.severity})` }}>{log.title}</span>
                              <span style={{ color: "var(--text-dim)" }}>{log.time}</span>
                            </div>
                            <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginTop: "2px" }}>{log.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* 4. Profile View */}
            {viewState === "profile" && (
              <div className="card" style={{ animation: "zoomIn 0.3s ease" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                  <h2>User Profile Details</h2>
                  <button className="btn btn-secondary" onClick={() => setViewState("dashboard")}>← Back to Portal</button>
                </div>

                <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", alignItems: "center", padding: "1rem 0" }}>
                  <div style={{ width: "90px", height: "90px", borderRadius: "50%", background: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-glow) 100%)", border: "3px solid var(--color-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3rem", color: "#020617", fontWeight: "bold" }}>
                    {username ? username.charAt(0).toUpperCase() : "G"}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <h3 style={{ fontSize: "1.6rem" }}>{username}</h3>
                    <p style={{ color: "var(--text-secondary)" }}>Base Station Client Node Administrator</p>
                    <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Logged in via client dashboard portal</p>
                  </div>
                </div>

                <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--border-color)", paddingTop: "1.5rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem" }}>
                  <div style={{ background: "rgba(0,0,0,0.15)", padding: "1.25rem", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
                    <div className="metric-label" style={{ fontSize: "0.75rem" }}>SYSTEM CONTACT</div>
                    <strong style={{ fontSize: "1.05rem" }}>abhijit.weather@lan.local</strong>
                  </div>
                  <div style={{ background: "rgba(0,0,0,0.15)", padding: "1.25rem", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
                    <div className="metric-label" style={{ fontSize: "0.75rem" }}>ASSIGNED CLIENT ID</div>
                    <strong style={{ fontSize: "1.05rem", fontFamily: "monospace", color: "var(--color-primary)" }}>{clientId}</strong>
                  </div>
                  <div style={{ background: "rgba(0,0,0,0.15)", padding: "1.25rem", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
                    <div className="metric-label" style={{ fontSize: "0.75rem" }}>BASE STATION GATEWAY</div>
                    <strong style={{ fontSize: "1.05rem" }}>{nodeIp}:8000</strong>
                  </div>
                  <div style={{ background: "rgba(0,0,0,0.15)", padding: "1.25rem", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
                    <div className="metric-label" style={{ fontSize: "0.75rem" }}>NODE STATUS</div>
                    <strong style={{ fontSize: "1.05rem", color: socketStatus === "CONNECTED" ? "var(--color-success)" : "var(--color-danger)" }}>
                      {socketStatus === "CONNECTED" ? "ACTIVE SOCKET" : "CONNECTION OFFLINE"}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {/* GPS Location coordinates View removed as per network host syncing cleanup */}

          </div>
        </>
      )}

      {/* Detailed News Modal Overlay */}
      {selectedNews && (
        <div className="news-modal-overlay" onClick={() => setSelectedNews(null)}>
          <div className="news-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="news-modal-close" onClick={() => setSelectedNews(null)}>×</button>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span className={`category-badge ${selectedNews.category.toLowerCase()}`}>
                {selectedNews.category}
              </span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                Source: {selectedNews.source}
              </span>
            </div>
            <h2 className="news-modal-title">{selectedNews.title}</h2>
            <div style={{ borderBottom: "1px solid var(--border-color)", marginBottom: "1.25rem" }}></div>
            <div className="news-modal-body">
              <p>{selectedNews.summary}</p>
              <p style={{ marginTop: "1rem", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                This bulletin is updated in real-time. For emergency assistance or detailed updates, contact your local meteorological station network coordinators.
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              {selectedNews.link && selectedNews.link !== "#" && (
                <a href={selectedNews.link} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ textDecoration: "none", display: "inline-block" }}>
                  View Full Coverage
                </a>
              )}
              <button className="btn btn-secondary" onClick={() => setSelectedNews(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Floating AI Weather Companion Widget */}
      {viewState !== "splash" && viewState !== "login" && (
        <div style={{ position: "fixed", bottom: "2rem", right: "2rem", zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>

          {/* Chat Window Panel */}
          {isChatOpen && (
            <div
              className="card ai-chat-card"
              style={{
                width: "350px",
                height: "450px",
                marginBottom: "1rem",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 15px 40px rgba(0, 210, 255, 0.25)",
                border: "1px solid rgba(0, 210, 255, 0.3)",
                animation: "slideInDown 0.3s ease-out"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.75rem", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "1.3rem" }}>🤖</span>
                  <div style={{ textAlign: "left" }}>
                    <h3 style={{ fontSize: "1rem", margin: 0 }}>AI Weather Companion</h3>
                    <span style={{ fontSize: "0.7rem", color: "var(--color-success)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <span className="status-dot online" style={{ width: "6px", height: "6px" }}></span> Online
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setIsChatOpen(false)}
                  style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: "1.2rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  ×
                </button>
              </div>

              <div className="ai-chat-messages" style={{ flexGrow: 1, overflowY: "auto" }}>
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`ai-message ${msg.sender}`}>
                    {msg.text}
                  </div>
                ))}
              </div>

              <form onSubmit={handleChatSubmit} className="ai-chat-form">
                <input
                  type="text"
                  className="ai-chat-input"
                  placeholder="Ask a question..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                />
                <button type="submit" className="ai-chat-send">
                  ➤
                </button>
              </form>
            </div>
          )}

          {/* Circular Floating Toggle Button */}
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, var(--color-primary) 0%, #0099ff 100%)",
              color: "#070a13",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.6rem",
              boxShadow: isChatOpen ? "0 0 20px var(--color-primary-glow)" : "0 8px 25px rgba(0, 210, 255, 0.4)",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              transform: isChatOpen ? "rotate(90deg)" : "none"
            }}
            title="AI Weather Companion"
          >
            {isChatOpen ? "✕" : "🤖"}
          </button>

        </div>
      )}
    </div>
  );
}
