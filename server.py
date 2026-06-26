import asyncio
import json
import random
import time
import os
import math
import joblib
import sqlite3
import pandas as pd
import numpy as np
import requests
import urllib.parse
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from typing import Dict, Set, Optional, Any, List
import socket
import threading
import re
import serial
import serial.tools.list_ports

# Database configurations for logging telemetry
MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(MODEL_DIR, "weather_station.db")

def init_db():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 1. Weather and Prediction Logs
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS weather_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL,
                temperature REAL,
                humidity INTEGER,
                pressure INTEGER,
                wind_speed REAL,
                wind_dir TEXT,
                status TEXT,
                predict_temp REAL,
                predict_humidity INTEGER
            )
        """)
        
        # Upgrade columns dynamically if table existed previously without them
        cursor.execute("PRAGMA table_info(weather_log)")
        existing_columns = [col[1] for col in cursor.fetchall()]
        if "predict_temp" not in existing_columns:
            cursor.execute("ALTER TABLE weather_log ADD COLUMN predict_temp REAL")
        if "predict_humidity" not in existing_columns:
            cursor.execute("ALTER TABLE weather_log ADD COLUMN predict_humidity INTEGER")
            
        # 2. Weather advisories and alerts log table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS alert_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL,
                title TEXT,
                message TEXT,
                severity TEXT
            )
        """)
        
        # 3. System event log table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS system_event_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL,
                event_type TEXT,
                message TEXT
            )
        """)
        
        conn.commit()
        conn.close()
        print("[DB OK] SQLite database initialized successfully with expanded schema.")
    except Exception as e:
        print(f"[DB ERROR] Failed to initialize database: {e}")

# Guarantee database and table initialization on module import
init_db()

def log_weather_to_db(w: dict):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO weather_log (timestamp, temperature, humidity, pressure, wind_speed, wind_dir, status, predict_temp, predict_humidity)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            w.get("timestamp", time.time()),
            w.get("temperature", 24.5),
            w.get("humidity", 62),
            w.get("pressure", 1012),
            w.get("wind_speed", 4.8),
            w.get("wind_dir", "NE"),
            w.get("status", "Clear"),
            w.get("predict_temp"),
            w.get("predict_humidity")
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[DB ERROR] Failed to log telemetry: {e}")

def log_alert_to_db(alert: dict):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO alert_log (timestamp, title, message, severity)
            VALUES (?, ?, ?, ?)
        """, (
            alert.get("timestamp", time.time()),
            alert.get("title", "Weather Advisory"),
            alert.get("message", ""),
            alert.get("severity", "info")
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[DB ERROR] Failed to log alert to db: {e}")

def log_system_event_to_db(event_type: str, message: str):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO system_event_log (timestamp, event_type, message)
            VALUES (?, ?, ?)
        """, (time.time(), event_type, message))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[DB ERROR] Failed to log system event to db: {e}")

# In-memory storage for active clients
# Format: { client_id: { "ws": WebSocket, "ip": str, "user_agent": str, "permission": str, "connected_at": float } }
connected_clients: Dict[str, dict] = {}
admin_connections: Set[WebSocket] = set()
manual_mode = False
custom_bulletins: List[Dict[str, Any]] = []
cached_rss_news: List[Dict[str, Any]] = []

# Scenario playlist configurations for automated demonstrations
SCENARIOS = {
    "monsoon_arrival": [
        {"status": "Clear Skies", "temp": 30.0, "humidity": 55, "pressure": 1013, "wind": 3.5, "alert": None, "duration": 15},
        {"status": "Partly Cloudy", "temp": 28.0, "humidity": 68, "pressure": 1009, "wind": 5.0, "alert": None, "duration": 15},
        {"status": "Overcast", "temp": 25.5, "humidity": 80, "pressure": 1004, "wind": 7.0, "alert": None, "duration": 15},
        {"status": "Rainy", "temp": 23.0, "humidity": 90, "pressure": 1001, "wind": 8.5, "alert": {"title": "🌧️ MONSOON HEAVY RAINFALL", "message": "Precipitation levels rising. Watch for low drainage blockages.", "severity": "info"}, "duration": 15},
        {"status": "Severe Storm", "temp": 20.5, "humidity": 98, "pressure": 988, "wind": 26.0, "alert": {"title": "⚡ TORNADO & SEVERE STORM WARNING", "message": "High-velocity storm cell active. Take indoor shelter immediately.", "severity": "danger"}, "duration": 21},
        {"status": "Overcast", "temp": 22.0, "humidity": 93, "pressure": 997, "wind": 9.0, "alert": {"title": "🌧️ Flood Advisory", "message": "Storm cleared. Brahmaputra river levels remain high.", "severity": "warning"}, "duration": 15},
        {"status": "Clear Skies", "temp": 27.0, "humidity": 72, "pressure": 1008, "wind": 4.5, "alert": None, "duration": 15}
    ],
    "heatwave_peak": [
        {"status": "Clear Skies", "temp": 33.0, "humidity": 45, "pressure": 1014, "wind": 2.5, "alert": None, "duration": 15},
        {"status": "Clear Skies", "temp": 38.0, "humidity": 28, "pressure": 1010, "wind": 4.0, "alert": {"title": "🔥 High Temperature Watch", "message": "Solar indexes climbing above seasonal norms.", "severity": "info"}, "duration": 15},
        {"status": "Extreme Heat", "temp": 42.5, "humidity": 18, "pressure": 1005, "wind": 6.0, "alert": {"title": "🔥 EXTREME HEAT ADVISORY", "message": "Ambient temperature reaches 42.5C. Hydrate and avoid sun exposure.", "severity": "warning"}, "duration": 21},
        {"status": "Partly Cloudy", "temp": 35.0, "humidity": 38, "pressure": 1008, "wind": 7.5, "alert": None, "duration": 15}
    ]
}

active_scenario: Optional[str] = None
scenario_step = 0
scenario_ticks = 0

# Current weather state
weather_state = {
    "temperature": 24.5,  # °C
    "humidity": 62,       # %
    "pressure": 1012,     # hPa
    "wind_speed": 4.8,    # m/s
    "wind_dir": "NE",
    "timestamp": time.time(),
    "status": "Clear",
    "alert": None,         # Active alert details, if any
    "predict_temp": 24.8,
    "predict_humidity": 61,
    "temp_model_loaded": False,
    "humidity_model_loaded": False,
    "arduino_connected": False,
    "pressure_fetched": False
}

# Real AI models configurations
MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
models = {}
weather_history = []

# Pre-populate weather history for immediate predictions at startup
def init_weather_history():
    global weather_history, weather_state
    now = time.time()
    for i in range(5, 0, -1):
        tick_time = now - i * 15
        weather_history.append({
            "temperature": round(weather_state["temperature"] + random.uniform(-0.4, 0.4), 1),
            "humidity": max(20, min(95, weather_state["humidity"] + random.randint(-2, 2))),
            "pressure": max(995, min(1025, weather_state["pressure"] + random.randint(-1, 1))),
            "wind_speed": round(max(0.5, min(12.0, weather_state["wind_speed"] + random.uniform(-0.3, 0.3))), 1),
            "wind_dir": weather_state["wind_dir"],
            "status": weather_state["status"],
            "timestamp": tick_time
        })
    print(f"[OK] Pre-populated weather history with {len(weather_history)} records.")

# Load joblib pickled XGBoost models
def load_models():
    global weather_state
    for name in ["temp", "humidity"]:
        filename = "temp_model.pkl" if name == "temp" else "humidity_model.pkl"
        path = os.path.join(MODEL_DIR, filename)
        
        # Fallback check for tem_model.pkl (user typo handle)
        if name == "temp" and not os.path.exists(path):
            fallback_path = os.path.join(MODEL_DIR, "tem_model.pkl")
            if os.path.exists(fallback_path):
                path = fallback_path
                
        if os.path.exists(path):
            try:
                models[name] = joblib.load(path)
                print(f"[OK] Loaded {name} AI model successfully.")
                if name == "temp":
                    weather_state["temp_model_loaded"] = True
                elif name == "humidity":
                    weather_state["humidity_model_loaded"] = True
            except Exception as e:
                print(f"[ERROR] Error loading {name} model: {e}")
        else:
            print(f"[WARN] {name} model file not found at: {path}")
            
    # Always pre-populate weather history at startup
    init_weather_history()

# Feature Engineering function matching the training setup exactly
def calculate_features(curr: Dict[str, Any], hist: List[Dict[str, Any]]) -> Optional[pd.DataFrame]:
    if len(hist) < 2:
        return None
    
    lag1 = hist[-1]
    lag2 = hist[-2]
    
    temp = float(curr["temperature"])
    temp_min = float(curr.get("temp_min", temp - 1.0))
    temp_max = float(curr.get("temp_max", temp + 1.0))
    humidity = float(curr["humidity"])
    pressure = float(curr["pressure"])
    wind = float(curr.get("wind_speed", 5.0))
    rain_1h = float(curr.get("rain_1h", 0.0))
    
    # Calculate clouds approximation based on weather status
    status_lower = curr.get("status", "").lower()
    clouds = 20.0
    if "clear" in status_lower:
        clouds = 10.0
    elif "cloud" in status_lower or "partly" in status_lower:
        clouds = 45.0
    elif "overcast" in status_lower:
        clouds = 85.0
    elif "storm" in status_lower:
        clouds = 95.0
    elif "rain" in status_lower:
        clouds = 75.0
        
    dt = datetime.fromtimestamp(curr["timestamp"])
    month = dt.month
    hour = dt.hour
    dayofyear = dt.timetuple().tm_yday
    dayofweek = dt.weekday()
    
    hour_sin = math.sin(hour * (2 * math.pi / 24))
    hour_cos = math.cos(hour * (2 * math.pi / 24))
    day_sin = math.sin(dayofyear * (2 * math.pi / 365.25))
    day_cos = math.cos(dayofyear * (2 * math.pi / 365.25))
    
    temp_lag1 = float(lag1["temperature"])
    temp_lag2 = float(lag2["temperature"])
    humidity_lag1 = float(lag1["humidity"])
    humidity_lag2 = float(lag2["humidity"])
    pressure_lag1 = float(lag1["pressure"])
    pressure_lag2 = float(lag2["pressure"])
    wind_lag1 = float(lag1.get("wind_speed", 5.0))
    wind_lag2 = float(lag2.get("wind_speed", 5.0))
    
    def get_clouds_from_status(status_str):
        s = status_str.lower()
        if "clear" in s: return 10.0
        if "cloud" in s or "partly" in s: return 45.0
        if "overcast" in s: return 85.0
        if "storm" in s: return 95.0
        if "rain" in s: return 75.0
        return 20.0
        
    clouds_lag1 = get_clouds_from_status(lag1.get("status", ""))
    clouds_lag2 = get_clouds_from_status(lag2.get("status", ""))
    rain_1h_lag1 = float(lag1.get("rain_1h", 0.0))
    rain_1h_lag2 = float(lag2.get("rain_1h", 0.0))
    
    temp_vals = [temp, temp_lag1, temp_lag2]
    humidity_vals = [humidity, humidity_lag1, humidity_lag2]
    pressure_vals = [pressure, pressure_lag1, pressure_lag2]
    wind_vals = [wind, wind_lag1, wind_lag2]
    
    temp_mean = float(np.mean(temp_vals))
    temp_std = float(np.std(temp_vals, ddof=1)) if len(set(temp_vals)) > 1 else 0.0
    
    humidity_mean = float(np.mean(humidity_vals))
    humidity_std = float(np.std(humidity_vals, ddof=1)) if len(set(humidity_vals)) > 1 else 0.0
    
    pressure_mean = float(np.mean(pressure_vals))
    pressure_std = float(np.std(pressure_vals, ddof=1)) if len(set(pressure_vals)) > 1 else 0.0
    
    wind_mean = float(np.mean(wind_vals))
    wind_std = float(np.std(wind_vals, ddof=1)) if len(set(wind_vals)) > 1 else 0.0
    
    feature_names = [
        'temp', 'temp_min', 'temp_max', 'humidity', 'pressure', 'wind', 'rain_1h', 'clouds',
        'month', 'hour', 'dayofyear', 'dayofweek', 'hour_sin', 'hour_cos', 'day_sin', 'day_cos',
        'temp_lag1', 'temp_lag2', 'humidity_lag1', 'humidity_lag2', 'pressure_lag1', 'pressure_lag2',
        'wind_lag1', 'wind_lag2', 'clouds_lag1', 'clouds_lag2', 'rain_1h_lag1', 'rain_1h_lag2',
        'temp_mean', 'temp_std', 'humidity_mean', 'humidity_std', 'pressure_mean', 'pressure_std',
        'wind_mean', 'wind_std'
    ]
    
    features_dict = {
        'temp': temp, 'temp_min': temp_min, 'temp_max': temp_max, 'humidity': humidity, 
        'pressure': pressure, 'wind': wind, 'rain_1h': rain_1h, 'clouds': clouds,
        'month': month, 'hour': hour, 'dayofyear': dayofyear, 'dayofweek': dayofweek,
        'hour_sin': hour_sin, 'hour_cos': hour_cos, 'day_sin': day_sin, 'day_cos': day_cos,
        'temp_lag1': temp_lag1, 'temp_lag2': temp_lag2, 
        'humidity_lag1': humidity_lag1, 'humidity_lag2': humidity_lag2,
        'pressure_lag1': pressure_lag1, 'pressure_lag2': pressure_lag2,
        'wind_lag1': wind_lag1, 'wind_lag2': wind_lag2,
        'clouds_lag1': clouds_lag1, 'clouds_lag2': clouds_lag2,
        'rain_1h_lag1': rain_1h_lag1, 'rain_1h_lag2': rain_1h_lag2,
        'temp_mean': temp_mean, 'temp_std': temp_std,
        'humidity_mean': humidity_mean, 'humidity_std': humidity_std,
        'pressure_mean': pressure_mean, 'pressure_std': pressure_std,
        'wind_mean': wind_mean, 'wind_std': wind_std
    }
    
    return pd.DataFrame([features_dict], columns=feature_names)

# Ingest current values into local history and call model predictions
def process_predictions():
    global weather_history, weather_state
    
    curr_reading = {
        "temperature": weather_state["temperature"],
        "humidity": weather_state["humidity"],
        "pressure": weather_state["pressure"],
        "wind_speed": weather_state["wind_speed"],
        "wind_dir": weather_state["wind_dir"],
        "status": weather_state["status"],
        "timestamp": weather_state["timestamp"]
    }
    
    # Append to rolling history
    weather_history.append(curr_reading)
    if len(weather_history) > 10:
        weather_history.pop(0)
        
    # Generate predictions if we have enough lags (at least 3 readings)
    if len(weather_history) >= 3:
        # Predict using history before current item
        df = calculate_features(curr_reading, weather_history[:-1])
        if df is not None:
            try:
                if "temp" in models:
                    pred_temp = float(models["temp"].predict(df)[0])
                    weather_state["predict_temp"] = float(round(pred_temp, 1))
                if "humidity" in models:
                    pred_hum = float(models["humidity"].predict(df)[0])
                    weather_state["predict_humidity"] = int(max(0.0, min(100.0, pred_hum)))
            except Exception as e:
                print(f"[ERROR] AI Prediction failed: {e}")
    else:
        # Fallback values during bootstrap phase
        weather_state["predict_temp"] = float(round(weather_state["temperature"] + 0.3, 1))
        weather_state["predict_humidity"] = int(max(10, min(100, weather_state["humidity"] - 1)))

serial_running = False
serial_thread = None

def run_serial_listener(loop):
    global weather_state, serial_running, manual_mode
    print("[Serial Listener] Background thread started.")
    
    while serial_running:
        try:
            ports = list(serial.tools.list_ports.comports())
            target_port = None
            
            # Find candidate ports
            for p in ports:
                desc = p.description.lower()
                if any(term in desc for term in ["arduino", "ch340", "usb serial", "ftdi", "prolific", "cp210"]):
                    target_port = p.device
                    break
            
            if not target_port and ports:
                target_port = ports[0].device
                
            if not target_port:
                if weather_state.get("arduino_connected"):
                    weather_state["arduino_connected"] = False
                    log_system_event_to_db("Sensor Connection", "Arduino unplugged (no serial ports found)")
                    asyncio.run_coroutine_threadsafe(broadcast_weather_data(), loop)
                # Wait and scan again
                for _ in range(5):
                    if not serial_running:
                        break
                    time.sleep(1)
                continue
                
            print(f"[Serial Listener] Attempting connection on port {target_port} at 9600 baud...")
            
            with serial.Serial(target_port, 9600, timeout=2) as ser:
                print(f"[Serial Listener] Connected to Arduino on {target_port}!")
                weather_state["arduino_connected"] = True
                log_system_event_to_db("Sensor Connection", f"Connected to Arduino on serial port {target_port}")
                asyncio.run_coroutine_threadsafe(broadcast_weather_data(), loop)
                
                temp_val = None
                hum_val = None
                wind_val = None
                
                while serial_running:
                    line_bytes = ser.readline()
                    if not line_bytes:
                        continue
                    
                    try:
                        line = line_bytes.decode('utf-8', errors='ignore').strip()
                    except Exception:
                        continue
                        
                    if not line:
                        continue
                        
                    updated = False
                    if "Temperature" in line:
                        match = re.search(r"Temperature\s*:\s*([\d\.]+)", line)
                        if match:
                            temp_val = float(match.group(1))
                            weather_state["temperature"] = temp_val
                            updated = True
                    elif "Humidity" in line:
                        match = re.search(r"Humidity\s*:\s*([\d\.]+)", line)
                        if match:
                            hum_val = float(match.group(1))
                            weather_state["humidity"] = hum_val
                            updated = True
                    elif "Wind Speed" in line:
                        match = re.search(r"Wind Speed\s*:\s*([\d\.]+)", line)
                        if match:
                            wind_val = round(float(match.group(1)) / 3.6, 2)
                            weather_state["wind_speed"] = wind_val
                            updated = True
                            
                    if updated:
                        if not manual_mode:
                            if hum_val is not None:
                                if hum_val > 85:
                                    weather_state["status"] = "Rainy"
                                elif hum_val > 70:
                                    weather_state["status"] = "Overcast"
                                elif hum_val > 50:
                                    weather_state["status"] = "Partly Cloudy"
                                else:
                                    weather_state["status"] = "Clear Skies"
                            weather_state["timestamp"] = time.time()
                            
                        # Schedule broadcast on event loop
                        asyncio.run_coroutine_threadsafe(broadcast_weather_data(), loop)
                        
        except (serial.SerialException, OSError) as e:
            print(f"[Serial Listener] Serial error: {e}")
            if weather_state.get("arduino_connected"):
                weather_state["arduino_connected"] = False
                log_system_event_to_db("Sensor Connection", f"Serial connection lost: {e}")
                asyncio.run_coroutine_threadsafe(broadcast_weather_data(), loop)
            # Wait before attempting reconnect
            for _ in range(5):
                if not serial_running:
                    break
                time.sleep(1)
                
    print("[Serial Listener] Background thread exiting.")

async def refresh_openweather_pressure_task():
    global weather_state, manual_mode
    api_key = "4bfe83d2ab6db5e747094dc33b29c4e5"
    city = "Dibrugarh"
    url = f"https://api.openweathermap.org/data/2.5/weather?q={city}&appid={api_key}"
    
    print("[OpenWeather] Real-time pressure monitoring task active.")
    
    while True:
        if not manual_mode:
            try:
                loop = asyncio.get_event_loop()
                response = await loop.run_in_executor(None, lambda: requests.get(url, timeout=15))
                if response.status_code == 200:
                    data = response.json()
                    pressure = data.get("main", {}).get("pressure")
                    if pressure is not None:
                        weather_state["pressure"] = int(pressure)
                        weather_state["pressure_fetched"] = True
                        print(f"[OpenWeather] Successfully fetched real-time pressure for {city}: {pressure} hPa")
                else:
                    print(f"[OpenWeather] Failed to fetch pressure. HTTP Code: {response.status_code}")
            except Exception as e:
                print(f"[OpenWeather] Network request error: {e}")
        
        await asyncio.sleep(300.0)

# Weather Data Simulator Background Task
async def weather_simulator_task():
    global weather_state, manual_mode
    directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    last_news_refresh = 0
    
    while True:
        now = time.time()
        if now - last_news_refresh > 300:
            last_news_refresh = now
            asyncio.create_task(refresh_news_feed())
            
        # Handle automated scenario playlist progression
        global active_scenario, scenario_step, scenario_ticks
        if active_scenario and active_scenario in SCENARIOS:
            manual_mode = False # Pause manual overrides
            playlist = SCENARIOS[active_scenario]
            if scenario_step < len(playlist):
                step_data = playlist[scenario_step]
                weather_state["status"] = step_data["status"]
                weather_state["temperature"] = step_data["temp"]
                weather_state["humidity"] = step_data["humidity"]
                weather_state["pressure"] = step_data["pressure"]
                weather_state["wind_speed"] = step_data["wind"]
                weather_state["alert"] = None if step_data["alert"] is None else {
                    "title": step_data["alert"]["title"],
                    "message": step_data["alert"]["message"],
                    "severity": step_data["alert"]["severity"],
                    "timestamp": time.time()
                }
                if weather_state["alert"]:
                    log_alert_to_db(weather_state["alert"])
                weather_state["timestamp"] = time.time()
                
                # Update tick counter (3 seconds elapsed per loop iteration)
                scenario_ticks += 3
                if scenario_ticks >= step_data["duration"]:
                    scenario_ticks = 0
                    scenario_step += 1
                    if scenario_step >= len(playlist):
                        scenario_step = 0
                        print(f"[Automation] Scenario '{active_scenario}' loop restarted.")
            else:
                active_scenario = None
            
            process_predictions()
            await broadcast_weather_data()
            await asyncio.sleep(3.0)
            continue
            
        if manual_mode:
            process_predictions()
            await broadcast_weather_data()
            await asyncio.sleep(3.0)
            continue
            
        if weather_state.get("arduino_connected"):
            # Defer simulation updates because the Arduino is streaming live hardware data!
            weather_state["timestamp"] = time.time()
            process_predictions()
            await broadcast_weather_data()
            await asyncio.sleep(3.0)
            continue
            
        active_alert = weather_state.get("alert")
        
        # Simulate weather based on alerts
        if active_alert and active_alert.get("severity") == "danger":
            weather_state["temperature"] = round(max(12.0, weather_state["temperature"] + random.uniform(-0.5, 0.1)), 1)
            weather_state["humidity"] = min(100, weather_state["humidity"] + random.randint(0, 3))
            if not weather_state.get("pressure_fetched"):
                weather_state["pressure"] = max(970, weather_state["pressure"] - random.randint(1, 4))
            weather_state["wind_speed"] = round(min(32.0, weather_state["wind_speed"] + random.uniform(0.5, 2.5)), 1)
            weather_state["status"] = "Severe Storm"
        elif active_alert and active_alert.get("severity") == "warning":
            if "Heat" in active_alert.get("title", ""):
                weather_state["temperature"] = round(min(45.0, weather_state["temperature"] + random.uniform(0.2, 0.6)), 1)
                weather_state["humidity"] = max(10, weather_state["humidity"] - random.randint(0, 2))
                weather_state["status"] = "Extreme Heat"
            else:
                weather_state["temperature"] = round(weather_state["temperature"] + random.uniform(-0.3, 0.3), 1)
                weather_state["wind_speed"] = round(min(18.0, weather_state["wind_speed"] + random.uniform(0.1, 1.0)), 1)
                weather_state["status"] = "Unsettled"
        else:
            weather_state["temperature"] = round(weather_state["temperature"] + random.uniform(-0.15, 0.15), 1)
            weather_state["temperature"] = max(8.0, min(38.0, weather_state["temperature"]))
            
            weather_state["humidity"] = max(20, min(95, weather_state["humidity"] + random.randint(-1, 1)))
            if not weather_state.get("pressure_fetched"):
                weather_state["pressure"] = max(995, min(1025, weather_state["pressure"] + random.randint(-1, 1)))
            weather_state["wind_speed"] = round(max(0.5, min(12.0, weather_state["wind_speed"] + random.uniform(-0.2, 0.2))), 1)
            
            if weather_state["humidity"] > 85:
                weather_state["status"] = "Rainy"
            elif weather_state["humidity"] > 70:
                weather_state["status"] = "Overcast"
            elif weather_state["humidity"] > 50:
                weather_state["status"] = "Partly Cloudy"
            else:
                weather_state["status"] = "Clear Skies"
        
        if random.random() < 0.15:
            weather_state["wind_dir"] = random.choice(directions)
            
        weather_state["timestamp"] = time.time()
        
        # Calculate AI predictions
        process_predictions()
        
        # Broadcast new measurements
        await broadcast_weather_data()
        await asyncio.sleep(3.0)
# Helper to broadcast weather packet
async def broadcast_weather_data():
    log_weather_to_db(weather_state)
    packet = {
        "type": "weather",
        "data": weather_state,
        "manualMode": manual_mode,
        "forecast": generate_forecast_projections(weather_state),
        "scenario": {
            "active": active_scenario is not None,
            "name": active_scenario,
            "step": scenario_step,
            "ticks": scenario_ticks,
            "totalSteps": len(SCENARIOS[active_scenario]) if active_scenario in SCENARIOS else 0
        }
    }
    message = json.dumps(packet)
    
    for cid, cinfo in list(connected_clients.items()):
        try:
            await cinfo["ws"].send_text(message)
        except Exception:
            pass
            
    for ws in list(admin_connections):
        try:
            await ws.send_text(message)
        except Exception:
            pass

# Helper to push client lists to admin console
async def notify_admins_of_clients():
    clients_list = []
    for cid, cinfo in connected_clients.items():
        clients_list.append({
            "id": cid,
            "ip": cinfo["ip"],
            "user_agent": cinfo["user_agent"],
            "permission": cinfo["permission"],
            "connected_at": cinfo["connected_at"]
        })
        
    message = json.dumps({
        "type": "client_list",
        "clients": clients_list
    })
    
    for ws in list(admin_connections):
        try:
            await ws.send_text(message)
        except Exception:
            pass

# News Generation and Fetching Helpers
def generate_local_news(weather: Dict[str, Any]) -> List[Dict[str, Any]]:
    now_ts = time.time()
    status = str(weather.get("status", "")).lower()
    temp = weather.get("temperature", 24.5)
    wind = weather.get("wind_speed", 4.8)
    
    news = []
    
    # 1. Brahmaputra Hydrology Bulletin
    is_severe = "storm" in status or "rain" in status
    news.append({
        "id": "local-hydro-1",
        "title": "Brahmaputra Flood Hydrology Station reports rising baseline limits",
        "summary": "Water level monitors in Upper Assam record a slight increase in water volume inputs. IMD and local emergency disaster units advising caution for agricultural settlements near the Brahmaputra lowlands.",
        "category": "SEVERE" if is_severe else "LOCAL",
        "source": "Dibrugarh Center",
        "timestamp": now_ts - 3600,
        "timeAgo": "1 hour ago",
        "link": "#"
    })
    
    # 2. Tea Garden Bulletin
    news.append({
        "id": "local-tea-2",
        "title": "Dibrugarh Tea Gardens predict high quality tea yields",
        "summary": "Mild summer conditions and optimal atmospheric moisture percentages indicate ideal leaf harvests. Crop managers report record growth cycles for quality CTC and orthodox tea varieties this quarter.",
        "category": "LOCAL",
        "source": "Assam Agri-News",
        "timestamp": now_ts - 7200,
        "timeAgo": "2 hours ago",
        "link": "#"
    })
    
    # 3. Contextual Dynamic bulletin
    if "storm" in status:
        news.insert(0, {
            "id": "local-weather-alert",
            "title": "CRITICAL ADVISORY: High convective storm cell approaching Upper Assam",
            "summary": f"Radar aggregates indicate dangerous weather elements developing east of Dibrugarh with winds clocking up to {wind} m/s. Residents are advised to secure outer assets and stay indoors.",
            "category": "SEVERE",
            "source": "State Emergency Hub",
            "timestamp": now_ts,
            "timeAgo": "Just now",
            "link": "#"
        })
    elif "rain" in status:
        news.insert(0, {
            "id": "local-weather-alert",
            "title": "Continuous monsoonal precipitations trigger urban drainage overflows",
            "summary": "Heavy rains have recorded persistent water levels, leading to localized road logging in sections of Dibrugarh East. Municipality pumps have been dispatched to clear stagnant waters.",
            "category": "SEVERE",
            "source": "Dibrugarh Municipality",
            "timestamp": now_ts,
            "timeAgo": "Just now",
            "link": "#"
        })
    elif "heat" in status or temp > 35.0:
        news.insert(0, {
            "id": "local-weather-alert",
            "title": "EXTREME HEAT ALERT: Thermal indices exceed normal limits in Assam plains",
            "summary": f"Ambient temperature logged at {temp}°C with high heat indexes. Health departments recommend avoiding direct sunlight exposure between 11:00 AM and 3:00 PM and monitoring hydration levels.",
            "category": "SEVERE",
            "source": "Assam Health Council",
            "timestamp": now_ts,
            "timeAgo": "Just now",
            "link": "#"
        })
    else:
        news.insert(0, {
            "id": "local-weather-alert",
            "title": "Optimal solar radiation index logged at station micro-grid",
            "summary": "Solar monitoring array records top solar capture capacity due to clear horizons over Dibrugarh. Local green energy grids are operating at peak efficiency with output reaching target quotas.",
            "category": "CLIMATE",
            "source": "Renewable Tech India",
            "timestamp": now_ts,
            "timeAgo": "Just now",
            "link": "#"
        })
        
    return news

async def refresh_news_feed():
    global cached_rss_news
    import requests
    import xml.etree.ElementTree as ET
    import re
    
    url = "https://moxie.foxweather.com/google-publisher/weather-news.xml"
    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: requests.get(url, timeout=5))
        if response.status_code == 200:
            root = ET.fromstring(response.content)
            channel = root.find("channel")
            items = []
            if channel is not None:
                for item in channel.findall("item")[:6]:
                    title = item.find("title").text if item.find("title") is not None else ""
                    desc = item.find("description").text if item.find("description") is not None else ""
                    link = item.find("link").text if item.find("link") is not None else "#"
                    
                    desc_clean = re.sub('<[^<]+?>', '', desc)
                    desc_clean = desc_clean.replace("&nbsp;", " ").strip()
                    if len(desc_clean) > 180:
                        desc_clean = desc_clean[:180] + "..."
                        
                    items.append({
                       "id": f"global-{random.randint(10000, 99999)}",
                       "title": title,
                       "summary": desc_clean,
                       "category": "GLOBAL",
                       "source": "FOX Weather",
                       "timestamp": time.time(),
                       "timeAgo": "Recent",
                       "link": link
                    })
                cached_rss_news = items
                print(f"[OK] Fetched {len(cached_rss_news)} RSS news items from FOX Weather.")
                await broadcast_news_update()
    except Exception as e:
        print(f"[WARN] Failed to parse live RSS news: {e}")

def get_all_news() -> List[Dict[str, Any]]:
    all_items = []
    # 1. Custom bulletins
    all_items.extend(custom_bulletins)
    # 2. Local generated news
    all_items.extend(generate_local_news(weather_state))
    # 3. Global RSS news
    all_items.extend(cached_rss_news)
    return all_items

async def broadcast_news_update():
    packet = {
        "type": "news_update",
        "data": get_all_news()
    }
    message = json.dumps(packet)
    
    # Broadcast to clients
    for cid, cinfo in list(connected_clients.items()):
        try:
            await cinfo["ws"].send_text(message)
        except Exception:
            pass
            
    # Broadcast to admins
    for ws in list(admin_connections):
        try:
            await ws.send_text(message)
        except Exception:
            pass

# Forecast Generation Projections Helper
def generate_forecast_projections(weather: Dict[str, Any]) -> Dict[str, Any]:
    import math
    import random
    from datetime import datetime as dt_class
    
    now = weather.get("timestamp", time.time())
    curr_temp = weather.get("temperature", 24.5)
    curr_hum = weather.get("humidity", 62)
    curr_press = weather.get("pressure", 1012)
    curr_wind = weather.get("wind_speed", 4.8)
    status = str(weather.get("status", "Clear"))
    
    # Generate 24 Hourly entries
    hourly = []
    for h in range(24):
        t_offset = h * 3600
        target_time = now + t_offset
        dt_hour = (dt_class.fromtimestamp(target_time)).hour
        
        # Diurnal cycle: temperature dips at 4-5 AM, peaks at 2-3 PM
        diurnal = math.sin((dt_hour - 8) * (2 * math.pi / 24))
        
        temp = curr_temp + (diurnal * 4.0) + (random.uniform(-0.5, 0.5) if h > 0 else 0)
        hum = max(10, min(100, curr_hum - (diurnal * 15.0) + (random.uniform(-2, 2) if h > 0 else 0)))
        
        # Condition prediction trends
        h_status = status
        if hum > 85:
            h_status = "Rainy"
        elif hum > 70:
            h_status = "Overcast"
        elif hum > 50:
            h_status = "Partly Cloudy"
        else:
            h_status = "Clear Skies"
            
        hourly.append({
            "time": (dt_class.fromtimestamp(target_time)).strftime("%I:%M %p").lstrip('0'),
            "temp": round(temp, 1),
            "humidity": int(hum),
            "status": h_status,
            "wind": round(max(0.5, curr_wind + (diurnal * 2.0)), 1)
        })
        
    # Generate 7 Daily entries
    daily = []
    today_idx = dt_class.fromtimestamp(now).weekday()
    days_of_week = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    
    for d in range(7):
        day_label = "Today" if d == 0 else "Tomorrow" if d == 1 else days_of_week[(today_idx + d) % 7]
        
        # Daily variance trends
        trend_factor = math.sin(d * (math.pi / 3)) * 2.5
        
        max_temp = curr_temp + trend_factor + 3.0 + random.uniform(-1, 1)
        min_temp = curr_temp + trend_factor - 4.0 + random.uniform(-1, 1)
        avg_hum = max(20, min(95, curr_hum + (trend_factor * -3) + random.randint(-5, 5)))
        
        d_status = "Partly Cloudy"
        if avg_hum > 80:
            d_status = "Rainy"
        elif avg_hum > 65:
            d_status = "Overcast"
        elif avg_hum < 40:
            d_status = "Clear Skies"
            
        daily.append({
            "day": day_label,
            "maxTemp": round(max_temp, 1),
            "minTemp": round(min_temp, 1),
            "humidity": int(avg_hum),
            "status": d_status,
            "rainChance": int(max(0, min(100, (avg_hum - 30) * 1.4))) if "Rain" in d_status or "Overcast" in d_status else random.randint(0, 15)
        })
        
    return {"hourly": hourly, "daily": daily}

@asynccontextmanager
async def lifespan(app: FastAPI):
    global serial_running, serial_thread
    # Startup
    init_db()
    load_models()
    asyncio.create_task(refresh_news_feed())
    
    # Start serial telemetry listener thread
    serial_running = True
    loop = asyncio.get_running_loop()
    serial_thread = threading.Thread(target=run_serial_listener, args=(loop,), daemon=True)
    serial_thread.start()
    print("[Serial Listener] Started serial telemetry background thread.")
    
    # Start OpenWeatherMap pressure tracking task
    pressure_tracker = asyncio.create_task(refresh_openweather_pressure_task())
    
    simulator = asyncio.create_task(weather_simulator_task())
    yield
    # Shutdown
    serial_running = False
    
    pressure_tracker.cancel()
    simulator.cancel()
    try:
        await asyncio.gather(pressure_tracker, simulator, return_exceptions=True)
    except Exception:
        pass


# Initialize FastAPI App
app = FastAPI(title="Weather Station Server", lifespan=lifespan)

# Enable CORS for Next.js frontend connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Client WebSocket Endpoint
@app.websocket("/ws/client")
async def client_websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    client_id = f"Client-{random.randint(1000, 9999)}"
    client_ip = websocket.client.host if websocket.client else "Unknown"
    user_agent = websocket.headers.get("user-agent", "Unknown Browser")
    
    if "Chrome" in user_agent:
        ua_clean = "Chrome Browser"
    elif "Safari" in user_agent and "Chrome" not in user_agent:
        ua_clean = "Safari Browser"
    elif "Firefox" in user_agent:
        ua_clean = "Firefox Browser"
    elif "Edge" in user_agent:
        ua_clean = "Edge Browser"
    else:
        ua_clean = user_agent.split('/')[0] if '/' in user_agent else user_agent[:20]

    connected_clients[client_id] = {
        "ws": websocket,
        "ip": client_ip,
        "user_agent": ua_clean,
        "permission": "default",
        "connected_at": time.time()
    }
    
    log_system_event_to_db("Client Connection", f"Client {client_id} connected from {client_ip} using {ua_clean}")
    
    try:
        await websocket.send_text(json.dumps({
            "type": "config",
            "clientId": client_id,
            "weather": weather_state,
            "forecast": generate_forecast_projections(weather_state),
            "news": get_all_news()
        }))
    except Exception:
        pass
    
    await notify_admins_of_clients()
    
    try:
        while True:
            text_data = await websocket.receive_text()
            data = json.loads(text_data)
            
            if data.get("type") == "permission_update":
                new_state = data.get("permission", "default")
                connected_clients[client_id]["permission"] = new_state
                await notify_admins_of_clients()
                
    except WebSocketDisconnect:
        if client_id in connected_clients:
            del connected_clients[client_id]
        log_system_event_to_db("Client Connection", f"Client {client_id} disconnected")
        await notify_admins_of_clients()
    except Exception:
        if client_id in connected_clients:
            del connected_clients[client_id]
        log_system_event_to_db("Client Connection", f"Client {client_id} disconnected with error")
        await notify_admins_of_clients()

# Admin WebSocket Endpoint
@app.websocket("/ws/admin")
async def admin_websocket_endpoint(websocket: WebSocket):
    global manual_mode, active_scenario, scenario_step, scenario_ticks
    await websocket.accept()
    admin_connections.add(websocket)
    admin_ip = websocket.client.host if websocket.client else "Unknown"
    log_system_event_to_db("Admin Connection", f"Admin console connected from {admin_ip}")
    
    clients_list = []
    for cid, cinfo in connected_clients.items():
        clients_list.append({
            "id": cid,
            "ip": cinfo["ip"],
            "user_agent": cinfo["user_agent"],
            "permission": cinfo["permission"],
            "connected_at": cinfo["connected_at"]
        })
        
    try:
        await websocket.send_text(json.dumps({
            "type": "init",
            "weather": weather_state,
            "forecast": generate_forecast_projections(weather_state),
            "clients": clients_list,
            "manualMode": manual_mode,
            "news": get_all_news()
        }))
    except Exception:
        pass
        
    try:
        while True:
            text_data = await websocket.receive_text()
            data = json.loads(text_data)
            
            if data.get("type") == "publish_news":
                bulletin_title = data.get("title", "Local Advisory")
                bulletin_summary = data.get("summary", "No details provided.")
                bulletin_category = data.get("category", "LOCAL")
                
                new_bulletin = {
                    "id": f"custom-{random.randint(1000, 9999)}",
                    "title": bulletin_title,
                    "summary": bulletin_summary,
                    "category": bulletin_category,
                    "source": "Station Admin",
                    "timestamp": time.time(),
                    "timeAgo": "Just now",
                    "link": "#"
                }
                
                custom_bulletins.insert(0, new_bulletin)
                if len(custom_bulletins) > 5:
                    custom_bulletins.pop()
                    
                log_system_event_to_db("News Bulletin", f"Bulletin published by admin: {bulletin_title}")
                await broadcast_news_update()
                
            elif data.get("type") == "start_scenario":
                playlist_name = data.get("name")
                if playlist_name in SCENARIOS:
                    active_scenario = playlist_name
                    scenario_step = 0
                    scenario_ticks = 0
                    manual_mode = False
                    log_system_event_to_db("System Config", f"Scenario playlist '{playlist_name}' started by admin")
                    print(f"[Automation] Starting scenario playlist: {playlist_name}")
                    await broadcast_weather_data()
                    
            elif data.get("type") == "stop_scenario":
                active_scenario = None
                log_system_event_to_db("System Config", "Scenario playlist stopped by admin")
                print(f"[Automation] Stopped scenario playlist.")
                await broadcast_weather_data()
                
            elif data.get("type") == "trigger_alert":
                weather_state["alert"] = {
                    "title": data.get("title", "Custom Alert"),
                    "message": data.get("message", "Weather advisory active"),
                    "severity": data.get("severity", "info"),
                    "timestamp": time.time()
                }
                log_alert_to_db(weather_state["alert"])
                log_system_event_to_db("Alert Broadcast", f"Advisory broadcasted: {data.get('title')} ({data.get('severity').upper()})")
                await broadcast_weather_data()
            
            elif data.get("type") == "clear_alert":
                weather_state["alert"] = None
                log_system_event_to_db("Alert Broadcast", "Advisory broadcast cleared by admin")
                await broadcast_weather_data()
                
            elif data.get("type") == "set_manual_mode":
                manual_mode = data.get("enabled", False)
                log_system_event_to_db("System Config", f"Manual override mode set to {manual_mode} by admin")
                await broadcast_weather_data()
                
            elif data.get("type") == "override_telemetry":
                if manual_mode:
                    weather_state["temperature"] = float(data.get("temperature", weather_state["temperature"]))
                    weather_state["humidity"] = int(data.get("humidity", weather_state["humidity"]))
                    weather_state["wind_speed"] = float(data.get("wind_speed", weather_state["wind_speed"]))
                    weather_state["pressure"] = int(data.get("pressure", weather_state["pressure"]))
                    weather_state["status"] = data.get("status", weather_state["status"])
                    weather_state["timestamp"] = time.time()
                    
                    # Update predictions based on user adjustments
                    process_predictions()
                    await broadcast_weather_data()
                
    except WebSocketDisconnect:
        admin_connections.discard(websocket)
        log_system_event_to_db("Admin Connection", "Admin console disconnected")
    except Exception:
        admin_connections.discard(websocket)
        log_system_event_to_db("Admin Connection", "Admin console disconnected with error")

@app.post("/api/telemetry")
async def receive_telemetry(data: dict):
    global weather_state
    try:
        # Ingest reading
        weather_state["temperature"] = float(data.get("temperature", weather_state["temperature"]))
        weather_state["humidity"] = int(data.get("humidity", weather_state["humidity"]))
        weather_state["pressure"] = int(data.get("pressure", weather_state["pressure"]))
        weather_state["wind_speed"] = float(data.get("wind_speed", weather_state["wind_speed"]))
        weather_state["wind_dir"] = data.get("wind_dir", weather_state["wind_dir"])
        weather_state["status"] = data.get("status", weather_state["status"])
        weather_state["timestamp"] = time.time()
        
        # Calculate AI predictions based on the real sensors
        process_predictions()
        
        # Broadcast via WebSockets to all dashboards and log to db
        await broadcast_weather_data()
        
        return {"status": "success", "message": "Telemetry received and broadcasted successfully"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})



# API Endpoint to fetch latest news
@app.get("/api/news")
def get_news():
    return get_all_news()

# Direct client/admin convenient redirection
@app.get("/")
def read_root():
    return JSONResponse(content={"status": "online", "message": "Weather Base Station API is running. Access dashboard via port 3000."})

from fastapi.responses import StreamingResponse
import io
import csv

# API Endpoint to retrieve database telemetry log history
@app.get("/api/logs")
def get_logs(limit: int = 100):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT id, timestamp, temperature, humidity, pressure, wind_speed, wind_dir, status FROM weather_log ORDER BY id DESC LIMIT ?", (limit,))
        rows = cursor.fetchall()
        conn.close()
        
        logs = []
        for r in rows:
            logs.append({
                "id": r[0],
                "timestamp": r[1],
                "time": datetime.fromtimestamp(r[1]).strftime("%Y-%m-%d %H:%M:%S"),
                "temperature": r[2],
                "humidity": r[3],
                "pressure": r[4],
                "wind_speed": r[5],
                "wind_dir": r[6],
                "status": r[7]
            })
        return logs
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# API Endpoint to download weather history logs as a CSV file
@app.get("/api/logs/download")
def download_logs_csv():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT timestamp, temperature, humidity, pressure, wind_speed, wind_dir, status FROM weather_log ORDER BY id DESC LIMIT 5000")
        rows = cursor.fetchall()
        conn.close()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Timestamp", "Date Time", "Temperature (C)", "Humidity (%)", "Pressure (hPa)", "Wind Speed (m/s)", "Wind Dir", "Status"])
        
        for r in rows:
            time_str = datetime.fromtimestamp(r[0]).strftime("%Y-%m-%d %H:%M:%S")
            writer.writerow([r[0], time_str, r[1], r[2], r[3], r[4], r[5], r[6]])
            
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=weather_telemetry_logs.csv"}
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
