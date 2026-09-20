from ddgs import DDGS
import json

topic = "zoho corporation"
print(f"Testing search for: {topic}")

try:
    # Test with safesearch and region
    print("\n--- US-EN Region + SafeSearch Off ---")
    try:
        results = DDGS().text(topic, region='us-en', safesearch='off', max_results=5)
        for r in results:
            print(r['href'])
    except Exception as e:
        print(f"Failed: {e}")
        
except Exception as e:
    print(f"Error: {e}")
