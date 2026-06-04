import { useEffect, useState } from 'react'
import type { SiteConfig } from '../types'
import { useUserConfig } from './useUserConfig'
import { useThemeConfig } from './useThemeConfig'
import { MOCK_CONFIG } from '../mockData'

const devMockEnabled =
  import.meta.env.DEV &&
  (import.meta.env.NODEGET_MOCK === 'true' || import.meta.env.NODEGET_MOCK !== 'false')

export function useConfig() {
  const { config: userConfig, error: userError } = useUserConfig()
  const { config: themeConfig, error: themeError } = useThemeConfig()
  const [config, setConfig] = useState<SiteConfig | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (devMockEnabled && (import.meta.env.NODEGET_MOCK === 'true' || userError)) {
      const merged = { ...themeConfig, ...MOCK_CONFIG } as SiteConfig
      setConfig(merged)
      setError(null)
      return
    }

    if (userError) {
      setError(userError)
      return
    }
    if (themeError) {
      setError(themeError)
      return
    }

    if (userConfig && themeConfig) {
      const merged = { ...themeConfig, ...userConfig } as SiteConfig
      setConfig(merged)
      setError(null)
    }
  }, [userConfig, themeConfig, userError, themeError])

  return { config, error }
}
