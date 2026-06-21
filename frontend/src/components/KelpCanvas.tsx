import { useEffect, useRef } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceX, forceY, type Simulation } from 'd3-force';
import type { KelpGraph, KelpNode } from '../lib/projectGraph.ts';

type SimNode = KelpNode & { x: number; y: number; vx?: number; vy?: number; fy?: number };
type SimLink = { source: SimNode; target: SimNode; kind: string };
type Particle = { x: number; y: number; r: number; speed: number; opacity: number };

const COL = { kelp: '#5C8F74', kelpLit: '#7FB894', cyan: '#4DE5F7', herb: '#9AB2A2' };

// easeOutBack ~= cubic-bezier(0.34, 1.56, 0.64, 1) — overshoot for budding pop.
function easeOutBack(t: number): number {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function KelpCanvas({ graph, onNodeClick, pulseToRunId }: {
  graph: KelpGraph; onNodeClick: (n: KelpNode) => void; pulseToRunId?: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const hoverRef = useRef<SimNode | null>(null);
  const mouseRef = useRef<{ x: number; y: number }>({ x: -1e4, y: -1e4 });
  const pulseRef = useRef<{ runId: number; start: number } | null>(null);

  // sync pulse trigger without rebuilding the simulation
  useEffect(() => {
    if (pulseToRunId == null) { pulseRef.current = null; return; }
    pulseRef.current = { runId: pulseToRunId, start: performance.now() };
  }, [pulseToRunId]);

  // (re)build simulation when graph identity changes
  useEffect(() => {
    const canvas = canvasRef.current!; const dpr = window.devicePixelRatio || 1;

    const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n, x: innerWidth / 2 + Math.random() * 40, y: innerHeight / 2 }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links: SimLink[] = graph.edges
      .map((e) => ({ source: byId.get(e.source)!, target: byId.get(e.target)!, kind: e.kind }))
      .filter((l) => l.source && l.target);

    const seabedY = () => innerHeight - 80;
    const anchorRuns = () => nodes.filter((n) => n.kind === 'run').forEach((n) => { n.fy = seabedY() - n.runId * 6; });
    anchorRuns(); // seabed anchoring

    const sim = forceSimulation<SimNode, SimLink>(nodes)
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(70).strength(0.6))
      .force('charge', forceManyBody().strength(-120))
      .force('x', forceX(innerWidth / 2).strength(0.03))
      .force('y', forceY((d: any) => (d.kind === 'finding' ? innerHeight * 0.35 : seabedY())).strength(0.05));
    sim.alphaTarget(0.02).restart(); // keep a faint jitter so the forest never fully freezes
    simRef.current = sim;

    // resize: re-fit canvas bitmap AND re-anchor the forest to the new viewport
    // (otherwise the layout stays pinned to the old dimensions and drifts off-screen).
    const resize = () => {
      canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
      sim.force('x', forceX(innerWidth / 2).strength(0.03));
      sim.force('y', forceY((d: any) => (d.kind === 'finding' ? innerHeight * 0.35 : seabedY())).strength(0.05));
      anchorRuns();
      sim.alpha(0.3).restart();
    };
    resize(); window.addEventListener('resize', resize);

    // marine snow seeded once per (re)build
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

    const render = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);

      // marine snow — drawn first, behind the kelp
      for (const p of particles) {
        p.y -= p.speed; if (p.y < -2) { p.y = innerHeight + 2; p.x = Math.random() * innerWidth; }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(154,178,162,${p.opacity})`; ctx.fill();
      }

      const mouse = mouseRef.current;
      const pulse = pulseRef.current;
      const PULSE_MS = 1100;

      // edges = curved tendrils with current sway + mouse-field bend
      ctx.lineWidth = 1.4;
      for (const l of links) {
        let mx = (l.source.x + l.target.x) / 2;
        let my = (l.source.y + l.target.y) / 2 - 24;
        // fluid current sway — shallower (finding) nodes lag root phase
        const depthPhase = (l.target.y / innerHeight) * Math.PI;
        mx += Math.sin(now * 0.0012 + depthPhase) * 10;
        // mouse sway field (control point only — nodes stay put so they remain clickable)
        const dist = Math.hypot(mx - mouse.x, my - mouse.y);
        if (dist < 120) mx += (1 - dist / 120) * 0.15 * 60 * Math.sin(now * 0.004);

        ctx.beginPath(); ctx.moveTo(l.source.x, l.source.y);
        ctx.quadraticCurveTo(mx, my, l.target.x, l.target.y);
        ctx.strokeStyle = l.kind === 'lineage' ? 'rgba(127,184,148,0.35)' : 'rgba(92,143,116,0.45)';
        ctx.stroke();

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

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    const pick = (mx: number, my: number) =>
      nodes.find((n) => Math.hypot(n.x - mx, n.y - my) < 10) ?? null;
    const onClick = (e: MouseEvent) => { const n = pick(e.clientX, e.clientY); if (n) onNodeClick(n); };
    const onHover = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      hoverRef.current = pick(e.clientX, e.clientY);
    };
    canvas.addEventListener('click', onClick); canvas.addEventListener('mousemove', onHover);

    return () => {
      cancelAnimationFrame(raf); sim.stop(); window.removeEventListener('resize', resize);
      canvas.removeEventListener('click', onClick); canvas.removeEventListener('mousemove', onHover);
    };
  }, [graph, onNodeClick]);

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, display: 'block' }} />;
}
