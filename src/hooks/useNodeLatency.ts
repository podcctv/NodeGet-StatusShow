import { useEffect, useState } from 'react'
import { taskQuery } from '../api/methods'
import { latencyTaskType, latencyValue } from '../utils/latency'
import type { BackendPool } from '../api/pool'
import type { LatencyType, TaskQueryResult } from '../types'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const REFRESH_MS = 10_000
const QUERY_TIMEOUT_MS = 20_000
const FALLBACK_LIMIT = 500

function clean(rows: TaskQueryResult[] | undefined): TaskQueryResult[] {
  return (rows ?? [])
    .filter(r => r && r.timestamp)
    .sort((a, b) => a.timestamp - b.timestamp)
}

function matchesLatencyType(row: TaskQueryResult, type: LatencyType) {
  const taskType = latencyTaskType(row)
  if (taskType) return taskType === type
  return latencyValue(row, type) != null
}

function inWindow(row: TaskQueryResult, from: number, to: number) {
  const ts = row.timestamp < 1_000_000_000_000 ? row.timestamp * 1000 : row.timestamp
  return ts >= from && ts <= to
}

function mergeRows(...groups: TaskQueryResult[][]) {
  const map = new Map<string, TaskQueryResult>()
  for (const row of groups.flat()) {
    map.set(`${row.task_id}:${row.timestamp}:${row.uuid}`, row)
  }
  return clean([...map.values()])
}

export function useNodeLatency(
  pool: BackendPool | null,
  source: string | null,
  uuid: string | null,
) {
  const [pingData, setPingData] = useState<TaskQueryResult[]>([])
  const [tcpData, setTcpData] = useState<TaskQueryResult[]>([])
  const [statusData, setStatusData] = useState<TaskQueryResult[]>([])
  const [pingError, setPingError] = useState<string | null>(null)
  const [tcpError, setTcpError] = useState<string | null>(null)
  const [taskReadable, setTaskReadable] = useState(true)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setPingData([])
    setTcpData([])
    setStatusData([])
    setPingError(null)
    setTcpError(null)
    setTaskReadable(true)

    if (!pool || !source || !uuid) return
    const entry = pool.entries.find(e => e.name === source)
    if (!entry) return

    let cancelled = false

    const fetchOnce = async () => {
      const now = Date.now()
      const hourWindow: [number, number] = [now - HOUR_MS, now]
      const dayWindow: [number, number] = [now - DAY_MS, now]
      setLoading(true)

      const [pingHour, tcpHour, pingDay, tcpDay, pingRecent, tcpRecent] = await Promise.allSettled([
        taskQuery(
          entry.client,
          [{ uuid }, { timestamp_from_to: hourWindow }, { type: 'ping' }],
          QUERY_TIMEOUT_MS,
        ),
        taskQuery(
          entry.client,
          [{ uuid }, { timestamp_from_to: hourWindow }, { type: 'tcp_ping' }],
          QUERY_TIMEOUT_MS,
        ),
        taskQuery(
          entry.client,
          [{ uuid }, { timestamp_from_to: dayWindow }, { type: 'ping' }],
          QUERY_TIMEOUT_MS,
        ),
        taskQuery(
          entry.client,
          [{ uuid }, { timestamp_from_to: dayWindow }, { type: 'tcp_ping' }],
          QUERY_TIMEOUT_MS,
        ),
        taskQuery(
          entry.client,
          [{ uuid }, { type: 'ping' }, { limit: FALLBACK_LIMIT }],
          QUERY_TIMEOUT_MS,
        ),
        taskQuery(
          entry.client,
          [{ uuid }, { type: 'tcp_ping' }, { limit: FALLBACK_LIMIT }],
          QUERY_TIMEOUT_MS,
        ),
      ])

      if (cancelled) return
      const toMessage = (r: PromiseSettledResult<unknown>) =>
        r.status === 'rejected'
          ? r.reason instanceof Error ? r.reason.message : String(r.reason)
          : null
      const pingErrors = [pingHour, pingDay, pingRecent].map(toMessage).filter(Boolean) as string[]
      const tcpErrors = [tcpHour, tcpDay, tcpRecent].map(toMessage).filter(Boolean) as string[]
      const denied = [...pingErrors, ...tcpErrors].some(e => /permission denied|missing task/i.test(e))
      setPingError(pingErrors[0] ?? null)
      setTcpError(tcpErrors[0] ?? null)
      setTaskReadable(!denied)

      const fallbackRows = mergeRows(
        pingRecent.status === 'fulfilled' ? pingRecent.value : [],
        tcpRecent.status === 'fulfilled' ? tcpRecent.value : [],
      ).filter(r => inWindow(r, dayWindow[0], dayWindow[1]))

      const fallbackPing = fallbackRows.filter(r => matchesLatencyType(r, 'ping'))
      const fallbackTcp = fallbackRows.filter(r => matchesLatencyType(r, 'tcp_ping'))

      const nextPingHour = mergeRows(
        pingHour.status === 'fulfilled' ? pingHour.value : [],
        fallbackPing.filter(r => inWindow(r, hourWindow[0], hourWindow[1])),
      )
      const nextTcpHour = mergeRows(
        tcpHour.status === 'fulfilled' ? tcpHour.value : [],
        fallbackTcp.filter(r => inWindow(r, hourWindow[0], hourWindow[1])),
      )
      const nextPingDay = mergeRows(pingDay.status === 'fulfilled' ? pingDay.value : [], fallbackPing)
      const nextTcpDay = mergeRows(tcpDay.status === 'fulfilled' ? tcpDay.value : [], fallbackTcp)

      setPingData(nextPingHour)
      setTcpData(nextTcpHour)
      setStatusData(mergeRows(nextPingDay, nextTcpDay))
      setLoading(false)
    }

    fetchOnce()
    const timer = setInterval(fetchOnce, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [pool, source, uuid])

  return { pingData, tcpData, statusData, loading, pingError, tcpError, taskReadable }
}
