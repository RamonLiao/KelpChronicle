import { useCallback, useEffect, useRef, useState } from 'react';

type Rect = { x: number; y: number; w: number; h: number };
type Stored = Rect & { collapsed: boolean };

function loadAll(): Record<string, Stored> {
  if (typeof localStorage === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem('recall_panels') ?? '{}'); } catch { return {}; }
}
function saveOne(id: string, s: Stored) {
  if (typeof localStorage === 'undefined') return;
  const all = loadAll(); all[id] = s; localStorage.setItem('recall_panels', JSON.stringify(all));
}

export function Panel({ id, title, defaultRect, children }: {
  id: string; title: string; defaultRect: Rect; children: React.ReactNode;
}) {
  const init = loadAll()[id];
  const [rect, setRect] = useState<Rect>(init ? { x: init.x, y: init.y, w: init.w, h: init.h } : defaultRect);
  const [collapsed, setCollapsed] = useState<boolean>(init?.collapsed ?? false);
  const drag = useRef<{ mode: 'move' | 'resize'; px: number; py: number; r: Rect } | null>(null);

  useEffect(() => { saveOne(id, { ...rect, collapsed }); }, [id, rect, collapsed]);

  const onDown = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.preventDefault(); (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { mode, px: e.clientX, py: e.clientY, r: { ...rect } };
  };
  const onMove = useCallback((e: PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (d.mode === 'move') setRect({ ...d.r, x: d.r.x + dx, y: d.r.y + dy });
    else setRect({ ...d.r, w: Math.max(180, d.r.w + dx), h: Math.max(80, d.r.h + dy) });
  }, []);
  const onUp = useCallback(() => { drag.current = null; }, []);
  useEffect(() => {
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [onMove, onUp]);

  return (
    <div style={{
      position: 'absolute', left: rect.x, top: rect.y, width: rect.w,
      height: collapsed ? undefined : rect.h, background: 'var(--abyss2)',
      border: '1px solid var(--border)', borderRadius: 10, backdropFilter: 'blur(3px)',
      boxShadow: '0 8px 30px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div onPointerDown={onDown('move')} style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '7px 10px', cursor: 'move', borderBottom: '1px solid var(--border)', userSelect: 'none',
      }}>
        <span className="label">{title}</span>
        <button onClick={() => setCollapsed((c) => !c)} style={{
          background: 'none', border: 'none', color: 'var(--herb)', cursor: 'pointer', fontSize: 12,
        }}>{collapsed ? '▢' : '—'}</button>
      </div>
      {!collapsed && <div style={{ padding: 12, overflow: 'auto', flex: 1 }}>{children}</div>}
      {!collapsed && <div onPointerDown={onDown('resize')} style={{
        position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, cursor: 'nwse-resize',
        background: 'linear-gradient(135deg, transparent 50%, var(--border) 50%)',
      }} />}
    </div>
  );
}
