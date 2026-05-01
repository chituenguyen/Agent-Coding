import { useState } from 'react'
import { api } from '../api'

export default function FolderPicker({ value, onChange, placeholder = '/path/to/repo' }) {
  const [loading, setLoading] = useState(false)

  async function browse() {
    setLoading(true)
    try {
      const res = await api.browseFolder('Select repository folder')
      if (res.path) onChange(res.path)
    } catch {
      // user cancelled or error — do nothing
    } finally {
      setLoading(false)
    }
  }

  function clear(e) {
    e.stopPropagation()
    onChange('')
  }

  const hasValue = value && value.trim()
  const folderName = hasValue ? value.trim().split('/').filter(Boolean).pop() : null

  return (
    <div className="flex gap-2">
      {/* Path display / manual input */}
      <div
        className={`flex-1 flex items-center gap-2 min-w-0 border rounded-lg px-3 py-2 text-sm transition-colors ${
          hasValue
            ? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-950'
            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
        }`}
      >
        {/* Folder icon */}
        <svg className={`w-4 h-4 shrink-0 ${hasValue ? 'text-indigo-500 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        </svg>

        {hasValue ? (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300 truncate leading-tight">{folderName}</p>
            <p className="text-xs text-indigo-400 dark:text-indigo-500 font-mono truncate leading-tight">{value.trim()}</p>
          </div>
        ) : (
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-gray-500 dark:text-gray-400 placeholder-gray-400 dark:placeholder-gray-500 font-mono text-xs outline-none min-w-0"
          />
        )}

        {/* Clear button */}
        {hasValue && (
          <button
            onClick={clear}
            className="shrink-0 text-indigo-300 dark:text-indigo-600 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
            title="Clear"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Browse button */}
      <button
        onClick={browse}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors disabled:opacity-50 shrink-0"
        title="Browse for folder"
      >
        {loading ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
        )}
        Browse
      </button>
    </div>
  )
}
