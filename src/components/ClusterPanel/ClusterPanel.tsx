import { useStore } from '../../store';
import ClusterItem from './ClusterItem';
import YearRangeSlider from './YearRangeSlider';

export default function ClusterPanel() {
  const clusters = useStore((s) => s.clusters);
  const toggleAllClusters = useStore((s) => s.toggleAllClusters);

  return (
    <div className="p-2 sm:p-3">
      <YearRangeSlider />
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-violet-900">聚类标签</span>
        <button
          type="button"
          onClick={toggleAllClusters}
          className="text-xs text-violet-600 hover:text-violet-800 transition-colors"
        >
          全选
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        {clusters.map((c) => (
          <ClusterItem key={c.id} cluster={c} />
        ))}
      </div>
    </div>
  );
}
