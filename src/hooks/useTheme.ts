import { useEffect } from 'react'

export function useTheme() {
  // Cyberpunk theme is always dark
  useEffect(() => {
    document.documentElement.classList.add('dark')
    localStorage.setItem('nodeget.theme', 'dark')
  }, [])

  return { theme: 'dark' as const, toggle: () => {} }
}
