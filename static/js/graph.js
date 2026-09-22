
class KnowledgeGraph {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;
        this.svg = d3.select(this.container).append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("viewBox", [0, 0, this.width, this.height])
            .style("cursor", "move");

        this.zoomGroup = this.svg.append("g");
        this.simulation = null;
        this.zoom = null;
        this.data = { nodes: [], links: [] };
        this.renderedNodes = [];
        this.renderedLinks = [];

        console.log("Graph initialized. Container:", this.container, "Width:", this.width, "Height:", this.height);
        if (this.width === 0 || this.height === 0) {
            console.warn("Graph container has 0 dimensions!");
        }

        this.init();

        window.addEventListener('resize', () => this.resize());
    }

    init() {
        // Zoom behavior
        // this.zoomGroup = this.svg.append("g"); // Moved to constructor
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => {
                this.zoomGroup.attr("transform", event.transform);
            });
        this.svg.call(this.zoom);

        // Filters (Glow) - REMOVED temporarily to debug visibility
        // const defs = this.svg.append("defs");
        // const filter = defs.append("filter").attr("id", "glow");
        // filter.append("feGaussianBlur").attr("stdDeviation", "2.5").attr("result", "coloredBlur");
        // const feMerge = filter.append("feMerge");
        // feMerge.append("feMergeNode").attr("in", "coloredBlur");
        // feMerge.append("feMergeNode").attr("in", "SourceGraphic");

        // Color scale
        this.color = d3.scaleOrdinal()
            .domain(['product', 'feature', 'concept', 'company', 'person'])
            .range(['#60a5fa', '#34d399', '#c084fc', '#fbbf24', '#f87171']);
    }

    resize() {
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;
        this.svg.attr("viewBox", [0, 0, this.width, this.height]);
        if (this.simulation) {
            this.simulation.alpha(0.3).restart();
        }
    }

    render(data) {
        if (!data || !data.nodes || data.nodes.length === 0) {
            console.error("Graph.render received empty data");
            return;
        }

        // --- ROBUST DOM SELECTION ---
        // Always select from the container to ensure we have the live DOM element
        let svg = d3.select(this.container).select("svg");
        if (svg.empty()) {
            console.warn("SVG missing, recreating...");
            svg = d3.select(this.container).append("svg")
                .attr("width", "100%")
                .attr("height", "100%")
                .attr("viewBox", [0, 0, this.width, this.height])
                .style("cursor", "move");
        }

        // Ensure Zoom Group exists
        let zoomGroup = svg.select("g.zoom-layer");
        if (zoomGroup.empty()) {
            zoomGroup = svg.append("g").attr("class", "zoom-layer");
            // Re-attach zoom behavior if needed, but usually zoom is on SVG
            this.zoomGroup = zoomGroup; // Update reference
        }
        // ---------------------------

        // Keep a serializable copy for export/chat while D3 mutates the rendered
        // link endpoints into node objects.
        this.data = {
            nodes: data.nodes.map(node => ({ ...node })),
            links: data.links.map(link => ({
                ...link,
                source: this.nodeId(link.source),
                target: this.nodeId(link.target)
            }))
        };
        zoomGroup.selectAll("*").remove(); // Clear previous content

        // Ensure dimensions are up to date
        this.resize();

        const nodes = data.nodes.map(d => ({ ...d }));
        const links = data.links.map(d => ({
            ...d,
            source: this.nodeId(d.source),
            target: this.nodeId(d.target)
        }));

        this.renderedNodes = nodes;
        this.renderedLinks = links;

        // Simulation
        this.simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(120))
            .force("charge", d3.forceManyBody().strength(-400))
            .force("center", d3.forceCenter(this.width / 2, this.height / 2))
            .force("collide", d3.forceCollide().radius(d => (d.val || 1) * 5 + 15));

        // Links Container
        const linkGroup = zoomGroup.append("g").attr("class", "links");

        // Links Selection
        const link = linkGroup
            .attr("stroke", "#374151")
            .attr("stroke-opacity", 0.4)
            .selectAll("line")
            .data(links)
            .join("line")
            .attr("stroke-width", 1);

        // Nodes Container
        const nodeGroup = zoomGroup.append("g").attr("class", "nodes");

        // Nodes Selection
        const node = nodeGroup
            .selectAll("g")
            .data(nodes)
            .join("g")
            .attr("class", "node")
            .attr("cursor", "pointer")
            .call(d3.drag()
                .on("start", (event, d) => {
                    if (!event.active) this.simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on("drag", (event, d) => {
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on("end", (event, d) => {
                    if (!event.active) this.simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }));

        // Circles
        node.append("circle")
            .attr("r", d => 8 + (d.val || 1) * 2)
            .attr("fill", d => this.color(d.group))
            .attr("stroke", "#fff")
            .attr("stroke-width", 2)
            // .style("filter", "url(#glow)") // Removed filter
            .on("click", (event, d) => {
                event.stopPropagation();
                this.handleNodeClick(d);
            })
            .on("dblclick", (event, d) => {
                event.stopPropagation();
                this.handleNodeDoubleClick(d);
            });

        // Labels
        node.append("text")
            .attr("dx", 15)
            .attr("dy", ".35em")
            .text(d => d.label)
            .style("fill", "#fff")
            .style("font-family", "sans-serif")
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .style("pointer-events", "none")
            .style("text-shadow", "0px 0px 4px #000");

        // Tick Handler
        this.simulation.on("tick", () => {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node.attr("transform", d => `translate(${d.x},${d.y})`);
        });

        console.log("Graph rendered with", nodes.length, "nodes.");
    }

    handleNodeClick(node) {
        console.log("Clicked:", node);

        // Focus Mode Logic
        if (this.focusedNodeId === node.id) {
            this.focusedNodeId = null;
            this.resetHighlight();
        } else {
            this.focusedNodeId = node.id;
            this.highlightNode(node);
        }

        // Dispatch custom event
        const event = new CustomEvent('node-click', { detail: node });
        document.dispatchEvent(event);
    }

    highlightNode(node) {
        // Dim everything
        this.svg.selectAll("circle").style("opacity", 0.1);
        this.svg.selectAll("line").style("opacity", 0.05);
        this.svg.selectAll("text").style("opacity", 0.1);

        // Find connected
        const connectedLinks = this.renderedLinks.filter(l =>
            this.nodeId(l.source) === node.id || this.nodeId(l.target) === node.id
        );
        const connectedNodeIds = new Set([
            node.id,
            ...connectedLinks.map(l =>
                this.nodeId(l.source) === node.id ? this.nodeId(l.target) : this.nodeId(l.source)
            )
        ]);

        // Highlight nodes
        this.svg.selectAll(".node")
            .filter(d => connectedNodeIds.has(d.id))
            .select("circle")
            .style("opacity", 1);

        this.svg.selectAll(".node")
            .filter(d => connectedNodeIds.has(d.id))
            .select("text")
            .style("opacity", 1);

        // Highlight links
        this.svg.selectAll("line")
            .filter(d => this.nodeId(d.source) === node.id || this.nodeId(d.target) === node.id)
            .style("opacity", 0.8)
            .attr("stroke", "#60a5fa");
    }

    resetHighlight() {
        this.svg.selectAll("circle").style("opacity", 1);
        this.svg.selectAll("line").style("opacity", 0.4).attr("stroke", "#374151");
        this.svg.selectAll("text").style("opacity", 0.8);
    }

    handleNodeDoubleClick(node) {
        console.log("Double Clicked:", node);
        const event = new CustomEvent('node-dblclick', { detail: node });
        document.dispatchEvent(event);
    }

    zoomIn() {
        if (this.svg && this.zoom) {
            this.svg.transition().duration(300).call(this.zoom.scaleBy, 1.3);
        }
    }

    zoomOut() {
        if (this.svg && this.zoom) {
            this.svg.transition().duration(300).call(this.zoom.scaleBy, 0.7);
        }
    }

    fit() {
        if (this.svg && this.zoom) {
            this.svg.transition().duration(750).call(this.zoom.transform, d3.zoomIdentity.translate(this.width / 2, this.height / 2).scale(0.8));
        }
    }

    zoomToNode(nodeId) {
        const node = this.renderedNodes.find(n => n.id === nodeId);
        if (!node || !this.svg || !this.zoom) return;

        // 1. Trigger Highlight & Inspector
        this.handleNodeClick(node);

        // 2. Zoom to Node
        const scale = 1.5;
        const x = -node.x * scale + this.width / 2;
        const y = -node.y * scale + this.height / 2;

        this.svg.transition().duration(750).call(
            this.zoom.transform,
            d3.zoomIdentity.translate(x, y).scale(scale)
        );
    }

    nodeId(endpoint) {
        return endpoint && typeof endpoint === 'object' ? endpoint.id : endpoint;
    }
}
