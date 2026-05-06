import { ArrowDown, ArrowUp, Clock, type LucideIcon } from 'lucide-react'
import { Badge } from './ui/badge'
import { Card } from './ui/card'
import { Progress } from './ui/progress'
import { Flag } from './Flag'
import { StatusDot } from './StatusDot'
import { bytes, pct, relativeAge, uptime } from '../utils/format'
import { cpuLabel, deriveUsage, displayName, distroLogo, osLabel, virtLabel } from '../utils/derive'
import { cn, loadColor, loadTextColor } from '../utils/cn'
import type { Node } from '../types'
import type { ReactNode } from 'react'
export function NodeCard({ node }: { node: Node }) {
  const u = deriveUsage(node)
  const tags = Array.isArray(node.meta?.tags) ? node.meta.tags : []
  const os = osLabel(node)
  const logo = distroLogo(node)
  const virt = virtLabel(node)
  const cpu = cpuLabel(node)
  const Wrapper = node.online ? 'a' : 'div'
  const wrapperProps = node.online ? { href: `#${encodeURIComponent(node.uuid)}` } : {}

  return (
    <Wrapper {...wrapperProps} className={cn('block', !node.online && 'cursor-default')}>
      <Card
        className={cn(
          'p-4 transition duration-300 flex flex-col gap-2.5 cyber-card',
          node.online && 'hover:border-primary/60 hover:-translate-y-1 hover:scale-[1.01] cyber-card-active',
          !node.online && 'opacity-60 pointer-events-none select-none cyber-card-offline',
        )}
      >
        <div className="cyber-orb" aria-hidden />
        <div className="cyber-grid" aria-hidden />
        <div className="flex items-center gap-2.5">
          <StatusDot online={node.online} />
          {logo && <img src={logo} alt="" className="w-5 h-5 shrink-0 object-contain" loading="lazy" />}
          <span className="font-semibold text-lg tracking-wide flex-1 min-w-0 truncate" title={displayName(node)}>
            {displayName(node)}
          </span>
          <Flag code={node.meta?.region} className="shrink-0" />
        </div>
        {(os || virt) && <div className="font-mono text-xs text-muted-foreground truncate">{[os, virt].filter(Boolean).join(' · ')}</div>}
        <div className="flex flex-col gap-2 rounded-xl border border-cyan-300/15 bg-slate-950/30 px-3 py-2 shadow-[inset_0_0_24px_rgba(45,212,191,0.08)]">
          <Metric label="CPU" value={u.cpu} sub={cpu || null} subTitle={cpu || undefined} />
          <Metric label="内存" value={u.mem} sub={u.memTotal ? `${bytes(u.memUsed)} / ${bytes(u.memTotal)}` : null} />
          <Metric label="磁盘" value={u.disk} sub={u.diskTotal ? `${bytes(u.diskUsed)} / ${bytes(u.diskTotal)}` : null} />
        </div>
        <div className="pt-2 border-t border-cyan-300/20 border-dashed font-mono text-xs text-slate-300/90 space-y-1">
          <div className="flex items-center gap-3">
            <Stat icon={ArrowDown}>{bytes(u.netIn || 0)}/s</Stat>
            <Stat icon={ArrowUp}>{bytes(u.netOut || 0)}/s</Stat>
          </div>
          <div className="flex items-center gap-3">
            <Stat icon={Clock}>{uptime(u.uptime)}</Stat>
            <span className="ml-auto">{relativeAge(u.ts)}</span>
          </div>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map(t => (
              <Badge key={t} variant="outline" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </Wrapper>
  )
}
function Metric({
  label,
  value,
  sub,
  subTitle,
}: {
  label: string
  value?: number | null
  sub?: ReactNode
  subTitle?: string
}) {
  const numericValue = Number.isFinite(value) ? (value as number) : undefined
  const percent = pct(numericValue)
  return (
    <div className="space-y-1">
      <div className="flex items-center text-xs font-mono">
        <span className="text-slate-300">{label}</span>
        {sub ? (
          <span className="ml-2 text-slate-400 truncate" title={subTitle}>
            {sub}
          </span>
        ) : null}
        <span className={cn('ml-auto font-semibold tabular-nums', loadTextColor(numericValue))}>{percent}</span>
      </div>
      <Progress
        value={numericValue}
        className="h-2 rounded-sm bg-slate-800/80 ring-1 ring-white/10"
        indicatorClassName={cn(loadColor(numericValue), 'progress-glow')}
      />
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
