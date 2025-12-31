'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { CertificateElement, CanvasBackground, HistoryState } from '@/types/certificate'

const MAX_STACK_SIZE = 50
const DEBOUNCE_DELAY = 300

interface UseHistoryManagerProps {
  initialElements: CertificateElement[]
  initialBackground: CanvasBackground
  initialCanvasSize: { width: number; height: number }
}

interface UseHistoryManagerReturn {
  // State
  elements: CertificateElement[]
  background: CanvasBackground
  canvasSize: { width: number; height: number }
  
  // Setters that record history
  setElements: (elements: CertificateElement[] | ((prev: CertificateElement[]) => CertificateElement[])) => void
  setBackground: (background: CanvasBackground | ((prev: CanvasBackground) => CanvasBackground)) => void
  setCanvasSize: (size: { width: number; height: number } | ((prev: { width: number; height: number }) => { width: number; height: number })) => void
  
  // Direct setters that skip history (for internal use like undo/redo)
  setElementsDirect: React.Dispatch<React.SetStateAction<CertificateElement[]>>
  setBackgroundDirect: React.Dispatch<React.SetStateAction<CanvasBackground>>
  setCanvasSizeDirect: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>
  
  // History-aware update that records before change
  pushToHistory: () => void
  pushToHistoryDebounced: () => void
  
  // Undo/Redo
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  
  // Clear history (useful when loading a layout)
  clearHistory: () => void
}

export function useHistoryManager({
  initialElements,
  initialBackground,
  initialCanvasSize,
}: UseHistoryManagerProps): UseHistoryManagerReturn {
  // Current state
  const [elements, setElementsState] = useState<CertificateElement[]>(initialElements)
  const [background, setBackgroundState] = useState<CanvasBackground>(initialBackground)
  const [canvasSize, setCanvasSizeState] = useState(initialCanvasSize)
  
  // Use refs to always have latest values (avoid stale closure issues)
  const elementsRef = useRef(elements)
  const backgroundRef = useRef(background)
  const canvasSizeRef = useRef(canvasSize)
  
  // Keep refs in sync
  useEffect(() => {
    elementsRef.current = elements
  }, [elements])
  
  useEffect(() => {
    backgroundRef.current = background
  }, [background])
  
  useEffect(() => {
    canvasSizeRef.current = canvasSize
  }, [canvasSize])
  
  // Two stacks: undoStack and redoStack
  const undoStackRef = useRef<HistoryState[]>([])
  const redoStackRef = useRef<HistoryState[]>([])
  
  // Force re-render trigger for canUndo/canRedo
  const [, forceUpdate] = useState({})
  
  // Refs for debouncing
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const hasPendingSnapshotRef = useRef(false)
  
  // Track if we're in the middle of undo/redo to prevent recording
  const isUndoRedoRef = useRef(false)
  
  // Get current state snapshot from refs (always latest)
  const getCurrentSnapshot = useCallback((): HistoryState => ({
    elements: JSON.parse(JSON.stringify(elementsRef.current)),
    background: { ...backgroundRef.current },
    canvasSize: { ...canvasSizeRef.current },
  }), [])
  
  // Push current state to undo stack (called BEFORE making changes)
  const pushToHistory = useCallback(() => {
    if (isUndoRedoRef.current) return
    
    const snapshot = getCurrentSnapshot()
    
    // Push to undo stack
    undoStackRef.current.push(snapshot)
    
    // Enforce max size by removing oldest entries
    while (undoStackRef.current.length > MAX_STACK_SIZE) {
      undoStackRef.current.shift()
    }
    
    // Clear redo stack when a new action is performed
    redoStackRef.current = []
    
    forceUpdate({})
  }, [getCurrentSnapshot])
  
  // Debounced version for text edits
  const pushToHistoryDebounced = useCallback(() => {
    if (isUndoRedoRef.current) return
    
    // Only capture snapshot once at the start of typing session
    if (!hasPendingSnapshotRef.current) {
      hasPendingSnapshotRef.current = true
      // Capture the snapshot NOW, before text changes
      const snapshot = getCurrentSnapshot()
      
      // Push to undo stack immediately
      undoStackRef.current.push(snapshot)
      while (undoStackRef.current.length > MAX_STACK_SIZE) {
        undoStackRef.current.shift()
      }
      redoStackRef.current = []
      forceUpdate({})
    }
    
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    
    // Set new timer to reset the pending flag after typing stops
    debounceTimerRef.current = setTimeout(() => {
      hasPendingSnapshotRef.current = false
    }, DEBOUNCE_DELAY)
  }, [getCurrentSnapshot])
  
  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])
  
  // Undo: pop from undo stack, push current to redo stack
  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return
    
    isUndoRedoRef.current = true
    
    // Save current state to redo stack
    const currentSnapshot = getCurrentSnapshot()
    redoStackRef.current.push(currentSnapshot)
    
    // Pop from undo stack and apply
    const prevState = undoStackRef.current.pop()!
    
    setElementsState(JSON.parse(JSON.stringify(prevState.elements)))
    setBackgroundState({ ...prevState.background })
    setCanvasSizeState({ ...prevState.canvasSize })
    
    forceUpdate({})
    
    setTimeout(() => {
      isUndoRedoRef.current = false
    }, 0)
  }, [getCurrentSnapshot])
  
  // Redo: pop from redo stack, push current to undo stack
  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return
    
    isUndoRedoRef.current = true
    
    // Save current state to undo stack
    const currentSnapshot = getCurrentSnapshot()
    undoStackRef.current.push(currentSnapshot)
    
    // Pop from redo stack and apply
    const nextState = redoStackRef.current.pop()!
    
    setElementsState(JSON.parse(JSON.stringify(nextState.elements)))
    setBackgroundState({ ...nextState.background })
    setCanvasSizeState({ ...nextState.canvasSize })
    
    forceUpdate({})
    
    setTimeout(() => {
      isUndoRedoRef.current = false
    }, 0)
  }, [getCurrentSnapshot])
  
  // Wrapped setters that record history before changes
  const setElements = useCallback((
    newElements: CertificateElement[] | ((prev: CertificateElement[]) => CertificateElement[])
  ) => {
    if (!isUndoRedoRef.current) {
      pushToHistory()
    }
    setElementsState(newElements)
  }, [pushToHistory])
  
  const setBackground = useCallback((
    newBackground: CanvasBackground | ((prev: CanvasBackground) => CanvasBackground)
  ) => {
    if (!isUndoRedoRef.current) {
      pushToHistory()
    }
    setBackgroundState(newBackground)
  }, [pushToHistory])
  
  const setCanvasSize = useCallback((
    newSize: { width: number; height: number } | ((prev: { width: number; height: number }) => { width: number; height: number })
  ) => {
    if (!isUndoRedoRef.current) {
      pushToHistory()
    }
    setCanvasSizeState(newSize)
  }, [pushToHistory])
  
  // Clear history (useful when loading a layout)
  const clearHistory = useCallback(() => {
    undoStackRef.current = []
    redoStackRef.current = []
    forceUpdate({})
  }, [])
  
  return {
    // State
    elements,
    background,
    canvasSize,
    
    // History-aware setters
    setElements,
    setBackground,
    setCanvasSize,
    
    // Direct setters (skip history)
    setElementsDirect: setElementsState,
    setBackgroundDirect: setBackgroundState,
    setCanvasSizeDirect: setCanvasSizeState,
    
    // Manual history push
    pushToHistory,
    pushToHistoryDebounced,
    
    // Undo/Redo
    undo,
    redo,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
    
    // Clear history
    clearHistory,
  }
}
