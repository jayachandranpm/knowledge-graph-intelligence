import ipaddress
import json
import os
import re
import socket
import time
from collections import Counter
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen


MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"
ALLOWED_GROUPS = {"product", "feature", "concept", "company", "person"}


def _gemini_api_key():
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("VITE_GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Gemini API key is not configured")
    return api_key


def _call_gemini(prompt, response_schema=None, use_search=False):
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.25},
    }
    if response_schema:
        payload["generationConfig"].update({
            "responseMimeType": "application/json",
            "responseJsonSchema": response_schema,
        })
    if use_search:
        payload["tools"] = [{"google_search": {}}]

    url = (
        f"{GEMINI_ENDPOINT}/{quote(MODEL, safe='')}:generateContent"
        f"?key={quote(_gemini_api_key(), safe='')}"
    )
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "KnowledgeGraph/1.0",
        },
        method="POST",
    )

    result = None
    for attempt in range(2):
        try:
            with urlopen(request, timeout=105) as response:
                result = json.loads(response.read().decode("utf-8"))
            break
        except HTTPError as error:
            detail = error.read(1000).decode("utf-8", errors="replace")
            if error.code in {429, 500, 502, 503, 504} and attempt < 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            if error.code == 429:
                message = "The AI service is temporarily rate-limited. Please try again shortly."
            elif error.code in {500, 502, 503, 504}:
                message = "The AI service is temporarily busy. Please try again shortly."
            else:
                try:
                    message = json.loads(detail).get("error", {}).get(
                        "message", "The AI service rejected the request."
                    )
                except json.JSONDecodeError:
                    message = "The AI service rejected the request."
            raise RuntimeError(message) from error
        except (URLError, TimeoutError) as error:
            if attempt < 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise RuntimeError(
                "The AI service could not be reached. Please try again shortly."
            ) from error

    if result is None:
        raise RuntimeError("The AI service did not return a response.")

    candidates = result.get("candidates") or []
    if not candidates:
        feedback = result.get("promptFeedback", {}).get(
            "blockReason", "no candidate returned"
        )
        raise RuntimeError(f"Gemini returned no response: {feedback}")

    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(part.get("text", "") for part in parts).strip()
    if not text:
        raise RuntimeError("Gemini returned an empty response")
    return text


def _graph_schema():
    return {
        "type": "object",
        "properties": {
            "nodes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "label": {"type": "string"},
                        "group": {
                            "type": "string",
                            "enum": sorted(ALLOWED_GROUPS),
                        },
                        "details": {"type": "string"},
                        "val": {"type": "number"},
                    },
                    "required": ["id", "label", "group", "val"],
                },
            },
            "links": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "source": {"type": "string"},
                        "target": {"type": "string"},
                        "relation": {"type": "string"},
                    },
                    "required": ["source", "target", "relation"],
                },
            },
        },
        "required": ["nodes", "links"],
    }


def _normalize_graph(data):
    nodes = []
    node_ids = set()
    for raw in data.get("nodes", []):
        node_id = str(raw.get("id", "")).strip()[:255]
        label = str(raw.get("label", "")).strip()[:255]
        if not node_id or not label or node_id in node_ids:
            continue
        group = str(raw.get("group", "concept")).lower()
        if group not in ALLOWED_GROUPS:
            group = "concept"
        try:
            value = max(1, min(10, int(float(raw.get("val", 5)))))
        except (TypeError, ValueError):
            value = 5
        nodes.append({
            "id": node_id,
            "label": label,
            "group": group,
            "details": str(raw.get("details", "")).strip()[:2000],
            "val": value,
        })
        node_ids.add(node_id)

    links = []
    seen_links = set()
    for raw in data.get("links", []):
        source = str(raw.get("source", "")).strip()[:255]
        target = str(raw.get("target", "")).strip()[:255]
        relation = (
            str(raw.get("relation", "related_to")).strip()[:255]
            or "related_to"
        )
        key = (source, target, relation)
        if (
            source in node_ids
            and target in node_ids
            and source != target
            and key not in seen_links
        ):
            links.append({
                "source": source,
                "target": target,
                "relation": relation,
            })
            seen_links.add(key)

    if len(nodes) < 2:
        raise RuntimeError("The model did not return enough valid graph nodes")
    return {"nodes": nodes, "links": links}


def generate_knowledge_graph(topic, context=""):
    prompt = f"""
Act as a knowledge-graph extraction engine. Build a useful graph for: {topic}

Source context:
{context or 'No external context was available; use established knowledge.'}

Return 18-24 entities and 24-32 meaningful relationships. Cover the ecosystem,
products, features, competitors, people, and key concepts. Use stable, concise
IDs. Each node group must be product, feature, concept, company, or person.
"""
    return _normalize_graph(
        json.loads(_call_gemini(prompt, _graph_schema()))
    )


def fallback_knowledge_graph(topic, context=""):
    root_id = "topic"
    nodes = [{
        "id": root_id,
        "label": topic,
        "group": "concept",
        "details": "The central topic for this source-derived graph.",
        "val": 10,
    }]

    phrase_pattern = re.compile(
        r"\b[A-Z][A-Za-z0-9&.-]+(?:[ \t]+[A-Z][A-Za-z0-9&.-]+){0,3}\b"
    )
    banned_terms = {
        "about", "account", "appearance", "community", "contact",
        "ceo", "content", "contribute", "create", "developer", "donate", "edit",
        "for", "founded", "headquarters", "help", "history", "industry",
        "jump", "key", "language", "learn", "log", "main", "menu",
        "navigation", "page", "random", "read", "recent", "references",
        "publisher", "products", "revenue", "search", "special", "talk",
        "this", "title", "tools", "type", "upload", "view", "website",
        "wikipedia", "worldwide",
    }
    counts = Counter()
    for raw_phrase in phrase_pattern.findall(context):
        phrase = raw_phrase.strip(" .,-")
        words = set(re.findall(r"[a-z]+", phrase.lower()))
        if len(phrase) <= 2 or words & banned_terms:
            continue
        counts[phrase] += 1

    candidates = []
    topic_lower = topic.lower()
    ranked_phrases = sorted(
        counts.items(),
        key=lambda item: (
            item[1],
            len(item[0].split()) > 1,
            len(item[0].split()),
            len(item[0]),
        ),
        reverse=True,
    )
    for phrase, count in ranked_phrases[:60]:
        if phrase.lower() == topic_lower:
            continue
        if any(phrase.lower() == existing.lower() for existing, _ in candidates):
            continue
        candidates.append((phrase, count))
        if len(candidates) == 14:
            break

    if len(candidates) < 6:
        candidates.extend([
            ("Key Concepts", 3),
            ("Products and Services", 3),
            ("Organizations", 2),
            ("People", 2),
            ("Applications", 2),
            ("Open Questions", 1),
        ])

    links = []
    used_ids = {root_id}
    for index, (label, count) in enumerate(candidates[:14], start=1):
        base_id = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_") or f"entity_{index}"
        node_id = base_id
        suffix = 2
        while node_id in used_ids:
            node_id = f"{base_id}_{suffix}"
            suffix += 1
        used_ids.add(node_id)

        lowered = label.lower()
        group = "company" if any(
            marker in lowered
            for marker in ("company", "corporation", "corp", "inc", "ltd")
        ) else "concept"
        nodes.append({
            "id": node_id,
            "label": label,
            "group": group,
            "details": "Identified in the retrieved source material.",
            "val": max(3, min(8, count + 3)),
        })
        links.append({
            "source": root_id,
            "target": node_id,
            "relation": "related_to",
        })

    return {"nodes": nodes, "links": links}


def expand_graph(original_data, target_node):
    existing = ", ".join(
        str(node.get("label", ""))
        for node in original_data.get("nodes", [])
    )
    prompt = f"""
Expand a knowledge graph around {target_node['label']}
({target_node['group']}). Create 5-8 new entities and their direct
relationships. Do not duplicate these existing entities: {existing}.
Include the target ID {target_node['id']} in links but do not recreate
the target as a new node.
"""
    raw = json.loads(_call_gemini(prompt, _graph_schema()))

    raw_nodes = raw.get("nodes", [])
    if not any(
        str(node.get("id")) == str(target_node["id"])
        for node in raw_nodes
    ):
        raw_nodes.append({
            **target_node,
            "details": target_node.get("details", ""),
            "val": 7,
        })

    normalized = _normalize_graph({
        "nodes": raw_nodes,
        "links": raw.get("links", []),
    })
    normalized["nodes"] = [
        {**node, "status": "new"}
        for node in normalized["nodes"]
        if node["id"] != str(target_node["id"])
    ]
    return normalized


def search_web(topic):
    params = urlencode({
        "action": "opensearch",
        "search": topic,
        "limit": 5,
        "namespace": 0,
        "format": "json",
    })
    request = Request(
        f"https://en.wikipedia.org/w/api.php?{params}",
        headers={
            "User-Agent": "KnowledgeGraph/1.0 (research application)"
        },
    )
    try:
        with urlopen(request, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
        titles = payload[1] if len(payload) > 1 else []
        raw_urls = payload[3] if len(payload) > 3 else []
        topic_terms = {
            term for term in re.findall(r"[a-z0-9]+", topic.lower())
            if len(term) > 2
        }
        distinctive_terms = topic_terms - {
            "company", "corporation", "group", "inc", "limited", "ltd",
        }
        ranked_urls = []
        for title, url in zip(titles, raw_urls):
            title_terms = set(re.findall(r"[a-z0-9]+", title.lower()))
            overlap = len(topic_terms & title_terms)
            distinctive_overlap = len(distinctive_terms & title_terms)
            if (
                overlap
                and (not distinctive_terms or distinctive_overlap)
                and _is_public_http_url(url)
            ):
                ranked_urls.append((
                    title.lower() == topic.lower(),
                    overlap,
                    url,
                ))
        ranked_urls.sort(reverse=True)
        urls = [item[2] for item in ranked_urls[:5]]
        if urls:
            return urls
    except (
        HTTPError,
        URLError,
        TimeoutError,
        ValueError,
        json.JSONDecodeError,
    ):
        pass
    return [
        f"https://en.wikipedia.org/wiki/"
        f"{quote(topic.replace(' ', '_'))}"
    ]


def answer_question(question, graph_context):
    node_context = "\n".join(
        f"{node['label']} [{node.get('id', '')}] "
        f"({node['group']}): {node.get('details', '')}"
        for node in graph_context.get("nodes", [])
    )
    relationships = "\n".join(
        f"{link['source']} -> {link['relation']} -> {link['target']}"
        for link in graph_context.get("links", [])
    )
    prompt = f"""
Answer the user's question using this knowledge graph. Cite graph nodes
with the exact format [cite: node_id]. Be concise, direct, and clearly
distinguish facts from inferences.

Nodes:
{node_context}

Relationships:
{relationships}

Question: {question}
"""
    return _call_gemini(prompt)


def fallback_answer(question, graph_context):
    question_terms = {
        token for token in re.findall(r"[a-z0-9]+", question.lower())
        if len(token) > 2
    }
    scored = []
    for node in graph_context.get("nodes", []):
        searchable = f"{node.get('label', '')} {node.get('details', '')}".lower()
        score = sum(term in searchable for term in question_terms)
        scored.append((score, node))
    scored.sort(key=lambda item: (item[0], item[1].get("val", 0)), reverse=True)
    relevant = [node for _, node in scored[:4]]
    if not relevant:
        return "The graph does not yet contain enough information to answer that question."
    entities = "; ".join(
        f"{node['label']} [cite: {node['id']}]: {node.get('details') or node['group']}"
        for node in relevant
    )
    return (
        "The AI service is temporarily busy, so this answer uses the saved "
        f"graph context directly. Relevant entities: {entities}"
    )


def _is_public_http_url(url):
    try:
        parsed = urlparse(url)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
        ):
            return False
        addresses = socket.getaddrinfo(
            parsed.hostname,
            parsed.port or 443,
            type=socket.SOCK_STREAM,
        )
        return bool(addresses) and all(
            ipaddress.ip_address(item[4][0]).is_global
            for item in addresses
        )
    except (OSError, ValueError):
        return False


class _PublicRedirectHandler(HTTPRedirectHandler):
    def redirect_request(
        self,
        request,
        file_pointer,
        code,
        message,
        headers,
        new_url,
    ):
        if not _is_public_http_url(new_url):
            raise HTTPError(
                new_url,
                403,
                "Redirect target is not public",
                headers,
                file_pointer,
            )
        return super().redirect_request(
            request,
            file_pointer,
            code,
            message,
            headers,
            new_url,
        )


class _VisibleTextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hidden_depth = 0
        self.main_depth = 0
        self.parts = []
        self.main_parts = []

    def handle_starttag(self, tag, attrs):
        if tag == "main":
            self.main_depth += 1
        if tag in {
            "script", "style", "noscript", "svg", "nav", "header",
            "footer", "aside",
        }:
            self.hidden_depth += 1

    def handle_endtag(self, tag):
        if tag == "main" and self.main_depth:
            self.main_depth -= 1
        if (
            tag in {
                "script", "style", "noscript", "svg", "nav", "header",
                "footer", "aside",
            }
            and self.hidden_depth
        ):
            self.hidden_depth -= 1

    def handle_data(self, data):
        if not self.hidden_depth:
            clean = " ".join(data.split())
            if clean:
                self.parts.append(clean)
                if self.main_depth:
                    self.main_parts.append(clean)


def scrape_urls(urls):
    opener = build_opener(_PublicRedirectHandler())
    scraped_content = []
    for url in urls[:3]:
        if not _is_public_http_url(url):
            continue
        try:
            request = Request(
                url,
                headers={"User-Agent": "KnowledgeGraph/1.0"},
            )
            with opener.open(request, timeout=8) as response:
                content_type = response.headers.get_content_type()
                if content_type not in {"text/html", "text/plain"}:
                    continue
                body = response.read(200_000).decode(
                    response.headers.get_content_charset() or "utf-8",
                    errors="replace",
                )
                final_url = response.geturl()
            parser = _VisibleTextParser()
            parser.feed(body)
            text = "\n".join(parser.main_parts or parser.parts)[:1500]
            if text:
                scraped_content.append(
                    f"--- Content from {final_url} ---\n{text}"
                )
        except (
            HTTPError,
            URLError,
            TimeoutError,
            ValueError,
        ):
            continue
    return "\n\n".join(scraped_content)
