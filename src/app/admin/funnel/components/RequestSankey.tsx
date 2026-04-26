'use client'

import { Sankey, Tooltip, ResponsiveContainer, Layer, Rectangle } from 'recharts'

interface SankeyNode {
  name: string
}

interface SankeyLink {
  source: number
  target: number
  value: number
}

interface RequestSankeyProps {
  nodes: SankeyNode[]
  links: SankeyLink[]
  emptyLabel?: string
}

const NODE_COLORS: Record<string, string> = {
  'Νέο Αίτημα':       '#3b82f6', // blue
  'Έλαβε Προσφορά':   '#8b5cf6', // violet
  'Καμία Προσφορά':   '#9ca3af', // gray
  'Δέχτηκε':          '#10b981', // green
  'Απορρίφθηκε':      '#f97316', // orange
  'Εκκρεμές':         '#eab308', // yellow
  'Ραντεβού':         '#06b6d4', // cyan
  'Ολοκληρώθηκε':     '#22c55e', // emerald
  'Ακυρώθηκε':        '#ef4444'  // red
}

interface NodeProps {
  x?: number
  y?: number
  width?: number
  height?: number
  index?: number
  payload?: {
    name: string
    value?: number
    targetLinks?: number[]   // outgoing — empty => terminal node (rightmost)
    sourceLinks?: number[]   // incoming — empty => entry node (leftmost)
  }
}

function CustomNode({ x = 0, y = 0, width = 0, height = 0, payload }: NodeProps) {
  const name = payload?.name || ''
  const color = NODE_COLORS[name] || '#94a3b8'
  // Terminal nodes (no outgoing links) get the label on the LEFT of the
  // bar so it doesn't overflow the chart area. Everything else gets it on
  // the RIGHT — including entry and middle nodes.
  const isTerminal = !payload?.targetLinks || payload.targetLinks.length === 0
  const value = payload?.value ?? 0

  return (
    <Layer>
      <Rectangle x={x} y={y} width={width} height={height} fill={color} fillOpacity={0.9} />
      <text
        textAnchor={isTerminal ? 'end' : 'start'}
        x={isTerminal ? x - 6 : x + width + 6}
        y={y + height / 2}
        fontSize="11"
        fontWeight="600"
        fill="#1f2937"
        dy=".35em"
      >
        {name}
        {value > 0 ? ` (${value})` : ''}
      </text>
    </Layer>
  )
}

export default function RequestSankey({
  nodes,
  links,
  emptyLabel = 'Δεν υπάρχουν αιτήματα στο επιλεγμένο διάστημα.'
}: RequestSankeyProps) {
  if (!links.length) {
    return <div className="text-sm text-secondary py-8 text-center">{emptyLabel}</div>
  }

  return (
    <div className="w-full" style={{ minHeight: 420 }}>
      <ResponsiveContainer width="100%" height={420}>
        <Sankey
          data={{ nodes, links }}
          nodeWidth={14}
          nodePadding={28}
          link={{ stroke: '#cbd5e1', strokeOpacity: 0.4 }}
          node={<CustomNode />}
          margin={{ left: 10, right: 130, top: 10, bottom: 10 }}
        >
          <Tooltip />
        </Sankey>
      </ResponsiveContainer>
    </div>
  )
}
