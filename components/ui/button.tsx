import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from './utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary: 'bg-accent-600 text-white hover:bg-accent-700',
        secondary:
          'bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] border border-[color:var(--border-default)] hover:bg-[color:var(--surface-sunken)]',
        ghost: 'text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-sunken)]',
        danger: 'bg-danger-600 text-white hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
