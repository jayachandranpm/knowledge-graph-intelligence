import os
import json
from google import genai
from google.genai import types
import requests
from bs4 import BeautifulSoup

# Initialize Gemini Client
# Ensure GEMINI_API_KEY is set in your environment variables
GOOGLE_API_KEY = os.getenv('GEMINI_API_KEY') or os.getenv('VITE_GEMINI_API_KEY')
client = genai.Client(api_key=GOOGLE_API_KEY)

def generate_knowledge_graph(topic, context=""):
    model = "gemini-2.5-flash"
    
    prompt = f"""
    Act as a Knowledge Graph extraction engine using the Graphiti library framework.
    
    Topic: {topic}
    Source Context: {context if context else "No external context provided. Use internal knowledge."}
    
    Task: Create a detailed, comprehensive knowledge graph about the topic "{topic}".
    The graph should focus on the ecosystem, products, key features, pricing models, competitors, and key concepts.
    
    Requirements:
    - Generate at least 25-30 nodes.
    - Generate at least 30-40 relationships (links).
    - Nodes must have a 'group' property: 'product', 'feature', 'concept', 'company', or 'person'.
    - Links must have a 'relation' property describing the edge (e.g., "includes", "integrates_with", "founded_by").
    - Ensure the JSON is strictly valid.
    """
    
    try:
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": {
                    "type": types.Type.OBJECT,
                    "properties": {
                        "nodes": {
                            "type": types.Type.ARRAY,
                            "items": {
                                "type": types.Type.OBJECT,
                                "properties": {
                                    "id": {"type": types.Type.STRING},
                                    "label": {"type": types.Type.STRING},
                                    "group": {"type": types.Type.STRING, "enum": ['product', 'feature', 'concept', 'company', 'person']},
                                    "details": {"type": types.Type.STRING},
                                    "val": {"type": types.Type.NUMBER, "description": "Importance value 1-10"}
                                },
                                "required": ["id", "label", "group", "val"]
                            }
                        },
                        "links": {
                            "type": types.Type.ARRAY,
                            "items": {
                                "type": types.Type.OBJECT,
                                "properties": {
                                    "source": {"type": types.Type.STRING},
                                    "target": {"type": types.Type.STRING},
                                    "relation": {"type": types.Type.STRING}
                                },
                                "required": ["source", "target", "relation"]
                            }
                        }
                    }
                }
            }
        )
        
        if not response.text:
            raise Exception("No data returned from Gemini")
            
        data = json.loads(response.text)
        
        # Cleanup and Validation
        nodes = data.get('nodes', [])
        links = data.get('links', [])
        
        node_ids = set(n['id'] for n in nodes)
        valid_links = []
        
        for link in links:
            if link['source'] in node_ids and link['target'] in node_ids:
                valid_links.append(link)
            else:
                print(f"Pruning invalid link: {link['source']} -> {link['target']}")
                
        return {"nodes": nodes, "links": valid_links}
        
    except Exception as e:
        print(f"Graph Generation Error: {e}")
        raise e

def expand_graph(original_data, target_node):
    model = "gemini-2.5-flash"
    
    prompt = f"""
    Act as a Knowledge Graph expansion engine.
    
    Target Entity: "{target_node['label']}" (Type: {target_node['group']})
    Context: This entity is part of a larger graph about "{original_data['nodes'][0]['label'] if original_data['nodes'] else 'unknown topic'}".
    
    Task: Identify 5-8 NEW, specific entities that are directly related to "{target_node['label']}" but are NOT already in the existing list.
    
    Existing Nodes (DO NOT DUPLICATE):
    {', '.join([n['label'] for n in original_data['nodes']])}
    
    Requirements:
    - Generate 5-8 new nodes.
    - Generate links connecting these new nodes to the Target Entity ("{target_node['id']}").
    - You may also link new nodes to other existing nodes if a strong relationship exists.
    - Ensure the JSON is strictly valid.
    """
    
    try:
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": {
                    "type": types.Type.OBJECT,
                    "properties": {
                        "nodes": {
                            "type": types.Type.ARRAY,
                            "items": {
                                "type": types.Type.OBJECT,
                                "properties": {
                                    "id": {"type": types.Type.STRING},
                                    "label": {"type": types.Type.STRING},
                                    "group": {"type": types.Type.STRING, "enum": ['product', 'feature', 'concept', 'company', 'person']},
                                    "details": {"type": types.Type.STRING},
                                    "val": {"type": types.Type.NUMBER, "description": "Importance value 1-10"}
                                },
                                "required": ["id", "label", "group", "val"]
                            }
                        },
                        "links": {
                            "type": types.Type.ARRAY,
                            "items": {
                                "type": types.Type.OBJECT,
                                "properties": {
                                    "source": {"type": types.Type.STRING},
                                    "target": {"type": types.Type.STRING},
                                    "relation": {"type": types.Type.STRING}
                                },
                                "required": ["source", "target", "relation"]
                            }
                        }
                    }
                }
            }
        )
        
        if not response.text:
            raise Exception("No data returned from Gemini for expansion")
            
        new_data = json.loads(response.text)
        
        # Mark new nodes
        new_nodes = new_data.get('nodes', [])
        for n in new_nodes:
            n['status'] = 'new'
            
        # Ensure all nodes mentioned in links exist
        existing_ids = set(n['id'] for n in original_data['nodes'])
        new_node_ids = set(n['id'] for n in new_nodes)
        
        links = new_data.get('links', [])
        for link in links:
            source = link['source']
            target = link['target']
            
            # Check Source
            if source not in existing_ids and source not in new_node_ids:
                print(f"Auto-creating missing source node: {source}")
                new_nodes.append({
                    "id": source,
                    "label": source.replace('_', ' '),
                    "group": "concept", # Default to concept
                    "details": "Inferred entity from relationship.",
                    "val": 5,
                    "status": "new"
                })
                new_node_ids.add(source)
                
            # Check Target
            if target not in existing_ids and target not in new_node_ids:
                print(f"Auto-creating missing target node: {target}")
                new_nodes.append({
                    "id": target,
                    "label": target.replace('_', ' '),
                    "group": "concept", # Default to concept
                    "details": "Inferred entity from relationship.",
                    "val": 5,
                    "status": "new"
                })
                new_node_ids.add(target)
        
        return {"nodes": new_nodes, "links": links}
        
    except Exception as e:
        print(f"Graph Expansion Error: {e}")
        raise e

def search_web(topic):
    from ddgs import DDGS
    import time
    
    print(f"Searching DuckDuckGo for: {topic}")
    
    for attempt in range(3):
        try:
            # Use ddgs with IN region and safesearch off for better relevance
            results = DDGS().text(topic, region='in-en', safesearch='off', max_results=5)
            # Convert generator/list to list safely
            results_list = list(results) if results else []
            
            if results_list:
                urls = [r['href'] for r in results_list if 'href' in r]
                print(f"Found URLs (Attempt {attempt+1}): {urls}")
                return urls
            else:
                print(f"Attempt {attempt+1}: No results found.")
                time.sleep(1)
                
        except Exception as e:
            print(f"DuckDuckGo Search Error (Attempt {attempt+1}): {e}")
            time.sleep(1)
            
    # Fallback to Wikipedia if search fails after retries
    print("All search attempts failed. Using fallback.")
    return [f"https://en.wikipedia.org/wiki/{topic.replace(' ', '_')}"]

def answer_question(question, graph_context):
    model = "gemini-2.5-flash"
    
    # Create context summary
    nodes = graph_context.get('nodes', [])
    links = graph_context.get('links', [])
    
    context_summary = "\n".join([f"{n['label']} ({n['group']}): {n.get('details', '')}" for n in nodes])
    relationships = "\n".join([f"{l['source']} -> {l['relation']} -> {l['target']}" for l in links])
    
    prompt = f"""
    You are an intelligent assistant powered by a Knowledge Graph about the topic.
    
    Context from Knowledge Graph:
    {context_summary}
    
    Relationships:
    {relationships}
    
    User Question: {question}
    
    Instructions:
    - Answer the question comprehensively using the provided context.
    - If the context is missing specific details, use your internal knowledge or the provided search tool.
    - CITATIONS: When you use information from a specific node in the graph, you MUST cite it using the format [cite: node_id].
    - Example: "Zoho CRM [cite: 3] is a product of Zoho Corp [cite: 1]."
    - Do not use markdown links for citations, use the [cite: id] format exactly.
    """
    
    try:
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config={
                "tools": [{"google_search": {}}],
                "system_instruction": "You are a helpful expert.",
            }
        )
        
        return response.text or "I could not generate an answer."
    except Exception as e:
        print(f"RAG Error: {e}")
        return "Error generating response."

def scrape_urls(urls):
    scraped_content = []
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    for url in urls[:3]: # Limit to top 3 to save time/tokens
        try:
            print(f"Scraping: {url}")
            response = requests.get(url, headers=headers, timeout=5)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Remove scripts and styles
                for script in soup(["script", "style"]):
                    script.decompose()
                    
                text = soup.get_text()
                
                # Clean text
                lines = (line.strip() for line in text.splitlines())
                chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
                text = '\n'.join(chunk for chunk in chunks if chunk)
                
                # Limit length
                scraped_content.append(f"--- Content from {url} ---\n{text[:2000]}")
            else:
                scraped_content.append(f"--- Failed to scrape {url}: Status {response.status_code} ---")
                
        except Exception as e:
            print(f"Scrape Error for {url}: {e}")
            scraped_content.append(f"--- Failed to scrape {url}: {str(e)} ---")
            
    return "\n\n".join(scraped_content)
