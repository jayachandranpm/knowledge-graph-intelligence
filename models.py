from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Session(db.Model):
    __tablename__ = 'sessions'
    id = db.Column(db.Integer, primary_key=True)
    topic = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    nodes = db.relationship('Node', backref='session', lazy=True, cascade="all, delete-orphan")
    links = db.relationship('Link', backref='session', lazy=True, cascade="all, delete-orphan")
    logs = db.relationship('Log', backref='session', lazy=True, cascade="all, delete-orphan")
    messages = db.relationship('Message', backref='session', lazy=True, cascade="all, delete-orphan")

class Node(db.Model):
    __tablename__ = 'nodes'
    id = db.Column(db.String(255), primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id'), primary_key=True)
    label = db.Column(db.String(255), nullable=False)
    group = db.Column(db.String(50), nullable=False)
    details = db.Column(db.Text)
    val = db.Column(db.Integer)
    status = db.Column(db.String(50), default='existing')

class Link(db.Model):
    __tablename__ = 'links'
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id'), nullable=False)
    source = db.Column(db.String(255), nullable=False)
    target = db.Column(db.String(255), nullable=False)
    relation = db.Column(db.String(255), nullable=False)

class Log(db.Model):
    __tablename__ = 'logs'
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id'), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    source = db.Column(db.String(50), nullable=False)
    message = db.Column(db.Text, nullable=False)
    type = db.Column(db.String(20), default='info')

class Message(db.Model):
    __tablename__ = 'messages'
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id'), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
