# Knowledge Graph Intelligence

A Gemini-powered Flask workspace that turns a topic into an explorable knowledge graph, expands individual nodes, preserves graph sessions, and answers questions against the visible graph context.

<p><a href="https://knowledgegraph-10134474052.development.catalystappsail.com/">Open the live application</a></p>

<img src="assets/knowledge-graph.png" alt="Knowledge Graph Intelligence light graph-first workspace" width="100%">

## Features

- Topic-to-graph generation with typed nodes and relationships
- Interactive graph exploration and node expansion
- Contextual chat grounded in the current graph
- Search, import, relevance checks, and persistent sessions
- Responsive web interface with a Python/Flask API

## Repository contents

The repository includes the current graph-first interface and its complete Flask implementation. The browser application lives in `templates/`, `static/css/`, and `static/js/`; the API, persistence models, and Gemini integration live in `app.py`, `models.py`, and `services/`.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python app.py
```

Add your own Gemini key to `.env`. The app uses a local SQLite database by default; set `DATABASE_URL` or the MySQL fields only when you want an external database. Local environment files and databases are excluded from this repository.
