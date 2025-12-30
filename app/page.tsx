'use client'

import { useState, useRef, useCallback } from 'react'
import Header from '@/components/Header'
import Ribbon from '@/components/Ribbon'
import CanvasEditor from '@/components/CanvasEditor'
import SlidePreviewPanel from '@/components/SlidePreviewPanel'
import { CertificateElement, CanvasBackground, CSVData, VariableBindings, TextSelection, CharacterStyle } from '@/types/certificate'
import { useHistoryManager } from '@/lib/useHistoryManager'

export default function Home() {
  // Use history manager for elements, background, and canvasSize
  const {
    elements,
    background,
    canvasSize,
    setElements,
    setBackground,
    setCanvasSize,
    setElementsDirect,
    setBackgroundDirect,
    setCanvasSizeDirect,
    pushToHistory,
    pushToHistoryDebounced,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
  } = useHistoryManager({
    initialElements: [],
    initialBackground: {
      type: 'color',
      color: '#ffffff',
    },
    initialCanvasSize: { width: 800, height: 600 },
  })

  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [csvData, setCsvData] = useState<CSVData | null>(null)
  const [variableBindings, setVariableBindings] = useState<VariableBindings>({})
  
  // Preview panel state
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState<number | null>(null)
  
  // Text selection state for inline formatting
  const [textSelection, setTextSelection] = useState<TextSelection>({
    elementId: null,
    start: 0,
    end: 0,
    hasSelection: false,
  })
  
  // Ref to access canvas editor's applySelectionStyle function
  const applySelectionStyleRef = useRef<((style: CharacterStyle) => void) | null>(null)
  
  // Get preview row data when a preview is selected
  const previewRowData = selectedPreviewIndex !== null && csvData 
    ? csvData.rows[selectedPreviewIndex] 
    : null
  
  // Callback to apply style to selected text
  const applySelectionStyle = useCallback((style: CharacterStyle) => {
    if (applySelectionStyleRef.current) {
      applySelectionStyleRef.current(style)
    }
  }, [])

  return (
    <div className="h-screen bg-gray-100 dark:bg-gray-900 transition-colors flex flex-col overflow-hidden">
      <Header />
      
      <div className="pt-16 flex-none z-40 relative">
        <Ribbon
          elements={elements}
          setElements={setElements}
          selectedElementId={selectedElementId}
          setSelectedElementId={setSelectedElementId}
          canvasSize={canvasSize}
          setCanvasSize={setCanvasSize}
          background={background}
          setBackground={setBackground}
          csvData={csvData}
          setCsvData={setCsvData}
          variableBindings={variableBindings}
          setVariableBindings={setVariableBindings}
          undo={undo}
          redo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          clearHistory={clearHistory}
          textSelection={textSelection}
          applySelectionStyle={applySelectionStyle}
        />
      </div>
      
      <main className="flex-1 overflow-hidden relative z-0 bg-gray-200 dark:bg-gray-950 flex">
        {/* Slide Preview Panel - Only visible when CSV is loaded */}
        {csvData && (
          <SlidePreviewPanel
            csvData={csvData}
            elements={elements}
            canvasSize={canvasSize}
            background={background}
            selectedPreviewIndex={selectedPreviewIndex}
            onSelectPreview={setSelectedPreviewIndex}
            variableBindings={variableBindings}
          />
        )}
        
        {/* Canvas Editor */}
        <div className="flex-1 overflow-auto">
          <CanvasEditor
            elements={elements}
            setElements={setElementsDirect}
            selectedElementId={selectedElementId}
            setSelectedElementId={setSelectedElementId}
            canvasSize={canvasSize}
            background={background}
            csvData={csvData}
            variableBindings={variableBindings}
            setVariableBindings={setVariableBindings}
            previewRowData={previewRowData}
            pushToHistory={pushToHistory}
            pushToHistoryDebounced={pushToHistoryDebounced}
            onUndo={undo}
            onRedo={redo}
            setTextSelection={setTextSelection}
            applySelectionStyleRef={applySelectionStyleRef}
          />
        </div>
      </main>
    </div>
  )
}
