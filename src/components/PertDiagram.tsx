import React, { useMemo } from 'react';
import type { Schedule, Scheduled } from '../lib/schedule';
import { formatDateID } from '../lib/date';

const NODE_W = 200;
const NODE_H = 96;
const COL_W = 280;
const ROW_GAP = 132;
const PAD = 30;

interface Props {
  schedule: Schedule;
  highlightCritical: boolean;
}

interface Positioned {
  item: Scheduled;
  x: number;
  y: number;
}

export function PertDiagram({ schedule, highlightCritical }: Props) {
  const { positions, width, height, edges } = useMemo(() => {
    const items = [...schedule.items.values()];
    const cols = new Map<number, Scheduled[]>();
    for (const it of items) {
      const list = cols.get(it.rank) || [];
      list.push(it);
      cols.set(it.rank, list);
    }
    const maxRank = cols.size === 0 ? 0 : Math.max(...cols.keys());
    const pos = new Map<string, Positioned>();
    let maxRows = 1;
    for (let r = 0; r <= maxRank; r++) {
      const list = (cols.get(r) || []).sort(
        (a, b) => a.es.getTime() - b.es.getTime() || a.task.name.localeCompare(b.task.name),
      );
      maxRows = Math.max(maxRows, list.length);
      list.forEach((it, rowIdx) => {
        pos.set(it.id, {
          item: it,
          x: PAD + r * COL_W,
          y: PAD + rowIdx * ROW_GAP,
        });
      });
    }

    const arrowEdges: { key: string; d: string; critical: boolean; title: string }[] = [];
    for (const it of items) {
      const to = pos.get(it.id);
      if (!to) continue;
      for (const dep of it.task.dependencies) {
        const from = pos.get(dep.taskId);
        if (!from) continue;
        const x1 = from.x + NODE_W;
        const y1 = from.y + NODE_H / 2;
        const x2 = to.x;
        const y2 = to.y + NODE_H / 2;
        const dx = Math.max(24, (x2 - x1) / 2);
        const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
        const crit = highlightCritical && from.item.critical && to.item.critical;
        arrowEdges.push({
          key: `${dep.taskId}->${it.id}`,
          d,
          critical: crit,
          title: `${from.item.task.name} → ${it.task.name} · ${dep.type}${dep.delay ? ` +${dep.delay} hr` : ''}`,
        });
      }
    }

    return {
      positions: pos,
      width: PAD * 2 + (maxRank + 1) * COL_W - (COL_W - NODE_W),
      height: PAD * 2 + maxRows * ROW_GAP - (ROW_GAP - NODE_H),
      edges: arrowEdges,
    };
  }, [schedule, highlightCritical]);

  if (schedule.items.size === 0) {
    return <div className="empty-state"><p>Belum ada tugas untuk diagram PERT.</p></div>;
  }

  return (
    <div className="pert-scroll">
      <svg
        className="pert-svg"
        width={Math.max(width, 600)}
        height={Math.max(height, 300)}
        role="img"
        aria-label="Diagram PERT"
      >
        <defs>
          <marker id="pert-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#64748b" />
          </marker>
          <marker id="pert-arrow-crit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#dc2626" />
          </marker>
        </defs>

        {edges.map((e) => (
          <path
            key={e.key}
            d={e.d}
            className={`pert-edge ${e.critical ? 'critical' : ''}`}
            markerEnd={e.critical ? 'url(#pert-arrow-crit)' : 'url(#pert-arrow)'}
          >
            <title>{e.title}</title>
          </path>
        ))}

        {[...positions.values()].map(({ item, x, y }) => {
          const crit = highlightCritical && item.critical;
          return (
            <g key={item.id} className={`pert-node ${crit ? 'critical' : ''}`}>
              <rect
                x={x}
                y={y}
                width={NODE_W}
                height={NODE_H}
                rx={10}
                className={`pert-box ${crit ? 'critical' : ''}`}
                style={!crit ? { stroke: item.task.color } : undefined}
              />
              <rect x={x} y={y} width={NODE_W} height={24} rx={10} className="pert-head" style={crit ? undefined : { fill: item.task.color }} />
              <rect x={x} y={y + 14} width={NODE_W} height={10} style={crit ? { fill: '#dc2626' } : { fill: item.task.color }} />
              <text x={x + 8} y={y + 16} className="pert-title">
                {item.task.name.length > 24 ? `${item.task.name.slice(0, 23)}…` : item.task.name}
              </text>

              <text x={x + 8} y={y + 40} className="pert-line">
                <tspan className="lbl">ES</tspan>
                {formatDateID(item.es)}
                <tspan className="lbl" dx={8}>EF</tspan>
                {formatDateID(item.ef)}
              </text>
              <text x={x + 8} y={y + 58} className="pert-line">
                <tspan className="lbl">LS</tspan>
                {formatDateID(item.ls)}
                <tspan className="lbl" dx={8}>LF</tspan>
                {formatDateID(item.lf)}
              </text>
              <line x1={x + 8} y1={y + 66} x2={x + NODE_W - 8} y2={y + 66} className="pert-sep" />
              <text x={x + 8} y={y + 82} className="pert-foot">
                Durasi: {item.duration} hari kerja
                <tspan className="lbl" dx={10}>Slack</tspan>
                {item.slack} hr
                {item.critical && (
                  <tspan className="pert-crit-tag" dx={10}>KRITIS</tspan>
                )}
              </text>
              <title>{`${item.task.name}\n${formatDateID(item.start)} → ${formatDateID(item.end)}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
