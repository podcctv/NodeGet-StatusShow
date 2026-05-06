import { Activity } from 'lucide-react'
import { cn } from '../utils/cn'

/**
 * Rainbow latency color scale — finer granularity for better readability.
 * Uses inline style for precise HSL color rather than Tailwind classes.
 */
function barStyle(avgMs: number | null): React.CSSProperties {
  if (avgMs == null) return { backgroundColor: 'rgba(51, 65, 85, 0.4)' } // slate-700/40
  // HSL hue: 120 (green) → 60 (yellow) → 30 (orange) → 0 (red) → 330 (magenta)
  // Map 0-500ms onto hue 120→330 (inverted: lower=greener, higher=redder/purple)
  const clamped = Math.max(0, Math.min(500, avgMs))
  let hue: number
  if (clamped <= 50) hue = 142            // emerald
  else if (clamped <= 100) hue = 142 - ((clamped - 50) / 50) * 42  // emerald→green-yellow (142→100)
  else if (clamped <= 150) hue = 100 - ((clamped - 100) / 50) * 52 // green-yellow→yellow (100→48)
  else if (clamped <= 200) hue = 48 - ((clamped - 150) / 50) * 18  // yellow→orange (48→30)
  else if (clamped <= 300) hue = 30 - ((clamped - 200) / 100) * 22 // orange→red (30→8)
  else hue = 8 - ((clamped - 300) / 200) * 8                        // red→deep-red (8→0)

  const sat = clamped <= 100 ? 72 : 75
  const light = clamped <= 50 ? 55 : clamped <= 200 ? 52 : 48
  return { backgroundColor: `hsl(${hue}, ${sat}%, ${light}%)` }
}

function labelColor(avgMs: number | null): string {
  if (avgMs == null) return 'text-slate-500'
  if (avgMs <= 50) return 'text-emerald-400'
  if (avgMs <= 100) return 'text-green-300'
  if (avgMs <= 150) return 'text-yellow-300'
  if (avgMs <= 200) return 'text-orange-300'
  if (avgMs <= 300) return 'text-red-400'
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
    <div className="retro-terminal rounded-md border border-border/60 bg-slate-50 dark:bg-black/20 px-3 py-3">
      <div className="mb-3 flex items-center justify-between text-[11px] font-mono font-semibold tracking-wide text-slate-600 dark:text-foreground/70">
        <span className="inline-flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-emerald-400" />
          三网 TCPing
        </span>
        <span className="min-w-[42px] text-right text-[10px] text-muted-foreground">
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

          const buckets: (number | null)[] = new Array(24).fill(null)
          for (const h of hourly) {
            if (h.hour >= 0 && h.hour < 24) {
              buckets[h.hour] = h.avg
            }
          }

          return (
            <div key={item.name} className="grid grid-cols-[34px_1fr_48px] items-center gap-2">
              <span className="text-[11px] font-medium text-foreground/65">
                {item.name}
              </span>
              <div
                className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[2px] rounded-sm bg-slate-200/60 dark:bg-black/40 p-[3px]"
                title="24h 延迟热力图 · 每格=1小时"
              >
                {buckets.map((avg, idx) => (
                  <span
                    key={idx}
                    className={cn('h-3 rounded-[1px] transition-colors duration-500', avg == null ? 'bg-slate-200 dark:bg-white/10' : '')}
                    style={barStyle(avg)}
                    title={avg != null ? `${idx}:00 — ${Math.round(avg)}ms` : `${idx}:00 — 无数据`}
                  />
                ))}
              </div>
              <div className="text-right font-mono leading-tight">
                <div className={cn('text-[10px] font-semibold', labelColor(item.avg))}>
                  {item.avg == null ? '—' : `${Math.round(item.avg)}ms`}
                </div>
                <span className="w-8 shrink-0 text-slate-500 dark:text-muted-foreground/80">
                  {item.loss == null ? '—' : `${item.loss.toFixed(0)}%`}
                </span>
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
