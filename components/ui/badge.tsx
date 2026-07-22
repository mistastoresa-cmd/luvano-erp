import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from './utils'

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      neutral: 'bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)]',
      success: 'bg-success-500/12 text-success-600',
      warning: 'bg-warning-500/14 text-warning-600',
      danger: 'bg-danger-500/12 text-danger-600',
      accent: 'bg-accent-500/12 text-accent-600',
    },
  },
  defaultVariants: { variant: 'neutral' },
})

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
