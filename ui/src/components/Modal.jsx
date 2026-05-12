import { useEffect } from 'react'

export default function Modal({ title, onClose, children, footer, wide, visible = true }) {
  useEffect(() => {
    if (!visible) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, visible])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={visible ? undefined : { display: 'none' }}
    >
      <div
        className="absolute inset-0 bg-black/35 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`cofounder-skin relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-co-lg border border-co-fg/10 bg-co-surface shadow-2xl ${
          wide ? 'max-w-2xl' : 'max-w-lg'
        }`}
      >
        {/* Accent stripe */}
        <div
          aria-hidden
          className="h-0.5 w-full opacity-60"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgb(var(--co-accent-rgb)), transparent)',
          }}
        />
        {/* Header */}
        <div className="flex items-center justify-between border-b border-co-fg/10 px-6 py-4">
          <h2 className="text-base font-semibold tracking-tight text-co-fg">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-co-sm text-co-fg/40 transition-colors hover:bg-co-fg/[0.06] hover:text-co-fg"
            title="Close (Esc)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2 rounded-b-co-lg border-t border-co-fg/10 bg-co-bg/40 px-6 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
