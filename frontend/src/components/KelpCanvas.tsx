import { useEffect, useRef } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceX, forceY, type Simulation } from 'd3-force';
import type { KelpGraph, KelpNode } from '../lib/projectGraph.ts';

type SimNode = KelpNode & { x: number; y: number; vx?: number; vy?: number; fy?: number };
type SimLink = { source: SimNode; target: SimNode; kind: string };

const COL = { kelp: '#5C8F74', kelpLit: '#7FB894', cyan: '#4DE5F7', herb: '#9AB2A2' };

export function KelpCanvas({ graph, onNodeClick }: { graph: KelpGraph; onNodeClick: (n: KelpNode) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const hoverRef = useRef<SimNode | null>(null);

  // (re)build simulation when graph identity changes
  useEffect(() => {
    const canvas = canvasRef.current!; const dpr = window.devicePixelRatio || 1;
    const resize = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; };
    resize(); window.addEventListener('resize', resize);

    const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n, x: innerWidth / 2 + Math.random() * 40, y: innerHeight / 2 }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links: SimLink[] = graph.edges
      .map((e) => ({ source: byId.get(e.source)!, target: byId.get(e.target)!, kind: e.kind }))
      .filter((l) => l.source && l.target);
    nodes.filter((n) => n.kind === 'run').forEach((n) => { n.fy = innerHeight - 80 - n.runId * 6; }); // seabed anchoring
    nodesRef.current = nodes;

    const sim = forceSimulation<SimNode, SimLink>(nodes)
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(70).strength(0.6))
      .force('charge', forceManyBody().strength(-120))
      .force('x', forceX(innerWidth / 2).strength(0.03))
      .force('y', forceY((d: any) => (d.kind === 'finding' ? innerHeight * 0.35 : innerHeight - 80)).strength(0.05));
    simRef.current = sim;

    const ctx = canvas.getContext('2d')!;
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      // edges = curved tendrils
      ctx.lineWidth = 1.4;
      for (const l of links) {
        const mx = (l.source.x + l.target.x) / 2, my = (l.source.y + l.target.y) / 2 - 24;
        ctx.beginPath(); ctx.moveTo(l.source.x, l.source.y);
        ctx.quadraticCurveTo(mx, my, l.target.x, l.target.y);
        ctx.strokeStyle = l.kind === 'lineage' ? 'rgba(127,184,148,0.35)' : 'rgba(92,143,116,0.45)';
        ctx.stroke();
      }
      // nodes
      for (const n of nodes) {
        ctx.beginPath();
        const r = n.kind === 'run' ? 7 : 5;
        ctx.arc(n.x, n.y, n === hoverRef.current ? r + 2 : r, 0, Math.PI * 2);
        if (n.fresh) { ctx.shadowBlur = 10; ctx.shadowColor = COL.cyan; ctx.fillStyle = COL.cyan; }
        else { ctx.shadowBlur = 0; ctx.fillStyle = n.kind === 'run' ? COL.kelpLit : COL.kelp; }
        ctx.fill(); ctx.shadowBlur = 0;
      }
    };
    sim.on('tick', draw);

    const pick = (mx: number, my: number) =>
      nodes.find((n) => Math.hypot(n.x - mx, n.y - my) < 10) ?? null;
    const onClick = (e: MouseEvent) => { const n = pick(e.clientX, e.clientY); if (n) onNodeClick(n); };
    const onHover = (e: MouseEvent) => { hoverRef.current = pick(e.clientX, e.clientY); };
    canvas.addEventListener('click', onClick); canvas.addEventListener('mousemove', onHover);

    return () => {
      sim.stop(); window.removeEventListener('resize', resize);
      canvas.removeEventListener('click', onClick); canvas.removeEventListener('mousemove', onHover);
    };
  }, [graph, onNodeClick]);

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, display: 'block' }} />;
}
