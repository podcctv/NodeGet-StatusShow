import { useEffect, useMemo, useState } from 'react'
import { taskQuery } from '../api/methods'
import { computeLatencyStats, latencySeriesName, latencyValue } from '../utils/latency'
import type { BackendPool } from '../api/pool'
import type { Node, TaskQueryResult } from '../types'

const REFRESH_MS = 60_000
const QUERY_TIMEOUT_MS = 15_000
const PER_NODE_LIMIT = 24
const MAX_NODES = 32

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

export function useFleetTcpPing(pool: BackendPool | null, nodes: Node[]) {
  const [rows, setRows] = useState<TaskQueryResult[]>([])
  const [loading, setLoading] = useState(false)
  const [readable, setReadable] = useState(true)

  const ids = useMemo(
    () => nodes.filter(n => n.online).slice(0, MAX_NODES).map(n => ({ source: n.source, uuid: n.uuid })),
    [nodes],
  )
  const idsKey = useMemo(() => ids.map(id => `${id.source}:${id.uuid}`).join('|'), [ids])

  useEffect(() => {
    setReadable(true)
    if (!pool || !ids.length) return
    let cancelled = false

    const fetchOnce = async () => {
      setLoading(true)
      const jobs = ids.flatMap(({ source, uuid }) => {
        const entry = pool.entries.find(e => e.name === source)
        if (!entry) return []
        return taskQuery(
          entry.client,
          [{ uuid }, { type: 'tcp_ping' }, { limit: PER_NODE_LIMIT }],
          QUERY_TIMEOUT_MS,
        )
      })

      const settled = await Promise.allSettled(jobs)
      if (cancelled) return

      const denied = settled.some(
        r => r.status === 'rejected' && /permission denied|missing task/i.test(r.reason instanceof Error ? r.reason.message : String(r.reason)),
      )
      setReadable(!denied)
      const nextRows = mergeRows(settled.flatMap(r => r.status === 'fulfilled' ? [r.value] : []))
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

    const out = new Map<string, Array<{ name: string; avg: number | null; loss: number | null; count: number }>>()
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
        return { name, avg, loss, count: group.length }
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
      return { name, avg, loss, count: list.length }
    })
  }, [rows])

  return { carriers, byUuid, loading, readable, hasData: rows.length > 0 }
}
