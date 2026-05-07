import { useRef, useMemo, useCallback } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';

const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();

export default function Points() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const papers = useStore((s) => s.papers);
  const clusters = useStore((s) => s.clusters);
  const visibleClusterIds = useStore((s) => s.visibleClusterIds);
  const yearRange = useStore((s) => s.yearRange);
  const searchResults = useStore((s) => s.searchResults);
  const selectedPaperId = useStore((s) => s.selectedPaperId);
  const selectPaper = useStore((s) => s.selectPaper);
  const hoverPaper = useStore((s) => s.hoverPaper);

  const colorMap = useMemo(() => {
    const map = new Map<number, string>();
    clusters.forEach((c) => map.set(c.id, c.color));
    return map;
  }, [clusters]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < papers.length; i++) {
      const p = papers[i];
      const visible =
        visibleClusterIds.has(p.clusterId) &&
        p.year >= yearRange[0] &&
        p.year <= yearRange[1];
      const searched = searchResults === null || searchResults.has(p.id);
      const isSelected = p.id === selectedPaperId;

      tempObject.position.set(p.embedding[0], p.embedding[1], p.embedding[2]);
      const scale = isSelected ? 0.5 : visible && searched ? 0.25 : 0;
      tempObject.scale.setScalar(scale);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);

      const baseColor = colorMap.get(p.clusterId) || '#ffffff';
      const opacity = visible && searched ? 1 : 0;
      tempColor.set(baseColor).multiplyScalar(opacity);
      mesh.setColorAt(i, tempColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined) {
        selectPaper(papers[e.instanceId].id);
      }
    },
    [papers, selectPaper]
  );

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined) {
        hoverPaper(papers[e.instanceId].id);
        document.body.style.cursor = 'pointer';
      }
    },
    [papers, hoverPaper]
  );

  const handlePointerOut = useCallback(() => {
    hoverPaper(null);
    document.body.style.cursor = 'default';
  }, [hoverPaper]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, papers.length]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
