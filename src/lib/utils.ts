import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date, format = 'dd MMM yyyy'): string {
  // Date-only strings (YYYY-MM-DD) are parsed as UTC midnight by new Date(), which
  // shifts the display date by the UTC offset (e.g. UTC-4 → shows previous day).
  // Appending T12:00:00 forces local-time interpretation.
  const d = typeof date === 'string'
    ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T12:00:00') : new Date(date))
    : date
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export function isToday(date: string | Date): boolean {
  const d = typeof date === 'string' ? new Date(date) : date
  const today = new Date()
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  )
}
