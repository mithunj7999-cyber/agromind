# AgroMind 2.0 - Smart Irrigation and Greenhouse Monitoring

A comprehensive IoT solution for real-time monitoring and control of agricultural greenhouse environments. AgroMind 2.0 combines IoT sensors with a web-based dashboard to provide intelligent irrigation and environmental monitoring.

## Features

- **Real-time Telemetry Monitoring**: Track temperature, humidity, soil moisture, and water levels
- **Smart Irrigation Control**: Automated motor control for irrigation pump management
- **Rain Detection**: Real-time rain sensor monitoring to prevent unnecessary watering
- **Web Dashboard**: Interactive web interface for live data visualization and system status
- **Data Logging**: SQLite database for historical data storage and analysis
- **REST API**: JSON-based API endpoints for system integration and remote access
- **Thread-safe Architecture**: Concurrent data handling with thread locks for reliability

## System Architecture

### Frontend
- **Dashboard**: HTML/CSS/JavaScript-based responsive web interface
- **Real-time Updates**: WebSocket-ready endpoint structure for live data streaming

### Backend
- **Framework**: Flask (Python)
- **Database**: SQLite for persistent data storage
- **API**: RESTful endpoints for data retrieval and system updates
- **Simulation**: NodeMCU telemetry simulator for testing and development

## Components & Sensors

The system monitors the following parameters:

| Parameter | Description | Unit |
|-----------|-------------|------|
| Temperature | Ambient/greenhouse temperature | °C |
| Humidity | Relative humidity level | % |
| Soil Moisture | Soil water content sensor | ADC Value |
| Rain | Rain detection sensor | Binary (0/1) |
| Water Level | Tank float sensor (0=Full, 1=Empty) | Binary |
| Motor 1 (M1) | Pump control (Active-low) | Binary |
| Motor 2 (M2) | Secondary control (Active-low) | Binary |

## Installation

### Prerequisites
- Python 3.7+
- pip package manager

### Setup

1. Clone or download the project:
```bash
cd agromind-2.0
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the Flask application:
```bash
python app.py
```

4. Access the dashboard:
```
http://localhost:5000
```

## Project Structure

```
agromind-2.0/
├── app.py                 # Main Flask application
├── test_telemetry.py     # NodeMCU simulator for testing
├── debug_values.py       # Debug utility script
├── requirements.txt      # Python dependencies
├── database.db           # SQLite database (auto-created)
├── templates/
│   └── index.html        # Web dashboard
└── static/
    ├── css/
    │   └── styles.css    # Dashboard styling
    └── js/
        └── dashboard.js  # Dashboard interactivity
```

## Usage

### Starting the Application

```bash
python app.py
```

The Flask server will start on `http://localhost:5000`

### Running the Telemetry Simulator

To simulate sensor data (useful for testing without hardware):

```bash
python test_telemetry.py
```

Update the `SERVER_IP` variable in `test_telemetry.py` with your PC's network IP address.

### Viewing the Dashboard

Open your web browser and navigate to:
```
http://localhost:5000
```

The dashboard displays:
- Current sensor readings (temperature, humidity, soil moisture)
- Rain detection status
- Tank water level
- Motor states
- Historical data graphs

## API Endpoints

### Get Latest Telemetry Data
```
GET /api/data
```
Returns the latest telemetry records in JSON format.

### Update Sensor Data
```
POST /api/update
```
Accepts JSON payload with sensor readings and updates the database.

**Payload Example:**
```json
{
  "temp": 28.5,
  "humidity": 65.0,
  "soil": 450,
  "rain": 0,
  "float_val": 0,
  "m1": 1,
  "m2": 1
}
```

## Database Schema

### Telemetry Table
```sql
CREATE TABLE telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  temp REAL,
  humidity REAL,
  soil INTEGER,
  rain INTEGER,
  float_val INTEGER,
  m1 INTEGER,
  m2 INTEGER
)
```

## Configuration

Edit the following in `app.py` to customize:

- **DB_PATH**: Database file location
- **CACHE_SIZE**: Live telemetry buffer size (default: 30 records)
- **TIMEZONE**: Set to IST (UTC+5:30) by default

## Time Zone

All timestamps are recorded in **Indian Standard Time (IST, UTC+5:30)**. Modify the `get_ist_now()` function in `app.py` to use a different timezone.

## Troubleshooting

### Simulator Connection Failed
- Verify the Flask server is running
- Check the `SERVER_IP` in `test_telemetry.py` matches your PC's network IP
- Ensure both devices are on the same network

### Database Lock Error
- Thread-safe mechanisms are implemented; this is rare
- Restart the application if persistent

### Dashboard Not Loading
- Verify port 5000 is not in use
- Check browser console for JavaScript errors
- Clear browser cache and reload

## Future Enhancements

- WebSocket support for real-time updates
- Mobile app integration
- Machine learning-based crop recommendations
- Email/SMS alert notifications
- Data export to CSV/JSON
- Multi-greenhouse support

## Technologies Used

- **Backend**: Python, Flask
- **Database**: SQLite3
- **Frontend**: HTML5, CSS3, JavaScript
- **Hardware Simulation**: Python requests library

## License

This project is part of the AgroMind initiative for smart agriculture.

## Support

For issues, feature requests, or contributions, please contact the development team.

---

**Version**: 2.0  
**Last Updated**: June 2026  
**Status**: Active Development
