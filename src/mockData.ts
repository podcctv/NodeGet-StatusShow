import type { DynamicSummary, HistorySample, Node, SiteConfig, TaskQueryResult } from './types'

const now = () => Date.now()
const gb = 1024 ** 3

export const MOCK_SOURCE_PRIMARY = 'Mock Beijing'
export const MOCK_SOURCE_SECONDARY = 'Mock Singapore'

export const MOCK_CONFIG: SiteConfig = {
  name: 'NodeGet Mock Theme',
  description: 'Local development mock data',
  repository: 'https://github.com/NodeSeekDev/NodeGet-StatusShow',
  dist_page: 'https://nodeget.pages.dev',
  user_preferences: {
    site_name: 'NodeGet Demo Fleet',
    site_logo: '',
    footer: 'Local mock mode',
  },
  site_tokens: [
    { name: MOCK_SOURCE_PRIMARY, backend_url: 'mock://primary', token: 'MOCK' },
    { name: MOCK_SOURCE_SECONDARY, backend_url: 'mock://secondary', token: 'MOCK' },
  ],
}

function dynamic(uuid: string, i: number, offsetMs = 0): DynamicSummary {
  const totalMemory = [8, 16, 24, 32, 64][i % 5] * gb
  const totalDisk = [80, 120, 240, 512, 1024][i % 5] * gb
  const cpu = 18 + ((i * 13 + Math.floor(now() / 15_000)) % 68)
  const memRatio = 0.22 + ((i * 17) % 48) / 100
  const diskRatio = 0.18 + ((i * 11) % 58) / 100

  return {
    uuid,
    timestamp: now() - offsetMs,
    cpu_usage: cpu,
    used_memory: Math.round(totalMemory * memRatio),
    total_memory: totalMemory,
    available_memory: Math.round(totalMemory * (1 - memRatio)),
    used_swap: i % 3 === 0 ? 256 * 1024 ** 2 : 0,
    total_swap: 2 * gb,
    total_space: totalDisk,
    available_space: Math.round(totalDisk * (1 - diskRatio)),
    read_speed: (2 + i) * 1024 ** 2,
    write_speed: (1 + i) * 1024 ** 2,
    receive_speed: (0.5 + i * 0.45) * 1024 ** 2,
    transmit_speed: (0.35 + i * 0.3) * 1024 ** 2,
    total_received: (120 + i * 45) * gb,
    total_transmitted: (72 + i * 31) * gb,
    load_one: Number((0.2 + i * 0.18).toFixed(2)),
    load_five: Number((0.18 + i * 0.13).toFixed(2)),
    load_fifteen: Number((0.16 + i * 0.1).toFixed(2)),
    uptime: 86_400 * (4 + i * 9) + 3600 * i,
    boot_time: Math.round((now() - 86_400_000 * (4 + i * 9)) / 1000),
    process_count: 90 + i * 17,
    tcp_connections: 140 + i * 28,
    udp_connections: 12 + i * 3,
  }
}

function historyFrom(row: DynamicSummary, i: number): HistorySample[] {
  return Array.from({ length: 36 }, (_, idx) => {
    const wave = Math.sin((idx + i) / 4)
    const cpu = Math.max(2, Math.min(98, (row.cpu_usage ?? 30) + wave * 12))
    const memTotal = row.total_memory || 1
    const diskTotal = row.total_space || 1
    return {
      t: now() - (35 - idx) * 2000,
      cpu,
      mem: ((row.used_memory ?? 0) / memTotal) * 100 + wave * 2,
      disk: ((diskTotal - (row.available_space ?? 0)) / diskTotal) * 100,
      netIn: (row.receive_speed ?? 0) * (0.7 + (idx % 5) * 0.08),
      netOut: (row.transmit_speed ?? 0) * (0.75 + (idx % 4) * 0.07),
    }
  })
}

export function createMockNodes(): Map<string, Node> {
  const seed = [
    ['cn-edge-01', MOCK_SOURCE_PRIMARY, 'CN', 'Beijing Control', ['core', 'china'], 'kvm', 'Ubuntu 24.04 LTS', 'Intel Xeon Gold 6133'],
    ['sg-edge-01', MOCK_SOURCE_SECONDARY, 'SG', 'Singapore Transit', ['edge', 'asia'], 'kvm', 'Debian 12', 'AMD EPYC 7763'],
    ['us-west-01', MOCK_SOURCE_PRIMARY, 'US', 'Los Angeles Gateway', ['cdn', 'america'], 'dedicated', 'Rocky Linux 9', 'AMD Ryzen 7950X'],
    ['de-frankfurt-01', MOCK_SOURCE_SECONDARY, 'DE', 'Frankfurt Storage', ['storage', 'europe'], 'vmware', 'Ubuntu 22.04 LTS', 'Intel Xeon E5-2680 v4'],
    ['jp-tokyo-01', MOCK_SOURCE_PRIMARY, 'JP', 'Tokyo App Node', ['app', 'asia'], 'kvm', 'Alpine Linux 3.20', 'Intel Xeon Silver 4210'],
    ['shared-node', MOCK_SOURCE_PRIMARY, 'HK', 'Hong Kong Shared A', ['duplicate-uuid', 'asia'], 'lxc', 'Debian 12', 'Intel Xeon E-2288G'],
    ['shared-node', MOCK_SOURCE_SECONDARY, 'GB', 'London Shared B', ['duplicate-uuid', 'europe'], 'kvm', 'Ubuntu 24.04 LTS', 'AMD EPYC 7443P'],
    ['au-sydney-01', MOCK_SOURCE_SECONDARY, 'AU', 'Sydney Offline Lab', ['lab', 'offline'], 'kvm', 'Fedora 40', 'Intel Core i7-12700'],
  ] as const

  const map = new Map<string, Node>()
  seed.forEach(([uuid, source, region, name, tags, virtualization, os, cpu], i) => {
    const offline = name.includes('Offline')
    const dyn = offline ? dynamic(uuid, i, 9 * 60_000) : dynamic(uuid, i)
    const id = `${source}::${uuid}`
    map.set(id, {
      id,
      uuid,
      source,
      online: !offline,
      meta: {
        name,
        region,
        tags: [...tags],
        hidden: false,
        virtualization,
        lat: null,
        lng: null,
        order: i,
        price: i % 2 ? 12 + i * 3 : 0,
        priceUnit: '$',
        priceCycle: 30,
        expireTime: i % 2 ? new Date(now() + (12 + i) * 86_400_000).toISOString().slice(0, 10) : '',
      },
      static: {
        uuid,
        timestamp: now(),
        system: {
          system_host_name: name.toLowerCase().replaceAll(' ', '-'),
          system_name: os.split(' ')[0],
          system_os_long_version: os,
          system_kernel_version: '6.8.0-nodeget',
          distribution_id: os.toLowerCase().split(' ')[0],
          arch: 'x86_64',
          virtualization,
        },
        cpu: {
          brand: cpu,
          physical_cores: 4 + (i % 4) * 2,
          logical_cores: 8 + (i % 4) * 4,
        },
      },
      dynamic: dyn,
      history: historyFrom(dyn, i),
    })
  })

  return map
}

function taskRow(
  uuid: string,
  source: string,
  carrier: string,
  type: 'ping' | 'tcp_ping',
  timestamp: number,
  value: number,
  success = true,
): TaskQueryResult {
  return {
    task_id: Math.abs(`${source}-${carrier}-${type}`.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)),
    timestamp,
    uuid,
    __nodeId: `${source}::${uuid}`,
    success,
    cron_source: `${carrier} ${type === 'tcp_ping' ? 'TCP' : 'ICMP'}`,
    task_event_type: { type },
    task_event_result: success ? { [type]: value } : null,
    error_message: success ? null : 'timeout',
  } as TaskQueryResult
}

export function createMockTaskRows(node: Pick<Node, 'uuid' | 'source'>, hours = 24): TaskQueryResult[] {
  const carriers = [
    ['移动', 18],
    ['电信', 28],
    ['联通', 38],
  ] as const
  const rows: TaskQueryResult[] = []
  const points = hours * 6
  for (let i = 0; i < points; i++) {
    const ts = now() - (points - i) * 10 * 60 * 1000
    carriers.forEach(([carrier, base], idx) => {
      const drift = Math.sin((i + idx) / 5) * 8
      const sourceBias = node.source === MOCK_SOURCE_SECONDARY ? 18 : 0
      const value = Math.max(5, Math.round(base + sourceBias + drift + (i % 7)))
      const lost = (i + idx + node.uuid.length) % 29 === 0
      rows.push(taskRow(node.uuid, node.source, carrier, 'tcp_ping', ts, value, !lost))
      if (hours <= 1 || i % 3 === 0) {
        rows.push(taskRow(node.uuid, node.source, carrier, 'ping', ts, Math.max(3, value - 6), !lost))
      }
    })
  }
  return rows
}

export function createMockFleetRows(nodes: Node[]): TaskQueryResult[] {
  return nodes.flatMap(node => createMockTaskRows(node, 24))
}
