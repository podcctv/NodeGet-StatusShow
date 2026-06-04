import { useEffect, useMemo, useState } from 'react'
import { taskQuery } from '../api/methods'
import { computeLatencyStats, latencySeriesName, latencyTaskType, latencyValue } from '../utils/latency'
import { createMockFleetRows } from '../mockData'
import type { BackendPool } from '../api/pool'
import type { Node, TaskQueryResult } from '../types'
import type { HourlyBucket } from '../components/FleetTcpPingPanel'

const REFRESH_MS = 60_000
const QUERY_TIMEOUT_MS = 20_000
const MAX_NODES = 160
const QUERY_CONCURRENCY = 6
const DAY_MS = 24 * 60 * 60 * 1000
const INITIAL_DELAY_MS = 3000

const DB_NAME = 'NodeGetCache'
const STORE_NAME = 'tcp_ping'
const DB_VERSION = 1

type CachedTaskRow = TaskQueryResult & { __nodeId?: string }

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function saveRowsToCache(rows: TaskQueryResult[]) {
  try {
    const db = await getDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(rows, 'latest_rows')
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn('Failed to save tcp_ping cache to IDB:', e)
  }
}

async function loadRowsFromCache(): Promise<TaskQueryResult[]> {
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get('latest_rows')
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('Failed to load tcp_ping cache from IDB:', e)
    return []
  }
}

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
  for (const row of groups.flat()) {
    map.set(`${nodeKey(row)}:${row.task_id}:${row.timestamp}`, row)
  }
  return clean([...map.values()])
}

function normalizeTs(ts: number) {
  return ts < 1_000_000_000_000 ? ts * 1000 : ts
}

function nodeKey(row: TaskQueryResult) {
  return String((row as CachedTaskRow).__nodeId ?? row.uuid)
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

async function runLimited(jobs: Array<() => Promise<void>>, limit: number) {
  let index = 0
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (index < jobs.length) {
      const job = jobs[index++]
      await job()
    }
  })
  await Promise.allSettled(workers)
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

  const targets = useMemo(
    () => nodes.slice(0, MAX_NODES).map(n => ({ id: n.id, uuid: n.uuid, source: n.source })),
    [nodes],
  )
  const targetKey = useMemo(() => targets.map(t => t.id).sort().join('|'), [targets])
  const targetIds = useMemo(() => new Set(targets.map(t => t.id)), [targets])

  useEffect(() => {
    if (rows.length > 0) saveRowsToCache(rows)
  }, [rows])

  useEffect(() => {
    setReadable(true)

    if (!targets.length) {
      setRows([])
      setLoading(false)
      return
    }

    if (!pool) {
      setRows(createMockFleetRows(nodes.slice(0, MAX_NODES)))
      setLoading(false)
      return
    }

    let cancelled = false

    loadRowsFromCache().then(cached => {
      if (cancelled) return
      const dayAgo = Date.now() - DAY_MS
      const validCached = cached.filter(r => {
        const ts = normalizeTs(r.timestamp)
        return ts >= dayAgo && targetIds.has(nodeKey(r))
      })
      if (validCached.length > 0) {
        setRows(prev => (prev.length === 0 ? validCached : mergeRows([validCached, prev])))
      }
    })

    const fetchOnce = async () => {
      setLoading(true)
      const now = Date.now()
      const dayWindow: [number, number] = [now - DAY_MS, now]
      const jobs = targets.flatMap(target => {
        const entry = pool.entries.find(e => e.name === target.source)
        if (!entry) return []

        return [async () => {
          if (cancelled) return
          try {
            const res = await taskQuery(
              entry.client,
              [{ uuid: target.uuid }, { timestamp_from_to: dayWindow }, { type: 'tcp_ping' }, { limit: 15000 }],
              QUERY_TIMEOUT_MS,
            )
            if (cancelled) return

            const validRows = (res ?? [])
              .filter(r => isTcpPingRow(r))
              .map(r => ({ ...r, __nodeId: target.id } as TaskQueryResult))
            if (validRows.length > 0) {
              setRows(prev => {
                const combined = mergeRows([prev, validRows])
                const dayAgo = Date.now() - DAY_MS
                return combined.filter(r => normalizeTs(r.timestamp) >= dayAgo && targetIds.has(nodeKey(r)))
              })
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (/permission denied|missing task/i.test(msg)) setReadable(false)
          }
        }]
      })

      await runLimited(jobs, QUERY_CONCURRENCY)
      if (!cancelled) setLoading(false)
    }

    const initialTimer = setTimeout(() => {
      if (!cancelled) fetchOnce()
    }, INITIAL_DELAY_MS)
    const refreshTimer = setTimeout(() => {
      if (cancelled) return
      cleanupInterval = setInterval(fetchOnce, REFRESH_MS)
    }, INITIAL_DELAY_MS + 1000)
    let cleanupInterval: ReturnType<typeof setInterval> | null = null

    return () => {
      cancelled = true
      clearTimeout(initialTimer)
      clearTimeout(refreshTimer)
      if (cleanupInterval) clearInterval(cleanupInterval)
    }
  }, [pool, targetKey, targetIds, targets, nodes])

  const rawByUuid = useMemo(() => {
    const map = new Map<string, TaskQueryResult[]>()
    for (const row of rows) {
      const key = nodeKey(row)
      const list = map.get(key) ?? []
      list.push(row)
      map.set(key, list)
    }
    return map
  }, [rows])

  const byUuid = useMemo(() => {
    const nodeMap = new Map<string, TaskQueryResult[]>()
    for (const row of rows) {
      const value = latencyValue(row, 'tcp_ping')
      if (value == null) continue
      const key = nodeKey(row)
      const list = nodeMap.get(key) ?? []
      list.push(row)
      nodeMap.set(key, list)
    }

    const out = new Map<string, CarrierRow[]>()
    for (const [key, list] of nodeMap) {
      const groups = new Map<string, TaskQueryResult[]>()
      for (const row of list) {
        const carrier = carrierOf(latencySeriesName(row))
        const group = groups.get(carrier) ?? []
        group.push(row)
        groups.set(carrier, group)
      }
      out.set(key, ['移动', '电信', '联通'].map(name => {
        const group = groups.get(name) ?? []
        const stats = computeLatencyStats(group, 'tcp_ping')
        const vals = stats.flatMap(s => (s.avg == null ? [] : [s.avg]))
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
      const vals = stats.flatMap(s => (s.avg == null ? [] : [s.avg]))
      const avg = vals.length ? vals.reduce((sum, v) => sum + v, 0) / vals.length : null
      const loss = stats.length ? stats.reduce((sum, s) => sum + s.lossRate, 0) / stats.length : null
      const hourly = computeHourlyBuckets(list, 'tcp_ping')
      return { name, avg, loss, count: list.length, hourly }
    })
  }, [rows])

  return { carriers, byUuid, rawByUuid, loading, readable, hasData: rows.length > 0 }
}
