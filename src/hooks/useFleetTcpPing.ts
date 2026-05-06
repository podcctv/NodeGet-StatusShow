import { useEffect, useMemo, useState } from 'react'
import { taskQuery } from '../api/methods'
import { computeLatencyStats, latencySeriesName, latencyTaskType, latencyValue } from '../utils/latency'
import type { BackendPool } from '../api/pool'
import type { Node, TaskQueryResult } from '../types'
import type { HourlyBucket } from '../components/FleetTcpPingPanel'

const REFRESH_MS = 60_000
const QUERY_TIMEOUT_MS = 15_000
/** Limit for the typed query (type: tcp_ping) */
const TYPED_LIMIT = 100
/** Limit for the untyped fallback query (all task types) */
const FALLBACK_LIMIT = 60
const MAX_NODES = 160

function clean(rows: TaskQueryResult[] | undefined): TaskQueryResult[] {
  return (rows ?? [])
    .filter(r => r && r.timestamp)
    .sort((a, b) => a.timestamp - b.timestamp)
}

function carrierOf(name: string) {
  const s = name.toLowerCase()
  if (/移动|mobile|cmcc/.test(s)) return '移动'
  if (/电信|telecom|ctcc|chinanet/.test(s)) return '电信'
  if (/联通|unicom|cucc/.test(s)) return '联通'
  return '其他'
}

function mergeRows(groups: TaskQueryResult[][]) {
  const map = new Map<string, TaskQueryResult>()
  for (const row of groups.flat()) map.set(`${row.task_id}:${row.timestamp}:${row.uuid}`, row)
  return clean([...map.values()])
}

function normalizeTs(ts: number) {
  return ts < 1_000_000_000_000 ? ts * 1000 : ts
}

/**
 * Check if a row matches tcp_ping — mirrors the detail page's matchesLatencyType logic.
 * First checks the task_event_type label, then falls back to checking if we can
 * extract a latency value from the result.
 */
function isTcpPingRow(row: TaskQueryResult): boolean {
  const taskType = latencyTaskType(row)
  if (taskType) return taskType === 'tcp_ping'
  // Fallback: if no explicit type, check if we can extract a tcp_ping value
  return latencyValue(row, 'tcp_ping') != null
}

/** Compute hourly buckets (24 hours) from task query results */
function computeHourlyBuckets(rows: TaskQueryResult[], type: 'tcp_ping'): HourlyBucket[] {
  const buckets: { sum: number; count: number }[] = Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }))

  for (const row of rows) {
    const val = latencyValue(row, type)
    if (val == null) continue
    const ms = normalizeTs(row.timestamp)
    const hour = new Date(ms).getHours()
    buckets[hour].sum += val
    buckets[hour].count += 1
  }

  return buckets.map((b, i) => ({
    hour: i,
    avg: b.count > 0 ? b.sum / b.count : null,
    count: b.count,
  }))
}

export interface CarrierRow {
  name: string
  avg: number | null
  loss: number | null
  count: number
  hourly?: HourlyBucket[]
}

export function useFleetTcpPing(pool: BackendPool | null, nodes: Node[]) {
  const [rows, setRows] = useState<TaskQueryResult[]>([])
  const [loading, setLoading] = useState(false)
  const [readable, setReadable] = useState(true)

  const ids = useMemo(
    () => nodes.slice(0, MAX_NODES).map(n => ({ source: n.source, uuid: n.uuid })),
    [nodes],
  )
  const idsKey = useMemo(() => ids.map(id => `${id.source}:${id.uuid}`).join('|'), [ids])

  useEffect(() => {
    setReadable(true)
    if (!pool || !ids.length) return
    let cancelled = false

    const fetchOnce = async () => {
      setLoading(true)

      // For each node fire TWO queries:
      //   1) typed:   { type: 'tcp_ping', limit: TYPED_LIMIT }   — fast path
      //   2) untyped: { limit: FALLBACK_LIMIT }                   — fallback for backends
      //      that don't support the type condition filter
      const jobs = ids.flatMap(({ source, uuid }) => {
        const entry = pool.entries.find(e => e.name === source)
        if (!entry) return []
        return [
          taskQuery(
            entry.client,
            [{ uuid }, { type: 'tcp_ping' }, { limit: TYPED_LIMIT }],
            QUERY_TIMEOUT_MS,
          ),
          taskQuery(
            entry.client,
            [{ uuid }, { limit: FALLBACK_LIMIT }],
            QUERY_TIMEOUT_MS,
          ),
        ]
      })

      const settled = await Promise.allSettled(jobs)
      if (cancelled) return

      const denied = settled.some(
        r => r.status === 'rejected' && /permission denied|missing task/i.test(r.reason instanceof Error ? r.reason.message : String(r.reason)),
      )
      setReadable(!denied)

      // Merge all results, then client-side filter for tcp_ping rows only
      const allRows = mergeRows(settled.flatMap(r => r.status === 'fulfilled' ? [r.value] : []))
      const nextRows = allRows.filter(isTcpPingRow)

      setRows(prev => nextRows.length ? nextRows : prev)
      setLoading(false)
    }

    fetchOnce()
    const timer = setInterval(fetchOnce, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [pool, idsKey])

  const byUuid = useMemo(() => {
    const nodeMap = new Map<string, TaskQueryResult[]>()
    for (const row of rows) {
      const value = latencyValue(row, 'tcp_ping')
      if (value == null) continue
      const list = nodeMap.get(row.uuid) ?? []
      list.push(row)
      nodeMap.set(row.uuid, list)
    }

    const out = new Map<string, CarrierRow[]>()
    for (const [uuid, list] of nodeMap) {
      const groups = new Map<string, TaskQueryResult[]>()
      for (const row of list) {
        const carrier = carrierOf(latencySeriesName(row))
        const group = groups.get(carrier) ?? []
        group.push(row)
        groups.set(carrier, group)
      }
      out.set(uuid, ['移动', '电信', '联通'].map(name => {
        const group = groups.get(name) ?? []
        const stats = computeLatencyStats(group, 'tcp_ping')
        const vals = stats.flatMap(s => s.avg == null ? [] : [s.avg])
        const avg = vals.length ? vals.reduce((sum, v) => sum + v, 0) / vals.length : null
        const loss = stats.length ? stats.reduce((sum, s) => sum + s.lossRate, 0) / stats.length : null
        const hourly = computeHourlyBuckets(group, 'tcp_ping')
        return { name, avg, loss, count: group.length, hourly }
      }))
    }
    return out
  }, [rows])

  const carriers = useMemo(() => {
    const groups = new Map<string, TaskQueryResult[]>()
    for (const row of rows) {
      const value = latencyValue(row, 'tcp_ping')
      if (value == null) continue
      const carrier = carrierOf(latencySeriesName(row))
      const list = groups.get(carrier) ?? []
      list.push(row)
      groups.set(carrier, list)
    }

    return ['移动', '电信', '联通'].map(name => {
      const list = groups.get(name) ?? []
      const stats = computeLatencyStats(list, 'tcp_ping')
      const vals = stats.flatMap(s => s.avg == null ? [] : [s.avg])
      const avg = vals.length ? vals.reduce((sum, v) => sum + v, 0) / vals.length : null
      const loss = stats.length ? stats.reduce((sum, s) => sum + s.lossRate, 0) / stats.length : null
      const hourly = computeHourlyBuckets(list, 'tcp_ping')
      return { name, avg, loss, count: list.length, hourly }
    })
  }, [rows])

  return { carriers, byUuid, loading, readable, hasData: rows.length > 0 }
}
