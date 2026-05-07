import { useStore } from '../../store';
import type { Cluster } from '../../types';

interface Props {
  cluster: Cluster;
}

export default function ClusterItem({ cluster }: Props) {
  const visible = useStore((s) => s.visibleClusterIds.has(cluster.id));
  const toggleCluster = useStore((s) => s.toggleCluster);

  return (
    <button
      type="button"
      onClick={() => toggleCluster(cluster.id)}
      className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-left text-xs transition-colors ${
        visible ? 'bg-violet-100 text-violet-950' : 'opacity-45 text-violet-700'
      } hover:bg-violet-50`}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: cluster.color }}
      />
      <span className="flex-1 truncate">{cluster.name}</span>
      <span className="text-violet-500 tabular-nums">
        {cluster.count.toLocaleString()}
      </span>
    </button>
  );
}
