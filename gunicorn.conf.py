import os


appsail_port = os.getenv("X_ZOHO_CATALYST_LISTEN_PORT", "5000")
bind = os.getenv("GUNICORN_BIND", f"0.0.0.0:{appsail_port}")
workers = int(os.getenv("GUNICORN_WORKERS", "2"))
worker_class = "sync"
timeout = 120
keepalive = 5
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")
proc_name = "knowledge-graph-intelligence"
