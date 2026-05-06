import { useEffect, useMemo, useState } from 'react'
import { taskQuery } from '../api/methods'
import { computeLatencyStats, latencySeriesName, latencyTaskType, latencyValue } from '../utils/latency'
import type { BackendPool } from '../api/pool'
import type { Node, TaskQueryResult } from '../types'
import type { HourlyBucket } from '../components/FleetTcpPingPanel'

const REFRESH_MS = 60_000
const QUERY_TIMEOUT_MS = 20_000
const MAX_NODES = 160
const DAY_MS = 24 * 60 * 60 * 1000
const GLOBAL_LIMIT = 5000
/** Delay before first ping fetch — let main data render first */
const INITIAL_DELAY_MS = 3000

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

function isTcpPingRow(row: TaskQueryResult): boolean {
  const taskType = latencyTaskType(row)
  if (taskType) return taskType === 'tcp_ping'
  return latencyValue(row, 'tcp_ping') != null
}

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

  const uuidSet = useMemo(
    () => new Set(nodes.slice(0, MAX_NODES).map(n => n.uuid)),
    [nodes],
  )
  const uuidKey = useMemo(() => [...uuidSet].sort().join('|'), [uuidSet])

  useEffect(() => {
    setReadable(true)
    if (!pool || !uuidSet.size) return
    let cancelled = false

    const fetchOnce = async () => {
      setLoading(true)
      const now = Date.now()
      const dayWindow: [number, number] = [now - DAY_MS, now]

      // Query all tcp_ping tasks globally per backend (not per-node)
      const jobs = pool.entries.flatMap(entry => [
        taskQuery(
          entry.client,
          [{ timestamp_from_to: dayWindow }, { type: 'tcp_ping' }],
          QUERY_TIMEOUT_MS,
        ),
        taskQuery(
          entry.client,
          [{ type: 'tcp_ping' }, { limit: GLOBAL_LIMIT }],
          QUERY_TIMEOUT_MS,
        ),
        taskQuery(
          entry.client,
          [{ timestamp_from_to: dayWindow }, { limit: GLOBAL_LIMIT }],
          QUERY_TIMEOUT_MS,
        ),
      ])

      const settled = await Promise.allSettled(jobs)
      if (cancelled) return

      const denied = settled.some(
        r => r.status === 'rejected' && /permission denied|missing task/i.test(
          r.reason instanceof Error ? r.reason.message : String(r.reason),
        ),
      )
      setReadable(!denied)

      const allRows = mergeRows(settled.flatMap(r => r.status === 'fulfilled' ? [r.value] : []))
      const nextRows = allRows.filter(r => isTcpPingRow(r) && uuidSet.has(r.uuid))

      setRows(prev => {
        if (!nextRows.length) return prev
        const combined = mergeRows([prev, nextRows])
        const dayAgo = Date.now() - DAY_MS
        return combined.filter(r => {
          const ts = r.timestamp < 1_000_000_000_000 ? r.timestamp * 1000 : r.timestamp
          return ts >= dayAgo
        })
      })
      setLoading(false)
    }

    // ★ Delay initial fetch so main node data renders first
    const initialTimer = setTimeout(() => {
      if (cancelled) return
      fetchOnce()
    }, INITIAL_DELAY_MS)

    // Then refresh periodically
    const refreshTimer = setTimeout(() => {
      if (cancelled) return
      const interval = setInterval(() => {
        if (!cancelled) fetchOnce()
      }, REFRESH_MS)
      // Store for cleanup
      cleanupInterval = interval
    }, INITIAL_DELAY_MS + 1000)

    let cleanupInterval: ReturnType<typeof setInterval> | null = null

    return () => {
      cancelled = true
      clearTimeout(initialTimer)
      clearTimeout(refreshTimer)
      if (cleanupInterval) clearInterval(cleanupInterval)
    }
  }, [pool, uuidKey])

  // Raw rows per UUID — for online status strip (includes success AND failure rows)
  const rawByUuid = useMemo(() => {
    const map = new Map<string, TaskQueryResult[]>()
    for (const row of rows) {
      const list = map.get(row.uuid) ?? []
      list.push(row)
      map.set(row.uuid, list)
    }
    return map
  }, [rows])

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

  return { carriers, byUuid, rawByUuid, loading, readable, hasData: rows.length > 0 }
}
