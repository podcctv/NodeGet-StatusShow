import {
  ArrowDown,
  ArrowUp,
  Clock,
  Cpu,
  Gauge,
  HardDrive,
  MemoryStick,
  Server,
  type LucideIcon,
} from 'lucide-react'
import { useMemo } from 'react'
import { Badge } from './ui/badge'
import { Card } from './ui/card'
import { Progress } from './ui/progress'
import { Flag } from './Flag'
import { FleetTcpPingPanel } from './FleetTcpPingPanel'
import type { HourlyBucket } from './FleetTcpPingPanel'
import { bytes, pct, relativeAge, uptime } from '../utils/format'
import { cpuLabel, deriveUsage, displayName, distroLogo, osLabel, virtLabel } from '../utils/derive'
import { cn, loadColor, loadTextColor } from '../utils/cn'
import type { Node, TaskQueryResult } from '../types'
import type { ReactNode } from 'react'

const EMPTY_TCP_PING: Array<{ name: string; avg: number | null; loss: number | null; count: number; hourly?: HourlyBucket[] }> = [
  { name: '移动', avg: null, loss: null, count: 0 },
  { name: '电信', avg: null, loss: null, count: 0 },
  { name: '联通', avg: null, loss: null, count: 0 },
]

/* ── 24h Online Status (compact version of detail page's OnlinePanel) ── */

type SlotState = 'online' | 'partial' | 'offline' | 'unknown'
const SLOT_MS = 30 * 60 * 1000  // 30 minutes per slot
const SLOT_COUNT = 48           // 48 slots = 24h

function buildSlotStates(rows: TaskQueryResult[]): SlotState[] {
  const now = Date.now()
  const states: SlotState[] = []
  for (let i = SLOT_COUNT - 1; i >= 0; i--) {
    const start = now - (i + 1) * SLOT_MS
    const end = now - i * SLOT_MS
    const bucket = rows.filter(r => {
      const ts = r.timestamp < 1_000_000_000_000 ? r.timestamp * 1000 : r.timestamp
      return ts >= start && ts < end
    })
    if (!bucket.length) { states.push('unknown'); continue }
    const fail = bucket.filter(r => !r.success).length
    if (fail === 0) states.push('online')
    else if (fail === bucket.length) states.push('offline')
    else states.push('partial')
  }
  return states
}

const SLOT_COLORS: Record<SlotState, string> = {
  online: 'bg-emerald-400/80',
  partial: 'bg-yellow-400/80',
  offline: 'bg-red-500/80',
  unknown: 'bg-slate-700/30',
}

function OnlineStrip({ rows }: { rows: TaskQueryResult[] }) {
  const states = useMemo(() => buildSlotStates(rows), [rows])
  const known = states.filter(s => s !== 'unknown').length
  const good = states.filter(s => s === 'online').length
  const ratio = known ? Math.round((good / known) * 100) : null

  return (
    <div className="rounded-md border border-border/50 bg-black/15 px-2.5 py-2">
      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground mb-1.5">
        <span>24h 在线</span>
        <span className={ratio != null && ratio < 80 ? 'text-red-400' : ratio != null && ratio < 95 ? 'text-yellow-400' : 'text-emerald-400'}>
          {ratio != null ? `${ratio}%` : '—'}
        </span>
      </div>
      <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${SLOT_COUNT}, minmax(0,1fr))` }}>
        {states.map((s, i) => (
          <span key={i} className={cn('h-2 rounded-[1px]', SLOT_COLORS[s])} />
        ))}
      </div>
    </div>
  )
}

/* ── Main Card ── */

export function NodeCard({
  node,
  tcpPing,
  tcpPingLoading,
  tcpPingReadable,
  statusRows,
}: {
  node: Node
  tcpPing?: Array<{ name: string; avg: number | null; loss: number | null; count: number; hourly?: HourlyBucket[] }>
  tcpPingLoading?: boolean
  tcpPingReadable?: boolean
  statusRows?: TaskQueryResult[]
}) {
  const u = deriveUsage(node)
  const tags = Array.isArray(node.meta?.tags) ? node.meta.tags : []
  const os = osLabel(node)
  const logo = distroLogo(node)
  const virt = virtLabel(node)
  const cpu = cpuLabel(node)
  const updated = relativeAge(u.ts)
  const updateState = node.online ? 'ONLINE' : 'OFFLINE'
  const tcpPingRows = tcpPing ?? EMPTY_TCP_PING
  const Wrapper = node.online ? 'a' : 'div'
  const wrapperProps = node.online ? { href: `#${encodeURIComponent(node.id)}` } : {}

  return (
    <Wrapper {...wrapperProps} className={cn('block h-full', !node.online && 'cursor-default')}>
      <Card
        className={cn(
          'p-0 h-full flex flex-col transition duration-300 cyber-card',
          node.online && 'hover:-translate-y-1 hover:scale-[1.01] cyber-card-active',
          !node.online && 'opacity-60 pointer-events-none select-none cyber-card-offline',
        )}
      >
        <div className="cyber-grid" aria-hidden />
        <div className="cyber-scan" aria-hidden />

        <div className="relative z-10 p-4 pb-3 flex flex-col flex-1">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border/40 bg-black/25">
              {logo ? (
                <img src={logo} alt="" className="h-7 w-7 object-contain" loading="lazy" />
              ) : (
                <Server className="h-5 w-5 text-muted-foreground" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-lg font-semibold tracking-wide text-foreground" title={displayName(node)}>
                  {displayName(node)}
                </span>
                <Flag code={node.meta?.region} className="shrink-0" />
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                {virt && <span className="truncate">{virt}</span>}
              </div>
            </div>
          </div>

          {/* System Info */}
          {(os || cpu) && (
            <div className="mt-3.5 grid grid-cols-1 gap-1.5 rounded-md border border-border/40 bg-black/10 px-3 py-2 text-[11px] font-mono text-foreground/70">
              {os && <Info icon={Server}>{os}</Info>}
              {cpu && <Info icon={Cpu}>{cpu}</Info>}
            </div>
          )}

          {/* Metrics */}
          <div className="mt-3.5 grid grid-cols-3 gap-2">
            <Metric icon={Gauge} label="CPU" value={u.cpu} />
            <Metric icon={MemoryStick} label="MEM" value={u.mem} />
            <Metric icon={HardDrive} label="DISK" value={u.disk} />
          </div>

          {/* Network */}
          <div className="mt-3.5 grid grid-cols-2 gap-2 font-mono text-xs">
            <StatBox icon={ArrowDown} label="DOWN">{bytes(u.netIn || 0)}/s</StatBox>
            <StatBox icon={ArrowUp} label="UP">{bytes(u.netOut || 0)}/s</StatBox>
          </div>

          {/* TCPing */}
          <div className="mt-3.5">
            <FleetTcpPingPanel rows={tcpPingRows} loading={tcpPingLoading} readable={tcpPingReadable} />
          </div>

          {/* 24h Online Status */}
          {statusRows && statusRows.length > 0 && (
            <div className="mt-3">
              <OnlineStrip rows={statusRows} />
            </div>
          )}

          {/* Footer - grows to push to bottom */}
          <div className="mt-3.5 flex-1 flex items-end">
            <div className="w-full flex items-center gap-3 border-t border-border/30 pt-3 font-mono text-[11px] text-muted-foreground">
              <Stat icon={Clock}>{uptime(u.uptime)}</Stat>
              <span
                className={cn(
                  'ml-auto truncate font-semibold tracking-wide',
                  node.online ? 'text-emerald-400' : 'text-rose-400',
                )}
                title={updated}
              >
                {updateState}
              </span>
            </div>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tags.slice(0, 4).map(t => (
                <Badge key={t} variant="outline" className="border-border/40 bg-muted/30 text-[10px] text-foreground/70">
                  {t}
                </Badge>
              ))}
              {tags.length > 4 && (
                <Badge variant="outline" className="border-border/30 bg-muted/30 text-[10px] text-foreground/50">
                  +{tags.length - 4}
                </Badge>
              )}
            </div>
          )}
        </div>
      </Card>
    </Wrapper>
  )
}

function Info({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{children}</span>
    </span>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value?: number | null
}) {
  const numericValue = Number.isFinite(value) ? (value as number) : undefined
  // Clamp display to 100% for the progress bar, but show real value in text
  const clampedForBar = numericValue != null ? Math.min(100, numericValue) : undefined
  const percent = pct(numericValue)
  return (
    <div className="rounded-md border border-border/30 bg-black/15 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
          <Icon className="h-3 w-3" />
          {label}
        </span>
        <span className={cn('font-mono text-[11px] font-semibold tabular-nums', loadTextColor(numericValue))}>{percent}</span>
      </div>
      <Progress
        value={clampedForBar}
        className="h-1.5 rounded-sm bg-slate-950/60 ring-1 ring-white/5"
        indicatorClassName={cn(loadColor(numericValue), 'progress-glow')}
      />
    </div>
  )
}

function StatBox({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-border/30 bg-black/10 px-2.5 py-2">
      <div className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="truncate text-foreground">{children}</div>
    </div>
  )
}

function Stat({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5" />
      <span>{children}</span>
    </span>
  )
}
