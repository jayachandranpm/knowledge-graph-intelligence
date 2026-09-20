from ddgs import DDGS
import json

try:
    print("Testing DDGS...")
    results = DDGS().text("python programming", max_results=5)
    print(f"Type: {type(results)}")
    results_list = list(results)
    print(f"Count: {len(results_list)}")
    print(json.dumps(results_list, indent=2))
except Exception as e:
    print(f"Error: {e}")
