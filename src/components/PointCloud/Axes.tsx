import { useMemo } from 'react';
import * as THREE from 'three';

const AXIS_LENGTH = 35;
const AXIS_OPACITY = 0.3;

function AxisLine({ start, end, color }: { start: [number, number, number]; end: [number, number, number]; color: string }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...start, ...end], 3));
    return g;
  }, [start, end]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={AXIS_OPACITY} />
    </lineSegments>
  );
}

function GridLines() {
  const geometry = useMemo(() => {
    const points: number[] = [];
    const step = 10;
    const half = AXIS_LENGTH;

    // XZ plane grid lines
    for (let i = -half; i <= half; i += step) {
      // lines along X
      points.push(-half, 0, i, half, 0, i);
      // lines along Z
      points.push(i, 0, -half, i, 0, half);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return g;
  }, []);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#ffffff" transparent opacity={0.04} />
    </lineSegments>
  );
}

export default function Axes() {
  return (
    <group>
      <GridLines />
      <AxisLine start={[-AXIS_LENGTH, 0, 0]} end={[AXIS_LENGTH, 0, 0]} color="#ff4444" />
      <AxisLine start={[0, -AXIS_LENGTH, 0]} end={[0, AXIS_LENGTH, 0]} color="#44ff44" />
      <AxisLine start={[0, 0, -AXIS_LENGTH]} end={[0, 0, AXIS_LENGTH]} color="#4444ff" />
    </group>
  );
}
