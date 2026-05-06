import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function loadColor(v?: number | null) {
  if (v == null || !Number.isFinite(v)) return 'bg-muted-foreground/40'
  if (v >= 100) return 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]'
  if (v >= 90) return 'bg-orange-500'
  if (v >= 70) return 'bg-amber-400'
  return 'bg-foreground'
}

export function loadTextColor(v?: number | null) {
  if (v == null || !Number.isFinite(v)) return 'text-muted-foreground'
  if (v >= 100) return 'text-rose-500'
  if (v >= 90) return 'text-orange-500'
  if (v >= 70) return 'text-amber-400'
  return 'text-foreground'
}

export function strokeColor(v?: number | null) {
  if (v == null || !Number.isFinite(v)) return 'stroke-muted-foreground/40'
  if (v >= 90) return 'stroke-rose-500'
  if (v >= 70) return 'stroke-amber-500'
  return 'stroke-sky-500'
}
