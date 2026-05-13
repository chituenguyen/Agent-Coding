import { useState, useEffect } from 'react'

const STEPS = [
  {
    icon: (
      <svg className="w-10 h-10 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    title: 'Welcome to URI Platform',
    subtitle: 'Your multi-agent AI workspace',
    description: 'Describe what you want to build or fix — Claude spawns a team of specialized agents that plan, code, review, and commit automatically.',
    color: 'indigo',
  },
  {
    icon: (
      <svg className="w-10 h-10 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    title: 'Tasks',
    subtitle: 'Run the full AI workflow',
    description: 'Create a task with a description and optional repo path. Claude runs Architect → Coder → Reviewer → Debugger → Commit automatically. Track progress in real time.',
    color: 'violet',
    badge: '/tasks',
  },
  {
    icon: (
      <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    title: 'Investigate',
    subtitle: 'Debug any bug instantly',
    description: 'Describe a bug and the Investigator agent traces it to the root cause — file path, line number, and causal chain. Optionally auto-fix and verify with tests.',
    color: 'blue',
    badge: '/investigate',
  },
  {
    icon: (
      <svg className="w-10 h-10 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
    title: 'Queue',
    subtitle: 'Batch multiple tasks',
    description: "Add several tasks to a queue and let Claude process them sequentially — overnight, while you're in a meeting, or any time. New tasks can be added while the queue runs.",
    color: 'cyan',
    badge: '/queue',
  },
  {
    icon: (
      <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    ),
    title: 'MCP Servers',
    subtitle: 'Connect more tools',
    description: 'Add Model Context Protocol servers to give Claude access to GitHub, databases, Slack, browsers, and more. Browse the catalog for one-click installs.',
    color: 'emerald',
    badge: '/mcp',
  },
  {
    icon: (
      <svg className="w-10 h-10 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-1" />
      </svg>
    ),
    title: 'Agents & Skills',
    subtitle: 'Customize AI behavior',
    description: 'Each agent has a "soul" — edit their instructions, model, and linked skills to shape how they think and act. No code needed, just plain text.',
    color: 'orange',
    badge: '/agents',
  },
]

const COLORS = {
  indigo:  { bg: 'bg-indigo-50 dark:bg-indigo-950',  ring: 'bg-indigo-100 dark:bg-indigo-900',  dot: 'bg-indigo-600',  btn: 'bg-indigo-600 hover:bg-indigo-700' },
  violet:  { bg: 'bg-violet-50 dark:bg-violet-950',  ring: 'bg-violet-100 dark:bg-violet-900',  dot: 'bg-violet-600',  btn: 'bg-violet-600 hover:bg-violet-700' },
  blue:    { bg: 'bg-blue-50 dark:bg-blue-950',    ring: 'bg-blue-100 dark:bg-blue-900',    dot: 'bg-blue-600',    btn: 'bg-blue-600 hover:bg-blue-700' },
  cyan:    { bg: 'bg-cyan-50 dark:bg-cyan-950',    ring: 'bg-cyan-100 dark:bg-cyan-900',    dot: 'bg-cyan-600',    btn: 'bg-cyan-600 hover:bg-cyan-700' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950', ring: 'bg-emerald-100 dark:bg-emerald-900', dot: 'bg-emerald-600', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  orange:  { bg: 'bg-orange-50 dark:bg-orange-950',  ring: 'bg-orange-100 dark:bg-orange-900',  dot: 'bg-orange-500',  btn: 'bg-orange-500 hover:bg-orange-600' },
}

const STORAGE_KEY = 'agent_coding_onboarding_seen'

export default function Onboarding() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      // Small delay so the app renders first
      const t = setTimeout(() => setVisible(true), 400)
      return () => clearTimeout(t)
    }
  }, [])

  function dismiss() {
    setExiting(true)
    setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, '1')
      setVisible(false)
      setExiting(false)
    }, 250)
  }

  function next() {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else dismiss()
  }

  function prev() {
    if (step > 0) setStep(s => s - 1)
  }

  if (!visible) return null

  const s = STEPS[step]
  const c = COLORS[s.color]
  const isLast = step === STEPS.length - 1

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-250 ${exiting ? 'opacity-0' : 'opacity-100'}`}
      style={{ backgroundColor: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) dismiss() }}
    >
      <div
        className={`relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden transition-all duration-250 ${exiting ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}
      >
        {/* Top color band */}
        <div className={`h-1.5 w-full ${c.dot}`} />

        {/* Skip */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors text-xs font-medium"
        >
          Skip
        </button>

        {/* Content — fixed height so modal never resizes between steps */}
        <div className="px-8 pt-8 pb-6 h-72 flex flex-col items-center justify-center">
          {/* Icon */}
          <div className={`w-20 h-20 ${c.ring} rounded-2xl flex items-center justify-center mb-5 shrink-0`}>
            {s.icon}
          </div>

          {/* Badge */}
          <div className="h-6 flex items-center justify-center mb-1">
            {s.badge && (
              <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${c.bg} ${c.dot.replace('bg-', 'text-')}`}>
                {s.badge}
              </span>
            )}
          </div>

          {/* Text */}
          <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center">{s.title}</h2>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 text-center mt-0.5">{s.subtitle}</p>
          <p className="text-sm text-gray-600 dark:text-gray-300 text-center mt-3 leading-relaxed">{s.description}</p>
        </div>

        {/* Footer */}
        <div className="px-8 pb-7 flex items-center gap-3">
          {/* Dot indicators */}
          <div className="flex items-center gap-1.5 flex-1">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`rounded-full transition-all duration-200 ${
                  i === step ? `w-5 h-2 ${c.dot}` : 'w-2 h-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              />
            ))}
          </div>

          {/* Nav buttons */}
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={prev}
                className="px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              className={`px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors ${c.btn}`}
            >
              {isLast ? "Let's go →" : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
