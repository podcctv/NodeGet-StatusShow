import { Activity, RadioTower, Zap } from 'lucide-react'
import { Card } from './ui/card'
import { Progress } from './ui/progress'
import { useFleetTcpPing } from '../hooks/useFleetTcpPing'
import { cn } from '../utils/cn'
import type { BackendPool } from '../api/pool'
import type { Node } from '../types'

interface Props {
  pool: BackendPool | null
  nodes: Node[]
}

const carrierStyles: Record<string, { color: string; bar: string }> = {
  移动: { color: 'text-emerald-300', bar: 'bg-emerald-400' },
  电信: { color: 'text-cyan-300', bar: 'bg-cyan-400' },
  联通: { color: 'text-fuchsia-300', bar: 'bg-fuchsia-400' },
}

function score(avg: number | null) {
  if (avg == null) return 0
  return Math.max(4, Math.min(100, 100 - avg / 5))
}

export function FleetTcpPingPanel({ pool, nodes }: Props) {
  const { carriers, loading, readable, hasData } = useFleetTcpPing(pool, nodes)

  return (
    <Card className="latency-panel p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-cyan-300/25 bg-black/25 shadow-[inset_0_0_22px_rgba(34,211,238,0.16)]">
            <RadioTower className="h-6 w-6 text-cyan-200" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-cyan-100">
              <Zap className="h-4 w-4 text-emerald-300" />
              TCP 三网 Ping
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {readable ? '聚合最近 TCP 探测任务，展示移动 / 电信 / 联通质量' : '当前 Token 未开放 Task Read: tcp_ping'}
            </div>
          </div>
        </div>

        <div className="grid flex-[1.7] grid-cols-1 gap-3 md:grid-cols-3">
          {carriers.map(item => {
            const style = carrierStyles[item.name]
            const pct = score(item.avg)
            return (
              <div key={item.name} className="rounded-md border border-cyan-300/12 bg-white/[0.035] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className={cn('flex items-center gap-1.5 text-sm font-semibold', style.color)}>
                    <Activity className="h-3.5 w-3.5" />
                    {item.name}
                  </span>
                  <span className="font-mono text-xs text-cyan-50">
                    {item.avg == null ? '—' : `${Math.round(item.avg)}ms`}
                  </span>
                </div>
                <Progress value={pct} className="h-2 rounded-sm bg-slate-950/80" indicatorClassName={cn(style.bar, 'progress-glow')} />
                <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                  <span>{item.count ? `${item.count} 条记录` : loading ? '同步中' : hasData ? '无三网记录' : '暂无数据'}</span>
                  <span>loss {item.loss == null ? '—' : `${item.loss.toFixed(1)}%`}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}
