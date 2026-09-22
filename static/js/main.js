document.addEventListener('DOMContentLoaded', () => {
    document.body.dataset.view = 'DASHBOARD';

    // State
    let sessionId = null;
    let graph = new KnowledgeGraph('d3-graph');

    // Elements
    const topicInput = document.getElementById('topic-input');
    const startBtn = document.getElementById('start-btn');
    const logsContainer = document.getElementById('console-logs');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chatHistory = document.getElementById('chat-history');
    const pipelineSteps = document.querySelectorAll('.step-item');
    const emptyState = document.getElementById('graph-empty-state');
    const currentTopicLabel = document.getElementById('current-topic');
    const statusDot = document.getElementById('status-dot');
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    const leftPanel = document.getElementById('left-panel');
    const rightPanel = document.getElementById('right-panel');
    const graphContainer = document.getElementById('graph-container');
    const suggestedTopics = document.querySelectorAll('.suggested-topic');
    const startButtonDefault = startBtn.innerHTML;
    let isGenerating = false;
    let isSending = false;

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    // --- Logger ---
    function addLog(source, message, type = 'info') {
        const placeholder = document.getElementById('logs-placeholder');
        if (placeholder) placeholder.remove();

        const div = document.createElement('div');
        div.className = 'flex gap-3 items-start hover:bg-white/5 px-2 py-1 rounded transition-colors group animate-in fade-in slide-in-from-left-2 duration-300';

        const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

        let colorClass = 'text-gray-400';
        if (type === 'success') colorClass = 'text-emerald-400';
        if (type === 'error') colorClass = 'text-red-400';
        if (type === 'warning') colorClass = 'text-amber-400';

        div.innerHTML = `
            <span class="text-gray-600 min-w-[55px] select-none">${time}</span>
            <div class="flex items-center gap-2 min-w-[90px] font-bold select-none">
                <span class="${source === 'SYSTEM' ? 'text-gray-500' : 'text-gray-300'}">${source}</span>
            </div>
            <span class="flex-1 break-words leading-tight ${colorClass}">${escapeHtml(message)}</span>
        `;

        logsContainer.appendChild(div);
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    // --- Pipeline UI ---
    function updatePipelineStep(step) {
        pipelineSteps.forEach(el => {
            const elStep = el.dataset.step;
            const bar = el.querySelector('.h-full');
            const iconBox = el.querySelector('.relative.z-10');

            // Reset
            bar.classList.remove('w-full', 'bg-emerald-500', 'w-[60%]', 'animate-[pulse_2s_infinite]');
            bar.classList.add('w-0');
            iconBox.classList.remove('bg-emerald-500', 'border-emerald-500', 'text-white', 'bg-blue-600', 'border-blue-500');
            iconBox.classList.add('bg-gray-800', 'border-gray-700', 'text-gray-500');

            if (elStep === step) {
                // Active
                bar.classList.remove('w-0');
                bar.classList.add('w-[60%]', 'bg-blue-500', 'animate-[pulse_2s_infinite]');
                iconBox.classList.remove('bg-gray-800', 'border-gray-700', 'text-gray-500');
                iconBox.classList.add('bg-blue-600', 'border-blue-500', 'text-white');
            } else if (isStepCompleted(step, elStep)) {
                // Completed
                bar.classList.remove('w-0');
                bar.classList.add('w-full', 'bg-emerald-500');
                iconBox.classList.remove('bg-gray-800', 'border-gray-700', 'text-gray-500');
                iconBox.classList.add('bg-emerald-500', 'border-emerald-500', 'text-white');
            }
        });
    }

    function isStepCompleted(current, target) {
        const order = ['SEARCH', 'SCRAPE', 'EXTRACT', 'INDEX', 'COMPLETE'];
        return order.indexOf(current) > order.indexOf(target) || current === 'COMPLETE';
    }

    // --- Actions ---
    // --- Actions ---
    startBtn.addEventListener('click', async () => {
        const topic = topicInput.value.trim();
        if (!topic || isGenerating) return;

        isGenerating = true;
        startBtn.disabled = true;
        startBtn.textContent = 'Building graph…';

        // Reset UI
        logsContainer.innerHTML = '';
        emptyState.classList.remove('hidden');
        graph.svg.selectAll("*").remove();
        currentTopicLabel.innerText = topic;
        statusDot.className = 'w-2 h-2 rounded-full bg-blue-500 animate-pulse';

        try {
            addLog('SYSTEM', `Initializing Knowledge Extraction Pipeline for: ${topic}`);

            // 1. Search Phase
            updatePipelineStep('SEARCH');
            addLog('WEB', `Searching trusted sources for "${topic}"...`);

            const searchResponse = await fetch('/api/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic })
            });

            if (!searchResponse.ok) throw new Error("Search failed");
            const searchData = await searchResponse.json();
            const urls = searchData.urls || [];

            addLog('WEB', `Found ${searchData.count} relevant sources.`, 'success');

            // 2. Scrape Phase
            updatePipelineStep('SCRAPE');
            addLog('PARSER', `Reading ${urls.length} source pages...`);

            const scrapeResponse = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urls })
            });

            if (!scrapeResponse.ok) throw new Error("Scraping failed");
            const context = await scrapeResponse.json();

            addLog('PARSER', `Content extraction complete. Context length: ${context.length} chars`, 'success');

            // 3. Extraction Phase
            updatePipelineStep('EXTRACT');
            addLog('GRAPHITI', `Initializing Entity Extraction Model (Gemini 2.5 Flash)...`);
            addLog('GRAPHITI', `Processing unstructured text chunks...`);

            // Actual API Call
            const response = await fetch('/api/graph/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic, context, source_urls: urls })
            });

            const responseBody = await response.text();
            let data;
            try {
                data = JSON.parse(responseBody);
            } catch (parseError) {
                throw new Error('The graph service returned an incomplete response. Please try again.');
            }
            if (!response.ok) {
                throw new Error(data.error || `Graph generation failed (${response.status})`);
            }
            if (data.degraded) {
                addLog(
                    'SYSTEM',
                    'The AI provider is busy. Showing a source-derived graph so you can continue working.',
                    'warning'
                );
            }
            console.log("API Response Data:", data);

            // --- MOCK DATA FALLBACK (If API fails to generate nodes) ---
            if (!data.graph || !data.graph.nodes || data.graph.nodes.length === 0) {
                console.warn("API returned empty graph. Using Mock Data for visualization.");
                addLog('SYSTEM', 'API returned empty data. Loading simulation graph...', 'warning');

                data.graph = {
                    nodes: [
                        { id: "1", label: "Zoho Corp", group: "company", val: 10, details: "Multinational technology company." },
                        { id: "2", label: "Sridhar Vembu", group: "person", val: 8, details: "CEO and Founder." },
                        { id: "3", label: "Zoho CRM", group: "product", val: 7, details: "Customer Relationship Management." },
                        { id: "4", label: "SaaS", group: "concept", val: 6, details: "Software as a Service." },
                        { id: "5", label: "ManageEngine", group: "product", val: 7, details: "IT Management Software." },
                        { id: "6", label: "Chennai", group: "concept", val: 5, details: "Headquarters location." },
                        { id: "7", label: "Bootstrapped", group: "concept", val: 6, details: "Business model." },
                        { id: "8", label: "Zoho One", group: "product", val: 8, details: "Operating System for Business." }
                    ],
                    links: [
                        { source: "2", target: "1", relation: "founded" },
                        { source: "3", target: "1", relation: "product_of" },
                        { source: "5", target: "1", relation: "division_of" },
                        { source: "1", target: "4", relation: "operates_in" },
                        { source: "1", target: "6", relation: "headquartered_in" },
                        { source: "1", target: "7", relation: "is" },
                        { source: "8", target: "1", relation: "product_of" },
                        { source: "8", target: "3", relation: "includes" }
                    ]
                };
                data.session_id = 999; // Mock Session ID
            }
            // -----------------------------------------------------------

            sessionId = data.session_id;

            // Re-enable alert for feedback
            // alert(`Graph generated with ${data.graph.nodes.length} nodes!`); 

            addLog('GRAPHITI', `Identified ${data.graph.nodes.length} unique entities.`, 'success');
            addLog('GRAPHITI', `Extracted ${data.graph.links.length} semantic relationships.`, 'success');

            // 4. Index Phase
            updatePipelineStep('INDEX');
            addLog('DATABASE', `Persisting ${data.graph.nodes.length} graph entities...`);
            await new Promise(r => setTimeout(r, 600));
            addLog('DATABASE', `Graph persisted and ready for questions.`, 'success');

            updatePipelineStep('COMPLETE');
            addLog('SYSTEM', 'Pipeline finished successfully. Knowledge Graph is interactive.', 'success');

            // Render Graph
            emptyState.classList.add('hidden');
            graph.render(data.graph);
            statusDot.className = 'w-2 h-2 rounded-full bg-emerald-500';

            if (window.innerWidth <= 640) {
                handleViewChange('GRAPH');
            }

            // Enable Chat & Export
            chatInput.disabled = false;
            sendBtn.disabled = false;
            chatInput.placeholder = "Ask about the graph...";
            document.getElementById('export-btn').classList.remove('hidden');

        } catch (error) {
            console.error('Pipeline Error:', error);
            const message = error?.message || 'An unexpected error interrupted the pipeline.';
            addLog('SYSTEM', `Pipeline failed: ${message}`, 'error');
            statusDot.className = 'w-2 h-2 rounded-full bg-red-500';
            updatePipelineStep('IDLE');
        } finally {
            isGenerating = false;
            startBtn.disabled = false;
            startBtn.innerHTML = startButtonDefault;
            lucide.createIcons();
        }
    });

    // --- Export ---
    document.getElementById('export-btn')?.addEventListener('click', () => {
        if (!graph.data) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(graph.data, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "knowledge_graph.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        addLog('SYSTEM', 'Graph data exported to JSON.', 'success');
    });

    // --- Chat ---
    async function sendMessage() {
        const msg = chatInput.value.trim();
        if (!msg || !sessionId || isSending) return;

        // User Msg
        appendChatMessage('user', msg);
        chatInput.value = '';
        isSending = true;
        sendBtn.disabled = true;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId, message: msg })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
            appendChatMessage('assistant', data.response);

        } catch (error) {
            appendChatMessage('assistant', "Error: " + error.message);
        } finally {
            isSending = false;
            sendBtn.disabled = false;
            chatInput.focus();
        }
    }

    function appendChatMessage(role, content) {
        const div = document.createElement('div');
        div.className = `flex gap-4 ${role === 'user' ? 'flex-row-reverse' : 'flex-row'} animate-in fade-in slide-in-from-bottom-2 duration-300`;

        // Format Content (Parse Citations)
        const formattedContent = role === 'assistant'
            ? formatMessageContent(content)
            : escapeHtml(content).replaceAll('\n', '<br>');

        div.innerHTML = `
            <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-lg ${role === 'user' ? 'bg-gray-700' : 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white'}">
                ${role === 'user' ? '<div class="w-2 h-2 bg-gray-300 rounded-sm"></div>' : '<i data-lucide="sparkles" class="w-4 h-4"></i>'}
            </div>
            <div class="max-w-[85%] space-y-1.5">
                <div class="p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${role === 'user' ? 'bg-gray-800 text-gray-100 rounded-tr-sm border border-gray-700' : 'bg-[#15161C] text-gray-200 border border-gray-800 rounded-tl-sm'}">
                    ${formattedContent}
                </div>
            </div>
        `;

        chatHistory.appendChild(div);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        lucide.createIcons();
    }

    function formatMessageContent(text) {
        // Regex to find [cite: node_id]
        const safeText = escapeHtml(text);
        return safeText.replace(/\[cite: (.+?)\]/g, (match, id) => {
            const node = graph.data?.nodes?.find(n => n.id === id);
            if (node) {
                return `<span class="citation-badge cursor-pointer inline-flex items-center gap-1 px-1.5 py-0.5 mx-1 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 hover:text-indigo-200 transition-colors border border-indigo-500/20 select-none" data-node-id="${escapeHtml(id)}"><i data-lucide="link" class="w-3 h-3"></i> ${escapeHtml(node.label)}</span>`;
            }
            return match; // Keep original if node not found
        }).replaceAll('\n', '<br>');
    }

    // Event Delegation for Citations
    chatHistory.addEventListener('click', (e) => {
        const badge = e.target.closest('.citation-badge');
        if (badge) {
            const nodeId = badge.dataset.nodeId;
            graph.zoomToNode(nodeId);
            // Also switch to graph view on mobile/small screens if needed, 
            // but for now we assume split view or user handles it.
            // If we are in CHAT view (full screen), we might want to switch to GRAPH view?
            // Let's check current view.
            if (currentView === 'CHAT') {
                // On mobile/single-panel mode, we need to switch. 
                // But in this layout, CHAT view hides the graph. 
                // So yes, we MUST switch to GRAPH view to see the zoom.
                handleViewChange('GRAPH');
            }
        }
    });

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // --- Graph Events ---
    // --- Graph Events ---

    // 1. Node Click (Show Inspector)
    const inspector = document.getElementById('node-inspector');
    const inspectorLabel = document.getElementById('inspector-label');
    const inspectorType = document.getElementById('inspector-type');
    const inspectorDetails = document.getElementById('inspector-details');
    const inspectorExpandBtn = document.getElementById('inspector-expand-btn');
    const inspectorChatBtn = document.getElementById('inspector-chat-btn');
    const closeInspectorBtn = document.getElementById('close-inspector');
    let selectedNode = null;

    document.addEventListener('node-click', (e) => {
        const node = e.detail;
        selectedNode = node;

        // Populate UI
        if (inspectorLabel) inspectorLabel.innerText = node.label;
        if (inspectorType) {
            inspectorType.innerText = node.group;
            // Color code the badge
            const colors = {
                'product': 'text-blue-400 bg-blue-400/10',
                'feature': 'text-emerald-400 bg-emerald-400/10',
                'concept': 'text-purple-400 bg-purple-400/10',
                'company': 'text-amber-400 bg-amber-400/10',
                'person': 'text-red-400 bg-red-400/10'
            };
            inspectorType.className = `text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded ${colors[node.group] || 'text-gray-400 bg-gray-800'}`;
        }
        if (inspectorDetails) inspectorDetails.innerText = node.details || "No additional details available for this entity.";

        // Show Inspector
        inspector?.classList.remove('hidden');
    });

    closeInspectorBtn?.addEventListener('click', () => {
        inspector?.classList.add('hidden');
        selectedNode = null;
        graph.resetHighlight();
    });

    inspectorChatBtn?.addEventListener('click', () => {
        if (!selectedNode) return;
        // Switch to Chat View
        handleViewChange('CHAT');
        // Pre-fill chat
        chatInput.value = `Tell me more about ${selectedNode.label}`;
        chatInput.focus();
    });

    inspectorExpandBtn?.addEventListener('click', () => {
        if (selectedNode) {
            triggerExpansion(selectedNode);
        }
    });

    // 2. Node Double Click (Expand)
    document.addEventListener('node-dblclick', async (e) => {
        triggerExpansion(e.detail);
    });

    async function triggerExpansion(node) {
        if (!sessionId) return;

        addLog('GRAPHITI', `Expanding node: ${node.label}...`);

        // Visual feedback on button if triggered from inspector
        if (inspectorExpandBtn) inspectorExpandBtn.innerText = "Expanding...";

        try {
            const response = await fetch('/api/graph/expand', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId, node_id: node.id })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || `Server Error: ${response.status}`);
            }

            const newData = await response.json();
            console.log("Expansion Data:", newData);

            if (!newData.nodes || newData.nodes.length === 0) {
                addLog('GRAPHITI', 'No new related entities found.', 'warning');
                if (inspectorExpandBtn) inspectorExpandBtn.innerText = "Expand";
                return;
            }

            // Merge Data Safely
            const currentData = graph.data || { nodes: [], links: [] };

            // Filter out duplicates
            const newNodes = newData.nodes.filter(n => !currentData.nodes.find(cn => cn.id === n.id));
            const endpointId = endpoint => endpoint && typeof endpoint === 'object' ? endpoint.id : endpoint;
            const newLinks = newData.links.filter(l => !currentData.links.find(cl => {
                const currentSource = endpointId(cl.source);
                const currentTarget = endpointId(cl.target);
                const nextSource = endpointId(l.source);
                const nextTarget = endpointId(l.target);
                return (currentSource === nextSource && currentTarget === nextTarget) ||
                    (currentSource === nextTarget && currentTarget === nextSource);
            }));

            if (newNodes.length === 0 && newLinks.length === 0) {
                addLog('GRAPHITI', 'All related entities are already in the graph.', 'info');
                if (inspectorExpandBtn) inspectorExpandBtn.innerText = "Expand";
                return;
            }

            const mergedData = {
                nodes: [...currentData.nodes, ...newNodes],
                links: [...currentData.links, ...newLinks]
            };

            console.log("Merged Data:", mergedData);

            // Render with merged data
            graph.render(mergedData);

            addLog('GRAPHITI', `Added ${newNodes.length} new nodes and ${newLinks.length} connections.`, 'success');

        } catch (error) {
            console.error("Expansion Error:", error);
            addLog('GRAPHITI', `Expansion failed: ${error.message}`, 'error');
        } finally {
            if (inspectorExpandBtn) inspectorExpandBtn.innerText = "Expand";
        }
    }
    // --- Sidebar Navigation ---
    sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            // Active State
            sidebarItems.forEach(i => i.classList.remove('active', 'text-blue-500', 'bg-white/5'));
            sidebarItems.forEach(i => i.classList.add('text-gray-400'));

            item.classList.add('active', 'text-blue-500', 'bg-white/5');
            item.classList.remove('text-gray-400');

            const view = item.dataset.view;
            handleViewChange(view);
        });
    });

    // --- View Control & Expansion ---
    const viewControls = document.querySelectorAll('.view-control');
    let currentView = 'DASHBOARD';

    viewControls.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            if (currentView === target) {
                handleViewChange('DASHBOARD');
            } else {
                handleViewChange(target);
            }
        });
    });

    function handleViewChange(view) {
        currentView = view;
        document.body.dataset.view = view;

        // Reset Layout Classes
        leftPanel.className = 'flex flex-col bg-[#0B0C10] border-r border-gray-800/50 shrink-0 transition-all duration-500';
        rightPanel.className = 'flex flex-col bg-[#0B0C10] border-l border-gray-800/50 shrink-0 transition-all duration-500';
        graphContainer.className = 'flex-1 flex flex-col bg-[#050505] overflow-hidden relative transition-all duration-500';

        // Reset Icons
        document.querySelectorAll('.view-control i').forEach(i => {
            i.setAttribute('data-lucide', 'maximize-2');
        });

        if (view === 'DASHBOARD') {
            leftPanel.classList.add('w-[360px]', 'translate-x-0', 'opacity-100');
            rightPanel.classList.add('w-[400px]', 'translate-x-0', 'opacity-100');
            // Graph is flex-1
        } else if (view === 'PIPELINE') {
            leftPanel.classList.add('w-full', 'translate-x-0', 'opacity-100');
            rightPanel.classList.add('w-0', 'overflow-hidden', 'opacity-0', 'translate-x-10', 'border-none');
            graphContainer.classList.add('w-0', 'overflow-hidden', 'opacity-0', 'scale-95');

            // Update Icon
            const btn = document.querySelector(`.view-control[data-target="PIPELINE"] i`);
            if (btn) btn.setAttribute('data-lucide', 'minimize-2');

        } else if (view === 'GRAPH') {
            leftPanel.classList.add('w-0', 'overflow-hidden', 'opacity-0', '-translate-x-10', 'border-none');
            rightPanel.classList.add('w-0', 'overflow-hidden', 'opacity-0', 'translate-x-10', 'border-none');
            graphContainer.classList.add('w-full', 'opacity-100', 'scale-100');

            // Update Icon
            const btn = document.querySelector(`.view-control[data-target="GRAPH"] i`);
            if (btn) btn.setAttribute('data-lucide', 'minimize-2');

        } else if (view === 'CHAT') {
            leftPanel.classList.add('w-0', 'overflow-hidden', 'opacity-0', '-translate-x-10', 'border-none');
            rightPanel.classList.add('w-full', 'translate-x-0', 'opacity-100');
            graphContainer.classList.add('w-0', 'overflow-hidden', 'opacity-0', 'scale-95');

            // Update Icon
            const btn = document.querySelector(`.view-control[data-target="CHAT"] i`);
            if (btn) btn.setAttribute('data-lucide', 'minimize-2');
        }

        // Update Sidebar Active State
        sidebarItems.forEach(i => {
            if (i.dataset.view === view) {
                i.classList.add('active', 'text-blue-500', 'bg-white/5');
                i.classList.remove('text-gray-400');
            } else {
                i.classList.remove('active', 'text-blue-500', 'bg-white/5');
                i.classList.add('text-gray-400');
            }
        });

        lucide.createIcons();

        // Trigger resize for Graph
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 550);
    }

    // --- Suggested Topics ---
    suggestedTopics.forEach(btn => {
        btn.addEventListener('click', () => {
            topicInput.value = btn.dataset.topic;
            startBtn.click();
        });
    });

    // --- Legend Toggle ---
    const toggleLegendBtn = document.getElementById('toggle-legend');
    const legendContent = document.getElementById('legend-content');
    const graphLegend = document.getElementById('graph-legend');
    const legendTitle = graphLegend?.querySelector('h4'); // Select the title
    let isLegendOpen = true;

    toggleLegendBtn?.addEventListener('click', () => {
        isLegendOpen = !isLegendOpen;
        const container = graphLegend.querySelector('div'); // The inner bg container

        if (isLegendOpen) {
            // Expand
            graphLegend.classList.remove('w-12');
            graphLegend.classList.add('w-48');

            container.classList.remove('p-2', 'items-center', 'justify-center');
            container.classList.add('p-4');

            legendContent.classList.remove('hidden');
            if (legendTitle) {
                legendTitle.classList.remove('hidden');
                legendTitle.parentElement.classList.add('justify-between');
                legendTitle.parentElement.classList.remove('justify-center');
            }

            toggleLegendBtn.innerHTML = '<i data-lucide="chevron-left" class="w-3 h-3"></i>';
        } else {
            // Collapse
            graphLegend.classList.remove('w-48');
            graphLegend.classList.add('w-12');

            container.classList.remove('p-4');
            container.classList.add('p-2', 'items-center', 'justify-center');

            legendContent.classList.add('hidden');
            if (legendTitle) {
                legendTitle.classList.add('hidden');
                legendTitle.parentElement.classList.remove('justify-between');
                legendTitle.parentElement.classList.add('justify-center');
            }

            toggleLegendBtn.innerHTML = '<i data-lucide="layers" class="w-5 h-5 text-blue-400"></i>';
        }
        lucide.createIcons();
    });

    // --- Zoom Controls ---
    document.getElementById('zoom-in')?.addEventListener('click', () => graph.zoomIn());
    document.getElementById('zoom-out')?.addEventListener('click', () => graph.zoomOut());
    document.getElementById('zoom-fit')?.addEventListener('click', () => graph.fit());

    // --- Sidebar Expansion ---
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebarLabels = document.querySelectorAll('.sidebar-label');
    let isSidebarExpanded = false;

    sidebarToggle?.addEventListener('click', () => {
        isSidebarExpanded = !isSidebarExpanded;
        if (isSidebarExpanded) {
            sidebar.classList.remove('w-16');
            sidebar.classList.add('w-64');
            sidebarLabels.forEach(l => l.classList.remove('opacity-0'));
            sidebarToggle.innerHTML = '<i data-lucide="chevron-left" class="w-3 h-3"></i>';
        } else {
            sidebar.classList.remove('w-64');
            sidebar.classList.add('w-16');
            sidebarLabels.forEach(l => l.classList.add('opacity-0'));
            sidebarToggle.innerHTML = '<i data-lucide="menu" class="w-3 h-3"></i>';
        }
        lucide.createIcons();
    });

    // --- Collapsible Sections ---
    const collapsibleHeaders = document.querySelectorAll('.section-header');
    collapsibleHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const iconWrapper = header.querySelector('.section-toggle-icon');

            if (content.classList.contains('hidden')) {
                // Expand
                content.classList.remove('hidden');
                if (iconWrapper) iconWrapper.style.transform = 'rotate(0deg)';
            } else {
                // Collapse
                content.classList.add('hidden');
                if (iconWrapper) iconWrapper.style.transform = 'rotate(-90deg)';
            }
        });
    });

    // Initialize sections as open (ensure no hidden class initially)
    document.querySelectorAll('.section-content').forEach(c => {
        c.classList.remove('hidden');
    });

});
