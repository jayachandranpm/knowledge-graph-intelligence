try:
    from duckduckgo_search import DDGS
    print("Import successful: from duckduckgo_search import DDGS")
    results = DDGS().text("python", max_results=1)
    print(f"Search successful. Found {len(list(results))} results.")
except ImportError:
    print("Import failed: duckduckgo_search")
    try:
        from ddgs import DDGS
        print("Import successful: from ddgs import DDGS")
        results = DDGS().text("python", max_results=1)
        print(f"Search successful. Found {len(list(results))} results.")
    except ImportError:
        print("Import failed: ddgs")
except Exception as e:
    print(f"Error: {e}")
