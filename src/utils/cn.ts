import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function loadColor(v?: number | null) {
  if (v == null || !Number.isFinite(v)) return 'bg-muted-foreground/40'
  if (v >= 90) return 'bg-rose-500'
  if (v >= 70) return 'bg-amber-500'
  return 'bg-emerald-500'
}

export function loadTextColor(v?: number | null) {
  if (v == null || !Number.isFinite(v)) return 'text-muted-foreground'
  if (v >= 90) return 'text-rose-300'
  if (v >= 70) return 'text-amber-300'
  return 'text-emerald-300'
}

export function strokeColor(v?: number | null) {
  if (v == null || !Number.isFinite(v)) return 'stroke-muted-foreground/40'
  if (v >= 90) return 'stroke-rose-500'
  if (v >= 70) return 'stroke-amber-500'
  return 'stroke-emerald-500'
}
