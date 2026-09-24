class KnowledgeGraph {
    constructor(containerId, minimapId = 'minimap') {
        this.container = document.getElementById(containerId);
        this.minimap = document.getElementById(minimapId);
        this.data = { nodes: [], links: [] };
        this.visibleData = { nodes: [], links: [] };
        this.renderedNodes = [];
        this.renderedLinks = [];
        this.mode = 'explore';
        this.selectedIds = new Set();
        this.hiddenGroups = new Set();
        this.minimumDegree = 0;
        this.showRelationshipLabels = false;
        this.lassoEnabled = false;
        this.currentTransform = d3.zoomIdentity;
        this.width = 1;
        this.height = 1;
        this.simulation = null;
        this.tickCount = 0;

        this.colors = {
            product: '#6da8ff',
            feature: '#54d8aa',
            concept: '#a28bff',
            company: '#f1b85c',
            person: '#f37c91',
            location: '#62d1e6',
            organization: '#f1b85c',
            event: '#f39c68',
            default: '#8794a9'
        };

        this.svg = d3.select(this.container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('aria-hidden', 'true');
        this.defs = this.svg.append('defs');
        this.defs.append('marker')
            .attr('id', 'graph-arrow')
            .attr('viewBox', '0 -4 8 8')
            .attr('refX', 7)
            .attr('refY', 0)
            .attr('markerWidth', 5)
            .attr('markerHeight', 5)
            .attr('orient', 'auto')
            .attr('markerUnits', 'strokeWidth')
            .append('path')
            .attr('d', 'M0,-3L7,0L0,3')
            .attr('fill', '#657289');
        this.zoomLayer = this.svg.append('g').attr('class', 'zoom-layer');
        this.clusterLayer = this.zoomLayer.append('g').attr('class', 'cluster-layer');
        this.linkLayer = this.zoomLayer.append('g').attr('class', 'links');
        this.linkLabelLayer = this.zoomLayer.append('g').attr('class', 'link-labels');
        this.nodeLayer = this.zoomLayer.append('g').attr('class', 'nodes');
        this.annotationLayer = this.zoomLayer.append('g').attr('class', 'annotations');
        this.brushLayer = this.svg.append('g').attr('class', 'brush').style('display', 'none');

        this.zoom = d3.zoom()
            .scaleExtent([0.18, 5])
            .filter(event => !this.lassoEnabled && !event.button)
            .on('zoom', event => {
                this.currentTransform = event.transform;
                this.zoomLayer.attr('transform', event.transform);
                this.container.classList.toggle('zoomed-in', event.transform.k > 1.18);
                this.updateMinimapViewport();
            });
        this.svg.call(this.zoom).on('dblclick.zoom', null);

        this.brush = d3.brush()
            .on('end', event => this.finishLasso(event));

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.container);
        this.resize();
        this.bindKeyboardNavigation();
    }

    nodeId(value) {
        return value && typeof value === 'object' ? String(value.id) : String(value);
    }

    normalize(data) {
        const nodes = (data?.nodes || []).map((node, index) => ({
            ...node,
            id: String(node.id),
            label: String(node.label || `Entity ${index + 1}`),
            group: String(node.group || 'concept').toLowerCase(),
            val: Number(node.val) || 1,
            indexOrder: index
        }));
        const nodeIds = new Set(nodes.map(node => node.id));
        const links = (data?.links || []).map((link, index) => ({
            ...link,
            source: this.nodeId(link.source),
            target: this.nodeId(link.target),
            relation: String(link.relation || 'related to').replaceAll('_', ' '),
            confidence: Number(link.confidence) || Math.max(.58, .92 - (index % 5) * .06)
        })).filter(link => nodeIds.has(link.source) && nodeIds.has(link.target));
        const degree = new Map(nodes.map(node => [node.id, 0]));
        links.forEach(link => {
            degree.set(link.source, (degree.get(link.source) || 0) + 1);
            degree.set(link.target, (degree.get(link.target) || 0) + 1);
        });
        nodes.forEach(node => { node.degree = degree.get(node.id) || 0; });
        return { nodes, links };
    }

    render(data, options = {}) {
        const normalized = this.normalize(data);
        this.data = {
            nodes: normalized.nodes.map(node => ({ ...node })),
            links: normalized.links.map(link => ({ ...link }))
        };
        this.applyFilters(options.preserveTransform !== true);
    }

    applyFilters(resetView = false) {
        const allowedNodes = this.data.nodes.filter(node =>
            !this.hiddenGroups.has(node.group) && node.degree >= this.minimumDegree
        );
        const allowedIds = new Set(allowedNodes.map(node => node.id));
        const allowedLinks = this.data.links.filter(link =>
            allowedIds.has(this.nodeId(link.source)) && allowedIds.has(this.nodeId(link.target))
        );
        this.visibleData = { nodes: allowedNodes, links: allowedLinks };
        this.draw(resetView);
    }

    draw(resetView = false) {
        if (this.simulation) this.simulation.stop();
        this.resize();
        this.clusterLayer.selectAll('*').remove();
        this.linkLayer.selectAll('*').remove();
        this.linkLabelLayer.selectAll('*').remove();
        this.nodeLayer.selectAll('*').remove();
        this.annotationLayer.selectAll('*').remove();

        const nodes = this.visibleData.nodes.map(node => ({ ...node }));
        const links = this.visibleData.links.map(link => ({
            ...link,
            source: this.nodeId(link.source),
            target: this.nodeId(link.target)
        }));
        this.renderedNodes = nodes;
        this.renderedLinks = links;
        this.container.className = `graph-canvas mode-${this.mode}${this.showRelationshipLabels ? ' show-link-labels' : ''}`;

        const linkSelection = this.linkLayer.selectAll('line')
            .data(links, link => `${this.nodeId(link.source)}-${this.nodeId(link.target)}-${link.relation}`)
            .join('line')
            .attr('class', 'link')
            .attr('marker-end', 'url(#graph-arrow)')
            .attr('stroke-width', link => this.mode === 'evidence' ? 1 + link.confidence * 2 : 1 + link.confidence);

        const relationLabels = this.linkLabelLayer.selectAll('text')
            .data(links)
            .join('text')
            .attr('class', 'relation-label')
            .attr('text-anchor', 'middle')
            .text(link => link.relation);

        const maxDegree = Math.max(1, ...nodes.map(node => node.degree));
        nodes.forEach(node => {
            const importance = Math.sqrt((node.degree + Math.max(1, node.val)) / (maxDegree + 1));
            node.radius = Math.round(15 + importance * 13);
        });
        const secondaryThreshold = d3.median(nodes, node => node.degree) || 0;
        const nodeSelection = this.nodeLayer.selectAll('g.node')
            .data(nodes, node => node.id)
            .join('g')
            .attr('class', node => `node${this.selectedIds.has(node.id) ? ' selected' : ''}`)
            .attr('tabindex', -1)
            .attr('role', 'button')
            .attr('aria-label', node => `${node.label}, ${node.group}, ${node.degree} connections`)
            .style('color', node => this.color(node.group))
            .call(this.dragBehavior());

        nodeSelection.append('circle')
            .attr('class', 'node-halo')
            .attr('r', node => node.radius + 6)
            .attr('fill', node => this.color(node.group));

        nodeSelection.append('circle')
            .attr('class', 'node-shape')
            .attr('r', node => node.radius)
            .attr('fill', node => this.color(node.group));

        nodeSelection.append('circle')
            .attr('class', 'node-core')
            .attr('r', node => Math.max(4, node.radius * .27))
            .attr('fill', 'rgba(255,255,255,.88)');

        nodeSelection.append('circle')
            .attr('class', 'node-selection-ring')
            .attr('r', node => node.radius + 8)
            .attr('fill', 'none')
            .attr('stroke', node => this.color(node.group))
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3 4')
            .attr('opacity', node => this.selectedIds.has(node.id) ? .65 : 0);

        nodeSelection.append('text')
            .attr('class', node => `node-label${node.degree <= secondaryThreshold ? ' secondary' : ''}`)
            .attr('text-anchor', 'middle')
            .attr('dy', node => node.radius + 17)
            .text(node => this.truncate(node.label, 28));

        nodeSelection
            .on('click', (event, node) => {
                event.stopPropagation();
                const multi = event.shiftKey || event.metaKey || event.ctrlKey;
                this.selectNode(node.id, multi);
                this.dispatch('graph:node-select', { node: this.publicNode(node), multi, originalEvent: event });
            })
            .on('dblclick', (event, node) => {
                event.preventDefault();
                event.stopPropagation();
                this.dispatch('graph:node-expand', { node: this.publicNode(node) });
            })
            .on('contextmenu', (event, node) => {
                event.preventDefault();
                this.selectNode(node.id, false);
                this.dispatch('graph:node-menu', { node: this.publicNode(node), x: event.clientX, y: event.clientY });
            })
            .on('keydown', (event, node) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    this.selectNode(node.id, event.shiftKey);
                    this.dispatch('graph:node-select', { node: this.publicNode(node), multi: event.shiftKey, originalEvent: event });
                }
            });

        this.svg.on('click', event => {
            if (event.target === this.svg.node()) this.clearSelection();
        });

        this.configureSimulation(nodes, links);
        this.simulation.on('tick', () => {
            linkSelection
                .attr('x1', link => this.linkPoint(link, true).x)
                .attr('y1', link => this.linkPoint(link, true).y)
                .attr('x2', link => this.linkPoint(link, false).x)
                .attr('y2', link => this.linkPoint(link, false).y);
            relationLabels
                .attr('x', link => (link.source.x + link.target.x) / 2)
                .attr('y', link => (link.source.y + link.target.y) / 2 - 4);
            nodeSelection.attr('transform', node => `translate(${node.x},${node.y})`);
            if (this.mode === 'clusters' && this.tickCount % 3 === 0) this.updateClusterHalos(nodes);
            if (this.tickCount % 8 === 0) this.updateMinimap();
            this.tickCount += 1;
        }).on('end', () => {
            this.updateMinimap();
            if (resetView) this.fit(false);
        });

        if (this.mode === 'clusters') this.createClusterHalos(nodes);
        if (this.mode === 'timeline') this.drawTimelineAnnotations(nodes);
        if (!nodes.length) this.updateMinimap();
        this.updateSelectionStyles();
    }

    configureSimulation(nodes, links) {
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(node => node.id).distance(link => 92 + (1 - link.confidence) * 70).strength(.55))
            .force('charge', d3.forceManyBody().strength(node => -210 - node.degree * 25))
            .force('collide', d3.forceCollide().radius(node => (node.radius || 20) + 26).iterations(2));

        if (this.mode === 'timeline') {
            const usable = Math.max(300, this.width - 160);
            simulation
                .force('link', d3.forceLink(links).id(node => node.id).distance(110).strength(.2))
                .force('x', d3.forceX(node => 80 + (node.indexOrder / Math.max(1, nodes.length - 1)) * usable).strength(.9))
                .force('y', d3.forceY(node => this.groupLane(node.group)).strength(.65))
                .force('charge', d3.forceManyBody().strength(-80));
        } else if (this.mode === 'clusters') {
            const positions = this.clusterPositions(nodes);
            simulation
                .force('x', d3.forceX(node => positions.get(node.group)?.x || centerX).strength(.22))
                .force('y', d3.forceY(node => positions.get(node.group)?.y || centerY).strength(.22));
        } else {
            simulation
                .force('x', d3.forceX(centerX).strength(.045))
                .force('y', d3.forceY(centerY).strength(.045));
        }
        this.simulation = simulation.alpha(1).alphaDecay(.045).restart();
    }

    dragBehavior() {
        return d3.drag()
            .filter(event => !this.lassoEnabled)
            .on('start', (event, node) => {
                if (!event.active) this.simulation?.alphaTarget(.22).restart();
                node.fx = node.x;
                node.fy = node.y;
            })
            .on('drag', (event, node) => {
                node.fx = event.x;
                node.fy = event.y;
            })
            .on('end', (event, node) => {
                if (!event.active) this.simulation?.alphaTarget(0);
                node.fx = null;
                node.fy = null;
            });
    }

    linkPoint(link, fromSource) {
        const source = link.source;
        const target = link.target;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const node = fromSource ? source : target;
        const direction = fromSource ? 1 : -1;
        const offset = (node.radius || 20) + (fromSource ? 2 : 7);
        return {
            x: node.x + direction * (dx / distance) * offset,
            y: node.y + direction * (dy / distance) * offset
        };
    }

    color(group) { return this.colors[group] || this.colors.default; }
    truncate(value, limit) { return value.length > limit ? `${value.slice(0, limit - 1)}…` : value; }
    publicNode(node) { return this.data.nodes.find(item => item.id === node.id) || { ...node }; }

    setMode(mode) {
        if (!['explore', 'clusters', 'timeline', 'evidence'].includes(mode)) return;
        this.mode = mode;
        this.draw(true);
    }

    setFilters({ hiddenGroups = [], minimumDegree = 0, showRelationshipLabels = false }) {
        this.hiddenGroups = new Set(hiddenGroups);
        this.minimumDegree = Number(minimumDegree) || 0;
        this.showRelationshipLabels = Boolean(showRelationshipLabels);
        this.applyFilters(true);
    }

    selectNode(id, multi = false) {
        const normalized = String(id);
        if (!multi) this.selectedIds.clear();
        if (multi && this.selectedIds.has(normalized)) this.selectedIds.delete(normalized);
        else this.selectedIds.add(normalized);
        this.updateSelectionStyles();
        this.highlightSelection();
        this.dispatch('graph:selection', { ids: [...this.selectedIds], nodes: this.getSelectedNodes() });
    }

    setSelection(ids = []) {
        this.selectedIds = new Set(ids.map(String).filter(id => this.data.nodes.some(node => node.id === id)));
        this.updateSelectionStyles();
        this.highlightSelection();
        this.dispatch('graph:selection', { ids: [...this.selectedIds], nodes: this.getSelectedNodes() });
    }

    clearSelection() {
        if (!this.selectedIds.size) return;
        this.selectedIds.clear();
        this.updateSelectionStyles();
        this.resetHighlight();
        this.dispatch('graph:selection', { ids: [], nodes: [] });
    }

    getSelectedNodes() { return [...this.selectedIds].map(id => this.data.nodes.find(node => node.id === id)).filter(Boolean); }

    updateSelectionStyles() {
        this.nodeLayer.selectAll('.node')
            .classed('selected', node => this.selectedIds.has(node.id))
            .select('.node-selection-ring')
            .attr('opacity', node => this.selectedIds.has(node.id) ? .72 : 0);
    }

    highlightSelection() {
        if (!this.selectedIds.size) return this.resetHighlight();
        const connected = new Set(this.selectedIds);
        this.data.links.forEach(link => {
            const source = this.nodeId(link.source);
            const target = this.nodeId(link.target);
            if (this.selectedIds.has(source) || this.selectedIds.has(target)) {
                connected.add(source);
                connected.add(target);
            }
        });
        this.nodeLayer.selectAll('.node').classed('dimmed', node => !connected.has(node.id));
        this.linkLayer.selectAll('.link')
            .classed('highlighted', link => this.selectedIds.has(this.nodeId(link.source)) || this.selectedIds.has(this.nodeId(link.target)))
            .classed('dimmed', link => !this.selectedIds.has(this.nodeId(link.source)) && !this.selectedIds.has(this.nodeId(link.target)));
    }

    resetHighlight() {
        this.nodeLayer.selectAll('.node').classed('dimmed', false);
        this.linkLayer.selectAll('.link').classed('highlighted', false).classed('dimmed', false);
    }

    getConnections(id) {
        const normalized = String(id);
        return this.data.links.filter(link => this.nodeId(link.source) === normalized || this.nodeId(link.target) === normalized).map(link => {
            const source = this.nodeId(link.source);
            const target = this.nodeId(link.target);
            const otherId = source === normalized ? target : source;
            return { ...link, source, target, other: this.data.nodes.find(node => node.id === otherId) };
        }).filter(item => item.other);
    }

    findPath(fromId, toId) {
        const start = String(fromId);
        const end = String(toId);
        if (start === end) return [start];
        const adjacency = new Map(this.data.nodes.map(node => [node.id, []]));
        this.data.links.forEach(link => {
            const source = this.nodeId(link.source);
            const target = this.nodeId(link.target);
            adjacency.get(source)?.push(target);
            adjacency.get(target)?.push(source);
        });
        const queue = [[start]];
        const visited = new Set([start]);
        while (queue.length) {
            const path = queue.shift();
            for (const next of adjacency.get(path.at(-1)) || []) {
                if (visited.has(next)) continue;
                const candidate = [...path, next];
                if (next === end) return candidate;
                visited.add(next);
                queue.push(candidate);
            }
        }
        return [];
    }

    focusNeighborhood(id) {
        this.selectNode(id, false);
        this.zoomToNode(id, 1.45);
    }

    zoomToNode(id, scale = 1.8) {
        const node = this.renderedNodes.find(item => item.id === String(id));
        if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
        const transform = d3.zoomIdentity
            .translate(this.width / 2, this.height / 2)
            .scale(scale)
            .translate(-node.x, -node.y);
        this.svg.transition().duration(520).ease(d3.easeCubicOut).call(this.zoom.transform, transform);
        this.selectNode(node.id, false);
        setTimeout(() => this.nodeLayer.selectAll('.node').filter(item => item.id === node.id).node()?.focus(), 540);
    }

    fit(animated = true) {
        if (!this.renderedNodes.length) return;
        const bounds = {
            minX: d3.min(this.renderedNodes, node => node.x) ?? 0,
            maxX: d3.max(this.renderedNodes, node => node.x) ?? this.width,
            minY: d3.min(this.renderedNodes, node => node.y) ?? 0,
            maxY: d3.max(this.renderedNodes, node => node.y) ?? this.height
        };
        const dx = Math.max(120, bounds.maxX - bounds.minX + 100);
        const dy = Math.max(120, bounds.maxY - bounds.minY + 100);
        const scale = Math.max(.25, Math.min(1.35, .9 / Math.max(dx / this.width, dy / this.height)));
        const x = (bounds.minX + bounds.maxX) / 2;
        const y = (bounds.minY + bounds.maxY) / 2;
        const transform = d3.zoomIdentity.translate(this.width / 2, this.height / 2).scale(scale).translate(-x, -y);
        const target = animated ? this.svg.transition().duration(480).ease(d3.easeCubicOut) : this.svg;
        target.call(this.zoom.transform, transform);
    }

    zoomBy(factor) { this.svg.transition().duration(220).call(this.zoom.scaleBy, factor); }

    enableLasso(enabled) {
        this.lassoEnabled = Boolean(enabled);
        this.brushLayer.style('display', this.lassoEnabled ? null : 'none');
        if (this.lassoEnabled) this.brushLayer.call(this.brush.extent([[0, 0], [this.width, this.height]]));
        else this.brushLayer.selectAll('*').remove();
    }

    finishLasso(event) {
        if (!event.selection) return;
        const [[x0, y0], [x1, y1]] = event.selection;
        const ids = this.renderedNodes.filter(node => {
            const [x, y] = this.currentTransform.apply([node.x, node.y]);
            return x >= x0 && x <= x1 && y >= y0 && y <= y1;
        }).map(node => node.id);
        this.setSelection(ids);
        this.brushLayer.call(this.brush.move, null);
        this.dispatch('graph:lasso-complete', { ids, nodes: this.getSelectedNodes() });
    }

    bindKeyboardNavigation() {
        this.container.addEventListener('keydown', event => {
            if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            const selected = this.getSelectedNodes()[0];
            if (!selected) return;
            const connections = this.getConnections(selected.id);
            if (!connections.length) return;
            event.preventDefault();
            const current = this.renderedNodes.find(node => node.id === selected.id);
            const candidates = connections.map(connection => this.renderedNodes.find(node => node.id === connection.other.id)).filter(Boolean);
            const scored = candidates.map(node => {
                const dx = node.x - current.x;
                const dy = node.y - current.y;
                const directionScore = event.key === 'ArrowRight' ? dx : event.key === 'ArrowLeft' ? -dx : event.key === 'ArrowDown' ? dy : -dy;
                return { node, directionScore, distance: Math.hypot(dx, dy) };
            }).filter(item => item.directionScore > 0).sort((a, b) => b.directionScore - a.directionScore || a.distance - b.distance);
            const next = scored[0]?.node || candidates[0];
            if (next) {
                this.zoomToNode(next.id, this.currentTransform.k || 1.4);
                this.dispatch('graph:node-select', { node: this.publicNode(next), multi: false, originalEvent: event });
            }
        });
    }

    clusterPositions(nodes) {
        const groups = [...new Set(nodes.map(node => node.group))];
        const radius = Math.min(this.width, this.height) * .29;
        return new Map(groups.map((group, index) => {
            const angle = (index / Math.max(1, groups.length)) * Math.PI * 2 - Math.PI / 2;
            return [group, { x: this.width / 2 + Math.cos(angle) * radius, y: this.height / 2 + Math.sin(angle) * radius }];
        }));
    }

    groupLane(group) {
        const groups = [...new Set(this.visibleData.nodes.map(node => node.group))];
        const index = Math.max(0, groups.indexOf(group));
        return 75 + index * Math.max(64, (this.height - 150) / Math.max(1, groups.length - 1));
    }

    createClusterHalos(nodes) {
        const groups = [...new Set(nodes.map(node => node.group))];
        this.clusterLayer.selectAll('ellipse').data(groups).join('ellipse')
            .attr('class', 'cluster-halo')
            .attr('fill', group => this.color(group))
            .attr('stroke', group => this.color(group));
    }

    updateClusterHalos(nodes) {
        this.clusterLayer.selectAll('ellipse').each(function(group) {
            const members = nodes.filter(node => node.group === group);
            if (!members.length) return;
            const xExtent = d3.extent(members, node => node.x);
            const yExtent = d3.extent(members, node => node.y);
            d3.select(this)
                .attr('cx', (xExtent[0] + xExtent[1]) / 2)
                .attr('cy', (yExtent[0] + yExtent[1]) / 2)
                .attr('rx', Math.max(62, (xExtent[1] - xExtent[0]) / 2 + 48))
                .attr('ry', Math.max(50, (yExtent[1] - yExtent[0]) / 2 + 42));
        });
    }

    drawTimelineAnnotations(nodes) {
        const groups = [...new Set(nodes.map(node => node.group))];
        this.annotationLayer.selectAll('line.timeline-guide').data(groups).join('line')
            .attr('class', 'timeline-guide')
            .attr('x1', 36).attr('x2', Math.max(36, this.width - 36))
            .attr('y1', group => this.groupLane(group)).attr('y2', group => this.groupLane(group))
            .attr('stroke', 'rgba(151,164,187,.09)').attr('stroke-dasharray', '3 7');
        this.annotationLayer.selectAll('text.timeline-label').data(groups).join('text')
            .attr('class', 'timeline-label').attr('x', 38).attr('y', group => this.groupLane(group) - 11)
            .attr('fill', group => this.color(group)).attr('font-size', 8).attr('font-weight', 750)
            .text(group => group.toUpperCase());
    }

    resize() {
        const rect = this.container.getBoundingClientRect();
        const nextWidth = Math.max(1, rect.width);
        const nextHeight = Math.max(1, rect.height);
        const changed = nextWidth !== this.width || nextHeight !== this.height;
        this.width = nextWidth;
        this.height = nextHeight;
        this.svg.attr('viewBox', `0 0 ${this.width} ${this.height}`);
        if (this.lassoEnabled) this.brushLayer.call(this.brush.extent([[0, 0], [this.width, this.height]]));
        if (changed && this.simulation) {
            this.configureSimulation(this.renderedNodes, this.renderedLinks);
            this.simulation.alpha(.35).restart();
        }
    }

    updateMinimap() {
        if (!this.minimap) return;
        const svg = d3.select(this.minimap);
        svg.selectAll('*').remove();
        if (!this.renderedNodes.length) return;
        const width = Math.max(1, this.minimap.clientWidth || 136);
        const height = Math.max(1, this.minimap.clientHeight || 75);
        const x = d3.scaleLinear().domain(d3.extent(this.renderedNodes, node => node.x)).range([8, width - 8]);
        const y = d3.scaleLinear().domain(d3.extent(this.renderedNodes, node => node.y)).range([8, height - 8]);
        svg.attr('viewBox', `0 0 ${width} ${height}`);
        svg.selectAll('line').data(this.renderedLinks).join('line')
            .attr('x1', link => x(link.source.x)).attr('y1', link => y(link.source.y))
            .attr('x2', link => x(link.target.x)).attr('y2', link => y(link.target.y))
            .attr('stroke', '#5b6576').attr('stroke-opacity', .3).attr('stroke-width', .6);
        svg.selectAll('circle').data(this.renderedNodes).join('circle')
            .attr('cx', node => x(node.x)).attr('cy', node => y(node.y)).attr('r', 2.1).attr('fill', node => this.color(node.group));
        this.minimapScale = { x, y, width, height };
        this.updateMinimapViewport();
    }

    updateMinimapViewport() {
        if (!this.minimap || !this.minimapScale) return;
        const { x, y } = this.minimapScale;
        const inverseLeft = this.currentTransform.invertX(0);
        const inverseRight = this.currentTransform.invertX(this.width);
        const inverseTop = this.currentTransform.invertY(0);
        const inverseBottom = this.currentTransform.invertY(this.height);
        const svg = d3.select(this.minimap);
        svg.selectAll('rect.viewport').data([0]).join('rect')
            .attr('class', 'viewport')
            .attr('x', Math.min(x(inverseLeft), x(inverseRight)))
            .attr('y', Math.min(y(inverseTop), y(inverseBottom)))
            .attr('width', Math.abs(x(inverseRight) - x(inverseLeft)))
            .attr('height', Math.abs(y(inverseBottom) - y(inverseTop)))
            .attr('fill', 'rgba(130,116,245,.07)').attr('stroke', 'rgba(169,159,255,.6)').attr('stroke-width', .7);
    }

    dispatch(name, detail) { document.dispatchEvent(new CustomEvent(name, { detail })); }
}

window.KnowledgeGraph = KnowledgeGraph;
