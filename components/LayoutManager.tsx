'use client'

import { useState, useEffect } from 'react'
import { Save, FolderOpen, Trash2 } from 'lucide-react'
import { CertificateElement, SavedLayout, CanvasBackground } from '@/types/certificate'
import { Dispatch, SetStateAction } from 'react'

interface LayoutManagerProps {
  elements: CertificateElement[]
  setElements: Dispatch<SetStateAction<CertificateElement[]>>
  canvasSize: { width: number; height: number }
  setCanvasSize: Dispatch<SetStateAction<{ width: number; height: number }>>
  background: CanvasBackground
  setBackground: Dispatch<SetStateAction<CanvasBackground>>
}

const STORAGE_KEY = 'certificate-saved-layouts'

export default function LayoutManager({
  elements,
  setElements,
  canvasSize,
  setCanvasSize,
  background,
  setBackground,
}: LayoutManagerProps) {
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>([])
  const [layoutName, setLayoutName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  // Load saved layouts from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        setSavedLayouts(JSON.parse(saved))
      }
    } catch (error) {
      console.error('Failed to load saved layouts:', error)
    }
  }, [])

  // Save layouts to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedLayouts))
    } catch (error) {
      console.error('Failed to save layouts:', error)
    }
  }, [savedLayouts])

  const handleSaveLayout = () => {
    if (!layoutName.trim()) {
      alert('Please enter a layout name')
      return
    }

    const newLayout: SavedLayout = {
      name: layoutName.trim(),
      elements: JSON.parse(JSON.stringify(elements)), // Deep clone
      canvasSize: { ...canvasSize },
      background: { ...background },
      timestamp: Date.now(),
    }

    setSavedLayouts(prev => {
      // Check if layout with same name exists
      const existingIndex = prev.findIndex(l => l.name === newLayout.name)
      if (existingIndex >= 0) {
        // Replace existing
        const updated = [...prev]
        updated[existingIndex] = newLayout
        return updated
      }
      // Add new
      return [...prev, newLayout]
    })

    setLayoutName('')
    setShowSaveInput(false)
    alert(`Layout "${newLayout.name}" saved successfully!`)
  }

  const handleLoadLayout = (layout: SavedLayout) => {
    if (confirm(`Load layout "${layout.name}"? Current work will be replaced.`)) {
      setElements(JSON.parse(JSON.stringify(layout.elements))) // Deep clone
      setCanvasSize({ ...layout.canvasSize })
      if (layout.background) {
        setBackground({ ...layout.background })
      }
      alert(`Layout "${layout.name}" loaded!`)
    }
  }

  const handleDeleteLayout = (name: string) => {
    if (confirm(`Delete layout "${name}"? This cannot be undone.`)) {
      setSavedLayouts(prev => prev.filter(l => l.name !== name))
      alert(`Layout "${name}" deleted!`)
    }
  }

  return (
    <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Layouts
      </h3>

      {/* Save Layout */}
      {showSaveInput ? (
        <div className="mb-3">
          <input
            type="text"
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
            placeholder="Layout name..."
            className="w-full px-2 py-1 mb-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveLayout()
              if (e.key === 'Escape') {
                setShowSaveInput(false)
                setLayoutName('')
              }
            }}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleSaveLayout}
              className="flex-1 px-3 py-1 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => {
                setShowSaveInput(false)
                setLayoutName('')
              }}
              className="flex-1 px-3 py-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 text-sm rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowSaveInput(true)}
          className="w-full mb-3 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          Save Current Layout
        </button>
      )}

      {/* Saved Layouts List */}
      {savedLayouts.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400">
            Saved Layouts ({savedLayouts.length})
          </h4>
          <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
            {savedLayouts.map((layout) => (
              <div
                key={layout.name}
                className="flex items-center justify-between p-2 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 dark:text-white truncate">
                    {layout.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(layout.timestamp).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-1 ml-2">
                  <button
                    onClick={() => handleLoadLayout(layout)}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    title="Load layout"
                  >
                    <FolderOpen className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                  </button>
                  <button
                    onClick={() => handleDeleteLayout(layout.name)}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    title="Delete layout"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {savedLayouts.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
          No saved layouts yet
        </p>
      )}
    </div>
  )
}
