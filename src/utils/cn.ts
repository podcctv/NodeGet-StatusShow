import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function loadColor(v?: number | null) {
  if (v == null || !Number.isFinite(v)) return 'bg-muted-foreground/40'
  if (v >= 90) return 'bg-gradient-to-r from-rose-500 via-orange-500 to-amber-400'
  if (v >= 70) return 'bg-gradient-to-r from-amber-400 to-yellow-300'
  return 'bg-gradient-to-r from-sky-500 to-cyan-300'
}

export function loadTextColor(v?: number | null) {
  if (v == null || !Number.isFinite(v)) return 'text-muted-foreground'
  if (v >= 90) return 'text-rose-300'
  if (v >= 70) return 'text-amber-300'
  return 'text-cyan-300'
}

export function strokeColor(v?: number | null) {
  if (v == null || !Number.isFinite(v)) return 'stroke-muted-foreground/40'
  if (v >= 90) return 'stroke-rose-500'
  if (v >= 70) return 'stroke-amber-500'
  return 'stroke-sky-500'
}
