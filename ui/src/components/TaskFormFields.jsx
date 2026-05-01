import { useRef, useEffect, useCallback } from 'react'
import PromptEvaluator from './PromptEvaluator'
import FolderPicker from './FolderPicker'

/**
 * Shared form fields: description textarea + PromptEvaluator + target repo FolderPicker.
 * Used in Tasks, Queue, and Investigate pages.
 */
export default function TaskFormFields({
  description,
  onDescriptionChange,
  targetRepo,
  onTargetChange,
  mode = 'task',
  descriptionLabel = 'Description',
  placeholder = '',
  rows = 3,
  autoFocus = false,
  onSubmit,
  targetRequired = false,
  ticketId,
  onTicketChange,
}) {
  const textareaRef = useRef(null)

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    // min ~3 rows (72px), max 280px — then scroll
    el.style.height = Math.min(Math.max(el.scrollHeight, 72), 280) + 'px'
  }, [])

  useEffect(() => { autoResize() }, [description, autoResize])

  return (
    <div className="space-y-4">
      {/* Description */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
            {descriptionLabel} <span className="text-red-400">*</span>
          </label>
          {description.trim().length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {description.trim().length} chars
            </span>
          )}
        </div>
        <textarea
          ref={textareaRef}
          rows={rows}
          value={description}
          onChange={e => { onDescriptionChange(e.target.value) }}
          onKeyDown={e => { if (onSubmit && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit() }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 focus:bg-white dark:focus:bg-gray-800 outline-none resize-none overflow-y-auto transition-colors shadow-inner shadow-gray-100 dark:shadow-none"
          style={{ maxHeight: 280 }}
        />
      </div>

      {/* Target repo */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
          Target Repository{' '}
          {targetRequired
            ? <span className="text-red-400">*</span>
            : <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
          }
        </label>
        <FolderPicker value={targetRepo} onChange={onTargetChange} />
      </div>

      {/* Ticket ID (optional) — used as folder name */}
      {onTicketChange && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
            Ticket ID <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={ticketId || ''}
            onChange={e => onTicketChange(e.target.value)}
            placeholder="e.g. PROJ-123, #456, sprint-1-auth"
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none font-mono"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Used as task folder name. Leave empty to auto-generate from description.
          </p>
        </div>
      )}

      {/* Enhance with AI — only shown after description is typed */}
      <PromptEvaluator
        value={description}
        targetRepo={targetRepo}
        mode={mode}
        onRewrite={onDescriptionChange}
      />
    </div>
  )
}
