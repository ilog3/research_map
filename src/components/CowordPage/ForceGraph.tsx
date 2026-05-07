import { useRef, useEffect, useCallback, useState } from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';

interface Node extends SimulationNodeDatum {
  id: string;
  count: number;
  domain: string;
  color: string;
}

interface Link extends SimulationLinkDatum<Node> {
  weight: number;
}

interface Props {
  nodes: Array<{ id: string; count: number; domain: string; color: string }>;
  links: Array<{ source: string; target: string; weight: number }>;
  onNodeClick: (id: string) => void;
  onNodeHover: (id: string | null) => void;
  hoveredNode: string | null;
}

const W = 1000;
const H = 750;

function nodeRadius(count: number) {
  return Math.max(3, Math.log2(count + 1) * 1.8);
}

// Pre-filter links: keep only top N strongest per node for default view
function filterTopLinks(
  allLinks: Array<{ source: string; target: string; weight: number }>,
  topN: number
): Set<string> {
  const nodeTop = new Map<string, number[]>(); // nodeId -> sorted weights
  for (const l of allLinks) {
    if (!nodeTop.has(l.source)) nodeTop.set(l.source, []);
    if (!nodeTop.has(l.target)) nodeTop.set(l.target, []);
    nodeTop.get(l.source)!.push(l.weight);
    nodeTop.get(l.target)!.push(l.weight);
  }
  // Find threshold per node
  const thresholds = new Map<string, number>();
  for (const [id, weights] of nodeTop) {
    weights.sort((a, b) => b - a);
    thresholds.set(id, weights[Math.min(topN - 1, weights.length - 1)] || 0);
  }
  const kept = new Set<string>();
  for (const l of allLinks) {
    const key = `${l.source}\t${l.target}`;
    if (l.weight >= (thresholds.get(l.source) || 0) || l.weight >= (thresholds.get(l.target) || 0)) {
      kept.add(key);
    }
  }
  return kept;
}

export default function ForceGraph({ nodes, links, onNodeClick, onNodeHover, hoveredNode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<Node>> | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const linksRef = useRef<Link[]>([]);
  const [simNodes, setSimNodes] = useState<Node[]>([]);
  const dragRef = useRef<{ node: Node; startX: number; startY: number } | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const topLinksRef = useRef<Set<string>>(new Set());
  hoveredRef.current = hoveredNode;

  // Draw links on canvas
  const drawLinks = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const scaleX = rect.width / W;
    const scaleY = rect.height / H;
    const ox = rect.width / 2;
    const oy = rect.height / 2;

    ctx.clearRect(0, 0, rect.width, rect.height);

    const hovered = hoveredRef.current;

    // Build connected set for hover
    const connectedToHovered = new Set<string>();
    if (hovered) {
      connectedToHovered.add(hovered);
      for (const l of linksRef.current) {
        const s = typeof l.source === 'object' ? l.source.id : String(l.source);
        const t = typeof l.target === 'object' ? l.target.id : String(l.target);
        if (s === hovered) connectedToHovered.add(t);
        if (t === hovered) connectedToHovered.add(s);
      }
    }

    const topLinks = topLinksRef.current;

    for (const l of linksRef.current) {
      const s = l.source as Node;
      const t = l.target as Node;
      if (s.x == null || t.x == null || s.y == null || t.y == null) continue;

      const sId = s.id;
      const tId = t.id;
      const isHighlighted = hovered && (sId === hovered || tId === hovered);
      const isDimmed = hovered && !isHighlighted;
      const linkKey = `${sId}\t${tId}`;
      const isTopLink = topLinks.has(linkKey);

      // In default (no hover) mode, only show top links
      if (!hovered && !isTopLink) continue;
      // In hover mode, show highlighted + top links only
      if (hovered && isDimmed && !isTopLink) continue;

      ctx.beginPath();
      ctx.moveTo(ox + s.x * scaleX, oy + s.y * scaleY);
      ctx.lineTo(ox + t.x * scaleX, oy + t.y * scaleY);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.3, Math.log2(l.weight) * 0.5) * scaleX;
      ctx.globalAlpha = isDimmed ? 0.015 : isHighlighted ? 0.5 : 0.08;
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }, []);

  // Run simulation when data changes
  useEffect(() => {
    const simNodesData: Node[] = nodes.map((n) => ({ ...n }));
    const simLinksData: Link[] = links.map((l) => ({
      source: l.source,
      target: l.target,
      weight: l.weight,
    })) as Link[];

    nodesRef.current = simNodesData;
    linksRef.current = simLinksData;
    topLinksRef.current = filterTopLinks(links, 3);

    if (simRef.current) simRef.current.stop();

    const sim = forceSimulation<Node>(simNodesData)
      .force(
        'link',
        forceLink<Node, Link>(simLinksData)
          .id((d) => d.id)
          .distance((d) => Math.max(40, 150 / Math.log2(d.weight + 1)))
      )
      .force('charge', forceManyBody<Node>().strength(-120))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide<Node>().radius((d) => nodeRadius(d.count) + 10))
      .alpha(1)
      .alphaDecay(0.02);

    sim.on('tick', () => {
      drawLinks();
      setSimNodes([...simNodesData]);
    });

    simRef.current = sim;
    return () => { sim.stop(); };
  }, [nodes, links, drawLinks]);

  // Redraw links when hover changes
  useEffect(() => {
    drawLinks();
  }, [hoveredNode, drawLinks]);

  // Drag handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, node: Node) => {
      e.preventDefault();
      dragRef.current = { node, startX: e.clientX, startY: e.clientY };
      node.fx = node.x;
      node.fy = node.y;
      simRef.current?.alphaTarget(0.3).restart();
    },
    []
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      const dx = (e.clientX - dragRef.current.startX) * scaleX;
      const dy = (e.clientY - dragRef.current.startY) * scaleY;
      const node = dragRef.current.node;
      node.fx = (node.x || 0) + dx;
      node.fy = (node.y || 0) + dy;
      dragRef.current.startX = e.clientX;
      dragRef.current.startY = e.clientY;
    };

    const handleMouseUp = () => {
      if (!dragRef.current) return;
      dragRef.current.node.fx = null;
      dragRef.current.node.fy = null;
      dragRef.current = null;
      simRef.current?.alphaTarget(0);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Connected set for node dimming
  const connectedToHovered = new Set<string>();
  if (hoveredNode) {
    connectedToHovered.add(hoveredNode);
    for (const l of linksRef.current) {
      const s = typeof l.source === 'object' ? l.source.id : String(l.source);
      const t = typeof l.target === 'object' ? l.target.id : String(l.target);
      if (s === hoveredNode) connectedToHovered.add(t);
      if (t === hoveredNode) connectedToHovered.add(s);
    }
  }

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {/* Canvas layer for links */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none' }}
      />
      {/* SVG layer for nodes (interactive) */}
      <svg
        ref={svgRef}
        viewBox={`${-W / 2} ${-H / 2} ${W} ${H}`}
        className="absolute inset-0 w-full h-full"
        style={{ cursor: dragRef.current ? 'grabbing' : 'default' }}
      >
        {simNodes.map((node) => {
          if (node.x == null || node.y == null) return null;
          const r = nodeRadius(node.count);
          const isHovered = node.id === hoveredNode;
          const isConnected = connectedToHovered.has(node.id);
          const isDimmed = hoveredNode && !isConnected;

          return (
            <g
              key={node.id}
              transform={`translate(${node.x},${node.y})`}
              style={{ cursor: 'pointer' }}
              opacity={isDimmed ? 0.15 : 1}
              onMouseEnter={() => onNodeHover(node.id)}
              onMouseLeave={() => onNodeHover(null)}
              onClick={() => onNodeClick(node.id)}
              onMouseDown={(e) => handleMouseDown(e, node)}
            >
              <circle
                r={r}
                fill={node.color}
                fillOpacity={0.8}
                stroke={isHovered ? '#ffffff' : node.color}
                strokeWidth={isHovered ? 2 : 0.5}
                strokeOpacity={isHovered ? 1 : 0.3}
              />
              <text
                dy={r + 10}
                textAnchor="middle"
                fill={isDimmed ? '#333' : isHovered ? '#fff' : '#bbb'}
                fontSize={Math.max(7, Math.min(11, r * 1.2))}
                fontWeight={isHovered ? 600 : 400}
                stroke="#0a0a1a"
                strokeWidth={2.5}
                paintOrder="stroke"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {node.id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
