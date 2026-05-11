import { useState, useMemo, useCallback } from 'react';
import ForceGraph from '../components/CowordPage/ForceGraph';
import CowordSearch from '../components/CowordPage/CowordSearch';
import NodeDetail from '../components/CowordPage/NodeDetail';
import globalData from '../data/coword-global.json';
import neighborsData from '../data/coword-neighbors.json';

type GlobalData = {
  nodes: Array<{ id: string; count: number; domain: string; color: string }>;
  links: Array<{ source: string; target: string; weight: number }>;
};

type NeighborsData = Record<
  string,
  Array<{ keyword: string; weight: number; count: number; domain: string; color: string }>
>;

const global = globalData as GlobalData;
const neighbors = neighborsData as NeighborsData;
const allKeywords = Object.keys(neighbors);

export default function CowordPage() {
  const [centerKeyword, setCenterKeyword] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Build graph data based on center keyword
  const { nodes, links } = useMemo(() => {
    if (!centerKeyword) {
      // Global view: top 50
      return {
        nodes: global.nodes.slice(0, 50),
        links: global.links.filter((l) => {
          const top50Ids = new Set(global.nodes.slice(0, 50).map((n) => n.id));
          return top50Ids.has(l.source) && top50Ids.has(l.target);
        }),
      };
    }

    // Center keyword view
    const neighborList = neighbors[centerKeyword] || [];
    const centerNode = global.nodes.find((n) => n.id === centerKeyword);
    const centerCount = centerNode?.count || 0;
    const centerDomain = centerNode?.domain || '基础教育·教育学';
    const centerColor = centerNode?.color || '#d7bde2';

    const nodeMap = new Map<string, { id: string; count: number; domain: string; color: string }>();
    nodeMap.set(centerKeyword, {
      id: centerKeyword,
      count: centerCount,
      domain: centerDomain,
      color: centerColor,
    });

    for (const n of neighborList) {
      nodeMap.set(n.keyword, {
        id: n.keyword,
        count: n.count,
        domain: n.domain,
        color: n.color,
      });
    }

    const nodesArr = [...nodeMap.values()];
    const nodeIds = new Set(nodesArr.map((n) => n.id));

    // Links from center to neighbors
    const linksArr = neighborList
      .filter((n) => nodeIds.has(n.keyword))
      .map((n) => ({
        source: centerKeyword,
        target: n.keyword,
        weight: n.weight,
      }));

    // Also add cross-links between neighbors if they appear in global links
    for (const gl of global.links) {
      if (
        gl.source !== centerKeyword &&
        gl.target !== centerKeyword &&
        nodeIds.has(gl.source) &&
        nodeIds.has(gl.target)
      ) {
        linksArr.push(gl);
      }
    }

    return { nodes: nodesArr, links: linksArr };
  }, [centerKeyword]);

  const handleNodeClick = useCallback(
    (id: string) => {
      if (neighbors[id]) {
        setCenterKeyword(id);
      }
    },
    []
  );

  // Get detail info for hovered or center node
  const detailNode = hoveredNode || centerKeyword;
  const detailNodeInfo = detailNode
    ? nodes.find((n) => n.id === detailNode) || null
    : null;
  const detailNeighbors = detailNode
    ? (neighbors[detailNode] || []).slice(0, 15)
    : [];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <CowordSearch
        allKeywords={allKeywords}
        onSelect={handleNodeClick}
        centerKeyword={centerKeyword}
        onReset={() => setCenterKeyword(null)}
      />
      <div className="flex flex-1 overflow-hidden">
        {/* Force graph */}
        <div className="flex-[3] relative bg-[radial-gradient(ellipse_at_center,#0f0f2a_0%,#050510_100%)]">
          <ForceGraph
            nodes={nodes}
            links={links}
            onNodeClick={handleNodeClick}
            onNodeHover={setHoveredNode}
            hoveredNode={hoveredNode}
          />
        </div>
        {/* Detail panel */}
        <div className="flex-1 min-w-[280px] bg-[#0d0d20] border-l border-[#1a1a3a]">
          <NodeDetail
            node={detailNodeInfo}
            neighbors={detailNeighbors}
            onClickNeighbor={handleNodeClick}
          />
        </div>
      </div>
    </div>
  );
}
