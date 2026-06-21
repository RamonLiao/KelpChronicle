import { Panel } from './Panel.tsx';
import type { KelpNode } from '../../lib/projectGraph.ts';

const EXPLORER = (digest: string) => `https://testnet.suivision.xyz/txblock/${digest}`;

export function Inspector({ node }: { node: KelpNode | null }) {
  return (
    <Panel id="inspector" title={node ? (node.kind === 'run' ? `Run #${node.runId}` : 'Finding') : 'Inspector'}
      defaultRect={{ x: typeof window !== 'undefined' ? window.innerWidth - 320 : 600, y: 64, w: 296, h: 280 }}>
      {!node && <div className="mono" style={{ fontSize: 11, color: 'var(--herb)' }}>Click a kelp node.</div>}
      {node?.kind === 'finding' && (
        <div>
          <div style={{ fontSize: 16, marginBottom: 6 }}>{node.label}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--herb)', lineHeight: 1.5 }}>{node.summary}</div>
          {node.sourceUrl && <a href={node.sourceUrl} target="_blank" rel="noreferrer"
            className="mono" style={{ fontSize: 11, color: 'var(--cyan)', display: 'block', marginTop: 8 }}>source ↗</a>}
        </div>
      )}
      {node?.kind === 'run' && (
        <div className="mono" style={{ fontSize: 11, lineHeight: 1.8 }}>
          <div><span style={{ color: 'var(--herb)' }}>runId  </span>{node.runId}</div>
          <div><span style={{ color: 'var(--herb)' }}>blobId </span>{node.blobId ?? '—'}</div>
          <div><span style={{ color: 'var(--herb)' }}>digest </span>{node.digest ? `${node.digest.slice(0, 10)}…` : '—'}</div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {node.blobId
              ? <span style={badgeAmber}>✦ Stored on Walrus</span>
              : <span style={badgeMatte}>○ Anchored</span>}
            {node.digest
              ? <a href={EXPLORER(node.digest)} target="_blank" rel="noreferrer" style={badgeCyan}>✓ Verified on-chain ↗</a>
              : <span style={badgeMatte}>○ Verifiable (pending index)</span>}
          </div>
        </div>
      )}
    </Panel>
  );
}
const badge: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, padding: '6px 10px', borderRadius: 7, width: 'fit-content', textDecoration: 'none' };
const badgeAmber: React.CSSProperties = { ...badge, color: 'var(--amber)', border: '1px solid rgba(235,179,82,0.4)', background: 'rgba(235,179,82,0.07)', boxShadow: '0 0 14px -4px rgba(235,179,82,0.5)' };
const badgeCyan: React.CSSProperties = { ...badge, color: 'var(--cyan)', border: '1px solid rgba(77,229,247,0.45)', background: 'rgba(77,229,247,0.06)', boxShadow: '0 0 16px -3px rgba(77,229,247,0.6)' };
const badgeMatte: React.CSSProperties = { ...badge, color: 'var(--herb)', border: '1px solid var(--border)', background: 'transparent' };
