import { Activity } from 'lucide-react'
import { cn } from '../utils/cn'

const carrierStyles: Record<string, { color: string; fill: string }> = {
  电信: { color: 'text-sky-200', fill: 'bg-orange-400' },
  联通: { color: 'text-violet-200', fill: 'bg-rose-400' },
  移动: { color: 'text-lime-200', fill: 'bg-amber-400' },
}

function score(avg: number | null, loss: number | null) {
  if (avg == null) return 0
  const latencyScore = 100 - avg / 5
  const lossPenalty = (loss ?? 0) * 2
  return Math.max(2, Math.min(100, latencyScore - lossPenalty))
}

function segmentClass(index: number, activeSegments: number, loss: number | null, fill: string) {
  if (index >= activeSegments) return 'bg-slate-950/90'
  const lossRate = loss ?? 0
  if (lossRate >= 8 && index % 3 === 1) return 'bg-rose-400'
  if (lossRate >= 3 && index % 5 === 2) return 'bg-yellow-300'
  return fill
}

interface Props {
  rows: Array<{ name: string; avg: number | null; loss: number | null; count: number }>
  loading?: boolean
  readable?: boolean
}

export function FleetTcpPingPanel({ rows, loading, readable = true }: Props) {
  const hasRows = rows.some(r => r.count > 0)
  return (
    <div className="retro-terminal rounded-md border border-slate-500/40 border-dashed bg-slate-900/55 px-3 py-3 shadow-[inset_0_0_18px_rgba(15,23,42,0.45)]">
      <div className="mb-3 flex items-center justify-between text-[11px] font-mono font-semibold tracking-wide text-cyan-100/85">
        <span className="inline-flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-lime-300" />
          三网 TCPing
        </span>
        <span className="min-w-[42px] text-right text-[10px] text-slate-400">{readable ? (hasRows ? 'LIVE' : loading ? 'SYNC' : 'NO DATA') : 'NO ACCESS'}</span>
      </div>
      <div className="space-y-2.5">
        {rows.map(item => {
          const style = carrierStyles[item.name]
          const pct = score(item.avg, item.loss)
          const activeSegments = Math.round((pct / 100) * 24)
          return (
            <div key={item.name} className="grid grid-cols-[34px_1fr_48px] items-center gap-2">
              <span className={cn('text-[11px] font-medium', style.color)}>
                {item.name}
              </span>
              <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[2px] rounded-sm bg-slate-950/75 p-1">
                {Array.from({ length: 24 }).map((_, idx) => (
                  <span
                    key={idx}
                    className={cn(
                      'h-3 rounded-[1px] shadow-[0_0_5px_rgba(251,191,36,0.14)] transition-colors duration-500',
                      segmentClass(idx, activeSegments, item.loss, style.fill),
                    )}
                  />
                ))}
              </div>
              <div className="text-right font-mono leading-tight">
                <div className="text-[10px] font-semibold text-cyan-50">{item.avg == null ? '—' : `${Math.round(item.avg)}ms`}</div>
                <div className="text-[9px] text-slate-400">{item.loss == null ? '—' : `${item.loss.toFixed(0)}%`}</div>
              </div>
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
