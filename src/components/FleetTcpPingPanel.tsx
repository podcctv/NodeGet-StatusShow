import { Activity } from 'lucide-react'
import { cn } from '../utils/cn'

/** Traditional latency color thresholds */
function barColor(avgMs: number | null): string {
  if (avgMs == null) return 'bg-slate-800/60'
  if (avgMs <= 80) return 'bg-emerald-400'
  if (avgMs <= 150) return 'bg-yellow-400'
  return 'bg-red-400'
}

function barGlow(avgMs: number | null): string {
  if (avgMs == null) return ''
  if (avgMs <= 80) return 'shadow-[0_0_6px_rgba(52,211,153,0.5)]'
  if (avgMs <= 150) return 'shadow-[0_0_6px_rgba(250,204,21,0.45)]'
  return 'shadow-[0_0_6px_rgba(248,113,113,0.5)]'
}

function labelColor(avgMs: number | null): string {
  if (avgMs == null) return 'text-slate-500'
  if (avgMs <= 80) return 'text-emerald-300'
  if (avgMs <= 150) return 'text-yellow-300'
  return 'text-red-300'
}

export interface HourlyBucket {
  hour: number      // 0-23
  avg: number | null // average latency in ms for that hour
  count: number
}

interface Props {
  rows: Array<{
    name: string
    avg: number | null
    loss: number | null
    count: number
    hourly?: HourlyBucket[]
  }>
  loading?: boolean
  readable?: boolean
}

export function FleetTcpPingPanel({ rows, loading, readable = true }: Props) {
  const hasRows = rows.some(r => r.count > 0)
  return (
    <div className="retro-terminal rounded-md border border-cyan-500/20 bg-slate-900/70 px-3 py-3 shadow-[inset_0_0_18px_rgba(15,23,42,0.45)]">
      <div className="mb-3 flex items-center justify-between text-[11px] font-mono font-semibold tracking-wide text-cyan-100/85">
        <span className="inline-flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-lime-300" />
          三网 TCPing
        </span>
        <span className="min-w-[42px] text-right text-[10px] text-slate-400">
          {readable ? (hasRows ? 'LIVE' : loading ? 'SYNC' : 'NO DATA') : 'NO ACCESS'}
        </span>
      </div>
      <div className="space-y-2.5">
        {rows.map(item => {
          const hourly = item.hourly ?? Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            avg: null as number | null,
            count: 0,
          }))

          // Ensure exactly 24 slots
          const buckets: (number | null)[] = new Array(24).fill(null)
          for (const h of hourly) {
            if (h.hour >= 0 && h.hour < 24) {
              buckets[h.hour] = h.avg
            }
          }

          return (
            <div key={item.name} className="grid grid-cols-[34px_1fr_48px] items-center gap-2">
              <span className="text-[11px] font-medium text-cyan-200/80">
                {item.name}
              </span>
              <div
                className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[2px] rounded-sm bg-slate-950/80 p-[3px]"
                title="24h 延迟热力图 · 每格=1小时"
              >
                {buckets.map((avg, idx) => (
                  <span
                    key={idx}
                    className={cn(
                      'h-3 rounded-[1px] transition-colors duration-500',
                      barColor(avg),
                      barGlow(avg),
                    )}
                    title={avg != null ? `${idx}:00 — ${Math.round(avg)}ms` : `${idx}:00 — 无数据`}
                  />
                ))}
              </div>
              <div className="text-right font-mono leading-tight">
                <div className={cn('text-[10px] font-semibold', labelColor(item.avg))}>
                  {item.avg == null ? '—' : `${Math.round(item.avg)}ms`}
                </div>
                <div className="text-[9px] text-slate-500">
                  {item.loss == null ? '—' : `${item.loss.toFixed(0)}%`}
                </div>
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
