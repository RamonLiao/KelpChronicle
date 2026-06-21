import { useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { Panel } from './Panel.tsx';
import { api, ApiError, type RunResult } from '../../lib/api.ts';

const TOPIC_MAX = 200; // mirrors backend

export function RunConsole({ topic, setTopic, onResult }: {
  topic: string; setTopic: (t: string) => void; onResult: (r: RunResult) => void;
}) {
  const account = useCurrentAccount();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<RunResult | null>(null);

  const tooLong = topic.length > TOPIC_MAX;
  const canRun = !!account && topic.trim().length > 0 && !tooLong && !busy;

  const run = async () => {
    if (!account) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.run(topic.trim(), account.address);
      setLast(r); onResult(r);
    } catch (e) {
      const ae = e as ApiError;
      setErr(ae.status === 409 ? 'A run is already in progress.' : 'Agent service error.');
    } finally { setBusy(false); }
  };

  return (
    <Panel id="run" title="New Run" defaultRect={{ x: 24, y: 64, w: 280, h: 200 }}>
      <input value={topic} maxLength={TOPIC_MAX + 1} onChange={(e) => setTopic(e.target.value)}
        placeholder="Research topic…" style={inputStyle} />
      <div className="label" style={{ marginTop: 8 }}>Agent (wallet)</div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--herb)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {account ? account.address : 'connect a wallet to run'}
      </div>
      <button disabled={!canRun} onClick={run} style={{ ...runBtn, opacity: canRun ? 1 : 0.4 }}>
        {busy ? 'Running…' : '▷ Run Agent'}
      </button>
      {tooLong && <div style={errStyle}>Topic too long (max {TOPIC_MAX}).</div>}
      {err && <div style={errStyle}>{err}</div>}
      {last && <div className="mono" style={{ fontSize: 11, marginTop: 8, color: 'var(--kelp-lit)' }}>
        +{last.freshCount} fresh · {last.knownHit} known
      </div>}
    </Panel>
  );
}
const inputStyle: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 12 };
const runBtn: React.CSSProperties = { width: '100%', marginTop: 10, background: 'var(--kelp)', color: '#031', border: 'none', borderRadius: 6, padding: '7px', fontWeight: 600, cursor: 'pointer' };
const errStyle: React.CSSProperties = { color: 'var(--amber)', fontSize: 11, marginTop: 6, fontFamily: 'var(--font-mono)' };
