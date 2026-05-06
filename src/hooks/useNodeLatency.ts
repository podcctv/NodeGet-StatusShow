import { useEffect, useRef, useState } from 'react'
import { taskCreateBlocking, taskQuery } from '../api/methods'
import { latencyTaskType, latencyValue } from '../utils/latency'
import type { BackendPool } from '../api/pool'
import type { LatencyType, TaskQueryResult } from '../types'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const REFRESH_MS = 10_000
const QUERY_TIMEOUT_MS = 20_000
const FALLBACK_LIMIT = 500
const LIVE_PROBE_INTERVAL_MS = 60_000
const LIVE_PROBE_TIMEOUT_MS = 8_000

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

function probeTarget(backendUrl: string) {
  try {
    const u = new URL(backendUrl)
    const host = u.hostname
    if (!host) return null
    const port = u.port || (u.protocol === 'wss:' || u.protocol === 'https:' ? '443' : '80')
    return { ping: host, tcp: `${host}:${port}` }
  } catch {
    return null
  }
}

function probeRow(
  uuid: string,
  type: LatencyType,
  target: string,
  result: Awaited<ReturnType<typeof taskCreateBlocking>>,
): TaskQueryResult {
  return {
    task_id: result.task_id,
    uuid,
    timestamp: result.timestamp,
    success: result.success,
    error_message: result.error_message,
    cron_source: '实时探测',
    task_event_type: { [type]: target },
    task_event_result: result.task_event_result,
  }
}

export function useNodeLatency(
  pool: BackendPool | null,
  source: string | null,
  uuid: string | null,
) {
  const [pingData, setPingData] = useState<TaskQueryResult[]>([])
  const [tcpData, setTcpData] = useState<TaskQueryResult[]>([])
  const [statusData, setStatusData] = useState<TaskQueryResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const lastProbeAt = useRef(0)

  useEffect(() => {
    setPingData([])
    setTcpData([])
    setStatusData([])
    setError(null)
    lastProbeAt.current = 0

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
      const queryErrors = [pingHour, tcpHour, pingDay, tcpDay, pingRecent, tcpRecent]
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map(r => r.reason instanceof Error ? r.reason.message : String(r.reason))
      setError(queryErrors[0] ?? null)

      const fallbackRows = mergeRows(
        pingRecent.status === 'fulfilled' ? pingRecent.value : [],
        tcpRecent.status === 'fulfilled' ? tcpRecent.value : [],
      ).filter(r => inWindow(r, dayWindow[0], dayWindow[1]))

      const fallbackPing = fallbackRows.filter(r => matchesLatencyType(r, 'ping'))
      const fallbackTcp = fallbackRows.filter(r => matchesLatencyType(r, 'tcp_ping'))

      let nextPingHour = mergeRows(
        pingHour.status === 'fulfilled' ? pingHour.value : [],
        fallbackPing.filter(r => inWindow(r, hourWindow[0], hourWindow[1])),
      )
      let nextTcpHour = mergeRows(
        tcpHour.status === 'fulfilled' ? tcpHour.value : [],
        fallbackTcp.filter(r => inWindow(r, hourWindow[0], hourWindow[1])),
      )
      let nextPingDay = mergeRows(pingDay.status === 'fulfilled' ? pingDay.value : [], fallbackPing)
      let nextTcpDay = mergeRows(tcpDay.status === 'fulfilled' ? tcpDay.value : [], fallbackTcp)

      const shouldProbe = (!nextPingHour.length || !nextTcpHour.length) && now - lastProbeAt.current > LIVE_PROBE_INTERVAL_MS
      const target = shouldProbe ? probeTarget(entry.backend_url) : null
      if (target) {
        lastProbeAt.current = now
        const [pingProbe, tcpProbe] = await Promise.allSettled([
          !nextPingHour.length
            ? taskCreateBlocking(entry.client, uuid, { ping: target.ping }, LIVE_PROBE_TIMEOUT_MS)
            : Promise.resolve(null),
          !nextTcpHour.length
            ? taskCreateBlocking(entry.client, uuid, { tcp_ping: target.tcp }, LIVE_PROBE_TIMEOUT_MS)
            : Promise.resolve(null),
        ])

        if (cancelled) return
        const probeErrors = [pingProbe, tcpProbe]
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .map(r => r.reason instanceof Error ? r.reason.message : String(r.reason))
        if (probeErrors.length) setError(probeErrors[0])

        if (pingProbe.status === 'fulfilled' && pingProbe.value) {
          const row = probeRow(uuid, 'ping', target.ping, pingProbe.value)
          nextPingHour = mergeRows(nextPingHour, [row])
          nextPingDay = mergeRows(nextPingDay, [row])
        }
        if (tcpProbe.status === 'fulfilled' && tcpProbe.value) {
          const row = probeRow(uuid, 'tcp_ping', target.tcp, tcpProbe.value)
          nextTcpHour = mergeRows(nextTcpHour, [row])
          nextTcpDay = mergeRows(nextTcpDay, [row])
        }
      }

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

  return { pingData, tcpData, statusData, loading, error }
}
