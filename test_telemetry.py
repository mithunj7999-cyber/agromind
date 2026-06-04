import time
import json
import random
import requests

# Flask Server Config
SERVER_IP = "10.36.137.217" # Your PC network IP
PORT = 5000
API_URL = f"http://{SERVER_IP}:{PORT}/api/update"

print("==================================================")
print("  SmartFarm IoT NodeMCU Telemetry Simulator")
print("==================================================")
print(f"Targeting Flask Server Endpoint: {API_URL}")
print("Press Ctrl+C to stop simulation.\n")

# Start values
temp = 25.0
humidity = 60.0
soil = 500
rain = 1       # 1 = No rain, 0 = Rain
float_state = 0 # 0 = Tank full, 1 = Tank not full (refill required)
m1 = 1         # Active-low (1 = OFF, 0 = ON)
m2 = 1         # Active-low (1 = OFF, 0 = ON)

try:
    while True:
        # Simulate environment natural fluctuations
        temp += random.uniform(-0.4, 0.4)
        temp = max(15.0, min(40.0, round(temp, 2)))
        
        humidity += random.uniform(-1.5, 1.5)
        humidity = max(20.0, min(95.0, round(humidity, 2)))
        
        # Simulate Rain switch - alternate between rain every 3-4 cycles for visible testing
        if random.random() < 0.6:
            rain = 0 if rain == 1 else 1
            
        # Refill Reservoir Simulator (Water Level)
        # Float state simulates Tank draining (triggering refilling)
        if float_state == 0 and random.random() < 0.25:
            float_state = 1 # Tank empty
            
        if float_state == 1:
            m1 = 0 # Turn ON Pump 1 (Active low)
            # Refill process
            print("Simulator action: Tank refilling in progress...")
            time.sleep(2)
            float_state = 0 # Tank full again
            m1 = 1 # Turn OFF Pump 1 (Active low)
            
        # Irrigation Control Sub-Logic (matches NodeMCU exactly)
        if rain == 0:
            m2 = 1 # Force Irrigation Closed (active low OFF)
        else:
            # Check soil dryness
            if soil < 400: # Threshold in ESP8266 is 400
                m2 = 0 # Engage irrigation (Active low ON)
                soil += random.randint(20, 50) # Wet up
            else:
                m2 = 1 # Shut irrigation (Active low OFF)
                soil -= random.randint(5, 15) # Dry down

        # Outbound Server JSON Transmission payload (matches NodeMCU exactly)
        payload = {
            "temp": temp,
            "humidity": humidity,
            "soil": soil,
            "rain": rain,
            "float": float_state,
            "m1": m1,
            "m2": m2
        }
        
        try:
            print(f"Sending JSON Payload: {json.dumps(payload)}")
            response = requests.post(API_URL, json=payload, headers={"Content-Type": "application/json"})
            print(f"HTTP Response Code: {response.status_code}")
            print(f"Server Response Body: {response.text}")
        except requests.exceptions.ConnectionError:
            print("Error: Flask server is offline or unreachable. Please launch app.py first!")

        print("--------------------------------------------------")
        time.sleep(2) # 2-second telemetry rhythm matching loop constraint

except KeyboardInterrupt:
    print("\nSimulation stopped successfully.")
