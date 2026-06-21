import { useEffect, useRef } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceX, forceY, type Simulation } from 'd3-force';
import type { KelpGraph, KelpNode } from '../lib/projectGraph.ts';

type SimNode = KelpNode & { x: number; y: number; vx?: number; vy?: number; fx?: number; fy?: number };
type SimLink = { source: SimNode; target: SimNode; kind: string };
type Particle = { x: number; y: number; r: number; speed: number; opacity: number };
type Camera = { scale: number; tx: number; ty: number };

const COL = { kelp: '#5C8F74', kelpLit: '#7FB894', cyan: '#4DE5F7', herb: '#9AB2A2', leaf: '#4E7E65', leafLit: '#7FB894' };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// easeOutBack ~= cubic-bezier(0.34, 1.56, 0.64, 1) — overshoot for budding pop.
function easeOutBack(t: number): number {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// a single kelp blade: two quadratics forming a pointed leaf, local "up" = grow direction.
function drawLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, screenAngle: number, len: number, w: number, fill: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(screenAngle + Math.PI / 2); // map local up-vector to the requested screen angle
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(w, -len * 0.55, 0, -len);
  ctx.quadraticCurveTo(-w, -len * 0.55, 0, 0);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

export function KelpCanvas({ graph, onNodeClick, pulseToRunId }: {
  graph: KelpGraph; onNodeClick: (n: KelpNode) => void; pulseToRunId?: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const hoverRef = useRef<SimNode | null>(null);
  const focusRef = useRef<SimNode | null>(null); // keyboard-focused node (arrow-key roving)
  const liveRef = useRef<HTMLDivElement>(null); // sr-only aria-live region for AT announcements
  const mouseRef = useRef<{ x: number; y: number }>({ x: -1e4, y: -1e4 }); // screen-space cursor
  const pulseRef = useRef<{ runId: number; start: number } | null>(null);
  // camera persists across graph rebuilds so panning/zoom isn't reset when /memory refetches.
  const camRef = useRef<Camera>({ scale: 1, tx: 0, ty: 0 });

  // sync pulse trigger without rebuilding the simulation
  useEffect(() => {
    if (pulseToRunId == null) { pulseRef.current = null; return; }
    pulseRef.current = { runId: pulseToRunId, start: performance.now() };
  }, [pulseToRunId]);

  // (re)build simulation when graph identity changes
  useEffect(() => {
    const canvas = canvasRef.current!; const dpr = window.devicePixelRatio || 1;
    const cam = camRef.current;
    focusRef.current = null; // stale node refs don't survive a graph rebuild

    const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n, x: innerWidth / 2 + Math.random() * 40, y: innerHeight / 2 }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links: SimLink[] = graph.edges
      .map((e) => ({ source: byId.get(e.source)!, target: byId.get(e.target)!, kind: e.kind }))
      .filter((l) => l.source && l.target);

    const seabedY = () => innerHeight - 80;
    // anchor run trunks along the seabed, spread horizontally so multiple runs form a forest row
    // instead of stacking dead-center (the old single-column "pinned to the middle" look).
    const anchorRuns = () => {
      const runs = nodes.filter((n) => n.kind === 'run').sort((a, b) => a.runId - b.runId);
      const gap = 170;
      runs.forEach((n, i) => {
        n.fx = innerWidth / 2 + (i - (runs.length - 1) / 2) * gap;
        n.fy = seabedY() - n.runId * 6;
      });
    };
    anchorRuns();

    const sim = forceSimulation<SimNode, SimLink>(nodes)
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(70).strength(0.6))
      .force('charge', forceManyBody().strength(-120))
      .force('x', forceX(innerWidth / 2).strength(0.015))
      .force('y', forceY((d: any) => (d.kind === 'finding' ? innerHeight * 0.35 : seabedY())).strength(0.05));
    sim.alphaTarget(0.02).restart(); // keep a faint jitter so the forest never fully freezes
    simRef.current = sim;

    // resize: re-fit canvas bitmap AND re-anchor the forest to the new viewport
    const resize = () => {
      canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
      sim.force('x', forceX(innerWidth / 2).strength(0.015));
      sim.force('y', forceY((d: any) => (d.kind === 'finding' ? innerHeight * 0.35 : seabedY())).strength(0.05));
      anchorRuns();
      sim.alpha(0.3).restart();
    };
    resize(); window.addEventListener('resize', resize);

    // marine snow seeded once per (re)build — drawn in SCREEN space so it doesn't zoom with the camera
    const particles: Particle[] = Array.from({ length: 40 }, () => ({
      x: Math.random() * innerWidth, y: Math.random() * innerHeight,
      r: 0.6 + Math.random() * 1.6, speed: 0.15 + Math.random() * 0.5,
      opacity: 0.05 + Math.random() * 0.05,
    }));

    // record first-seen time of fresh nodes for the budding pop
    const budStart = new Map<string, number>();
    const t0 = performance.now();
    for (const n of nodes) if (n.fresh) budStart.set(n.id, t0);

    const ctx = canvas.getContext('2d')!;
    let raf = 0;

    // screen <-> world helpers (world = simulation coords; screen = CSS px)
    const toWorld = (sx: number, sy: number) => ({ x: (sx - cam.tx) / cam.scale, y: (sy - cam.ty) / cam.scale });

    const render = (now: number) => {
      // --- screen-space layer: clear + marine snow (unaffected by camera) ---
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of particles) {
        p.y -= p.speed; if (p.y < -2) { p.y = innerHeight + 2; p.x = Math.random() * innerWidth; }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(154,178,162,${p.opacity})`; ctx.fill();
      }

      // --- world-space layer: kelp, under the camera transform ---
      ctx.setTransform(dpr * cam.scale, 0, 0, dpr * cam.scale, dpr * cam.tx, dpr * cam.ty);

      const mouse = toWorld(mouseRef.current.x, mouseRef.current.y);
      const pulse = pulseRef.current;
      const PULSE_MS = 1100;

      for (const l of links) {
        let mx = (l.source.x + l.target.x) / 2;
        let my = (l.source.y + l.target.y) / 2 - 24;
        // fluid current sway — shallower (finding) nodes lag root phase
        const depthPhase = (l.target.y / innerHeight) * Math.PI;
        mx += Math.sin(now * 0.0012 + depthPhase) * 10;
        // mouse sway field (control point only — nodes stay put so they remain clickable)
        const dist = Math.hypot(mx - mouse.x, my - mouse.y);
        if (dist < 120) mx += (1 - dist / 120) * 0.15 * 60 * Math.sin(now * 0.004);

        // stem
        ctx.lineWidth = l.kind === 'lineage' ? 1.2 : 1.8;
        ctx.beginPath(); ctx.moveTo(l.source.x, l.source.y);
        ctx.quadraticCurveTo(mx, my, l.target.x, l.target.y);
        ctx.strokeStyle = l.kind === 'lineage' ? 'rgba(127,184,148,0.35)' : 'rgba(92,143,116,0.55)';
        ctx.stroke();

        // procedural fronds along membership stems — "data IS the kelp" (spec §3)
        if (l.kind === 'membership') {
          const fresh = l.target.fresh;
          const fill = fresh ? 'rgba(127,184,148,0.85)' : 'rgba(78,126,101,0.7)';
          const SAMPLES = [0.32, 0.5, 0.66, 0.8, 0.92];
          for (let i = 0; i < SAMPLES.length; i++) {
            const t = SAMPLES[i], it = 1 - t;
            // quadratic bezier point + tangent
            const bx = it * it * l.source.x + 2 * it * t * mx + t * t * l.target.x;
            const by = it * it * l.source.y + 2 * it * t * my + t * t * l.target.y;
            const tgx = 2 * it * (mx - l.source.x) + 2 * t * (l.target.x - mx);
            const tgy = 2 * it * (my - l.source.y) + 2 * t * (l.target.y - my);
            const tang = Math.atan2(tgy, tgx);
            const side = i % 2 === 0 ? 1 : -1;
            const sway = Math.sin(now * 0.0015 + i + depthPhase) * 0.12;
            const len = 16 - i * 1.6; // shorter toward the tip
            drawLeaf(ctx, bx, by, tang + side * 0.7 + sway, len, 4.5, fill);
          }
        }

        // retrieval pulse: glowing dot travels run->finding stems of the pulsed run
        if (pulse && l.kind === 'membership' && l.source.runId === pulse.runId) {
          const t = (now - pulse.start) / PULSE_MS;
          if (t >= 0 && t <= 1) {
            const it = 1 - t;
            const bx = it * it * l.source.x + 2 * it * t * mx + t * t * l.target.x;
            const by = it * it * l.source.y + 2 * it * t * my + t * t * l.target.y;
            ctx.beginPath(); ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
            ctx.shadowBlur = 12; ctx.shadowColor = COL.cyan; ctx.fillStyle = COL.cyan;
            ctx.fill(); ctx.shadowBlur = 0;
          }
        }
      }

      // nodes
      for (const n of nodes) {
        const base = n.kind === 'run' ? 7 : 5;
        let r = n === hoverRef.current ? base + 2 : base;
        const bs = budStart.get(n.id);
        if (bs !== undefined) {
          const t = (now - bs) / 600;
          if (t < 1) r *= Math.max(0, easeOutBack(Math.max(0, t)));
        }
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        if (n.fresh) { ctx.shadowBlur = 10; ctx.shadowColor = COL.cyan; ctx.fillStyle = COL.cyan; }
        else { ctx.shadowBlur = 0; ctx.fillStyle = n.kind === 'run' ? COL.kelpLit : COL.kelp; }
        ctx.fill(); ctx.shadowBlur = 0;
      }

      // keyboard-focus ring (world space) — visible focus indicator for arrow-key navigation
      const foc = focusRef.current;
      if (foc) {
        ctx.beginPath(); ctx.arc(foc.x, foc.y, (foc.kind === 'run' ? 7 : 5) + 6, 0, Math.PI * 2);
        ctx.strokeStyle = COL.cyan; ctx.lineWidth = 2 / cam.scale; ctx.setLineDash([4 / cam.scale, 3 / cam.scale]);
        ctx.stroke(); ctx.setLineDash([]);
      }

      // --- screen-space overlay: hover tooltip ---
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const hov = hoverRef.current;
      if (hov) {
        const sx = hov.x * cam.scale + cam.tx;
        const sy = hov.y * cam.scale + cam.ty;
        const title = hov.label || (hov.kind === 'run' ? `Run #${hov.runId}` : 'finding');
        const sub = hov.kind === 'run'
          ? (hov.blobId ? `blob ${hov.blobId.slice(0, 8)}…` : 'pending index')
          : `Run #${hov.runId}`;
        ctx.font = '12px "Spline Sans Mono", ui-monospace, monospace';
        const tw = Math.max(ctx.measureText(title).width, ctx.measureText(sub).width);
        const pad = 8, boxW = tw + pad * 2, boxH = 36;
        let bx = sx + 12, by = sy - boxH - 12;
        if (bx + boxW > innerWidth) bx = sx - boxW - 12;
        if (by < 0) by = sy + 12;
        ctx.fillStyle = 'rgba(7,30,34,0.92)';
        ctx.strokeStyle = 'rgba(127,184,148,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === 'function') (ctx as any).roundRect(bx, by, boxW, boxH, 6);
        else ctx.rect(bx, by, boxW, boxH); // fallback for engines without roundRect
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#E6F0EA';
        ctx.fillText(title.length > 40 ? title.slice(0, 39) + '…' : title, bx + pad, by + 15);
        ctx.fillStyle = COL.herb;
        ctx.fillText(sub, bx + pad, by + 29);
      }

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    // hit-test in world space (reproject the screen cursor through the camera)
    const pick = (sx: number, sy: number) => {
      const w = toWorld(sx, sy);
      const r = 12 / cam.scale; // constant ~12px screen-space hit radius regardless of zoom
      return nodes.find((n) => Math.hypot(n.x - w.x, n.y - w.y) < r) ?? null;
    };

    // pointer: background drag = pan; node click (no drag) = inspect; wheel = zoom-to-cursor.
    // pan tracks delta from the last move (not e.movementX, which is flaky/0 on synthetic events).
    let down: { x: number; y: number; lastX: number; lastY: number; moved: boolean } | null = null;
    const onDown = (e: MouseEvent) => {
      down = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false };
      canvas.style.cursor = 'grabbing';
    };
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      if (down) {
        cam.tx += e.clientX - down.lastX; cam.ty += e.clientY - down.lastY; // pan in screen px
        down.lastX = e.clientX; down.lastY = e.clientY;
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 3) down.moved = true;
      } else {
        hoverRef.current = pick(e.clientX, e.clientY);
        canvas.style.cursor = hoverRef.current ? 'pointer' : 'grab';
      }
    };
    const onUp = (e: MouseEvent) => {
      if (down && !down.moved) { const n = pick(e.clientX, e.clientY); if (n) onNodeClick(n); }
      down = null;
      canvas.style.cursor = pick(e.clientX, e.clientY) ? 'pointer' : 'grab';
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0012);
      const ns = clamp(cam.scale * factor, 0.35, 4);
      // keep the world point under the cursor fixed while zooming
      const w = toWorld(e.clientX, e.clientY);
      cam.scale = ns;
      cam.tx = e.clientX - w.x * ns;
      cam.ty = e.clientY - w.y * ns;
    };
    const onLeave = () => { hoverRef.current = null; down = null; };

    // keyboard navigation: arrow keys rove through nodes, Enter/Space inspects, Esc clears.
    // Tab is left untouched so page tab-order still works. Roving order: runs first, then findings.
    const kbOrder = nodes.slice().sort((a, b) =>
      a.kind !== b.kind ? (a.kind === 'run' ? -1 : 1) : a.runId - b.runId || a.id.localeCompare(b.id));
    let focusIdx = -1;
    const focusAt = (i: number) => {
      focusIdx = ((i % kbOrder.length) + kbOrder.length) % kbOrder.length; // safe wrap for any i
      const n = kbOrder[focusIdx]; focusRef.current = n;
      cam.tx = innerWidth / 2 - n.x * cam.scale; cam.ty = innerHeight / 2 - n.y * cam.scale; // center it
      const desc = n.kind === 'run' ? `Run ${n.runId}` : `Finding: ${n.label}`;
      if (liveRef.current) liveRef.current.textContent = `${desc}. ${focusIdx + 1} of ${kbOrder.length}. Press Enter to inspect.`;
    };
    const onKey = (e: KeyboardEvent) => {
      if (!kbOrder.length) return;
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': e.preventDefault(); focusAt(focusIdx + 1); break;
        case 'ArrowLeft': case 'ArrowUp': e.preventDefault(); focusAt(focusIdx - 1); break;
        case 'Enter': case ' ': if (focusRef.current) { e.preventDefault(); onNodeClick(focusRef.current); } break;
        case 'Escape': focusIdx = -1; focusRef.current = null; if (liveRef.current) liveRef.current.textContent = ''; break;
      }
    };

    canvas.style.cursor = 'grab';
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(raf); sim.stop(); window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKey);
    };
  }, [graph, onNodeClick]);

  // canvas is a replaced element: `inset:0` alone won't size it — `width:auto` falls back to the
  // intrinsic bitmap size (innerWidth*dpr), so on HiDPI screens it renders at 2× and the forest
  // draws off-viewport. Pin the CSS box to the viewport; the bitmap stays dpr-scaled for sharpness.
  // a11y: canvas is pointer-driven, so it's also made focusable with arrow-key node roving + an
  // aria-live region announcing the focused node. Tab reaches it; arrows move; Enter inspects.
  return (
    <>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-label="Kelp forest memory graph. Drag to pan, scroll to zoom, click a node to inspect. Use arrow keys to move between nodes and Enter to inspect."
        style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', display: 'block' }}
      />
      <div
        ref={liveRef}
        aria-live="polite"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}
      />
    </>
  );
}
