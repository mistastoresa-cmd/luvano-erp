'use client'

import { useRef, useState, type DragEvent } from 'react'
import { ImageSquare, UploadSimple, X } from '@phosphor-icons/react'

const MAX_MB = 4

// Drag-and-drop (or click) image picker. Holds the chosen File in local
// state, shows a live preview, and reports it up so the form can attach it
// to FormData on submit (Vercel Blob upload happens server-side in the
// product action). No upload here — just selection + preview.
export function ImageDropzone({ onFile }: { onFile: (file: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function accept(file: File | undefined) {
    setError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('الملف يجب أن يكون صورة.')
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`حجم الصورة يجب أن يكون أقل من ${MAX_MB} ميجابايت.`)
      return
    }
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(file)
    })
    onFile(file)
  }

  function clear() {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    onFile(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    accept(e.dataTransfer.files?.[0])
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => accept(e.target.files?.[0])}
      />

      {preview ? (
        <div className="relative w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="معاينة"
            className="h-32 w-32 rounded-lg border border-[color:var(--border-subtle)] object-cover"
          />
          <button
            type="button"
            onClick={clear}
            className="absolute -end-2 -top-2 rounded-full bg-danger-600 p-1 text-white shadow"
            aria-label="إزالة الصورة"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragging
              ? 'border-accent-500 bg-accent-500/5'
              : 'border-[color:var(--border-default)] hover:border-accent-400 hover:bg-[color:var(--surface-sunken)]'
          }`}
        >
          <span className="text-accent-600">
            {dragging ? <UploadSimple size={26} weight="bold" /> : <ImageSquare size={26} />}
          </span>
          <span className="text-sm font-medium text-[color:var(--text-secondary)]">
            اسحب صورة المنتج هنا أو اضغط للاختيار
          </span>
          <span className="text-[11px] text-[color:var(--text-tertiary)]">
            PNG أو JPG حتى {MAX_MB} ميجابايت
          </span>
        </button>
      )}

      {error && <p className="mt-1.5 text-xs text-danger-600">{error}</p>}
    </div>
  )
}
