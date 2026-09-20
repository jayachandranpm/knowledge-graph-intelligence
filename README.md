# Knowledge Graph Intelligence

A Gemini-powered Flask workspace that turns a topic into an explorable knowledge graph, expands individual nodes, preserves graph sessions, and answers questions against the visible graph context.

![Knowledge Graph Intelligence interface](assets/knowledge-graph.png)

## Features

- Topic-to-graph generation with typed nodes and relationships
- Interactive graph exploration and node expansion
- Contextual chat grounded in the current graph
- Search, import, relevance checks, and persistent sessions
- Responsive web interface with a Python/Flask API

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python app.py
```

Add your own Gemini key and database settings to `.env`. Local environment files and databases are excluded from this repository.

