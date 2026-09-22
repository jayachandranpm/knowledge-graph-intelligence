import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from models import db, Session, Node, Link, Log, Message
from services.gemini_service import generate_knowledge_graph, expand_graph, search_web, answer_question, scrape_urls
from sqlalchemy import text

import mysql.connector
from mysql.connector import Error

app = Flask(__name__)
CORS(app)

MAX_TOPIC_LENGTH = 200
MAX_CONTEXT_LENGTH = 20_000
MAX_MESSAGE_LENGTH = 4_000

# Database Configuration
# Construct URI from individual env vars to keep ORM working while using user's preferred config method
db_user = os.getenv('DB_USER')
db_password = os.getenv('DB_PASSWORD')
db_host = os.getenv('DB_HOST')
db_name = os.getenv('DB_NAME')

database_url = os.getenv('DATABASE_URL')
if not database_url:
    if all((db_user, db_password, db_host, db_name)):
        database_url = f"mysql+mysqlconnector://{db_user}:{db_password}@{db_host}/{db_name}"
    else:
        database_url = 'sqlite:///knowledge_graph.db'

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

def create_connection():
    try:
        connection = mysql.connector.connect(
            host=os.getenv('DB_HOST'),
            database=os.getenv('DB_NAME'),
            user=os.getenv('DB_USER'),
            password=os.getenv('DB_PASSWORD')
        )
        if connection.is_connected():
            return connection
    except Error as e:
        app.logger.error(f"Error connecting to MySQL database: {str(e)}")
        return None

with app.app_context():
    db.create_all()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/health', methods=['GET'])
@app.route('/api/health', methods=['GET'])
def health_check():
    try:
        db.session.execute(text('SELECT 1'))
        return jsonify({
            "status": "healthy",
            "database": db.engine.url.get_backend_name(),
        })
    except Exception as e:
        app.logger.error("Database health check failed: %s", e)
        return jsonify({"status": "unhealthy", "database": "unavailable"}), 503

@app.route('/api/search', methods=['POST'])
def search_endpoint():
    data = request.get_json(silent=True) or {}
    topic = str(data.get('topic', '')).strip()
    if not topic:
        return jsonify({"error": "Topic is required"}), 400
    if len(topic) > MAX_TOPIC_LENGTH:
        return jsonify({"error": f"Topic must be {MAX_TOPIC_LENGTH} characters or fewer"}), 400
    
    try:
        urls = search_web(topic)
        return jsonify({"urls": urls, "count": len(urls)})
    except Exception as e:
        app.logger.warning("Web search unavailable; continuing with model knowledge: %s", e)
        return jsonify({"urls": [], "count": 0})

@app.route('/api/scrape', methods=['POST'])
def scrape_endpoint():
    data = request.get_json(silent=True) or {}
    urls = data.get('urls', [])
    if not isinstance(urls, list):
        return jsonify({"error": "URLs must be provided as a list"}), 400
    urls = [url for url in urls[:5] if isinstance(url, str)]
    if not urls:
        return jsonify("")
    
    try:
        scraped_data = scrape_urls(urls)
        return jsonify(scraped_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/graph/generate', methods=['POST'])
def generate_graph():
    data = request.get_json(silent=True) or {}
    topic = str(data.get('topic', '')).strip()
    context = str(data.get('context', ''))[:MAX_CONTEXT_LENGTH]
    source_urls = data.get('source_urls', [])
    
    if not topic:
        return jsonify({"error": "Topic is required"}), 400
    if len(topic) > MAX_TOPIC_LENGTH:
        return jsonify({"error": f"Topic must be {MAX_TOPIC_LENGTH} characters or fewer"}), 400
    if not isinstance(source_urls, list):
        source_urls = []
        
    try:
        # Generate Graph with context
        graph_data = generate_knowledge_graph(topic, context)
        

        
        # 3. Save to DB (Simplified: Create new session)
        session = Session(topic=topic)
        db.session.add(session)
        db.session.commit()
        
        # Save Nodes
        for n in graph_data['nodes']:
            node = Node(
                id=n['id'],
                session_id=session.id,
                label=n['label'],
                group=n['group'],
                details=n.get('details'),
                val=n.get('val')
            )
            db.session.add(node)
            
        # Save Links
        for l in graph_data['links']:
            link = Link(
                session_id=session.id,
                source=l['source'],
                target=l['target'],
                relation=l['relation']
            )
            db.session.add(link)
            
        db.session.commit()
        
        return jsonify({
            "session_id": session.id,
            "graph": graph_data,
            "sources": source_urls
        })
        
    except Exception as e:
        db.session.rollback()
        app.logger.exception("Graph generation failed")
        return jsonify({"error": str(e)}), 500

@app.route('/api/graph/expand', methods=['POST'])
def expand_graph_endpoint():
    data = request.get_json(silent=True) or {}
    session_id = data.get('session_id')
    node_id = data.get('node_id')
    
    if not session_id or not node_id:
        return jsonify({"error": "Session ID and Node ID are required"}), 400
        
    try:
        # Fetch current graph state
        session = db.session.get(Session, session_id)
        if not session:
            return jsonify({"error": "Session not found"}), 404
            
        nodes = [{"id": n.id, "label": n.label, "group": n.group} for n in session.nodes]
        links = [{"source": l.source, "target": l.target, "relation": l.relation} for l in session.links]
        
        target_node_obj = Node.query.filter_by(session_id=session_id, id=node_id).first()
        if not target_node_obj:
            return jsonify({"error": "Node not found"}), 404
            
        target_node_dict = {
            "id": target_node_obj.id,
            "label": target_node_obj.label,
            "group": target_node_obj.group
        }
        
        # Call Gemini Service
        original_data = {"nodes": nodes, "links": links}
        new_data = expand_graph(original_data, target_node_dict)
        
        # Save new nodes and links
        for n in new_data['nodes']:
            # Check if exists
            exists = Node.query.filter_by(session_id=session_id, id=n['id']).first()
            if not exists:
                node = Node(
                    id=n['id'],
                    session_id=session.id,
                    label=n['label'],
                    group=n['group'],
                    details=n.get('details'),
                    val=n.get('val'),
                    status='new'
                )
                db.session.add(node)
                
        for l in new_data['links']:
            link = Link(
                session_id=session.id,
                source=l['source'],
                target=l['target'],
                relation=l['relation']
            )
            db.session.add(link)
            
        db.session.commit()
        
        return jsonify(new_data)
        
    except Exception as e:
        db.session.rollback()
        app.logger.exception("Graph expansion failed")
        return jsonify({"error": str(e)}), 500

@app.route('/api/chat', methods=['POST'])
def chat_endpoint():
    data = request.get_json(silent=True) or {}
    session_id = data.get('session_id')
    message = str(data.get('message', '')).strip()
    
    if not session_id or not message:
        return jsonify({"error": "Session ID and Message are required"}), 400
    if len(message) > MAX_MESSAGE_LENGTH:
        return jsonify({"error": f"Message must be {MAX_MESSAGE_LENGTH} characters or fewer"}), 400
        
    try:
        # Save User Message
        user_msg = Message(session_id=session_id, role='user', content=message)
        db.session.add(user_msg)
        
        # Get Graph Context
        session = db.session.get(Session, session_id)
        if not session:
            db.session.rollback()
            return jsonify({"error": "Session not found"}), 404
        nodes = [{"label": n.label, "group": n.group, "details": n.details} for n in session.nodes]
        links = [{"source": l.source, "target": l.target, "relation": l.relation} for l in session.links]
        graph_context = {"nodes": nodes, "links": links}
        
        # Get Answer
        answer = answer_question(message, graph_context)
        
        # Save Assistant Message
        ai_msg = Message(session_id=session_id, role='assistant', content=answer)
        db.session.add(ai_msg)
        db.session.commit()
        
        return jsonify({"response": answer})
        
    except Exception as e:
        db.session.rollback()
        app.logger.exception("Chat request failed")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('X_ZOHO_CATALYST_LISTEN_PORT', os.getenv('PORT', '5000')))
    debug = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(debug=debug, host='0.0.0.0', port=port)
