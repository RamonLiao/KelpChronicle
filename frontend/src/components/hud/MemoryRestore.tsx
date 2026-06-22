import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Panel } from './Panel.tsx';
import { api, type Artifact } from '../../lib/api.ts';
import { writeTopics } from '../../lib/topics.ts';

export function MemoryRestore({ artifacts, topics, onClearLocal, onRestored }: {
  artifacts: Artifact[]; topics: string[]; onClearLocal: () => void; onRestored: () => void;
}) {
  const [qr, setQr] = useState<string>('');
  const [busy, setBusy] = useState(false);
  // encode the FULL watchlist into the QR target so the scanned device opens the same forest.
  // set('topic', ...) would collapse the repeated ?topic= params down to one — dropping topics.
  useEffect(() => {
    const u = new URL(window.location.href);
    writeTopics(u, topics);
    QRCode.toDataURL(u.toString(), { margin: 1, width: 96 }).then(setQr).catch(() => {});
  }, [topics]);

  const restore = async () => {
    setBusy(true);
    try { await api.restore(); onRestored(); } finally { setBusy(false); }
  };

  return (
    <Panel id="memory" title="Memory · Restore"
      defaultRect={{ x: 24, y: typeof window !== 'undefined' ? window.innerHeight - 300 : 400, w: 280, h: 260 }}>
      <div className="label">Recalled</div>
      <div style={{ maxHeight: 90, overflow: 'auto', margin: '6px 0' }}>
        {artifacts.length === 0 && <div className="mono" style={{ fontSize: 11, color: 'var(--herb)' }}>none</div>}
        {[...artifacts].sort((a, b) => b.runId - a.runId).map((a) => (
          <div key={`${a.runId}-${a.createdAtMs}`} className="mono" style={{ fontSize: 11, padding: '3px 0', borderLeft: '2px solid var(--kelp)', paddingLeft: 6, marginBottom: 3 }}>
            Run #{a.runId} · {a.findings.length} findings
          </div>
        ))}
      </div>
      <button onClick={onClearLocal} style={btnGhost}>⌫ Clear local view</button>
      <button onClick={restore} disabled={busy} style={btnCyan}>{busy ? 'Restoring…' : '⟳ Restore from Walrus'}</button>
      {qr && <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
        <img src={qr} width={64} height={64} alt="open on phone" style={{ borderRadius: 4 }} />
        <span className="mono" style={{ fontSize: 10, color: 'var(--herb)' }}>scan to open same memory on another device</span>
      </div>}
    </Panel>
  );
}
const btn: React.CSSProperties = { width: '100%', marginTop: 6, borderRadius: 6, padding: '7px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11 };
const btnGhost: React.CSSProperties = { ...btn, background: 'transparent', border: '1px solid var(--border)', color: 'var(--herb)' };
const btnCyan: React.CSSProperties = { ...btn, background: 'rgba(77,229,247,0.12)', border: '1px solid var(--cyan)', color: 'var(--cyan)' };
