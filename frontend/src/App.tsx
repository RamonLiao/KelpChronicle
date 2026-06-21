import { useMemo, useState } from 'react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { KelpCanvas } from './components/KelpCanvas.tsx';
import { RunConsole } from './components/hud/RunConsole.tsx';
import { Inspector } from './components/hud/Inspector.tsx';
import { MemoryRestore } from './components/hud/MemoryRestore.tsx';
import { useMemory } from './hooks/useMemory.ts';
import { projectGraph, type KelpNode } from './lib/projectGraph.ts';
import type { RunResult } from './lib/api.ts';

const DEFAULT_TOPIC = 'Walrus ecosystem';

export default function App() {
  const [topic, setTopic] = useState(DEFAULT_TOPIC);
  const [live, setLive] = useState<RunResult | null>(null);
  const [selected, setSelected] = useState<KelpNode | null>(null);
  const [clearedLocally, setClearedLocally] = useState(false);

  const memory = useMemory(topic);
  const artifacts = memory.data ?? [];

  const graph = useMemo(
    () => (clearedLocally ? { nodes: [], edges: [] } : projectGraph(artifacts, live)),
    [artifacts, live, clearedLocally],
  );

  return (
    <div>
      <KelpCanvas graph={graph} onNodeClick={setSelected} pulseToRunId={live?.artifact.runId ?? null} />
      <header style={{ position: 'fixed', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', pointerEvents: 'none' }}>
        <span style={{ fontSize: 22 }}>Kelp<em style={{ color: 'var(--kelp-lit)' }}>Chronicle</em></span>
        <div style={{ pointerEvents: 'auto' }}><ConnectButton /></div>
      </header>

      {graph.nodes.length === 0 && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontStyle: 'italic', color: 'var(--herb)' }}>
            {memory.isError ? 'Memory service unavailable.' : 'No anchored memory yet — run the agent.'}
          </span>
        </div>
      )}

      <RunConsole topic={topic} setTopic={setTopic} onResult={(r) => { setClearedLocally(false); setLive(r); memory.refetch(); }} />
      <Inspector node={selected} />
      <MemoryRestore artifacts={artifacts} onClearLocal={() => { setClearedLocally(true); setSelected(null); }}
        onRestored={() => { setClearedLocally(false); memory.refetch(); }} />
    </div>
  );
}
