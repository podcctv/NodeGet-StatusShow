import type { LatencyType, TaskQueryResult } from '../types'

const COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#14b8a6',
]

export function latencyColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

function normalizeTs(ts: number) {
  return ts < 1_000_000_000_000 ? ts * 1000 : ts
}

export function latencySeriesName(row: TaskQueryResult) {
  const source = typeof row.cron_source === 'string' ? row.cron_source.trim() : ''
  if (source && source !== '未知') return source

  const event = row.task_event_type
  if (event && typeof event === 'object') {
    const payload = event as Record<string, unknown>
    const target = payload.tcp_ping ?? payload.ping
    if (typeof target === 'string' && target.trim()) return target.trim()
  }

  return row.task_id ? `任务 #${row.task_id}` : '未知来源'
}

export function latencyTaskType(row: TaskQueryResult): LatencyType | null {
  const event = row.task_event_type
  if (event && typeof event === 'object') {
    const payload = event as Record<string, unknown>
    if ('tcp_ping' in payload || 'tcpPing' in payload) return 'tcp_ping'
    if ('ping' in payload || 'icmp_ping' in payload || 'icmpPing' in payload) return 'ping'
  }

  const payload = row.task_event_result
  if (payload && typeof payload === 'object') {
    const result = payload as Record<string, unknown>
    if ('tcp_ping' in result || 'tcpPing' in result) return 'tcp_ping'
    if ('ping' in result || 'icmp_ping' in result || 'icmpPing' in result) return 'ping'
  }

  return null
}

export function latencyValue(row: TaskQueryResult, type: LatencyType): number | null {
  if (!row.success) return null
  const payload = row.task_event_result
  if (!payload) return null

  const keys =
    type === 'tcp_ping'
      ? ['tcp_ping', 'tcpPing', 'tcp', 'latency', 'value', 'delay', 'avg', 'min', 'time', 'duration']
      : ['ping', 'icmp_ping', 'icmpPing', 'latency', 'value', 'delay', 'avg', 'min', 'time', 'duration']

  const toNum = (v: unknown) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    if (typeof v === 'string') {
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    return null
  }

  for (const key of keys) {
    const v = toNum(payload[key])
    if (v != null) return v
  }

  for (const v of Object.values(payload)) {
    const top = toNum(v)
    if (top != null) return top
    if (v && typeof v === 'object') {
      const nested = v as Record<string, unknown>
      for (const key of keys) {
        const nv = toNum(nested[key])
        if (nv != null) return nv
      }
    }
  }

  return null
}

function seriesNames(rows: TaskQueryResult[]) {
  const set = new Set<string>()
  for (const r of rows) set.add(latencySeriesName(r))
  return [...set].sort((a, b) => a.localeCompare(b))
}

export interface ChartPoint {
  t: number
  [series: string]: number | null
}

export interface ChartSeries {
  name: string
  color: string
}

function forwardFill(data: ChartPoint[], names: string[]) {
  const last: Record<string, number | null> = {}
  for (const n of names) last[n] = null
  for (const pt of data) {
    for (const n of names) {
      const v = pt[n]
      if (v == null) pt[n] = last[n]
      else last[n] = v
    }
  }
}

export function buildLatencyChart(rows: TaskQueryResult[], type: LatencyType) {
  const names = seriesNames(rows)
  const series: ChartSeries[] = names.map(name => ({ name, color: latencyColor(name) }))
  const byTs = new Map<number, ChartPoint>()

  for (const r of rows) {
    const t = normalizeTs(r.timestamp)
    let pt = byTs.get(t)
    if (!pt) {
      pt = { t }
      for (const n of names) pt[n] = null
      byTs.set(t, pt)
    }
    pt[latencySeriesName(r)] = latencyValue(r, type)
  }

  const data = [...byTs.values()].sort((a, b) => a.t - b.t)
  forwardFill(data, names)
  return { data, series }
}

export interface LatencyStats {
  name: string
  color: string
  avg: number | null
  jitter: number | null
  lossRate: number
}

export function computeLatencyStats(rows: TaskQueryResult[], type: LatencyType): LatencyStats[] {
  const stats = seriesNames(rows).map<LatencyStats>(name => {
    const list = rows.filter(r => latencySeriesName(r) === name)
    const vals: number[] = []
    for (const r of list) {
      const v = latencyValue(r, type)
      if (v != null) vals.push(v)
    }

    const color = latencyColor(name)
    const lossRate = list.length ? ((list.length - vals.length) / list.length) * 100 : 0
    if (!vals.length) return { name, color, avg: null, jitter: null, lossRate }

    const avg = vals.reduce((s, v) => s + v, 0) / vals.length
    const jitter =
      vals.length >= 2
        ? vals.slice(1).reduce((s, v, i) => s + Math.abs(v - vals[i]), 0) / (vals.length - 1)
        : null

    return { name, color, avg, jitter, lossRate }
  })

  return stats.sort((a, b) => {
    const av = a.avg ?? Infinity
    const bv = b.avg ?? Infinity
    if (av !== bv) return av - bv
    const aj = a.jitter ?? Infinity
    const bj = b.jitter ?? Infinity
    if (aj !== bj) return aj - bj
    return a.lossRate - b.lossRate
  })
}
