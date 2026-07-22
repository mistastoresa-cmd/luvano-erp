'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from '@phosphor-icons/react'
import { Button } from './ui/button'

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('luvano-theme')
    const dark = stored === 'dark'
    setIsDark(dark)
    document.documentElement.classList.toggle('dark', dark)
  }, [])

  function toggle() {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('luvano-theme', next ? 'dark' : 'light')
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="تبديل المظهر">
      {isDark ? <Sun size={18} weight="bold" /> : <Moon size={18} weight="bold" />}
    </Button>
  )
}
