import { Activity } from 'lucide-react'
import { Progress } from './ui/progress'
import { cn } from '../utils/cn'

const carrierStyles: Record<string, { color: string; bar: string }> = {
  移动: { color: 'text-emerald-300', bar: 'bg-emerald-400' },
  电信: { color: 'text-cyan-300', bar: 'bg-cyan-400' },
  联通: { color: 'text-fuchsia-300', bar: 'bg-fuchsia-400' },
}

function score(avg: number | null) {
  if (avg == null) return 0
  return Math.max(4, Math.min(100, 100 - avg / 5))
}

interface Props {
  rows: Array<{ name: string; avg: number | null; loss: number | null; count: number }>
  loading?: boolean
  readable?: boolean
}

export function FleetTcpPingPanel({ rows, loading, readable = true }: Props) {
  const hasRows = rows.some(r => r.count > 0)
  return (
    <div className="rounded-md border border-cyan-300/15 bg-black/20 px-3 py-2 shadow-[inset_0_0_18px_rgba(34,211,238,0.06)]">
      <div className="mb-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-wide text-cyan-100/60">
        <span>TCP 三网 Ping</span>
        <span className="min-w-[42px] text-right">{readable ? (hasRows ? 'LIVE' : loading ? 'SYNC' : 'NO DATA') : 'NO ACCESS'}</span>
      </div>
      <div className="space-y-1.5">
        {rows.map(item => {
          const style = carrierStyles[item.name]
          const pct = score(item.avg)
          return (
            <div key={item.name} className="grid grid-cols-[34px_1fr_42px] items-center gap-2">
              <span className={cn('flex items-center gap-1 text-[10px] font-semibold', style.color)}>
                <Activity className="h-3 w-3" />
                {item.name}
              </span>
              <Progress value={pct} className="h-1.5 rounded-sm bg-slate-950/80" indicatorClassName={cn(style.bar, 'progress-glow transition-[width] duration-500 ease-out')} />
              <span className="text-right font-mono text-[10px] text-cyan-50">
                {item.avg == null ? '—' : `${Math.round(item.avg)}ms`}
              </span>
            </div>
          )
        })}
        {!readable && (
          <div className="truncate text-[10px] text-muted-foreground">Token 未开放 tcp_ping 读取</div>
        )}
        {readable && !hasRows && !loading && (
          <div className="truncate text-[10px] text-muted-foreground">暂无该节点三网记录</div>
        )}
      </div>
    </div>
  )
}
