const HUGE_ICON_ALIASES = {
    'panel-left': 'panel-left', 'panel-right': 'sidebar-right', 'panel-right-open': 'sidebar-right-01',
    'chevron-down': 'chevron-down', 'chevron-up': 'chevron-up', 'chevron-left': 'chevron-left', 'chevron-right': 'chevron-right',
    search: 'search-01', 'search-x': 'search-minus', 'list-filter': 'filter-horizontal', 'share-2': 'share-08', download: 'download-04',
    sparkles: 'ai-sparkles', sparkle: 'sparkle', 'wand-sparkles': 'ai-magic', library: 'library', bookmark: 'bookmark-02',
    'bookmark-check': 'bookmark-check-02', history: 'history', files: 'files-01', plus: 'plus-sign', minus: 'minus-sign', keyboard: 'keyboard',
    'shield-check': 'shield-01', 'arrow-right': 'arrow-right-02', 'arrow-left-right': 'arrow-left-right', 'arrow-up': 'arrow-up-02',
    scan: 'scan', 'scan-text': 'ai-scan-text', 'mouse-pointer-2': 'cursor-01', 'mouse-pointer-click': 'mouse-left-click-01',
    'undo-2': 'undo', 'redo-2': 'redo', 'git-compare-arrows': 'git-compare-arrows', network: 'ai-network',
    'unfold-horizontal': 'unfold-horizontal', 'circle-dot': 'circle', 'clock-3': 'clock-03', 'cloud-upload': 'cloud-upload',
    combine: 'combine', database: 'database-01', square: 'stop', 'rotate-ccw': 'rotate-01', 'link-2': 'link-02', type: 'text',
    'file-up': 'file-upload', 'file-text': 'file-text', 'file-question': 'help-circle', 'locate-fixed': 'locate-fixed',
    'corner-down-left': 'corner-down-left', 'loader-circle': 'loading-03', play: 'play', pause: 'pause', x: 'cancel-01',
    'badge-check': 'badge-check', check: 'checkmark-circle-02', 'triangle-alert': 'alert-02', info: 'information-circle',
    'layout-grid': 'grid-view', 'git-commit-horizontal': 'git-commit', 'user-round': 'user-circle', 'building-2': 'building-02',
    box: 'cube', 'map-pin': 'map-pin', 'calendar-days': 'calendar-03', lightbulb: 'lightbulb'
};

const UNDRAW_EMPTY_STATES = Object.freeze({
    sources: '/static/assets/undraw/source-files.svg',
    saved: '/static/assets/undraw/saved-views.svg',
    history: '/static/assets/undraw/history-timeline.svg',
    evidence: '/static/assets/undraw/evidence-analysis.svg',
    noResults: '/static/assets/undraw/no-results.svg'
});

function emptyStateMarkup(illustration, message, imageClass = 'sidebar-empty-illustration') {
    return `<div class="sidebar-empty"><img class="${imageClass}" src="${illustration}" alt="" loading="lazy"><p>${message}</p></div>`;
}

function refreshIcons(root = document) {
    root.querySelectorAll('[data-lucide], [data-icon]').forEach(icon => {
        const requested = icon.getAttribute('data-icon') || icon.getAttribute('data-lucide') || 'circle';
        const name = HUGE_ICON_ALIASES[requested] || requested;
        [...icon.classList].filter(className => className.startsWith('hgi-') && className !== 'hgi-stroke').forEach(className => icon.classList.remove(className));
        icon.classList.add('hgi-stroke', `hgi-${name}`);
        icon.removeAttribute('data-lucide');
        icon.removeAttribute('data-icon');
        icon.setAttribute('aria-hidden', 'true');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const graph = new KnowledgeGraph('d3-graph', 'minimap');
    const STORAGE = {
        history: 'graphiti.research-history.v2',
        saved: 'graphiti.saved-views.v2',
        onboarding: 'graphiti.onboarding.v2'
    };
    const typeIcons = {
        person: 'user-round', company: 'building-2', organization: 'building-2', product: 'box',
        feature: 'sparkle', concept: 'lightbulb', location: 'map-pin', event: 'calendar-days', default: 'circle-dot'
    };
    const typeColors = graph.colors;
    const pipelineOrder = ['SEARCH', 'SCRAPE', 'EXTRACT', 'INDEX'];

    const state = {
        sessionId: null,
        topic: '',
        sources: [],
        graphData: { nodes: [], links: [] },
        generating: false,
        sending: false,
        selectedNode: null,
        selectedSourceType: 'topic',
        file: null,
        fileText: '',
        controller: null,
        lastBuildInput: null,
        hiddenGroups: new Set(),
        minimumDegree: 0,
        showRelationshipLabels: false,
        compareMode: false,
        compareIds: [],
        history: readStorage(STORAGE.history, []),
        savedViews: readStorage(STORAGE.saved, []),
        graphHistory: [],
        graphHistoryIndex: -1,
        commandItems: [],
        commandIndex: 0,
        presentation: { active: false, sequence: [], index: 0, playing: false, timer: null }
    };

    const elements = {
        topicInput: $('#topic-input'), startButton: $('#start-button'), emptyState: $('#empty-state'),
        graphTitle: $('#graph-title'), graphEyebrow: $('#graph-eyebrow'), projectName: $('#project-name'),
        nodeCount: $('#node-count'), linkCount: $('#link-count'), sourceQuality: $('#source-quality'),
        sourceList: $('#source-list'), savedList: $('#saved-list'), historyList: $('#history-list'),
        sourcesCount: $('#sources-count'), savedCount: $('#saved-count'), historyCount: $('#history-count'),
        statusDot: $('#status-dot'), statusLabel: $('#status-label'), statusDetail: $('#status-detail'),
        activityDrawer: $('#activity-drawer'), activityButton: $('#activity-button'), activitySummary: $('#activity-summary'),
        activityPulse: $('#activity-pulse'), activityLog: $('#activity-log'), cancelBuild: $('#cancel-build'), retryBuild: $('#retry-build'),
        sourceModal: $('#source-modal'), modalTopic: $('#modal-topic-input'), urlInput: $('#url-input'), urlTopic: $('#url-topic-input'),
        fileInput: $('#file-input'), fileTopic: $('#file-topic-input'), filePreview: $('#file-preview'), fileName: $('#file-name'), fileMeta: $('#file-meta'),
        chatHistory: $('#chat-history'), chatInput: $('#chat-input'), sendButton: $('#send-button'), assistantState: $('#assistant-state'),
        inspectorEmpty: $('#inspector-empty'), entityInspector: $('#entity-inspector'), contextPanel: $('#context-panel'),
        filterPopover: $('#filter-popover'), filterTypes: $('#filter-types'), filterButton: $('#filter-button'), filterCount: $('#filter-count'),
        commandPalette: $('#command-palette'), commandInput: $('#command-input'), commandResults: $('#command-results'),
        compareTray: $('#compare-tray'), presentationCard: $('#presentation-card'), minimapShell: $('#minimap-shell'),
        nodeMenu: $('#node-menu'), toastRegion: $('#toast-region')
    };

    refreshIcons();
    bindInterface();
    renderHistory();
    renderSavedViews();
    renderSources();
    checkHealth();
    maybeShowWelcome();

    function bindInterface() {
        elements.startButton.addEventListener('click', () => buildGraph({ topic: elements.topicInput.value.trim(), sourceType: 'topic' }));
        elements.topicInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') buildGraph({ topic: elements.topicInput.value.trim(), sourceType: 'topic' });
        });
        $$('.quick-starts button').forEach(button => button.addEventListener('click', () => {
            elements.topicInput.value = button.dataset.topic;
            buildGraph({ topic: button.dataset.topic, sourceType: 'topic' });
        }));
        $('#new-graph-button').addEventListener('click', openSourceModal);
        $('#add-source-button').addEventListener('click', openSourceModal);
        $('#project-switcher').addEventListener('click', openSourceModal);
        $$('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.closeModal)));
        $$('[data-close-popover]').forEach(button => button.addEventListener('click', () => closePopover(button.dataset.closePopover)));
        $$('.modal-backdrop, .command-backdrop, .shortcut-backdrop').forEach(backdrop => backdrop.addEventListener('mousedown', event => {
            if (event.target === backdrop) closeOverlay(backdrop.id);
        }));

        $$('.source-type-tab').forEach(button => button.addEventListener('click', () => selectSourceType(button.dataset.sourceType)));
        $('#modal-build-button').addEventListener('click', handleModalBuild);
        elements.fileInput.addEventListener('change', () => prepareFile(elements.fileInput.files?.[0]));
        $('#remove-file').addEventListener('click', clearFile);
        const dropZone = $('#drop-zone');
        ['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.add('dragging'); }));
        ['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.remove('dragging'); }));
        dropZone.addEventListener('drop', event => prepareFile(event.dataTransfer.files?.[0]));

        $$('.page-nav-button').forEach(button => button.addEventListener('click', () => navigatePage(button.dataset.page)));
        $('#save-view-button').addEventListener('click', saveCurrentView);
        $('#keyboard-help-button').addEventListener('click', () => openOverlay('shortcut-modal'));
        $('#sidebar-toggle').addEventListener('click', () => $('#source-sidebar').classList.toggle('open'));
        $('#sidebar-close').addEventListener('click', () => {
            $('#source-sidebar').classList.remove('open');
            setActivePage('graph');
        });
        $('#context-toggle').addEventListener('click', () => elements.contextPanel.classList.toggle('open'));
        $('#context-close').addEventListener('click', () => {
            elements.contextPanel.classList.remove('open');
            setActivePage('graph');
        });

        $$('.mode-button').forEach(button => button.addEventListener('click', () => setGraphMode(button.dataset.mode)));
        $('#zoom-in').addEventListener('click', () => graph.zoomBy(1.28));
        $('#zoom-out').addEventListener('click', () => graph.zoomBy(.78));
        $('#zoom-fit').addEventListener('click', () => graph.fit());
        $('#lasso-button').addEventListener('click', toggleLasso);
        $('#undo-button').addEventListener('click', undoGraph);
        $('#redo-button').addEventListener('click', redoGraph);
        $('#export-button').addEventListener('click', exportGraph);
        $('#share-button').addEventListener('click', shareSummary);
        $('#compare-mode-button').addEventListener('click', toggleCompareMode);
        $('#close-compare').addEventListener('click', closeCompareMode);
        $$('.compare-slot').forEach(button => button.addEventListener('click', () => {
            const id = state.compareIds[Number(button.dataset.slot)];
            if (id) focusNode(id);
        }));

        elements.filterButton.addEventListener('click', toggleFilterPopover);
        $('#degree-filter').addEventListener('input', event => { $('#degree-value').textContent = event.target.value; });
        $('#apply-filters').addEventListener('click', applyFilters);
        $('#reset-filters').addEventListener('click', resetFilters);

        $$('.context-tab').forEach(button => button.addEventListener('click', () => setContextTab(button.dataset.contextTab)));
        $$('.inspector-tab').forEach(button => button.addEventListener('click', () => setInspectorTab(button.dataset.inspectorTab)));
        $('#close-inspector').addEventListener('click', () => { state.selectedNode = null; graph.clearSelection(); renderInspector(); });
        $('#expand-entity').addEventListener('click', () => state.selectedNode && expandNode(state.selectedNode));
        $('#ask-entity').addEventListener('click', askSelectedEntity);
        $('#compare-entity').addEventListener('click', () => state.selectedNode && addToComparison(state.selectedNode.id));
        $('#show-all-related').addEventListener('click', () => setInspectorTab('connections'));

        elements.sendButton.addEventListener('click', sendMessage);
        elements.chatInput.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }
        });
        elements.chatInput.addEventListener('input', autoSizeChat);
        $$('#prompt-chips button').forEach(button => button.addEventListener('click', () => {
            elements.chatInput.value = button.textContent.trim();
            sendMessage();
        }));
        elements.chatHistory.addEventListener('click', event => {
            const citation = event.target.closest('.citation-badge');
            if (citation) focusNode(citation.dataset.nodeId);
        });

        elements.activityButton.addEventListener('click', toggleActivityDrawer);
        $('#close-activity').addEventListener('click', () => setActivityDrawer(false));
        $('#clear-activity').addEventListener('click', () => { elements.activityLog.innerHTML = ''; });
        elements.cancelBuild.addEventListener('click', cancelBuild);
        elements.retryBuild.addEventListener('click', () => state.lastBuildInput && buildGraph(state.lastBuildInput));

        $('#command-trigger').addEventListener('click', openCommandPalette);
        elements.commandInput.addEventListener('input', renderCommandResults);
        elements.commandInput.addEventListener('keydown', handleCommandKeys);
        elements.commandResults.addEventListener('click', event => {
            const item = event.target.closest('[data-command-index]');
            if (item) runCommand(Number(item.dataset.commandIndex));
        });

        $('#presentation-button').addEventListener('click', startPresentation);
        $('#presentation-close').addEventListener('click', stopPresentation);
        $('#presentation-prev').addEventListener('click', () => movePresentation(-1));
        $('#presentation-next').addEventListener('click', () => movePresentation(1));
        $('#presentation-play').addEventListener('click', togglePresentationPlayback);

        elements.nodeMenu.addEventListener('click', event => {
            const action = event.target.closest('[data-node-action]')?.dataset.nodeAction;
            if (action) runNodeMenuAction(action);
        });
        document.addEventListener('click', event => {
            if (!event.target.closest('#node-menu')) elements.nodeMenu.classList.add('hidden');
            if (!event.target.closest('#filter-popover') && !event.target.closest('#filter-button')) closePopover('filter-popover');
        });

        document.addEventListener('graph:node-select', event => handleNodeSelection(event.detail.node, event.detail.multi));
        document.addEventListener('graph:node-expand', event => expandNode(event.detail.node));
        document.addEventListener('graph:node-menu', event => showNodeMenu(event.detail));
        document.addEventListener('graph:selection', event => handleGraphSelection(event.detail));
        document.addEventListener('graph:lasso-complete', event => {
            showToast('Selection ready', `${event.detail.ids.length} entities selected.`, 'success');
            if (event.detail.ids.length === 2) {
                state.compareMode = true;
                state.compareIds = event.detail.ids;
                updateCompareTray();
            }
        });

        document.addEventListener('keydown', handleGlobalKeys);
        window.addEventListener('resize', () => {
            if (window.innerWidth > 820) {
                $('#source-sidebar').classList.remove('open');
                elements.contextPanel.classList.remove('open');
            }
        });
    }

    async function buildGraph(input) {
        const topic = String(input.topic || '').trim();
        if (!topic || state.generating) {
            if (!topic) showToast('Add a topic', 'Tell Graphiti what you want to understand.', 'error');
            return;
        }
        state.generating = true;
        state.lastBuildInput = { ...input };
        state.controller = new AbortController();
        state.topic = topic;
        state.selectedNode = null;
        state.compareIds = [];
        closeCompareMode();
        closeModal('source-modal');
        resetPipeline();
        setActivityDrawer(true);
        setBusyState(true, 'Finding trustworthy sources', `Researching “${topic}”…`);
        elements.retryBuild.classList.add('hidden');
        elements.cancelBuild.classList.remove('hidden');
        elements.startButton.disabled = true;
        $('#modal-build-button').disabled = true;
        addLog('SYSTEM', `Started knowledge extraction for “${topic}”.`);

        try {
            let urls = [...(input.urls || [])];
            let context = String(input.context || '');

            setPipelineStep('SEARCH', 'active', input.sourceType === 'url' ? 'Validating the supplied page' : input.sourceType === 'file' ? 'Using the imported document' : 'Searching credible sources');
            if (!urls.length && !context) {
                const searchData = await api('/api/search', { topic }, state.controller.signal);
                urls = searchData.urls || [];
                completePipelineStep('SEARCH', `${urls.length} relevant source${urls.length === 1 ? '' : 's'} found`);
                addLog('WEB', `Found ${urls.length} relevant source${urls.length === 1 ? '' : 's'}.`, 'success');
            } else {
                completePipelineStep('SEARCH', context ? 'Document ready' : 'Web page ready');
                addLog('SOURCE', context ? 'Imported document is ready for analysis.' : 'Supplied web page is ready for analysis.', 'success');
            }

            setPipelineStep('SCRAPE', 'active', context ? 'Preparing imported text' : `Reading ${urls.length} source page${urls.length === 1 ? '' : 's'}`);
            if (!context && urls.length) {
                context = await api('/api/scrape', { urls }, state.controller.signal);
                if (typeof context !== 'string') throw new Error('The source reader returned an invalid response.');
            }
            completePipelineStep('SCRAPE', `${context.length.toLocaleString()} characters prepared`);
            addLog('PARSER', `Prepared ${context.length.toLocaleString()} characters of source context.`, 'success');

            setPipelineStep('EXTRACT', 'active', 'Identifying entities and relationships');
            setBusyState(true, 'Mapping entities', 'Building relationships from the collected evidence…');
            const result = await api('/api/graph/generate', { topic, context, source_urls: urls }, state.controller.signal);
            if (!result.graph?.nodes?.length) throw new Error('No useful entities were returned for this topic.');
            completePipelineStep('EXTRACT', `${result.graph.nodes.length} entities · ${result.graph.links.length} relationships`);
            if (result.degraded) addLog('AI', 'The model provider is busy. Graphiti created a source-derived graph so your work can continue.', 'warning');
            else addLog('AI', 'Entity extraction completed with the intelligence model.', 'success');

            setPipelineStep('INDEX', 'active', 'Saving the graph and preparing exploration');
            state.sessionId = result.session_id;
            state.sources = urls;
            state.graphData = result.graph;
            commitGraph(result.graph, 'Initial graph');
            completePipelineStep('INDEX', 'Graph saved and ready');
            addLog('DATABASE', 'Graph persisted and indexed for questions.', 'success');
            finishGraphBuild(result.degraded);
        } catch (error) {
            if (error.name === 'AbortError') {
                addLog('SYSTEM', 'Graph build cancelled.', 'warning');
                setBusyState(false, 'Build cancelled', 'Your previous graph was left unchanged.');
            } else {
                markActiveStepFailed(error.message);
                addLog('SYSTEM', `Build failed: ${error.message}`, 'error');
                setBusyState(false, 'Could not build the graph', error.message, 'error');
                elements.retryBuild.classList.remove('hidden');
                showToast('Graph build failed', error.message, 'error');
            }
        } finally {
            state.generating = false;
            state.controller = null;
            elements.cancelBuild.classList.add('hidden');
            elements.startButton.disabled = false;
            $('#modal-build-button').disabled = false;
            elements.activityPulse.classList.remove('active');
        }
    }

    function finishGraphBuild(degraded) {
        elements.emptyState.classList.add('hidden');
        elements.graphTitle.textContent = state.topic;
        elements.graphEyebrow.textContent = degraded ? 'Source-derived knowledge map' : 'Knowledge map';
        elements.projectName.textContent = state.topic;
        elements.topicInput.value = state.topic;
        graph.render(state.graphData);
        updateGraphMetrics();
        renderSources();
        renderFilterTypes();
        renderInspector();
        elements.minimapShell.classList.remove('hidden');
        $('#export-button').disabled = false;
        $('#presentation-button').disabled = false;
        elements.chatInput.disabled = false;
        elements.sendButton.disabled = false;
        elements.chatInput.placeholder = 'Ask a question about this graph…';
        setBusyState(false, 'Graph ready', `${state.graphData.nodes.length} entities connected across ${state.graphData.links.length} relationships.`, 'success');
        elements.activitySummary.textContent = 'Graph build complete';
        addHistoryEntry();
        setTimeout(() => graph.fit(), 420);
        setTimeout(() => setActivityDrawer(false), 1000);
        showToast('Graph ready', `Explore ${state.graphData.nodes.length} entities and ${state.graphData.links.length} relationships.`, 'success');
    }

    function cancelBuild() { state.controller?.abort(); }

    async function api(url, body, signal) {
        const response = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal
        });
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); }
        catch { throw new Error('The service returned an incomplete response. Please retry.'); }
        if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
        return data;
    }

    async function checkHealth() {
        try {
            const response = await fetch('/api/health', { cache: 'no-store' });
            if (!response.ok) throw new Error('Unavailable');
            const data = await response.json();
            $('.connection-state').classList.add('online');
            $('#connection-label').textContent = `${data.database} connected`;
        } catch {
            $('.connection-state').classList.remove('online');
            $('#connection-label').textContent = 'Service unavailable';
        }
    }

    function setBusyState(busy, label, detail, kind = '') {
        elements.statusDot.className = `status-dot${busy ? ' active' : kind ? ` ${kind}` : ''}`;
        elements.statusLabel.textContent = label;
        elements.statusDetail.textContent = detail;
        elements.activityPulse.classList.toggle('active', busy);
        elements.activitySummary.textContent = busy ? label : kind === 'error' ? 'Action required' : 'No active tasks';
    }

    function resetPipeline() {
        $$('.pipeline-card').forEach(card => {
            card.className = 'pipeline-card';
            $('.pipeline-state', card).textContent = 'Queued';
            $('small', card).textContent = card.dataset.step === 'SEARCH' ? 'Waiting to start' : 'Waiting for previous step';
        });
    }

    function setPipelineStep(step, status, message) {
        const card = $(`.pipeline-card[data-step="${step}"]`);
        if (!card) return;
        card.className = `pipeline-card ${status}`;
        $('.pipeline-state', card).textContent = status === 'active' ? 'Working' : status;
        $('small', card).textContent = message;
    }

    function completePipelineStep(step, message) { setPipelineStep(step, 'complete', message); $('.pipeline-state', $(`.pipeline-card[data-step="${step}"]`)).textContent = 'Done'; }
    function markActiveStepFailed(message) {
        const active = $('.pipeline-card.active');
        if (!active) return;
        active.className = 'pipeline-card error';
        $('.pipeline-state', active).textContent = 'Failed';
        $('small', active).textContent = message;
    }

    function addLog(source, message, level = 'info') {
        const row = document.createElement('div');
        row.className = `log-row ${level}`;
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        row.innerHTML = `<span>${now}</span><span class="log-source">${escapeHtml(source)}</span><span class="log-message">${escapeHtml(message)}</span>`;
        elements.activityLog.appendChild(row);
        elements.activityLog.scrollTop = elements.activityLog.scrollHeight;
    }

    function openSourceModal() {
        elements.modalTopic.value = state.topic || elements.topicInput.value || '';
        openOverlay('source-modal');
        setTimeout(() => elements.modalTopic.focus(), 80);
    }

    function selectSourceType(type) {
        state.selectedSourceType = type;
        $$('.source-type-tab').forEach(button => button.classList.toggle('active', button.dataset.sourceType === type));
        $$('.source-pane').forEach(pane => pane.classList.toggle('active', pane.dataset.sourcePane === type));
        refreshIcons();
    }

    async function handleModalBuild() {
        if (state.selectedSourceType === 'topic') {
            return buildGraph({ topic: elements.modalTopic.value.trim(), sourceType: 'topic' });
        }
        if (state.selectedSourceType === 'url') {
            const value = elements.urlInput.value.trim();
            let parsed;
            try { parsed = new URL(value); }
            catch { return showToast('Check the URL', 'Enter a complete public http or https URL.', 'error'); }
            if (!['http:', 'https:'].includes(parsed.protocol)) return showToast('Unsupported URL', 'Only public http and https pages can be read.', 'error');
            const topic = elements.urlTopic.value.trim() || parsed.hostname.replace(/^www\./, '');
            return buildGraph({ topic, urls: [parsed.href], sourceType: 'url' });
        }
        if (!state.file || !state.fileText) return showToast('Choose a document', 'Select a supported text, CSV, or JSON file.', 'error');
        const topic = elements.fileTopic.value.trim() || state.file.name.replace(/\.[^.]+$/, '');
        return buildGraph({ topic, context: state.fileText.slice(0, 8000), sourceType: 'file', urls: [`file://${state.file.name}`] });
    }

    async function prepareFile(file) {
        if (!file) return;
        const allowed = ['text/plain', 'text/csv', 'application/json', 'text/markdown', ''];
        const extensionAllowed = /\.(txt|md|markdown|csv|json)$/i.test(file.name);
        if (!allowed.includes(file.type) && !extensionAllowed) return showToast('Unsupported document', 'Use a TXT, Markdown, CSV, or JSON file.', 'error');
        if (file.size > 2 * 1024 * 1024) return showToast('Document is too large', 'Choose a document smaller than 2 MB.', 'error');
        try {
            state.fileText = await file.text();
            state.file = file;
            elements.fileName.textContent = file.name;
            elements.fileMeta.textContent = `${formatBytes(file.size)} · ${state.fileText.length.toLocaleString()} characters`;
            elements.filePreview.classList.remove('hidden');
            $('#drop-zone').classList.add('hidden');
            if (!elements.fileTopic.value) elements.fileTopic.value = file.name.replace(/\.[^.]+$/, '');
        } catch { showToast('Could not read document', 'Please try another file.', 'error'); }
    }

    function clearFile() {
        state.file = null; state.fileText = ''; elements.fileInput.value = '';
        elements.filePreview.classList.add('hidden'); $('#drop-zone').classList.remove('hidden');
    }

    function setGraphMode(mode) {
        if (!state.graphData.nodes.length) return showToast('Build a graph first', 'Graph modes become available after extraction.');
        $$('.mode-button').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
        graph.setMode(mode);
        elements.graphEyebrow.textContent = ({ explore: 'Knowledge map', clusters: 'Entity communities', timeline: 'Extraction sequence', evidence: 'Evidence strength' })[mode];
        addLog('VIEW', `Switched to ${mode} mode.`);
    }

    function toggleLasso() {
        const button = $('#lasso-button');
        const next = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', String(next));
        button.classList.toggle('active', next);
        graph.enableLasso(next);
        if (next) showToast('Selection mode', 'Drag a box around entities to select them.');
    }

    function renderFilterTypes() {
        const groups = [...new Set(state.graphData.nodes.map(node => String(node.group || 'concept').toLowerCase()))];
        elements.filterTypes.innerHTML = groups.map(group => `<button class="filter-chip${state.hiddenGroups.has(group) ? '' : ' active'}" type="button" data-filter-group="${escapeHtml(group)}" style="--chip-color:${typeColors[group] || typeColors.default}"><span></span>${escapeHtml(capitalize(group))}</button>`).join('');
        $$('.filter-chip', elements.filterTypes).forEach(button => button.addEventListener('click', () => button.classList.toggle('active')));
        refreshIcons();
    }

    function applyFilters() {
        const visibleGroups = new Set($$('.filter-chip.active', elements.filterTypes).map(button => button.dataset.filterGroup));
        const allGroups = $$('.filter-chip', elements.filterTypes).map(button => button.dataset.filterGroup);
        state.hiddenGroups = new Set(allGroups.filter(group => !visibleGroups.has(group)));
        state.minimumDegree = Number($('#degree-filter').value);
        state.showRelationshipLabels = $('#relationship-label-toggle').checked;
        graph.setFilters({ hiddenGroups: [...state.hiddenGroups], minimumDegree: state.minimumDegree, showRelationshipLabels: state.showRelationshipLabels });
        const count = state.hiddenGroups.size + (state.minimumDegree > 0 ? 1 : 0) + (state.showRelationshipLabels ? 1 : 0);
        elements.filterCount.textContent = count;
        elements.filterCount.classList.toggle('hidden', count === 0);
        closePopover('filter-popover');
        updateGraphMetrics();
        showToast('Filters applied', `${graph.visibleData.nodes.length} entities remain visible.`, 'success');
    }

    function resetFilters() {
        state.hiddenGroups.clear(); state.minimumDegree = 0; state.showRelationshipLabels = false;
        $('#degree-filter').value = 0; $('#degree-value').textContent = '0'; $('#relationship-label-toggle').checked = false;
        renderFilterTypes(); applyFilters();
    }

    function toggleFilterPopover() {
        const opening = elements.filterPopover.classList.contains('hidden');
        elements.filterPopover.classList.toggle('hidden', !opening);
        elements.filterButton.setAttribute('aria-expanded', String(opening));
    }

    function handleNodeSelection(node, multi) {
        state.selectedNode = state.graphData.nodes.find(item => String(item.id) === String(node.id)) || node;
        renderInspector();
        setContextTab('inspector');
        $('#source-sidebar').classList.remove('open');
        elements.contextPanel.classList.add('open');
        if (state.compareMode || multi) addToComparison(node.id);
    }

    function handleGraphSelection(detail) {
        if (!detail.ids.length && !state.compareMode) {
            state.selectedNode = null;
            renderInspector();
        }
    }

    function renderInspector() {
        const node = state.selectedNode;
        elements.inspectorEmpty.classList.toggle('hidden', Boolean(node));
        elements.entityInspector.classList.toggle('hidden', !node);
        if (!node) return;
        const connections = graph.getConnections(node.id);
        $('#entity-label').textContent = node.label;
        $('#entity-type').textContent = capitalize(node.group || 'concept');
        $('#entity-description').textContent = node.details || 'This entity was identified in the retrieved source material.';
        $('#entity-degree').textContent = connections.length;
        $('#entity-influence').textContent = influenceLabel(connections.length, state.graphData.links.length);
        $('#entity-confidence').textContent = `${Math.round(78 + Math.min(18, connections.length * 2.4))}%`;
        $('#connection-count').textContent = connections.length;
        const avatar = $('#entity-avatar');
        avatar.style.color = typeColors[node.group] || typeColors.default;
        avatar.style.background = `${typeColors[node.group] || typeColors.default}18`;
        avatar.innerHTML = `<i data-lucide="${typeIcons[node.group] || typeIcons.default}"></i>`;

        const related = connections.slice(0, 5);
        $('#related-list').innerHTML = related.length ? related.map(connection => relatedItemHtml(connection)).join('') : '<div class="sidebar-empty"><p>No visible relationships.</p></div>';
        $('#connection-list').innerHTML = connections.length ? connections.map(connection => relatedItemHtml(connection, true)).join('') : '<div class="sidebar-empty"><p>No relationships available.</p></div>';
        $$('.related-item, .connection-item', elements.entityInspector).forEach(button => button.addEventListener('click', () => focusNode(button.dataset.nodeId)));
        renderEvidenceList();
        refreshIcons();
    }

    function relatedItemHtml(connection, full = false) {
        const other = connection.other;
        return `<button class="${full ? 'connection-item' : 'related-item'}" type="button" data-node-id="${escapeHtml(other.id)}"><span class="related-dot" style="color:${typeColors[other.group] || typeColors.default};background:${typeColors[other.group] || typeColors.default}12"><i data-lucide="${typeIcons[other.group] || typeIcons.default}"></i></span><span class="related-copy"><strong>${escapeHtml(other.label)}</strong><small>${escapeHtml(capitalize(other.group || 'concept'))}</small></span><span class="relation-chip">${escapeHtml(connection.relation)}</span></button>`;
    }

    function renderEvidenceList() {
        const list = $('#evidence-list');
        if (!state.sources.length) {
            list.innerHTML = emptyStateMarkup(UNDRAW_EMPTY_STATES.evidence, 'This graph uses model or imported-document context.', 'evidence-empty-illustration');
            return;
        }
        list.innerHTML = state.sources.map(source => {
            if (source.startsWith('file://')) return `<div class="evidence-item"><span class="evidence-domain">F</span><span class="related-copy"><strong>${escapeHtml(source.replace('file://', ''))}</strong><small>Imported document</small></span></div>`;
            let url; try { url = new URL(source); } catch { return ''; }
            return `<a class="evidence-item" href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer"><span class="evidence-domain">${escapeHtml(url.hostname.replace(/^www\./, '').charAt(0).toUpperCase())}</span><span class="related-copy"><strong>${escapeHtml(url.hostname.replace(/^www\./, ''))}</strong><small>${escapeHtml(url.pathname || '/')}</small></span></a>`;
        }).join('');
    }

    function setContextTab(tab) {
        $$('.context-tab').forEach(button => { const active = button.dataset.contextTab === tab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
        $$('.context-view').forEach(view => view.classList.toggle('active', view.dataset.contextView === tab));
        if (tab === 'assistant') {
            setActivePage('assistant');
            setTimeout(() => elements.chatInput.focus(), 80);
        }
    }

    function setInspectorTab(tab) {
        $$('.inspector-tab').forEach(button => button.classList.toggle('active', button.dataset.inspectorTab === tab));
        $$('.inspector-pane').forEach(pane => pane.classList.toggle('active', pane.dataset.inspectorPane === tab));
    }

    function focusNode(id) {
        const node = state.graphData.nodes.find(item => String(item.id) === String(id));
        if (!node) return;
        state.selectedNode = node;
        graph.zoomToNode(id);
        renderInspector();
        setContextTab('inspector');
        $('#source-sidebar').classList.remove('open');
        elements.contextPanel.classList.add('open');
    }

    async function expandNode(node) {
        if (!state.sessionId || state.generating) return;
        const button = $('#expand-entity');
        const previous = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<i data-lucide="loader-circle"></i> Expanding';
        refreshIcons();
        addLog('GRAPH', `Expanding ${node.label}…`);
        setActivityDrawer(true);
        try {
            const expansion = await api('/api/graph/expand', { session_id: state.sessionId, node_id: node.id });
            const current = state.graphData;
            const existingNodes = new Set(current.nodes.map(item => String(item.id)));
            const existingLinks = new Set(current.links.map(link => linkKey(link)));
            const nodes = [...current.nodes, ...(expansion.nodes || []).filter(item => !existingNodes.has(String(item.id)))];
            const links = [...current.links, ...(expansion.links || []).filter(item => !existingLinks.has(linkKey(item)))];
            if (nodes.length === current.nodes.length && links.length === current.links.length) {
                const message = expansion.degraded
                    ? 'Expansion is temporarily unavailable; your saved graph is unchanged.'
                    : 'All discovered entities are already present.';
                addLog('GRAPH', message, 'warning');
                showToast(expansion.degraded ? 'Expansion paused' : 'Nothing new to add', message);
                return;
            }
            state.graphData = { nodes, links };
            commitGraph(state.graphData, `Expanded ${node.label}`);
            graph.render(state.graphData, { preserveTransform: true });
            updateGraphMetrics(); renderFilterTypes(); renderInspector();
            addLog('GRAPH', `Added ${nodes.length - current.nodes.length} entities and ${links.length - current.links.length} relationships.`, 'success');
            showToast('Graph expanded', `New context was added around ${node.label}.`, 'success');
        } catch (error) {
            addLog('GRAPH', `Expansion failed: ${error.message}`, 'error');
            showToast('Could not expand entity', error.message, 'error');
        } finally {
            button.disabled = false; button.innerHTML = previous; refreshIcons();
            setTimeout(() => setActivityDrawer(false), 900);
        }
    }

    function askSelectedEntity() {
        if (!state.selectedNode) return;
        setContextTab('assistant');
        elements.chatInput.value = `Explain ${state.selectedNode.label}, its strongest relationships, and why it matters.`;
        elements.chatInput.focus(); autoSizeChat();
    }

    async function sendMessage() {
        const message = elements.chatInput.value.trim();
        if (!message || !state.sessionId || state.sending) return;
        appendChatMessage('user', message);
        elements.chatInput.value = ''; autoSizeChat();
        state.sending = true; elements.sendButton.disabled = true; elements.assistantState.classList.add('thinking'); elements.assistantState.innerHTML = '<span></span> Thinking';
        const pending = appendPendingMessage();
        try {
            const response = await api('/api/chat', { session_id: state.sessionId, message });
            pending.remove();
            appendChatMessage('assistant', response.response, response.degraded);
        } catch (error) {
            pending.remove();
            appendChatMessage('assistant', `I could not answer that question: ${error.message}`);
        } finally {
            state.sending = false; elements.sendButton.disabled = false; elements.assistantState.classList.remove('thinking'); elements.assistantState.innerHTML = '<span></span> Ready';
            elements.chatInput.focus();
        }
    }

    function appendChatMessage(role, content, degraded = false) {
        const wrapper = document.createElement('div');
        wrapper.className = `chat-message ${role}`;
        const formatted = role === 'assistant' ? formatAssistantMessage(content) : escapeHtml(content).replaceAll('\n', '<br>');
        wrapper.innerHTML = role === 'assistant'
            ? `<span class="message-avatar"><i data-lucide="sparkles"></i></span><div class="message-body">${formatted}${degraded ? '<br><small class="degraded-note">Answered from saved graph context while the AI service is busy.</small>' : ''}</div>`
            : `<div class="message-body">${formatted}</div>`;
        elements.chatHistory.appendChild(wrapper);
        elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
        refreshIcons();
    }

    function appendPendingMessage() {
        const wrapper = document.createElement('div');
        wrapper.className = 'chat-message assistant-pending';
        wrapper.innerHTML = '<span class="message-avatar"><i data-lucide="sparkles"></i></span><div class="message-body">Reading the graph<span class="typing-dots">…</span></div>';
        elements.chatHistory.appendChild(wrapper); elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight; refreshIcons();
        return wrapper;
    }

    function formatAssistantMessage(content) {
        return escapeHtml(String(content || '')).replace(/\[cite:\s*(.+?)\]/g, (match, id) => {
            const node = state.graphData.nodes.find(item => String(item.id) === id);
            return node ? `<button class="citation-badge" type="button" data-node-id="${escapeHtml(id)}"><i data-lucide="locate-fixed"></i>${escapeHtml(node.label)}</button>` : escapeHtml(match);
        }).replaceAll('\n', '<br>');
    }

    function autoSizeChat() { elements.chatInput.style.height = 'auto'; elements.chatInput.style.height = `${Math.min(120, elements.chatInput.scrollHeight)}px`; }

    function toggleCompareMode() {
        state.compareMode = !state.compareMode;
        if (!state.compareMode) return closeCompareMode();
        state.compareIds = graph.getSelectedNodes().slice(0, 2).map(node => node.id);
        elements.compareTray.classList.remove('hidden'); updateCompareTray();
        showToast('Compare mode', 'Select two entities with Shift + click, or use the entity inspector.');
    }

    function closeCompareMode() {
        state.compareMode = false; state.compareIds = [];
        elements.compareTray.classList.add('hidden'); $('#compare-mode-button').classList.remove('active');
    }

    function addToComparison(id) {
        const normalized = String(id);
        state.compareMode = true;
        elements.compareTray.classList.remove('hidden'); $('#compare-mode-button').classList.add('active');
        if (!state.compareIds.includes(normalized)) {
            if (state.compareIds.length >= 2) state.compareIds.shift();
            state.compareIds.push(normalized);
        }
        updateCompareTray();
    }

    function updateCompareTray() {
        $$('.compare-slot').forEach((button, index) => {
            const node = state.graphData.nodes.find(item => String(item.id) === state.compareIds[index]);
            button.textContent = node?.label || `Entity ${index ? 'B' : 'A'}`;
            button.classList.toggle('filled', Boolean(node));
        });
        const heading = $('.compare-heading span');
        if (state.compareIds.length === 2) {
            const path = graph.findPath(state.compareIds[0], state.compareIds[1]);
            const nodes = state.compareIds.map(id => state.graphData.nodes.find(item => String(item.id) === id));
            heading.textContent = path.length ? `${Math.max(0, path.length - 1)}-hop relationship path` : 'No connection found';
            graph.setSelection(path.length ? path : state.compareIds);
            elements.chatInput.value = `Compare ${nodes[0]?.label} and ${nodes[1]?.label}. Explain their relationship, similarities, and differences.`;
        } else heading.textContent = 'Select two entities to compare';
    }

    function commitGraph(data, label) {
        const snapshot = { label, data: JSON.parse(JSON.stringify(data)), time: Date.now() };
        state.graphHistory = state.graphHistory.slice(0, state.graphHistoryIndex + 1);
        state.graphHistory.push(snapshot);
        if (state.graphHistory.length > 12) state.graphHistory.shift();
        state.graphHistoryIndex = state.graphHistory.length - 1;
        updateUndoButtons();
    }

    function undoGraph() {
        if (state.graphHistoryIndex <= 0) return;
        state.graphHistoryIndex -= 1; restoreGraphSnapshot(state.graphHistory[state.graphHistoryIndex]);
    }

    function redoGraph() {
        if (state.graphHistoryIndex >= state.graphHistory.length - 1) return;
        state.graphHistoryIndex += 1; restoreGraphSnapshot(state.graphHistory[state.graphHistoryIndex]);
    }

    function restoreGraphSnapshot(snapshot) {
        state.graphData = JSON.parse(JSON.stringify(snapshot.data));
        graph.render(state.graphData); updateGraphMetrics(); renderFilterTypes(); renderInspector(); updateUndoButtons();
        showToast('Graph restored', snapshot.label, 'success');
    }

    function updateUndoButtons() {
        $('#undo-button').disabled = state.graphHistoryIndex <= 0;
        $('#redo-button').disabled = state.graphHistoryIndex >= state.graphHistory.length - 1;
    }

    function saveCurrentView() {
        if (!state.graphData.nodes.length) return showToast('Nothing to save', 'Build a graph before saving a view.', 'error');
        const view = {
            id: crypto.randomUUID?.() || String(Date.now()),
            name: `${state.topic} · ${capitalize(graph.mode)}`,
            topic: state.topic, sessionId: state.sessionId, sources: state.sources,
            graph: state.graphData, mode: graph.mode,
            filters: { hiddenGroups: [...state.hiddenGroups], minimumDegree: state.minimumDegree, showRelationshipLabels: state.showRelationshipLabels },
            savedAt: Date.now()
        };
        state.savedViews.unshift(view); state.savedViews = state.savedViews.slice(0, 10);
        writeStorage(STORAGE.saved, state.savedViews); renderSavedViews(); showSidebarSection('saved');
        showToast('View saved', 'The graph, mode, and filters were saved locally.', 'success');
    }

    function renderSavedViews() {
        elements.savedCount.textContent = state.savedViews.length;
        if (!state.savedViews.length) { elements.savedList.innerHTML = emptyStateMarkup(UNDRAW_EMPTY_STATES.saved, 'Save a useful graph arrangement.'); return; }
        elements.savedList.innerHTML = state.savedViews.map(view => `<button class="saved-item" type="button" data-saved-id="${escapeHtml(view.id)}"><span class="item-icon"><i data-lucide="bookmark-check"></i></span><span class="list-item-copy"><strong>${escapeHtml(view.name)}</strong><small>${relativeTime(view.savedAt)}</small></span><i data-lucide="chevron-right"></i></button>`).join('');
        $$('[data-saved-id]', elements.savedList).forEach(button => button.addEventListener('click', () => loadStoredGraph(state.savedViews.find(view => view.id === button.dataset.savedId))));
        refreshIcons();
    }

    function addHistoryEntry() {
        const entry = { id: String(Date.now()), topic: state.topic, sessionId: state.sessionId, sources: state.sources, graph: state.graphData, createdAt: Date.now() };
        state.history = [entry, ...state.history.filter(item => item.topic !== state.topic)].slice(0, 8);
        writeStorage(STORAGE.history, state.history); renderHistory();
    }

    function renderHistory() {
        elements.historyCount.textContent = state.history.length;
        if (!state.history.length) { elements.historyList.innerHTML = emptyStateMarkup(UNDRAW_EMPTY_STATES.history, 'Generated graphs will be available here.'); return; }
        elements.historyList.innerHTML = state.history.map(item => `<button class="history-item" type="button" data-history-id="${escapeHtml(item.id)}"><span class="item-icon"><i data-lucide="network"></i></span><span class="list-item-copy"><strong>${escapeHtml(item.topic)}</strong><small>${item.graph.nodes.length} entities · ${relativeTime(item.createdAt)}</small></span><i data-lucide="chevron-right"></i></button>`).join('');
        $$('[data-history-id]', elements.historyList).forEach(button => button.addEventListener('click', () => loadStoredGraph(state.history.find(item => item.id === button.dataset.historyId))));
        refreshIcons();
    }

    function loadStoredGraph(item) {
        if (!item?.graph?.nodes?.length) return;
        state.topic = item.topic; state.sessionId = item.sessionId; state.sources = item.sources || []; state.graphData = item.graph;
        state.graphHistory = []; state.graphHistoryIndex = -1; commitGraph(item.graph, 'Loaded saved graph');
        elements.emptyState.classList.add('hidden'); elements.graphTitle.textContent = item.topic; elements.projectName.textContent = item.topic; elements.topicInput.value = item.topic;
        graph.render(item.graph);
        if (item.mode) setGraphMode(item.mode);
        if (item.filters) {
            state.hiddenGroups = new Set(item.filters.hiddenGroups || []); state.minimumDegree = item.filters.minimumDegree || 0; state.showRelationshipLabels = Boolean(item.filters.showRelationshipLabels);
            graph.setFilters(item.filters);
        }
        updateGraphMetrics(); renderSources(); renderFilterTypes(); elements.minimapShell.classList.remove('hidden'); $('#export-button').disabled = false; $('#presentation-button').disabled = false; elements.chatInput.disabled = false; elements.sendButton.disabled = false;
        setBusyState(false, 'Saved graph loaded', `Restored ${item.graph.nodes.length} entities.`, 'success');
        showToast('Graph restored', item.topic, 'success');
    }

    function renderSources() {
        elements.sourcesCount.textContent = state.sources.length;
        if (!state.sources.length) { elements.sourceList.innerHTML = emptyStateMarkup(UNDRAW_EMPTY_STATES.sources, 'Your sources will appear here.'); return; }
        elements.sourceList.innerHTML = state.sources.map(source => {
            if (source.startsWith('file://')) {
                const name = source.replace('file://', '');
                return `<div class="source-item"><span class="source-favicon">F</span><span class="source-item-copy"><strong>${escapeHtml(name)}</strong><small>Imported document</small></span><span class="verified-icon"><i data-lucide="badge-check"></i></span></div>`;
            }
            let url; try { url = new URL(source); } catch { return ''; }
            const domain = url.hostname.replace(/^www\./, '');
            return `<a class="source-item" href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer"><span class="source-favicon">${escapeHtml(domain.charAt(0).toUpperCase())}</span><span class="source-item-copy"><strong>${escapeHtml(domain)}</strong><small>${escapeHtml(url.pathname || '/')}</small></span><span class="verified-icon"><i data-lucide="badge-check"></i></span></a>`;
        }).join('');
        refreshIcons();
    }

    function setActivePage(page) {
        $$('.page-nav-button').forEach(button => {
            const active = button.dataset.page === page;
            button.classList.toggle('active', active);
            if (active) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
    }

    function navigatePage(page) {
        if (page === 'graph') {
            $$('.sidebar-section').forEach(panel => panel.classList.toggle('active', panel.dataset.sidebarSection === 'sources'));
            setContextTab('inspector');
            setActivePage('graph');
            $('#source-sidebar').classList.remove('open');
            elements.contextPanel.classList.remove('open');
            $('#graph-workspace').focus({ preventScroll: true });
            return;
        }
        if (page === 'assistant') {
            $('#source-sidebar').classList.remove('open');
            setContextTab('assistant');
            elements.contextPanel.classList.add('open');
            return;
        }
        elements.contextPanel.classList.remove('open');
        setContextTab('inspector');
        showSidebarSection(page);
    }

    function showSidebarSection(section) {
        setActivePage(section);
        $$('.sidebar-section').forEach(panel => panel.classList.toggle('active', panel.dataset.sidebarSection === section));
        const labels = { sources: 'Research sources', saved: 'Saved views', history: 'Recent research' };
        $('#source-drawer-title').textContent = labels[section] || 'Workspace';
        $('#source-sidebar').classList.add('open');
    }

    function openCommandPalette() {
        openOverlay('command-palette'); elements.commandInput.value = ''; state.commandIndex = 0; renderCommandResults();
        setTimeout(() => elements.commandInput.focus(), 60);
    }

    function commandCatalog() {
        const commands = [
            { type: 'Action', label: 'Build a new graph', detail: 'Topic, URL, or document', icon: 'plus', run: openSourceModal },
            { type: 'Action', label: 'Fit graph to screen', detail: 'Center every visible entity', icon: 'scan', run: () => graph.fit() },
            { type: 'Action', label: 'Save current view', detail: 'Preserve this graph and layout mode', icon: 'bookmark', run: saveCurrentView },
            { type: 'Action', label: 'Compare two entities', detail: 'Find their shortest relationship path', icon: 'git-compare-arrows', run: toggleCompareMode },
            { type: 'Action', label: 'Start guided presentation', detail: 'Tour the most connected entities', icon: 'play', run: startPresentation },
            { type: 'View', label: 'Explore mode', detail: 'Organic relationship map', icon: 'network', run: () => setGraphMode('explore') },
            { type: 'View', label: 'Cluster mode', detail: 'Group entities by semantic type', icon: 'layout-grid', run: () => setGraphMode('clusters') },
            { type: 'View', label: 'Timeline mode', detail: 'Arrange entities by extraction order', icon: 'git-commit-horizontal', run: () => setGraphMode('timeline') },
            { type: 'View', label: 'Evidence mode', detail: 'Expose confidence and relationship labels', icon: 'shield-check', run: () => setGraphMode('evidence') },
            { type: 'Panel', label: 'Open graph assistant', detail: 'Ask questions about the current graph', icon: 'sparkles', run: () => setContextTab('assistant') },
            ...state.graphData.nodes.map(node => ({ type: 'Entity', label: node.label, detail: `${capitalize(node.group || 'concept')} · ${node.details || 'Graph entity'}`, icon: typeIcons[node.group] || typeIcons.default, run: () => focusNode(node.id) })),
            ...state.savedViews.map(view => ({ type: 'Saved view', label: view.name, detail: relativeTime(view.savedAt), icon: 'bookmark-check', run: () => loadStoredGraph(view) }))
        ];
        const query = elements.commandInput.value.trim();
        if (query.toLowerCase().startsWith('ask ') && state.sessionId) {
            commands.unshift({ type: 'Ask AI', label: query.slice(4), detail: 'Ask this question using the current graph', icon: 'sparkles', run: () => { setContextTab('assistant'); elements.chatInput.value = query.slice(4); sendMessage(); } });
        }
        return commands;
    }

    function renderCommandResults() {
        const query = elements.commandInput.value.trim().toLowerCase();
        const items = commandCatalog().filter(item => !query || `${item.label} ${item.detail} ${item.type}`.toLowerCase().includes(query)).slice(0, 30);
        state.commandItems = items; state.commandIndex = Math.min(state.commandIndex, Math.max(0, items.length - 1));
        if (!items.length) { elements.commandResults.innerHTML = emptyStateMarkup(UNDRAW_EMPTY_STATES.noResults, 'No entities or commands matched.', 'command-empty-illustration'); return; }
        let previousType = '';
        elements.commandResults.innerHTML = items.map((item, index) => {
            const heading = item.type !== previousType ? `<div class="command-section-label">${escapeHtml(item.type)}</div>` : '';
            previousType = item.type;
            return `${heading}<button class="command-result${index === state.commandIndex ? ' active' : ''}" type="button" data-command-index="${index}"><span class="command-result-icon"><i data-lucide="${item.icon}"></i></span><span class="command-result-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small></span><i data-lucide="corner-down-left"></i></button>`;
        }).join('');
        refreshIcons();
    }

    function handleCommandKeys(event) {
        if (event.key === 'ArrowDown') { event.preventDefault(); state.commandIndex = Math.min(state.commandItems.length - 1, state.commandIndex + 1); renderCommandResults(); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); state.commandIndex = Math.max(0, state.commandIndex - 1); renderCommandResults(); }
        else if (event.key === 'Enter') { event.preventDefault(); runCommand(state.commandIndex); }
        else if (event.key === 'Escape') closeOverlay('command-palette');
    }

    function runCommand(index) {
        const item = state.commandItems[index]; if (!item) return;
        closeOverlay('command-palette'); item.run();
    }

    function showNodeMenu({ node, x, y }) {
        state.selectedNode = state.graphData.nodes.find(item => String(item.id) === String(node.id)) || node;
        elements.nodeMenu.style.left = `${Math.min(window.innerWidth - 202, x)}px`;
        elements.nodeMenu.style.top = `${Math.min(window.innerHeight - 220, y)}px`;
        elements.nodeMenu.classList.remove('hidden'); refreshIcons();
    }

    function runNodeMenuAction(action) {
        elements.nodeMenu.classList.add('hidden');
        if (!state.selectedNode) return;
        if (action === 'inspect') { renderInspector(); setContextTab('inspector'); elements.contextPanel.classList.add('open'); }
        if (action === 'expand') expandNode(state.selectedNode);
        if (action === 'ask') askSelectedEntity();
        if (action === 'compare') addToComparison(state.selectedNode.id);
        if (action === 'focus') graph.focusNeighborhood(state.selectedNode.id);
    }

    function startPresentation() {
        if (!state.graphData.nodes.length) return;
        const degrees = new Map(state.graphData.nodes.map(node => [String(node.id), graph.getConnections(node.id).length]));
        state.presentation.sequence = [...state.graphData.nodes].sort((a, b) => degrees.get(String(b.id)) - degrees.get(String(a.id))).slice(0, Math.min(8, state.graphData.nodes.length));
        state.presentation.index = 0; state.presentation.active = true; state.presentation.playing = true;
        elements.presentationCard.classList.remove('hidden'); showPresentationStep(); schedulePresentation();
    }

    function showPresentationStep() {
        const { sequence, index } = state.presentation;
        const node = sequence[index]; if (!node) return;
        $('#presentation-title').textContent = node.label;
        $('#presentation-details').textContent = node.details || `A ${node.group} with ${graph.getConnections(node.id).length} visible relationships.`;
        $('#presentation-progress').style.width = `${((index + 1) / sequence.length) * 100}%`;
        graph.zoomToNode(node.id, 1.65);
    }

    function movePresentation(delta) {
        if (!state.presentation.active) return;
        state.presentation.index = (state.presentation.index + delta + state.presentation.sequence.length) % state.presentation.sequence.length;
        showPresentationStep(); schedulePresentation();
    }

    function togglePresentationPlayback() {
        state.presentation.playing = !state.presentation.playing;
        $('#presentation-play').innerHTML = `<i data-lucide="${state.presentation.playing ? 'pause' : 'play'}"></i>`;
        refreshIcons();
        if (state.presentation.playing) schedulePresentation(); else clearTimeout(state.presentation.timer);
    }

    function schedulePresentation() {
        clearTimeout(state.presentation.timer);
        if (state.presentation.playing) state.presentation.timer = setTimeout(() => movePresentation(1), 6000);
    }

    function stopPresentation() {
        clearTimeout(state.presentation.timer); state.presentation = { active: false, sequence: [], index: 0, playing: false, timer: null };
        elements.presentationCard.classList.add('hidden'); graph.fit();
    }

    function updateGraphMetrics() {
        const nodes = graph.visibleData.nodes.length || state.graphData.nodes.length;
        const links = graph.visibleData.links.length || state.graphData.links.length;
        elements.nodeCount.textContent = nodes.toLocaleString(); elements.linkCount.textContent = links.toLocaleString();
        elements.sourceQuality.textContent = state.sources.length ? `${Math.min(99, 70 + state.sources.length * 7)}%` : 'Model';
    }

    async function shareSummary() {
        if (!state.graphData.nodes.length) return showToast('Nothing to share', 'Build a graph first.', 'error');
        const summary = `${state.topic}\n${state.graphData.nodes.length} entities · ${state.graphData.links.length} relationships\nTop entities: ${[...state.graphData.nodes].sort((a, b) => graph.getConnections(b.id).length - graph.getConnections(a.id).length).slice(0, 5).map(node => node.label).join(', ')}\n${location.href}`;
        try { await navigator.clipboard.writeText(summary); showToast('Summary copied', 'Paste it into a message or document.', 'success'); }
        catch { showToast('Could not access clipboard', 'Use Export to download the graph instead.', 'error'); }
    }

    function exportGraph() {
        if (!state.graphData.nodes.length) return;
        const payload = { title: state.topic, exportedAt: new Date().toISOString(), sources: state.sources, graph: state.graphData };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
        anchor.href = url; anchor.download = `${slugify(state.topic || 'knowledge-graph')}.json`; anchor.click(); URL.revokeObjectURL(url);
        addLog('EXPORT', 'Graph exported as structured JSON.', 'success'); showToast('Export ready', 'The complete graph was downloaded.', 'success');
    }

    function handleGlobalKeys(event) {
        const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openCommandPalette(); return; }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveCurrentView(); return; }
        if (event.key === 'Escape') {
            closeAllOverlays(); elements.contextPanel.classList.remove('open'); $('#source-sidebar').classList.remove('open'); elements.nodeMenu.classList.add('hidden');
            if (state.presentation.active) stopPresentation();
            return;
        }
        if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
        if (event.key.toLowerCase() === 'n') openSourceModal();
        if (event.key.toLowerCase() === 'f') graph.fit();
        if (event.key.toLowerCase() === 'c') toggleCompareMode();
    }

    function setActivityDrawer(open) {
        elements.activityDrawer.classList.toggle('open', open); elements.activityDrawer.setAttribute('aria-hidden', String(!open)); elements.activityButton.setAttribute('aria-expanded', String(open));
    }
    function toggleActivityDrawer() { setActivityDrawer(!elements.activityDrawer.classList.contains('open')); }
    function openOverlay(id) { const element = document.getElementById(id); element?.classList.remove('hidden'); document.body.classList.add('modal-open'); refreshIcons(); }
    function closeOverlay(id) { document.getElementById(id)?.classList.add('hidden'); if (!$$('.modal-backdrop:not(.hidden), .command-backdrop:not(.hidden), .shortcut-backdrop:not(.hidden)').length) document.body.classList.remove('modal-open'); }
    function closeModal(id) { closeOverlay(id); }
    function closePopover(id) { document.getElementById(id)?.classList.add('hidden'); if (id === 'filter-popover') elements.filterButton.setAttribute('aria-expanded', 'false'); }
    function closeAllOverlays() { ['source-modal', 'command-palette', 'shortcut-modal'].forEach(closeOverlay); closePopover('filter-popover'); }

    function showToast(title, detail, type = '') {
        const toast = document.createElement('div'); toast.className = `toast ${type}`;
        const icon = type === 'success' ? 'check' : type === 'error' ? 'triangle-alert' : 'info';
        toast.innerHTML = `<span class="toast-icon"><i data-lucide="${icon}"></i></span><span class="toast-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail || '')}</span></span>`;
        elements.toastRegion.appendChild(toast); refreshIcons();
        setTimeout(() => toast.remove(), 4200);
    }

    function maybeShowWelcome() {
        if (readStorage(STORAGE.onboarding, false)) return;
        writeStorage(STORAGE.onboarding, true);
        setTimeout(() => showToast('Welcome to Graphiti', 'Start with a topic, URL, or document. Press ⌘K whenever you want to move faster.'), 700);
    }

    function readStorage(key, fallback) { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
    function writeStorage(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage can be unavailable in private contexts. */ } }
    function escapeHtml(value) { const div = document.createElement('div'); div.textContent = String(value ?? ''); return div.innerHTML; }
    function capitalize(value) { const string = String(value || ''); return string.charAt(0).toUpperCase() + string.slice(1); }
    function formatBytes(bytes) { if (!bytes) return '0 B'; const units = ['B', 'KB', 'MB']; const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024))); return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`; }
    function relativeTime(timestamp) { const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000)); if (seconds < 60) return 'just now'; const minutes = Math.floor(seconds / 60); if (minutes < 60) return `${minutes}m ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`; return `${Math.floor(hours / 24)}d ago`; }
    function influenceLabel(degree, links) { const ratio = degree / Math.max(1, links); return ratio >= .32 ? 'High' : ratio >= .14 ? 'Medium' : 'Focused'; }
    function slugify(value) { return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'knowledge-graph'; }
    function linkKey(link) { const a = String(typeof link.source === 'object' ? link.source.id : link.source); const b = String(typeof link.target === 'object' ? link.target.id : link.target); return [a, b].sort().join('::') + `::${link.relation || ''}`; }
});
