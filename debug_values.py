import requests
import json

r = requests.get('http://127.0.0.1:5000/api/data').json()
for rec in r.get('data', [])[-3:]:
    print(f"Rain: {rec['rain']} (type: {type(rec['rain']).__name__})")
    print(f"Float: {rec['float']} (type: {type(rec['float']).__name__})")
    print(f"M1: {rec['m1']}, M2: {rec['m2']}")
    print("---")
