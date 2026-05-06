import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Flag } from './Flag'
import { StatusDot } from './StatusDot'
import { bytes, pct, relativeAge, uptime } from '../utils/format'
import { deriveUsage, displayName, distroLogo, osLabel, virtLabel } from '../utils/derive'
import { cycleProgress, hasCost, remainingDays, remainingValue } from '../utils/cost'
import { cn, strokeColor } from '../utils/cn'
import {
  buildLatencyChart,
  computeLatencyStats,
  type LatencyStats,
} from '../utils/latency'
import { useNodeLatency } from '../hooks/useNodeLatency'
import type { BackendPool } from '../api/pool'
import type { HistorySample, LatencyType, Node, NodeMeta, TaskQueryResult } from '../types'

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 6,
  fontSize: 11,
}

interface Props {
  node: Node | null
  onClose: () => void
  showSource?: boolean
  pool: BackendPool | null
}

export function NodeDetail({ node, onClose, showSource, pool }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    if (!node) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [node, onClose])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setStuck(false)
    const onScroll = () => {
      const h = headerRef.current?.offsetHeight ?? 60
      setStuck(el.scrollTop > h)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [node])

  const {
    pingData,
    tcpData,
    statusData,
    loading: latencyLoading,
    pingError,
    tcpError,
    taskReadable,
  } = useNodeLatency(
    pool,
    node?.source ?? null,
    node?.uuid ?? null,
  )

  if (!node) return null

  const u = deriveUsage(node)
  const d = node.dynamic
  const s = node.static?.system
  const cpu = node.static?.cpu
  const tags = node.meta?.tags ?? []
  const virt = virtLabel(node)
  const logo = distroLogo(node)
  const swap =
    d?.total_swap && d.used_swap != null ? (d.used_swap / d.total_swap) * 100 : undefined
  const loadAvg =
    d?.load_one != null && d?.load_five != null && d?.load_fifteen != null
      ? `${d.load_one.toFixed(2)} / ${d.load_five.toFixed(2)} / ${d.load_fifteen.toFixed(2)}`
      : null
  const history = node.history || []

  return (
    <div
      ref={scrollRef}
      className="fixed inset-0 z-50 bg-background overflow-y-auto animate-in fade-in duration-150"
    >
      <div
        ref={headerRef}
        className={`sticky top-0 z-10 transition-[background-color,backdrop-filter,border-color] duration-200 ${
          stuck
            ? 'border-b border-border/40 backdrop-blur bg-background/70'
            : 'border-b border-transparent'
        }`}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="返回" className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <StatusDot online={node.online} />
          {logo && (
            <img src={logo} alt="" className="w-5 h-5 shrink-0 object-contain" loading="lazy" />
          )}
          <span className="font-semibold truncate min-w-0">{displayName(node)}</span>
          <Flag code={node.meta?.region} className="shrink-0" />
          <span className="hidden md:inline truncate text-xs font-mono text-muted-foreground">
            {node.uuid}
          </span>
          <div className="ml-auto flex flex-wrap gap-1.5 shrink-0">
            {node.meta?.region && <Badge variant="secondary">{node.meta.region}</Badge>}
            {showSource && (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                {node.source}
              </Badge>
            )}
            {virt && <Badge variant="secondary">{virt}</Badge>}
            {tags.map(t => (
              <Badge key={t} variant="outline">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-5 sm:space-y-8">
        <Section title="资源">
          <div className="flex flex-wrap justify-around gap-4 sm:gap-6">
            <Ring label="CPU" value={u.cpu} sub={loadAvg ?? undefined} />
            <Ring
              label="内存"
              value={u.mem}
              sub={u.memTotal ? `${bytes(u.memUsed)} / ${bytes(u.memTotal)}` : undefined}
            />
            <Ring
              label="磁盘"
              value={u.disk}
              sub={u.diskTotal ? `${bytes(u.diskUsed)} / ${bytes(u.diskTotal)}` : undefined}
            />
            {swap != null && (
              <Ring
                label="Swap"
                value={swap}
                sub={`${bytes(d?.used_swap)} / ${bytes(d?.total_swap)}`}
              />
            )}
          </div>
        </Section>

        {history.length > 1 && (
          <Section title={`近 ${history.length * 2} 秒趋势`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Spark
                data={history}
                dataKey="cpu"
                label="CPU %"
                stroke="#3b82f6"
                domain={[0, 100]}
                format={pct}
              />
              <Spark
                data={history}
                dataKey="mem"
                label="内存 %"
                stroke="#10b981"
                domain={[0, 100]}
                format={pct}
              />
              <Spark
                data={history}
                dataKey="netIn"
                label="下行"
                stroke="#8b5cf6"
                format={v => `${bytes(v)}/s`}
              />
              <Spark
                data={history}
                dataKey="netOut"
                label="上行"
                stroke="#f59e0b"
                format={v => `${bytes(v)}/s`}
              />
            </div>
          </Section>
        )}

        <Section title="状态面板">
          <OnlinePanel rows={statusData} loading={latencyLoading} nodeOnline={node.online} />
        </Section>

        {taskReadable ? (
          <>
            <LatencyBlock
              title="TCP Ping"
              rows={tcpData}
              type="tcp_ping"
              loading={latencyLoading}
              error={tcpError}
            />
            <LatencyBlock title="Ping" rows={pingData} type="ping" loading={latencyLoading} error={pingError} />
          </>
        ) : (
          <TaskUnsupportedPanel />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-8">
          <Section title="系统">
            <KV k="主机名" v={s?.system_host_name} />
            <KV k="操作系统" v={osLabel(node)} />
            <KV k="内核" v={s?.system_kernel || s?.system_kernel_version} />
            <KV k="CPU 架构" v={s?.arch || s?.cpu_arch} />
            <KV k="虚拟化" v={virt} />
            <KV k="CPU 型号" v={cpu?.brand || cpu?.per_core?.[0]?.brand} />
            <KV
              k="核心"
              v={
                cpu?.physical_cores != null
                  ? `${cpu.physical_cores} 物理 / ${cpu.logical_cores} 逻辑`
                  : cpu?.per_core?.length
                    ? `${cpu.per_core.length} 核`
                    : null
              }
            />
          </Section>

          <Section title="网络与负载">
            <KV k="累计接收" v={d?.total_received != null ? bytes(d.total_received) : null} />
            <KV k="累计发送" v={d?.total_transmitted != null ? bytes(d.total_transmitted) : null} />
            <KV k="磁盘读" v={d?.read_speed != null ? `${bytes(d.read_speed)}/s` : null} />
            <KV k="磁盘写" v={d?.write_speed != null ? `${bytes(d.write_speed)}/s` : null} />
            <KV k="进程数" v={d?.process_count} />
            <KV
              k="TCP / UDP"
              v={
                d?.tcp_connections != null || d?.udp_connections != null
                  ? `${d?.tcp_connections ?? '—'} / ${d?.udp_connections ?? '—'}`
                  : null
              }
            />
            <KV k="运行时长" v={uptime(d?.uptime)} />
            <KV k="数据更新" v={relativeAge(d?.timestamp)} />
          </Section>

          {hasCost(node.meta) && <CostSection meta={node.meta} />}
        </div>
      </div>
    </div>
  )
}

type HourState = 'online' | 'partial_offline' | 'fully_offline' | 'unknown'
const STATUS_SLOT_MS = 10 * 60 * 1000
const STATUS_SLOT_COUNT = 24 * 6

function buildHourState(rows: TaskQueryResult[]): HourState[] {
  const now = Date.now()
  const states: HourState[] = []
  for (let i = STATUS_SLOT_COUNT - 1; i >= 0; i--) {
    const start = now - (i + 1) * STATUS_SLOT_MS
    const end = now - i * STATUS_SLOT_MS
    const bucket = rows.filter(r => {
      const ts = r.timestamp < 1_000_000_000_000 ? r.timestamp * 1000 : r.timestamp
      return ts >= start && ts < end
    })
    if (!bucket.length) {
      states.push('unknown')
      continue
    }
    const fail = bucket.filter(r => !r.success).length
    if (fail === 0) states.push('online')
    else if (fail === bucket.length) states.push('fully_offline')
    else states.push('partial_offline')
  }
  return states
}

function OnlinePanel({
  rows,
  loading,
  nodeOnline,
}: {
  rows: TaskQueryResult[]
  loading: boolean
  nodeOnline: boolean
}) {
  const states = useMemo(() => buildHourState(rows), [rows])
  const knownHours = states.filter(s => s !== 'unknown').length
  // 偶尔丢包不算掉线，仅完全不通 (fully_offline) 算作离线影响在线率
  const offlineHours = states.filter(s => s === 'fully_offline').length
  const onlineRatio = knownHours ? Math.round(((knownHours - offlineHours) / knownHours) * 100) : null

  return (
    <div className="rounded-xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-slate-950 p-4 space-y-3">
      <div className="flex items-center justify-between text-sm mb-2">
        <span className="text-emerald-300">在线状态 · 24小时</span>
        <span className="font-mono text-emerald-300">
          {onlineRatio == null ? (loading ? '同步中' : nodeOnline ? '在线' : '未知') : `${onlineRatio}%`}
        </span>
      </div>
      <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${STATUS_SLOT_COUNT}, minmax(0,1fr))` }}>
        {states.map((state, idx) => (
          <span
            key={idx}
            title={`近 24 小时 · 第 ${idx + 1} 个 10 分钟`}
            className={cn(
              'h-5 rounded-[2px] border border-black/20',
              state === 'online' && 'bg-emerald-400/85',
              state === 'partial_offline' && 'bg-yellow-400/85',
              state === 'fully_offline' && 'bg-red-500/90',
              state === 'unknown' && 'bg-slate-600/35',
            )}
          />
        ))}
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-400/85" />在线</span>
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-yellow-400/85" />10分钟内有离线</span>
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-red-500/90" />10分钟离线</span>
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-slate-600/60" />无记录</span>
      </div>
    </div>
  )
}

function TaskUnsupportedPanel() {
  return (
    <Section title="探测数据">
      <div className="min-h-36 flex flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <div>当前 Token 未开放 Task Read 权限，无法读取 Ping / TCP Ping 任务历史。</div>
        <div>页面已使用动态监控数据判断在线状态；如需延迟曲线，请给前端 Token 增加 Task Read: ping / tcp_ping。</div>
      </div>
    </Section>
  )
}

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">{title}</div>
      {children}
    </Card>
  )
}

function KV({ k, v }: { k: string; v: ReactNode }) {
  if (v == null || v === '') return null
  return (
    <div className="flex justify-between gap-3 text-sm py-1">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono text-right truncate">{v}</span>
    </div>
  )
}

function Ring({ label, value, sub }: { label: string; value?: number; sub?: string }) {
  const r = 40
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value ?? 0))
  const hasValue = Number.isFinite(value)
  return (
    <div className="flex flex-col items-center gap-2 min-w-0">
      <div className="relative w-24 h-24 sm:w-28 sm:h-28">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle
            cx="50" cy="50" r={r}
            fill="none" strokeWidth={8}
            className="stroke-secondary"
          />
          {hasValue && (
            <circle
              cx="50" cy="50" r={r}
              fill="none" strokeWidth={8}
              className={strokeColor(value)}
              strokeDasharray={c}
              strokeDashoffset={c - (c * v) / 100}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 400ms ease' }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-base sm:text-lg font-semibold">
          {pct(value)}
        </div>
      </div>
      <div className="text-sm font-medium">{label}</div>
      {sub && (
        <div className="text-xs font-mono text-muted-foreground truncate max-w-full" title={sub}>
          {sub}
        </div>
      )}
    </div>
  )
}

interface SparkProps {
  data: HistorySample[]
  dataKey: keyof HistorySample
  label: string
  stroke: string
  domain?: [number, number]
  format: (v: number) => string
}

function Spark({ data, dataKey, label, stroke, domain, format }: SparkProps) {
  const last = Number(data.at(-1)?.[dataKey] ?? 0)
  const id = `g-${dataKey}`
  return (
    <div className="rounded-md border bg-card/50 p-3">
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{format(last)}</span>
      </div>
      <div className="h-20">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" hide />
            <YAxis hide domain={domain ?? ['auto', 'auto']} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={t => new Date(t).toLocaleTimeString()}
              formatter={(v: number) => [format(v), label]}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={stroke}
              strokeWidth={1.5}
              fill={`url(#${id})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

interface LatencyBlockProps {
  title: string
  rows: TaskQueryResult[]
  type: LatencyType
  loading: boolean
  error?: string | null
}

const ms = (v: number) => `${v.toFixed(1)} ms`

function summarizeStats(stats: LatencyStats[]) {
  const valid = stats.filter(s => s.avg != null)
  if (!valid.length) return null
  const avg = valid.reduce((sum, s) => sum + (s.avg ?? 0), 0) / valid.length
  const jitterVals = valid.flatMap(s => s.jitter == null ? [] : [s.jitter])
  const jitter = jitterVals.length ? jitterVals.reduce((sum, v) => sum + v, 0) / jitterVals.length : null
  const loss = valid.reduce((sum, s) => sum + s.lossRate, 0) / valid.length
  return { avg, jitter, loss }
}

function LatencyBlock({ title, rows, type, loading, error }: LatencyBlockProps) {
  const { data, series } = useMemo(() => buildLatencyChart(rows, type), [rows, type])
  const stats = useMemo(() => computeLatencyStats(rows, type), [rows, type])
  const summary = useMemo(() => summarizeStats(stats), [stats])
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const empty = data.length === 0

  const visibleSeries = series.filter(s => !hidden.has(s.name))

  const toggle = (name: string) =>
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  return (
    <Section title={`${title} · 近 1 小时`} className="latency-panel">
      {summary && (
        <div className="-mt-1 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-cyan-300/10 pb-3 font-mono text-[11px] text-cyan-100/70">
          <span>avg <b className="text-cyan-50">{ms(summary.avg)}</b></span>
          <span>jitter <b className="text-cyan-50">{summary.jitter == null ? '—' : ms(summary.jitter)}</b></span>
          <span>loss <b className={cn(summary.loss >= 5 ? 'text-red-400' : 'text-cyan-50')}>{summary.loss.toFixed(1)}%</b></span>
        </div>
      )}
      <div className="relative h-56 sm:h-64 rounded-md border border-cyan-300/10 bg-black/20 p-2">
        {empty && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            {loading ? '加载中…' : error ? `暂无 ${type} 数据 · ${error}` : `暂无 ${type} 数据`}
          </div>
        )}
        {!empty && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="t"
                type="number"
                domain={['dataMin', 'dataMax']}
                scale="time"
                tickFormatter={t => new Date(t).toLocaleTimeString()}
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                tickFormatter={v => `${v}ms`}
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                width={48}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={t => new Date(Number(t)).toLocaleTimeString()}
                formatter={(v: number) => ms(Number(v))}
              />
              {visibleSeries.map(s => (
                <Line
                  key={s.name}
                  type="monotone"
                  dataKey={s.name}
                  stroke={s.color}
                  strokeWidth={1.5}
                  dot={data.length <= 2}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
        {!empty && loading && (
          <div className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
        )}
      </div>

      {stats.length > 0 && (
        <div className="mt-4 border-t border-cyan-300/15 pt-3 overflow-x-auto">
          <div className="grid min-w-[520px] grid-cols-[1fr_88px_80px_70px] gap-3 px-2 pb-2 text-[11px] text-cyan-100/55">
            <span>来源</span>
            <span className="text-right">平均延迟</span>
            <span className="text-right">抖动</span>
            <span className="text-right">丢包率</span>
          </div>
          <div className="space-y-1 min-w-[520px]">
            {stats.map(s => (
              <LatencyStatsRow
                key={s.name}
                stat={s}
                hidden={hidden.has(s.name)}
                onToggle={() => toggle(s.name)}
              />
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}

function LatencyStatsRow({
  stat,
  hidden,
  onToggle,
}: {
  stat: LatencyStats
  hidden: boolean
  onToggle: () => void
}) {
  const { name, color, avg, jitter, lossRate } = stat

  return (
    <div
      onClick={onToggle}
      className={cn(
        'grid grid-cols-[1fr_88px_80px_70px] items-center gap-3 rounded-md border border-cyan-300/10 bg-white/[0.025] px-2 py-2 text-xs cursor-pointer select-none transition hover:bg-cyan-300/5',
        hidden && 'opacity-35',
      )}
    >
      <span className="flex items-center gap-2 min-w-0 font-semibold">
        <span
          className="inline-block w-5 h-0.5 rounded-full shrink-0 shadow-[0_0_10px_currentColor]"
          style={{ background: color }}
        />
        <span className="truncate">{name}</span>
      </span>
      <span className="text-right tabular-nums font-mono text-cyan-50">
        {avg != null ? ms(avg) : '—'}
      </span>
      <span className="text-right tabular-nums font-mono">
        {jitter != null ? ms(jitter) : '—'}
      </span>
      <span
        className={cn(
          'text-right tabular-nums font-mono',
          lossRate >= 5 && 'text-red-500 font-medium',
        )}
      >
        {lossRate.toFixed(1)}%
      </span>
    </div>
  )
}

function CostSection({ meta }: { meta: NodeMeta }) {
  const days = remainingDays(meta.expireTime)
  const value = remainingValue(meta)
  const progress = cycleProgress(meta)
  const unit = meta.priceUnit || '$'

  let daysLabel: string
  let daysClass = ''
  if (days == null) daysLabel = '未设置'
  else if (days < 0) {
    daysLabel = `已过期 ${Math.abs(days)} 天`
    daysClass = 'text-red-500'
  } else if (days <= 7) {
    daysLabel = `${days} 天`
    daysClass = 'text-red-500'
  } else if (days <= 30) {
    daysLabel = `${days} 天`
    daysClass = 'text-orange-500'
  } else {
    daysLabel = `${days} 天`
  }

  const barColor =
    days == null || days < 0
      ? 'bg-muted-foreground/40'
      : days <= 7
        ? 'bg-red-500'
        : days <= 30
          ? 'bg-orange-500'
          : 'bg-emerald-500'

  return (
    <Section title="费用">
      <KV k="月费" v={meta.price > 0 ? `${unit}${meta.price} / ${meta.priceCycle} 天` : null} />
      <KV k="到期" v={meta.expireTime || null} />
      <KV k="剩余" v={<span className={daysClass}>{daysLabel}</span>} />
      <KV k="剩余价值" v={meta.price > 0 ? `${unit}${value.toFixed(2)}` : null} />

      {meta.expireTime && days != null && (
        <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', barColor)}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </Section>
  )
}
