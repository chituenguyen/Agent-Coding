const CONFIG = {
  created:  { label: 'Created',  cls: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' },
  planned:  { label: 'Planned',  cls: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' },
  coded:    { label: 'Coded',    cls: 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300' },
  issues:   { label: 'Issues',   cls: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300' },
  fixed:    { label: 'Fixed',    cls: 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300' },
  approved: { label: 'Approved', cls: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' },
  done:     { label: 'Done',     cls: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' },
  running:  { label: 'Running',  cls: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300' },
  unknown:  { label: 'Unknown',  cls: 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500' },
}

export default function StatusBadge({ status }) {
  const { label, cls } = CONFIG[status] ?? CONFIG.unknown
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}
