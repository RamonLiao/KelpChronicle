import { useEffect, useMemo, useState } from 'react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { useQuery } from '@tanstack/react-query';
import { KelpCanvas } from './components/KelpCanvas.tsx';
import { RunConsole } from './components/hud/RunConsole.tsx';
import { Inspector } from './components/hud/Inspector.tsx';
import { MemoryRestore } from './components/hud/MemoryRestore.tsx';
import { useMemory } from './hooks/useMemory.ts';
import { projectGraph, type KelpNode } from './lib/projectGraph.ts';
import { api, type RunResult } from './lib/api.ts';

const DEFAULT_TOPIC = 'Walrus ecosystem';

// topic lives in the URL (?topic=) so the QR / shared link opens the SAME memory on another
// device — the cross-device persistence promise breaks if topic stays only in React state.
function initialTopic() {
  if (typeof window === 'undefined') return DEFAULT_TOPIC;
  return new URLSearchParams(window.location.search).get('topic') || DEFAULT_TOPIC;
}

export default function App() {
  const [topic, setTopic] = useState(initialTopic);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const u = new URL(window.location.href);
    u.searchParams.set('topic', topic);
    window.history.replaceState(null, '', u);
  }, [topic]);
  const [live, setLive] = useState<RunResult | null>(null);
  const [selected, setSelected] = useState<KelpNode | null>(null);
  const [clearedLocally, setClearedLocally] = useState(false);

  const account = useCurrentAccount();
  const memory = useMemory(topic);
  const artifacts = memory.data ?? [];

  // namespace is shared across all of an agent's artifacts; take it from any recalled one.
  const namespace = artifacts[0]?.namespace ?? '';
  const attestations = useQuery({
    queryKey: ['attestations', account?.address, namespace],
    queryFn: () => api.getAttestations(account!.address, namespace),
    enabled: !!account && artifacts.length > 0,
  });

  const graph = useMemo(
    () => (clearedLocally ? { nodes: [], edges: [] } : projectGraph(artifacts, live, attestations.data ?? {})),
    [artifacts, live, clearedLocally, attestations.data],
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

      {/* non-destructive error notice when a refetch fails but stale nodes remain on screen (spec §4) */}
      {memory.isError && graph.nodes.length > 0 && (
        <div className="mono" style={{
          position: 'fixed', top: 56, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
          fontSize: 11, color: 'var(--amber)', background: 'rgba(235,179,82,0.07)',
          border: '1px solid rgba(235,179,82,0.4)', borderRadius: 7, padding: '5px 12px', pointerEvents: 'none',
        }}>
          ⚠ Memory service unavailable — showing last known forest.
        </div>
      )}

      <RunConsole topic={topic} setTopic={setTopic} onResult={(r) => { setClearedLocally(false); setLive(r); memory.refetch(); }} />
      <Inspector node={selected} />
      <MemoryRestore artifacts={artifacts} topic={topic} onClearLocal={() => { setClearedLocally(true); setSelected(null); }}
        onRestored={() => { setClearedLocally(false); memory.refetch(); }} />
    </div>
  );
}
