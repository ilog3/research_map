import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useStore } from '../../store';
import Points from './Points';
import Tooltip from './Tooltip';
import Axes from './Axes';
import TimePlayer from './TimePlayer';

export default function PointCloud() {
  const viewMode = useStore((s) => s.viewMode);
  const selectPaper = useStore((s) => s.selectPaper);
  const papers = useStore((s) => s.papers);
  const visibleClusterIds = useStore((s) => s.visibleClusterIds);
  const yearRange = useStore((s) => s.yearRange);
  const searchResults = useStore((s) => s.searchResults);

  const visibleCount = papers.filter(
    (p) =>
      visibleClusterIds.has(p.clusterId) &&
      p.year >= yearRange[0] &&
      p.year <= yearRange[1] &&
      (searchResults === null || searchResults.has(p.id))
  ).length;

  return (
    <div className="absolute inset-0 bg-gradient-to-b from-violet-100/60 to-[#f5f0ff]">
      <Canvas
        className="h-full w-full block touch-none"
        camera={{ position: [40, 30, 100], fov: 50 }}
        onPointerMissed={() => selectPaper(null)}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={1} />
        <Points />
        <Axes />
        <OrbitControls
          enableDamping
          dampingFactor={0.1}
          autoRotate={viewMode === '3d'}
          autoRotateSpeed={0.5}
          maxDistance={200}
          minDistance={10}
          enableRotate={viewMode === '3d'}
        />
      </Canvas>
      <Tooltip />
      <TimePlayer />
      <div className="absolute bottom-3 left-3 text-[10px] text-violet-700 bg-white/70 px-2 py-0.5 rounded-md border border-violet-200/80">
        {viewMode.toUpperCase()} · {visibleCount.toLocaleString()} / {papers.length.toLocaleString()} 篇
      </div>
    </div>
  );
}
