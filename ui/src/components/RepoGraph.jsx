import { useState, useEffect, useRef, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { api } from '../api'

const KIND_COLORS = {
  File: '#6366f1',       // indigo
  Class: '#f59e0b',      // amber
  Method: '#10b981',     // emerald
  Function: '#10b981',
  Interface: '#8b5cf6',  // violet
  Route: '#ef4444',      // red
  Property: '#6b7280',   // gray
}

export default function RepoGraph({ project, onClose }) {
  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [indexing, setIndexing] = useState(false)
  const [hovered, setHovered] = useState(null)
  const graphRef = useRef()

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getRepoGraph(project)
      if (!data.indexed) {
        setGraphData(null)
        setError('not-indexed')
      } else {
        // Build graph data for force-graph
        const nodeMap = new Map()
        const nodes = data.nodes.map(n => {
          const id = n.id
          const node = {
            id,
            name: n.name,
            kind: n.kind,
            file: n.file,
            color: KIND_COLORS[n.kind] || '#6b7280',
            val: n.kind === 'File' ? 3 : n.kind === 'Class' ? 5 : 2,
          }
          nodeMap.set(id, node)
          return node
        })

        const links = data.edges
          .filter(e => nodeMap.has(e.source) && nodeMap.has(e.target))
          .map(e => ({
            source: e.source,
            target: e.target,
            rel: e.rel,
          }))

        setGraphData({ nodes, links })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [project])

  async function handleIndex() {
    setIndexing(true)
    try {
      await api.indexRepoGraph(project)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setIndexing(false)
    }
  }

  const handleNodeHover = useCallback(node => setHovered(node), [])

  const paintNode = useCallback((node, ctx) => {
    const isHover = hovered?.id === node.id
    const r = Math.sqrt(node.val) * 3

    // Node circle
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
    ctx.fillStyle = node.color + (isHover ? 'ff' : 'cc')
    ctx.fill()

    if (isHover) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Label
    ctx.font = `${isHover ? 'bold ' : ''}${isHover ? 4 : 3}px Sans-Serif`
    ctx.fillStyle = '#e5e7eb'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(node.name, node.x, node.y + r + 2)
  }, [hovered])

  // Legend items
  const kinds = [...new Set(graphData?.nodes.map(n => n.kind) || [])]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-white">{project} — Code Graph</h2>
          {graphData && (
            <p className="text-xs text-gray-400">{graphData.nodes.length} nodes, {graphData.links.length} edges</p>
          )}
        </div>

        {/* Legend */}
        {kinds.length > 0 && (
          <div className="flex items-center gap-3">
            {kinds.map(k => (
              <div key={k} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: KIND_COLORS[k] || '#6b7280' }} />
                <span className="text-xs text-gray-400">{k}</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => graphRef.current?.zoomToFit(400, 50)}
          className="px-3 py-1.5 text-xs text-gray-300 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
        >
          Fit View
        </button>
      </div>

      {/* Graph area */}
      <div className="flex-1 relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Loading graph data...
            </div>
          </div>
        ) : error === 'not-indexed' ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-400 mb-3">Repository not indexed yet</p>
              <button
                onClick={handleIndex}
                disabled={indexing}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {indexing ? 'Indexing...' : 'Index Repository'}
              </button>
            </div>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : graphData ? (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            nodeCanvasObject={paintNode}
            nodePointerAreaPaint={(node, color, ctx) => {
              const r = Math.sqrt(node.val) * 3
              ctx.beginPath()
              ctx.arc(node.x, node.y, r + 2, 0, 2 * Math.PI)
              ctx.fillStyle = color
              ctx.fill()
            }}
            onNodeHover={handleNodeHover}
            linkColor={() => 'rgba(100, 116, 139, 0.3)'}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            backgroundColor="#030712"
            cooldownTicks={100}
            onEngineStop={() => graphRef.current?.zoomToFit(400, 50)}
          />
        ) : null}

        {/* Hover tooltip */}
        {hovered && (
          <div className="absolute bottom-4 left-4 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 shadow-lg pointer-events-none">
            <p className="text-sm font-medium text-white">{hovered.name}</p>
            <p className="text-xs text-gray-400">{hovered.kind} — {hovered.file}</p>
          </div>
        )}
      </div>
    </div>
  )
}
