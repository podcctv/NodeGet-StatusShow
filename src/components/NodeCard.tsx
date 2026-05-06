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
import { Badge } from './ui/badge'
import { Card } from './ui/card'
import { Progress } from './ui/progress'
import { Flag } from './Flag'
import { FleetTcpPingPanel } from './FleetTcpPingPanel'
import { bytes, pct, relativeAge, uptime } from '../utils/format'
import { cpuLabel, deriveUsage, displayName, distroLogo, osLabel, virtLabel } from '../utils/derive'
import { cn, loadColor, loadTextColor } from '../utils/cn'
import type { Node } from '../types'
import type { ReactNode } from 'react'

const EMPTY_TCP_PING = [
  { name: '移动', avg: null, loss: null, count: 0 },
  { name: '电信', avg: null, loss: null, count: 0 },
  { name: '联通', avg: null, loss: null, count: 0 },
]

export function NodeCard({
  node,
  tcpPing,
  tcpPingLoading,
  tcpPingReadable,
}: {
  node: Node
  tcpPing?: Array<{ name: string; avg: number | null; loss: number | null; count: number }>
  tcpPingLoading?: boolean
  tcpPingReadable?: boolean
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
    <Wrapper {...wrapperProps} className={cn('block', !node.online && 'cursor-default')}>
      <Card
        className={cn(
          'p-0 transition duration-300 cyber-card',
          node.online && 'hover:-translate-y-1 hover:scale-[1.01] cyber-card-active',
          !node.online && 'opacity-60 pointer-events-none select-none cyber-card-offline',
        )}
      >
        <div className="cyber-grid" aria-hidden />
        <div className="cyber-scan" aria-hidden />

        <div className="relative z-10 p-4 pb-3 space-y-3.5">
          <div className="flex items-start gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-cyan-300/30 bg-black/25 shadow-[inset_0_0_18px_rgba(34,211,238,0.16)]">
              {logo ? (
                <img src={logo} alt="" className="h-7 w-7 object-contain" loading="lazy" />
              ) : (
                <Server className="h-5 w-5 text-cyan-200" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-lg font-semibold tracking-wide text-slate-50" title={displayName(node)}>
                  {displayName(node)}
                </span>
                <Flag code={node.meta?.region} className="shrink-0" />
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] font-mono uppercase tracking-wide text-cyan-100/65">
                {virt && <span className="truncate">{virt}</span>}
              </div>
            </div>
          </div>

          {(os || cpu) && (
            <div className="grid grid-cols-1 gap-1.5 rounded-md border border-white/10 bg-white/[0.045] px-3 py-2 text-[11px] font-mono text-slate-300/85">
              {os && <Info icon={Server}>{os}</Info>}
              {cpu && <Info icon={Cpu}>{cpu}</Info>}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Metric icon={Gauge} label="CPU" value={u.cpu} />
            <Metric icon={MemoryStick} label="MEM" value={u.mem} />
            <Metric icon={HardDrive} label="DISK" value={u.disk} />
          </div>

          <div className="grid grid-cols-2 gap-2 font-mono text-xs">
            <StatBox icon={ArrowDown} label="DOWN">{bytes(u.netIn || 0)}/s</StatBox>
            <StatBox icon={ArrowUp} label="UP">{bytes(u.netOut || 0)}/s</StatBox>
          </div>

          <FleetTcpPingPanel rows={tcpPingRows} loading={tcpPingLoading} readable={tcpPingReadable} />

          <div className="flex items-center gap-3 border-t border-cyan-300/20 pt-3 font-mono text-[11px] text-slate-300/80">
            <Stat icon={Clock}>{uptime(u.uptime)}</Stat>
            <span
              className={cn(
                'ml-auto truncate font-semibold tracking-wide',
                node.online ? 'text-emerald-300' : 'text-rose-300',
              )}
              title={updated}
            >
              {updateState}
            </span>
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.slice(0, 4).map(t => (
                <Badge key={t} variant="outline" className="border-cyan-300/25 bg-cyan-300/5 text-[10px] text-cyan-100">
                  {t}
                </Badge>
              ))}
              {tags.length > 4 && (
                <Badge variant="outline" className="border-cyan-300/20 bg-cyan-300/5 text-[10px] text-cyan-100/70">
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
      <Icon className="h-3.5 w-3.5 shrink-0 text-cyan-200/75" />
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
  const percent = pct(numericValue)
  return (
    <div className="rounded-md border border-cyan-300/15 bg-black/20 p-2 shadow-[inset_0_0_20px_rgba(15,23,42,0.36)]">
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <span className="flex items-center gap-1 text-[10px] font-mono text-cyan-100/60">
          <Icon className="h-3 w-3" />
          {label}
        </span>
        <span className={cn('font-mono text-[11px] font-semibold tabular-nums', loadTextColor(numericValue))}>{percent}</span>
      </div>
      <Progress
        value={numericValue}
        className="h-1.5 rounded-sm bg-slate-950/80 ring-1 ring-white/10"
        indicatorClassName={cn(loadColor(numericValue), 'progress-glow')}
      />
    </div>
  )
}

function StatBox({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2">
      <div className="mb-1 flex items-center gap-1 text-[10px] text-cyan-100/55">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="truncate text-slate-100">{children}</div>
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
