# 🌦️ Intelligent Weather Station and Predictive AI Portal System

An IoT-enabled, AI-powered hyperlocal weather monitoring and forecasting platform designed for real-time telemetry acquisition, machine learning-based prediction, emergency advisory broadcasting, and interactive web visualization.

---

# 🚀 Key Features

## 📡 Real-Time Telemetry Acquisition

* Collects environmental data using DHT11 and DIY Anemometer sensors.
* Receives telemetry through TCP Socket communication.
* Socket Server runs on **Port 5000**.
* Supports real-time sensor streaming.
* Integrates OpenWeatherMap API for atmospheric pressure data.


---

## 🧠 Machine Learning Forecasting

The forecasting engine utilizes XGBoost Regression Models.

Prediction Models:

```text
temp_model.pkl
humidity_model.pkl
```

Input Features

* Current Temperature
* Current Humidity
* Wind Speed
* Time Features
* Lag Features
* Rolling Statistics


Predicted Outputs


* Temperature after 15 minutes
* Humidity after 15 minutes


Capabilities


* Feature Engineering
* Hyperparameter Tuning
* Model Evaluation
* Model Serialization
* Short-term Forecast Generation



---

## 🗄 Database Logging


Database


```text
weather_station.db
```


Stored Information


* Sensor Telemetry
* Historical Records
* Prediction Logs
* Advisories
* System Event Logs


---

## 🔄 WebSocket Communication


### /ws/client


Provides


* Live Telemetry
* Forecast Data
* Weather Advisories
* Emergency Notifications
* Client Synchronization


### /ws/admin


Provides


* Manual Overrides
* Administrative Commands
* Alert Broadcasting
* Configuration Updates


---

# 🏗 System Architecture


Subsystems


* Remote Sensing Module
* FastAPI Backend
* SQLite Database
* Machine Learning Engine
* Base Station Dashboard
* Client Portal



Architecture Figure


```text
docs/system_architecture.png
```



Features


* TCP Socket Communication
* OpenWeatherMap Integration
* WebSocket Synchronization
* XGBoost Forecasting
* Emergency Broadcasting


<p align="center">

<img src="docs/system_architecture.png">

</p>


---

# 📈 Machine Learning Pipeline


The forecasting workflow consists of:


1. Historical Dataset Collection

2. Data Cleaning

3. Feature Engineering

4. Target Creation

5. Train Test Split

6. Hyperparameter Tuning

7. XGBoost Training

8. Model Evaluation

9. Model Saving

10. Forecast Generation




Train Test Ratio


```text
80 : 20
```


Forecast Horizon


```text
15 Minutes
```


Models


```text
temp_model.pkl

humidity_model.pkl
```


<p align="center">

<img src="docs/ml_pipeline.png">

</p>



---

# 🔌 Hardware Design


Hardware Components


### Arduino UNO


Main controller.


### DHT11


Temperature and humidity sensing.


### DIY Cup Anemometer


Wind speed measurement.


### LEDs


Red LED

Blue LED


Status Indicators.



### Capacitor


Noise suppression.


### Diode


Reverse polarity protection.



---

## Hardware Connections



| Component | Connection |
|----------|------------|
| DHT11 VCC | 5V |
| DHT11 GND | GND |
| DHT11 DATA | D2 |
| Anemometer Signal | D3 |
| Red LED | D7 |
| Blue LED | D8 |
| Capacitor | Across Supply |
| Diode | Series Protection |



<p align="center">

<img src="docs/hardware_design.png">

</p>



---

# 📺 Monitoring and Alert Circuit


Components


* LCD 16x2
* Arduino UNO
* Buzzer
* Red LED
* Green LED
* Potentiometer
* 220Ω Resistors



Functions


* Weather Display
* Warning Indication
* Audible Alert
* System Health Monitoring



<p align="center">

<img src="docs/monitoring_circuit.png">

</p>


---

# 🖥 Base Station Dashboard


Features


* Real-time Telemetry

* Forecast Visualization

* System Logs

* CSV Export Facility

* Alert Broadcasting

* Manual Override


Capabilities


Administrator Interface

Emergency Management

Forecast Monitoring



---

# 🌐 Client Portal



Provides


* Live Weather Data

* Forecast Reports

* Advisory Banners

* Browser Notifications

* Weather Animations

* Emergency Alerts



Capabilities


Real-time Synchronization

Interactive Visualization

Instant Warning Updates



---

# 🚨 Emergency Advisory System



Severity Levels


### Information


General Updates



### Warning


Potential Hazards



### Critical Danger


Emergency Conditions



Features


* Full Screen Overlay

* Flashing Interface

* Browser Notifications

* WebSocket Broadcasting

* Instant Synchronization



---

# 🗃 Database Schema



Database


```text
weather_station.db
```



Tables



### weather_log


Stores


* Temperature

* Humidity

* Pressure

* Wind Speed

* Prediction Values



### alert_log


Stores


* Alerts

* Advisories

* Severity



### system_event_log


Stores


* Events

* WebSocket Activities

* Manual Overrides



---

# 🛠 Technology Stack


## Backend


FastAPI

Uvicorn

Python 3


SQLite


Pandas


NumPy


Scikit Learn


XGBoost


Joblib



---

## Frontend


Next.js 15+


React 19


TypeScript


HTML5


CSS3


Custom CSS Variables



---

## Hardware


Arduino UNO


DHT11


DIY Anemometer


LEDs


Capacitor


Diode



---

# ⚙ Installation


Clone Repository


```bash
git clone https://github.com/Abhijit12322/Weather_Monitoring_System.git

cd weather-station
```



Install Backend Dependencies


```bash
pip install -r requirements.txt
```



Install Frontend Dependencies


```bash
cd frontend

npm install
```



---

# ▶ Running the Application


Backend


```bash
python server.py
```



FastAPI


```text
http://localhost:8000
```



TCP Socket


```text
Port 5000
```



Frontend


```bash
cd frontend

npm run dev
```



Base Station


```text
http://localhost:3000
```



Client Portal


```text
http://localhost:3000/client
```



Sensor Simulation


```bash
python sensor.py
```



---

# 📂 Repository Structure


```text
WeatherStation/

├── frontend/
├── sensor.py
├── server.py
├── temp_model.pkl
├── humidity_model.pkl
├── weather_station.db
├── requirements.txt

├── docs/
│   ├── system_architecture.png
│   ├── ml_pipeline.png
│   ├── hardware_design.png
│   └── monitoring_circuit.png

└── README.md
```



---

# 📌 Applications


* Hyperlocal Weather Monitoring

* Smart Agriculture

* Environmental Monitoring

* Disaster Management

* Smart Cities

* Educational Research

* Renewable Energy Planning



---

# 🔮 Future Scope


* Hourly Forecasting

* Daily Forecasting

* Satellite Integration

* Radar Integration

* Mobile Applications

* Multi-location Deployment

* LSTM Forecast Models

* GRU Forecast Models



---

# 📄 License


Academic and Research Use Only.


---

## Author

Developed as part of an Intelligent Weather Station and Predictive AI Portal research project.
