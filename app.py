import os
import sqlite3
import random
import csv
import io
import threading
from datetime import datetime, timedelta, timezone
from flask import Flask, request, jsonify, render_template, Response

app = Flask(__name__)
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'database.db')

# Thread-safe global memory cache
cache_lock = threading.Lock()
live_telemetry_buffer = []  # Capped at 30 elements
last_db_write_time = None  # datetime tracking last snapshot write

def get_ist_now():
    """Returns the current date and time in Indian Standard Time (IST, UTC+5:30)."""
    ist_offset = timezone(timedelta(hours=5, minutes=30))
    return datetime.now(ist_offset)

def prime_cache():
    """Primes the live_telemetry_buffer cache with the latest 30 database records on startup."""
    global live_telemetry_buffer
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT timestamp, temp, humidity, soil, rain, float_val, m1, m2 
            FROM telemetry 
            ORDER BY id DESC 
            LIMIT 30
        ''')
        rows = cursor.fetchall()
        conn.close()
        
        with cache_lock:
            live_telemetry_buffer = []
            for row in reversed(rows):
                # Clean timestamp format
                dt = datetime.strptime(row['timestamp'], '%Y-%m-%d %H:%M:%S')
                clean_time = dt.strftime('%H:%M:%S')
                live_telemetry_buffer.append({
                    "time": clean_time,
                    "timestamp": row['timestamp'],
                    "temp": row['temp'],
                    "humidity": row['humidity'],
                    "soil": row['soil'],
                    "rain": row['rain'],
                    "float": row['float_val'],
                    "m1": row['m1'],
                    "m2": row['m2'],
                    "field_unit": "system_boot"
                })
        print(f"Successfully primed cache with {len(live_telemetry_buffer)} historical database records.")
    except Exception as e:
        print(f"Failed to prime memory cache: {e}")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            temp REAL,
            humidity REAL,
            soil INTEGER,
            rain INTEGER,
            float_val INTEGER,
            m1 INTEGER,
            m2 INTEGER
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')
    
    # Set default soil threshold in DB if it doesn't exist
    cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('soil_threshold', '400')")
    conn.commit()

    # Check if there is data, if not seed the database with realistic smart farming mock data
    cursor.execute("SELECT COUNT(*) as count FROM telemetry")
    count = cursor.fetchone()['count']
    if count == 0:
        seed_mock_data(conn)
        
    conn.close()

def seed_mock_data(conn):
    """Seeds the database with realistic time-series sensor telemetry data for smart farming."""
    cursor = conn.cursor()
    now = datetime.now()
    records = []
    
    # Generate 30 data points spaced 3 minutes apart (1.5 hours of historical telemetry)
    temp = 24.5
    humidity = 62.0
    soil = 480  # Wet initially, will dry down
    float_val = 0 # 0 = Tank full (Motor 1 OFF)
    m1 = 1 # 1 = OFF (Active low)
    m2 = 1 # 1 = OFF (Active low)
    rain = 1 # 1 = No rain
    
    for i in range(30):
        time_offset = now - timedelta(minutes=(30 - i) * 3)
        timestamp_str = time_offset.strftime('%Y-%m-%d %H:%M:%S')
        
        # Add random natural fluctuation to temperature and humidity
        temp += random.uniform(-0.3, 0.3)
        temp = max(18.0, min(38.0, round(temp, 1)))
        
        humidity += random.uniform(-1.0, 1.0)
        humidity = max(30.0, min(95.0, round(humidity, 1)))
        
        # Simulate soil drying out, then irrigation pump starting, then soil wetting up
        if i < 12:
            soil -= random.randint(10, 20)  # Drying out
            m2 = 1
        elif i == 12:
            soil -= 10
            m2 = 0  # Irrigation turns ON (Soil value falls below 400 threshold)
        elif 12 < i < 18:
            soil += random.randint(30, 50)  # Wetting up
            m2 = 0
        else:
            m2 = 1  # Irrigation turns OFF (Soil value above 400)
            soil -= random.randint(5, 12)  # Slowly drying out again
            
        # Simulate tank water level going down (float becomes 1 -> Motor 1 turns ON to refill)
        if i > 20:
            float_val = 1
            m1 = 0  # Motor 1 ON
        else:
            float_val = 0
            m1 = 1  # Motor 1 OFF
        
        # Simulate rain events (15-25 records: rain detected, others: no rain)
        if 15 <= i <= 25:
            rain = 0  # Rain detected
        else:
            rain = 1  # No rain
            
        records.append((timestamp_str, temp, humidity, soil, rain, float_val, m1, m2))
        
    cursor.executemany('''
        INSERT INTO telemetry (timestamp, temp, humidity, soil, rain, float_val, m1, m2)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', records)
    conn.commit()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/update', methods=['POST'])
def update_telemetry():
    """
    Endpoint for ESP8266 HTTP POST JSON request.
    Payload format: 
    {
      "field unit": "esp8266_field_unit_01",
      "temp": 24.5,
      "humidity": 60,
      "soil": 380,
      "rain": 1,
      "float": 0,
      "m1": 1,
      "m2": 1,
      "timestamp": "2026-05-30 22:30:00"  (optional)
    }
    """
    global last_db_write_time, live_telemetry_buffer
    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({"status": "error", "message": "No JSON payload received"}), 400
        
        # 1. Device Identifier (optional - defaults if not provided by NodeMCU)
        field_unit = data.get('field unit') or data.get('field_unit') or 'esp8266_node'
        
        temp = float(data.get('temp', 0))
        humidity = float(data.get('humidity', 0))
        soil = int(data.get('soil', 0))
        rain = int(data.get('rain', 1))
        float_val = int(data.get('float', 0))
        m1 = int(data.get('m1', 1))
        m2 = int(data.get('m2', 1))
        
        # 2. Get/Generate IST timestamp
        ist_now = get_ist_now()
        timestamp_str = data.get('timestamp')
        if not timestamp_str:
            timestamp_str = ist_now.strftime('%Y-%m-%d %H:%M:%S')
            
        clean_time = ist_now.strftime('%H:%M:%S')
        try:
            parsed_dt = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
            clean_time = parsed_dt.strftime('%H:%M:%S')
        except ValueError:
            pass

        new_packet = {
            "time": clean_time,
            "timestamp": timestamp_str,
            "temp": temp,
            "humidity": humidity,
            "soil": soil,
            "rain": rain,
            "float": float_val,
            "m1": m1,
            "m2": m2,
            "field_unit": field_unit
        }

        # 3. Save to In-Memory Cache (Live display buffer)
        with cache_lock:
            live_telemetry_buffer.append(new_packet)
            if len(live_telemetry_buffer) > 30:
                live_telemetry_buffer.pop(0)

        # 4. Check if 5 minutes elapsed since last DB snapshot write (300 seconds)
        should_write_to_db = False
        if last_db_write_time is None:
            should_write_to_db = True
        else:
            elapsed_seconds = (ist_now - last_db_write_time).total_seconds()
            if elapsed_seconds >= 300:
                should_write_to_db = True

        if should_write_to_db:
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO telemetry (timestamp, temp, humidity, soil, rain, float_val, m1, m2)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (timestamp_str, temp, humidity, soil, rain, float_val, m1, m2))
            conn.commit()
            
            # Read threshold limit to sync back
            cursor.execute("SELECT value FROM settings WHERE key = 'soil_threshold'")
            threshold = int(cursor.fetchone()['value'])
            conn.close()
            
            last_db_write_time = ist_now
            print(f"[{timestamp_str}] Successfully archived telemetry snapshot to database. (5-min interval)")
        else:
            # Just read threshold from settings without writing a new row
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key = 'soil_threshold'")
            threshold = int(cursor.fetchone()['value'])
            conn.close()

        return jsonify({
            "status": "success",
            "message": "Live telemetry cached successfully",
            "soilThreshold": threshold
        }), 200
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/data', methods=['GET'])
def get_telemetry():
    """Returns the cached rolling 30 telemetry logs for fast frontend dashboard rendering."""
    try:
        # Read the current soil threshold limit from settings
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = 'soil_threshold'")
        threshold = int(cursor.fetchone()['value'])
        conn.close()
        
        with cache_lock:
            data_copy = list(live_telemetry_buffer)
            
        return jsonify({
            "status": "success",
            "data": data_copy,
            "soilThreshold": threshold
        }), 200
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/settings', methods=['POST'])
def update_settings():
    """Allows dashboard users to set new configurations (like Soil threshold limits) remotely."""
    try:
        data = request.get_json(force=True)
        threshold = data.get('soil_threshold')
        
        if threshold is None:
            return jsonify({"status": "error", "message": "soil_threshold parameter is required"}), 400
            
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO settings (key, value)
            VALUES ('soil_threshold', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        ''', (str(threshold),))
        conn.commit()
        conn.close()
        
        return jsonify({"status": "success", "message": "Settings updated successfully"}), 200
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/reports/download', methods=['GET'])
def download_report():
    """Generates a CSV report of all historical telemetry data for download."""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, timestamp, temp, humidity, soil, rain, float_val, m1, m2 
            FROM telemetry 
            ORDER BY id DESC
        ''')
        rows = cursor.fetchall()
        conn.close()

        dest = io.StringIO()
        writer = csv.writer(dest)
        
        # Write CSV Header
        writer.writerow([
            'ID', 
            'Timestamp', 
            'Temperature (C)', 
            'Humidity (%)', 
            'Soil Moisture (ADC)', 
            'Rain Detection (0=Rain, 1=No Rain)', 
            'Float Level (0=Full, 1=Low)', 
            'Reservoir Pump M1 (0=ON, 1=OFF)', 
            'Irrigation Pump M2 (0=ON, 1=OFF)'
        ])
        
        # Write CSV Data rows
        for row in rows:
            # Parse and reformat timestamp to ensure consistency (removes any extra spaces)
            try:
                ts = datetime.strptime(row['timestamp'].strip(), '%Y-%m-%d %H:%M:%S').strftime('%d-%m-%Y %H:%M:%S')
            except:
                ts = row['timestamp']
            
            writer.writerow([
                row['id'],
                ts,
                row['temp'],
                row['humidity'],
                row['soil'],
                row['rain'],
                row['float_val'],
                row['m1'],
                row['m2']
            ])
            
        output = dest.getvalue()
        dest.close()
        
        return Response(
            output,
            mimetype="text/csv",
            headers={"Content-disposition": "attachment; filename=telemetry_report.csv"}
        )
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    init_db()
    prime_cache()
    # Run on all available interfaces (0.0.0.0) so the ESP8266 can connect to PC's local IP address
    app.run(host='0.0.0.0', port=5000, debug=True)
