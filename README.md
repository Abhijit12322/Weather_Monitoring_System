# 🌦️ Intelligent Weather Station and Predictive AI Portal System

<p align="center">
  <video src="Image/Client.mp4" width="800" controls></video>
</p>

An IoT-enabled, AI-powered hyperlocal weather monitoring and forecasting platform designed for real-time telemetry acquisition, machine learning-based prediction, emergency advisory broadcasting, and interactive web visualization.

---

## 🚀 Key Features

### 📡 Real-Time Telemetry Acquisition
* **Sensor Core**: Collects atmospheric metrics using a **DHT11** sensor (temperature & humidity) and a **DIY Cup Anemometer** (wind speed).
* **TCP Socket Stream**: Ingests high-frequency sensor telemetry over a custom asynchronous TCP socket server running on **Port 5000**.
* **OpenWeatherMap Integration**: Automatically fetches and logs real-time barometric pressure data to enrich local sensor readings.
* **Low-Latency Broadcasts**: Instantly pushes telemetry updates to all active client portals and administrative command interfaces.

### 🧠 XGBoost Machine Learning Forecasting
* **Hyperlocal Projections**: Utilizes serialized **XGBoost Regression** models to forecast climate conditions.
* **Model Files**:
  * `temp_model.pkl` - Predicts future temperature trends.
  * `humidity_model.pkl` - Forecasts humidity variations.
* **Feature Engineering**: Incorporates lag variables, rolling averages, timestamps, and diurnal cycles (sine/cosine curves reflecting solar temperature fluctuations).
* **Forecast Horizon**: Predicts temperature and humidity changes **15 minutes** into the future.

### 🗄️ Database Logging
* **SQLite Database**: Persisted locally in `weather_station.db`.
* **Database Tables**:
  * `weather_log`: Stores raw sensor readings, pressure indicators, and AI prediction values.
  * `alert_log`: Logs generated weather advisories and safety warnings.
  * `system_event_log`: Audits admin logs, WebSocket connections, and manual overrides.

### 🔄 WebSocket Communication
Dual-channel WebSocket architecture for instantaneous synchronization:
* **`/ws/client` (Client Portal)**: Feeds live readings, predictions, safety alerts, and weather ticker logs to standard clients.
* **`/ws/admin` (Admin Console)**: Handles manual overrides, telemetry slides, and scenario playbooks.

---

## 🏗️ System Architecture

The platform consists of a **Remote Sensing Module**, a **FastAPI backend framework** with an integrated **XGBoost Inference Engine**, and a **Next.js admin/client presentation layer**.

<p align="center">
  <img src="Image/SystemFlow.png" alt="System Flow Architecture Diagram" width="800">
</p>

### Key Architectural Modules:
* **Remote Sensor Node**: Polls DHT11 and Cup Anemometer values, streaming them via raw TCP socket.
* **FastAPI Server**: Ingests sensor data, merges barometric pressure, runs XGBoost predictions, logs entries to SQLite, and broadcasts data.
* **WebSocket Coordinator**: Handles full-duplex messaging between base stations and clients.

---

## 📈 Machine Learning Pipeline

The forecasting pipeline is trained to compute 15-minute climate projections based on structural lag states and diurnal cycles.

<p align="center">
  <img src="Image/ML_step.png" alt="Machine Learning Pipeline Diagram" width="800">
</p>

1. **Dataset Ingestion**: Collects historical temperature and humidity logs from SQLite database records.
2. **Feature Engineering**: Develops rolling statistics, temporal features, lag parameters, and diurnal factors.
3. **Train-Test Partition**: Splits historical data into an `80:20` ratio for training and validation.
4. **XGBoost Training**: Trains regression models using targeted gradient boosting configurations.
5. **Model Serialization**: Serializes trained networks into `temp_model.pkl` and `humidity_model.pkl` for rapid local inference.

---

## 🔌 Hardware Design

### Core Components
* **Arduino UNO**: Main microcontroller coordinating sensor signal conversion.
* **DHT11 Sensor**: Ambient temperature and humidity sensor.
* **DIY Cup Anemometer**: Intercepts wind velocity and calculates rotational frequency.
* **Red & Blue Status LEDs**: Active visual state indicators for network link and data packet broadcasts.
* **Decoupling Capacitor**: Suppresses high-frequency electrical noise and vibration interference from the anemometer.
* **Diode (1N4007)**: Series configuration to protect the main circuit against reverse polarity.

<p align="center">
  <img src="Image/HardwareConnection.png" alt="Hardware Connections Circuit Diagram" width="800">
</p>

### Hardware Connections
| Component | Connection Pin | Pin Description |
| :--- | :--- | :--- |
| **DHT11 VCC** | `5V` | 5V Power Supply |
| **DHT11 GND** | `GND` | Common Ground Reference |
| **DHT11 DATA** | `D2` | DHT11 Data Channel |
| **Anemometer Signal** | `D3` | Pulse Frequency Interrupt |
| **Red LED** | `D7` | Warning State Indicator |
| **Blue LED** | `D8` | Telemetry Link Status |
| **Capacitor** | `VCC / GND` | Decoupling Noise Filter |
| **Diode** | `VIN` | Inline Reverse-Voltage Protection |

---

## 📺 Monitoring and Alert Circuit

Designed to display warning levels and trigger audible sirens locally at the physical base station:
* **LCD 16x2 Display**: Outputs live Temperature, Humidity, and Wind speed metrics.
* **Active Piezo Buzzer**: Sounds audible alarms during severe weather events.
* **LED Status Lights**: Red (Critical Alarm) and Green (Normal System State) indicators.

<p align="center">
  <img src="Image/Circuit%20connection.png" alt="Monitoring and Alert Circuit Diagram" width="800">
</p>

---

## 🖥️ Base Station Dashboard (Admin Console)

Provides administrative command and control utilities:
* **Real-time Telemetry Grid**: Displays active environmental status and statistics.
* **Manual Override Controls**: Sliders to override sensor values directly (Temp, Humidity, Wind Speed, Pressure).
* **Presets Broadcaster**: Instant dispatch buttons for storms, heatwaves, floods, or clearing alerts.
* **Scenario Playlist Manager**: Automatically plays back transition playlists (e.g., Monsoon Arrival) to simulate dynamic changes.

<p align="center">
  <img src="Image/BaseStation.png" alt="Base Station Dashboard Interface" width="800">
</p>

---

## 🌐 Client Portal & Emergency Alerts

Real-time presentation console for public safety:
* **Client Presentation dials**: Renders speedometers, temperature scales, and trend charts.
* **Emergency Alert System**: 
  * `info`: Blue banners for minor local warnings or advisories.
  * `warning`: Orange banners for potential hazards like high heat indexes.
  * `danger`: Flashing red fullscreen warning screens for critical conditions (like severe storms and tornadoes), accompanied by alarms.
* **AI Companion Chatbot**: Direct access to an LLM companion, responding to weather inquiries based on local sensor records.

<p align="center">
  <img src="Image/Client.png" alt="Client Portal Interface Dashboard" width="800">
</p>

### 📹 Client Portal Walkthrough Demonstration
The video below shows the client dashboard dynamically responding to admin alerts and interacting with the AI weather companion chatbot:

<p align="center">
  <video src="Image/Client.mp4" width="800" controls></video>
</p>
<p align="center">
  <a href="Image/Client.mp4">👉 Click here to watch the Client Demonstration Video if it does not load above.</a>
</p>

---

## 🗃️ Database Schema

### Table: `weather_log`
```sql
CREATE TABLE weather_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp REAL NOT NULL,
    temperature REAL NOT NULL,
    humidity INTEGER NOT NULL,
    pressure INTEGER,
    wind_speed REAL,
    wind_dir TEXT,
    status TEXT,
    predict_temp REAL,
    predict_humidity INTEGER
);
```

### Table: `alert_log`
```sql
CREATE TABLE alert_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp REAL NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT NOT NULL
);
```

### Table: `system_event_log`
```sql
CREATE TABLE system_event_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp REAL NOT NULL,
    event_type TEXT NOT NULL,
    message TEXT NOT NULL
);
```

---

## 🛠️ Technology Stack

* **Backend**: FastAPI, Uvicorn, Python 3, SQLite3, Joblib, Scikit-learn, XGBoost.
* **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Vanilla CSS (HSL premium UI framework, glassmorphism cards).
* **Hardware**: Arduino UNO, DHT11, DIY Anemometer, 16x2 LCD.

---

## ⚙️ Installation & Running

### 1. Set Up the Backend Server
Create a virtual environment and install the required dependencies:
```bash
# Create and activate virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI Server
python server.py
```
* **API Portal**: `http://localhost:8000`
* **TCP Socket Listener**: `Port 5000`

### 2. Set Up the Next.js Frontend
Install packages and run the Next.js dev server:
```bash
cd frontend
npm install
npm run dev
```
* **Admin Dashboard**: `http://localhost:3000` (Access PIN: **`8822`**)
* **Client Portal**: `http://localhost:3000/client`

### 3. Stream Mock Sensor Data (Optional)
Run the remote sensor simulator script to feed mock readings to the base station:
```bash
python sensor.py
```

---

## 🔮 Future Scope
* **Extended Forecasting**: Integrating RNN models (LSTM/GRU) for 24h-48h weather projections.
* **Mesh Network**: Deploying multi-sensor networks reporting to a single base station.
* **Mobile Portals**: Developing native iOS and Android apps with push alerts.

---

## 📄 License
Academic and Research Use Only.

---

## Author
Developed as part of the Intelligent Weather Station and Predictive AI Portal research project.
