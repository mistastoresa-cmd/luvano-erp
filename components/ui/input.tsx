import type { InputHTMLAttributes } from 'react'
import { cn } from './utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] px-3 text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-tertiary)] outline-none transition-colors focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20',
        className
      )}
      {...props}
    />
  )
}
