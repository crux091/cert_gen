'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { CertificateElement, CanvasBackground } from '@/types/certificate'
import ElementControls from './ElementControls'
import ExportControls from './ExportControls'
import LayoutManager from './LayoutManager'
import BackgroundControls from './BackgroundControls'
import { Dispatch, SetStateAction } from 'react'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  elements: CertificateElement[]
  setElements: Dispatch<SetStateAction<CertificateElement[]>>
  selectedElementId: string | null
  setSelectedElementId: Dispatch<SetStateAction<string | null>>
  canvasSize: { width: number; height: number }
  setCanvasSize: Dispatch<SetStateAction<{ width: number; height: number }>>
  background: CanvasBackground
  setBackground: Dispatch<SetStateAction<CanvasBackground>>
}

export default function Sidebar({
  isOpen,
  onClose,
  elements,
  setElements,
  selectedElementId,
  setSelectedElementId,
  canvasSize,
  setCanvasSize,
  background,
  setBackground,
}: SidebarProps) {
  const selectedElement = elements.find(el => el.id === selectedElementId)

  return (
    <>
      {/* Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ x: -320 }}
            animate={{ x: 0 }}
            exit={{ x: -320 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed left-0 top-16 bottom-0 w-80 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 z-50 overflow-y-auto custom-scrollbar"
          >
            <div className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Controls
                </h2>
                <button
                  onClick={onClose}
                  className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  aria-label="Close sidebar"
                >
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>

              {/* Canvas Size */}
              <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Canvas Size
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Width
                    </label>
                    <input
                      type="number"
                      value={canvasSize.width}
                      onChange={(e) => setCanvasSize(prev => ({ ...prev, width: parseInt(e.target.value) || 800 }))}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Height
                    </label>
                    <input
                      type="number"
                      value={canvasSize.height}
                      onChange={(e) => setCanvasSize(prev => ({ ...prev, height: parseInt(e.target.value) || 600 }))}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Background Controls */}
              <BackgroundControls
                background={background}
                setBackground={setBackground}
              />

              {/* Element Controls */}
              {selectedElement && (
                <ElementControls
                  element={selectedElement}
                  onUpdate={(updates) => {
                    setElements(prev =>
                      prev.map(el =>
                        el.id === selectedElement.id ? { ...el, ...updates } : el
                      )
                    )
                  }}
                  onDelete={() => {
                    setElements(prev => prev.filter(el => el.id !== selectedElement.id))
                    setSelectedElementId(null)
                  }}
                  onDuplicate={() => {
                    const newElement = {
                      ...selectedElement,
                      id: Date.now().toString(),
                      x: selectedElement.x + 20,
                      y: selectedElement.y + 20,
                    }
                    setElements(prev => [...prev, newElement])
                  }}
                />
              )}

              {/* Add Element Buttons */}
              <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Add Element
                </h3>
                <button
                  onClick={() => {
                    const newElement: CertificateElement = {
                      id: Date.now().toString(),
                      type: 'text',
                      content: 'New Text',
                      x: 100,
                      y: 100,
                      fontSize: 24,
                      fontWeight: 'normal',
                      fontFamily: 'Inter',
                      color: '#000000',
                      alignment: 'left',
                      locked: false,
                      zIndex: elements.length + 1,
                    }
                    setElements(prev => [...prev, newElement])
                    setSelectedElementId(newElement.id)
                  }}
                  className="w-full px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                >
                  Add Text Element
                </button>
              </div>

              {/* Layout Manager */}
              <LayoutManager
                elements={elements}
                setElements={setElements}
                canvasSize={canvasSize}
                setCanvasSize={setCanvasSize}
                background={background}
                setBackground={setBackground}
              />

              {/* Export Controls */}
              <ExportControls
                elements={elements}
                setElements={setElements}
                canvasSize={canvasSize}
              />

              {/* Clear Canvas */}
              <div className="mt-6">
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to clear the canvas? This cannot be undone.')) {
                      setElements([])
                      setSelectedElementId(null)
                    }
                  }}
                  className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  Clear Canvas
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}
