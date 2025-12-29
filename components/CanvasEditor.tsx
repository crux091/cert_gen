'use client'

import { useRef, useEffect, useState, useMemo } from 'react'
import { fabric } from 'fabric'
import { CertificateElement, CanvasBackground, CSVData, VariableBindings } from '@/types/certificate'
import { Dispatch, SetStateAction } from 'react'
import { hasVariables, extractVariables, replaceAllVariables } from '@/lib/variableParser'

// Generate consistent colors for variable names (like syntax highlighting)
const VARIABLE_COLORS = [
  '#e91e63', // pink
  '#9c27b0', // purple
  '#673ab7', // deep purple
  '#3f51b5', // indigo
  '#2196f3', // blue
  '#00bcd4', // cyan
  '#009688', // teal
  '#4caf50', // green
  '#ff9800', // orange
  '#ff5722', // deep orange
]

function getVariableColor(variableName: string): string {
  // Generate a consistent hash from the variable name
  let hash = 0
  for (let i = 0; i < variableName.length; i++) {
    hash = ((hash << 5) - hash) + variableName.charCodeAt(i)
    hash = hash & hash // Convert to 32bit integer
  }
  return VARIABLE_COLORS[Math.abs(hash) % VARIABLE_COLORS.length]
}

interface CanvasEditorProps {
  elements: CertificateElement[]
  setElements: Dispatch<SetStateAction<CertificateElement[]>>
  selectedElementId: string | null
  setSelectedElementId: Dispatch<SetStateAction<string | null>>
  canvasSize: { width: number; height: number }
  background: CanvasBackground
  csvData: CSVData | null
  variableBindings: VariableBindings
  setVariableBindings: Dispatch<SetStateAction<VariableBindings>>
  previewRowData?: Record<string, any> | null  // When set, canvas is in read-only preview mode
}

export default function CanvasEditor({
  elements,
  setElements,
  selectedElementId,
  setSelectedElementId,
  canvasSize,
  background,
  csvData,
  variableBindings,
  setVariableBindings,
  previewRowData,
}: CanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null)
  const [isReady, setIsReady] = useState(false)
  
  // Preview mode: when previewRowData is set, the canvas is read-only
  const isPreviewMode = previewRowData !== null && previewRowData !== undefined
  
  // Variable binding popup state
  // Each variable is tracked by its startIndex to uniquely identify it (even duplicates)
  const [bindingPopup, setBindingPopup] = useState<{
    visible: boolean
    x: number
    y: number
    variable: { name: string; fullMatch: string; startIndex: number } | null  // Clicked variable (if detected)
    allVariables: Array<{ name: string; fullMatch: string; startIndex: number }>  // All variables for fallback
    elementId: string
  } | null>(null)

  // Auto-bind variables when CSV is loaded or elements change
  // This automatically binds [Variable] to Column if names match exactly
  useEffect(() => {
    if (!csvData) return
    
    // Collect all variables from all text elements (scan all, don't rely on hasVariables flag)
    const allVariables = new Set<string>()
    elements.forEach(el => {
      if (el.type === 'text') {
        const vars = extractVariables(el.content)
        vars.forEach(v => allVariables.add(v.name))
      }
    })
    
    // Auto-bind variables that match column headers (case-insensitive match)
    const newBindings: Record<string, string> = {}
    allVariables.forEach(varName => {
      // Try exact match first
      if (csvData.headers.includes(varName)) {
        newBindings[varName] = varName
      } else {
        // Try case-insensitive match
        const matchedHeader = csvData.headers.find(
          h => h.toLowerCase() === varName.toLowerCase()
        )
        if (matchedHeader) {
          newBindings[varName] = matchedHeader
        }
      }
    })
    
    if (Object.keys(newBindings).length > 0) {
      setVariableBindings(prev => {
        // Only add new bindings, don't overwrite existing ones
        const updated = { ...prev }
        Object.entries(newBindings).forEach(([key, value]) => {
          if (!updated[key]) {
            updated[key] = value
          }
        })
        return updated
      })
    }
  }, [csvData, elements, setVariableBindings])

  // Initialize Fabric.js canvas
  useEffect(() => {
    if (!canvasRef.current || fabricCanvasRef.current) return

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: canvasSize.width,
      height: canvasSize.height,
      backgroundColor: background.type === 'color' ? background.color || '#ffffff' : '#ffffff',
      preserveObjectStacking: true,
      selection: true,
    })

    fabricCanvasRef.current = canvas

    // Store canvas instance on the canvas element for export access
    // @ts-ignore
    canvasRef.current.__fabricCanvas = canvas

    setIsReady(true)

    // Handle object selection
    canvas.on('selection:created', (e) => {
      const obj = e.selected?.[0]
      if (obj && obj.data?.elementId) {
        setSelectedElementId(obj.data.elementId)
      }
    })

    canvas.on('selection:updated', (e) => {
      const obj = e.selected?.[0]
      if (obj && obj.data?.elementId) {
        setSelectedElementId(obj.data.elementId)
      }
    })

    canvas.on('selection:cleared', () => {
      setSelectedElementId(null)
      setBindingPopup(null)
    })

    // Handle object modifications
    canvas.on('object:modified', (e) => {
      const obj = e.target
      if (!obj || !obj.data?.elementId) return

      const elementId = obj.data.elementId
      setElements(prev => prev.map(el => {
        if (el.id === elementId) {
          return {
            ...el,
            x: Math.round(obj.left || 0),
            y: Math.round(obj.top || 0),
            width: Math.round((obj.width || 0) * (obj.scaleX || 1)),
            height: Math.round((obj.height || 0) * (obj.scaleY || 1)),
            angle: obj.angle || 0,
            scaleX: obj.scaleX || 1,
            scaleY: obj.scaleY || 1,
          }
        }
        return el
      }))
    })

    // Handle text editing
    canvas.on('text:editing:entered', (e) => {
      const obj = e.target as fabric.Textbox
      if (obj && obj.data?.elementId) {
        setSelectedElementId(obj.data.elementId)
        // Store original position and canvas dimensions
        obj.data.originalLeft = obj.left
        obj.data.originalTop = obj.top
        // Lock canvas dimensions during editing
        canvas.setDimensions({
          width: canvasSize.width,
          height: canvasSize.height,
        })
        // Ensure textbox width doesn't exceed canvas bounds
        const maxWidth = canvasSize.width * 0.8
        obj.set({ 
          width: maxWidth,
          splitByGrapheme: false,
        })
        canvas.renderAll()
      }
    })

    canvas.on('text:editing:exited', (e) => {
      const obj = e.target as fabric.Textbox
      if (obj && obj.data?.elementId) {
        // Restore position and lock the width after editing
        const maxWidth = canvasSize.width * 0.8
        obj.set({ 
          width: maxWidth,
          splitByGrapheme: false,
          left: obj.data.originalLeft || obj.left,
          top: obj.data.originalTop || obj.top,
        })
        // Ensure canvas dimensions remain fixed
        canvas.setDimensions({
          width: canvasSize.width,
          height: canvasSize.height,
        })
        canvas.renderAll()
      }
    })

    canvas.on('text:changed', (e) => {
      const obj = e.target as fabric.Textbox
      if (!obj || !obj.data?.elementId) return

      // Constrain width during typing
      const maxWidth = canvasSize.width * 0.8
      if (obj.width && obj.width !== maxWidth) {
        obj.set({ width: maxWidth })
      }

      // Lock canvas dimensions during typing
      canvas.setDimensions({
        width: canvasSize.width,
        height: canvasSize.height,
      })

      const elementId = obj.data.elementId
      const textContent = obj.text || ''
      
      setElements(prev => prev.map(el => {
        if (el.id === elementId) {
          return {
            ...el,
            content: textContent,
            hasVariables: hasVariables(textContent),
          }
        }
        return el
      }))
    })

    // Apply variable highlighting when exiting text edit mode
    canvas.on('text:editing:exited', (e) => {
      const obj = e.target as fabric.Textbox
      if (!obj) return
      
      // Apply syntax highlighting after editing is done
      const text = obj.text || ''
      const variables = extractVariables(text)
      
      // Auto-bind variables that match CSV column headers
      if (csvData && variables.length > 0) {
        const newBindings: Record<string, string> = {}
        variables.forEach(v => {
          // If variable name matches a column header, auto-bind it
          if (csvData.headers.includes(v.name)) {
            newBindings[v.name] = v.name
          }
        })
        if (Object.keys(newBindings).length > 0) {
          setVariableBindings(prev => ({ ...prev, ...newBindings }))
        }
      }
      
      if (variables.length === 0) {
        obj.styles = {}
      } else {
        // Build styles object for Fabric.js
        const lines = text.split('\n')
        const newStyles: Record<number, Record<number, any>> = {}
        
        let globalCharIndex = 0
        lines.forEach((line, lineIndex) => {
          const lineStart = globalCharIndex
          const lineEnd = lineStart + line.length
          
          variables.forEach(v => {
            if (v.startIndex >= lineStart && v.startIndex < lineEnd) {
              const localStart = v.startIndex - lineStart
              const localEnd = Math.min(v.endIndex - lineStart, line.length)
              
              if (!newStyles[lineIndex]) {
                newStyles[lineIndex] = {}
              }
              
              const color = getVariableColor(v.name)
              
              for (let i = localStart; i < localEnd; i++) {
                newStyles[lineIndex][i] = {
                  fill: color,
                  fontWeight: 'bold',
                }
              }
            }
          })
          
          globalCharIndex = lineEnd + 1
        })
        
        obj.styles = newStyles
      }
      canvas.renderAll()
    })

    // Keyboard event for deleting objects
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!canvas) return

      const activeObject = canvas.getActiveObject()
      if (!activeObject) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement

        // Allow deletion if not typing in input
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          return
        }

        // Check if object is locked
        if (activeObject.data?.locked) {
          alert('This element is locked. Please unlock it first to delete.')
          return
        }

        e.preventDefault()

        const elementId = activeObject.data?.elementId
        if (elementId) {
          canvas.remove(activeObject)
          setElements(prev => prev.filter(el => el.id !== elementId))
          setSelectedElementId(null)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      canvas.dispose()
      fabricCanvasRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only initialize once

  // Handle variable click for binding (separate effect to get fresh csvData)
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    const handleMouseDown = (e: fabric.IEvent<Event>) => {
      // Disable variable binding in preview mode
      if (isPreviewMode) {
        setBindingPopup(null)
        return
      }
      
      // Only activate variable binding if a dataset is uploaded
      if (!csvData) {
        setBindingPopup(null)
        return
      }
      
      if (!e.target) {
        setBindingPopup(null)
        return
      }
      
      const obj = e.target as fabric.Textbox
      if (!obj.data?.elementId || obj.type !== 'textbox') {
        setBindingPopup(null)
        return
      }

      const textContent = obj.text || ''
      const variables = extractVariables(textContent)
      
      if (variables.length === 0) {
        setBindingPopup(null)
        return
      }

      // Get click position for popup positioning
      const mouseEvent = e.e as MouseEvent
      const pointer = canvas.getPointer(mouseEvent)
      
      // Calculate popup position near the click
      const canvasEl = canvasRef.current
      if (!canvasEl) return
      
      const canvasRect = canvasEl.getBoundingClientRect()
      const popupX = canvasRect.left + pointer.x
      const popupY = canvasRect.top + pointer.y + 20

      // Try to detect which character was clicked
      let clickedVariable: { name: string; fullMatch: string; startIndex: number } | null = null
      
      try {
        // Get the character index at click position
        const charIndex = obj.getSelectionStartFromPointer(mouseEvent)
        
        if (typeof charIndex === 'number' && charIndex >= 0) {
          // Find which variable contains this character position
          for (const v of variables) {
            if (charIndex >= v.startIndex && charIndex < v.endIndex) {
              clickedVariable = { name: v.name, fullMatch: v.fullMatch, startIndex: v.startIndex }
              break
            }
          }
        }
      } catch (err) {
        // Fallback if getSelectionStartFromPointer fails
        console.warn('Could not detect clicked character position')
      }
      
      // Store all variables with their positions for the popup
      const allVars = variables.map(v => ({ 
        name: v.name, 
        fullMatch: v.fullMatch, 
        startIndex: v.startIndex 
      }))
      
      setBindingPopup({
        visible: true,
        x: popupX,
        y: popupY,
        variable: clickedVariable,  // The specific variable clicked (or null if detection failed)
        allVariables: allVars,      // All variables as fallback
        elementId: obj.data.elementId
      })
    }

    canvas.on('mouse:down', handleMouseDown)

    return () => {
      canvas.off('mouse:down', handleMouseDown)
    }
  }, [csvData, isPreviewMode]) // Re-register when csvData or preview mode changes

  // Handle paste events for creating new text boxes with formatting
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    const handlePaste = (e: ClipboardEvent) => {
      // Check if we're editing text or if target is input/textarea
      const activeObject = canvas.getActiveObject()
      if (activeObject && (activeObject as any).isEditing) {
        return // Let Fabric.js handle paste during text editing
      }

      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return // Let native paste work in inputs
      }

      // Get clipboard data
      const clipboardData = e.clipboardData
      if (!clipboardData) return

      const htmlData = clipboardData.getData('text/html')
      const plainText = clipboardData.getData('text/plain')

      if (!plainText) return

      e.preventDefault()

      // Parse HTML formatting if available
      let formatting = {
        fontFamily: 'Arial',
        fontSize: 16,
        fontWeight: 'normal',
        textAlign: 'left' as 'left' | 'center' | 'right',
        color: '#000000'
      }

      if (htmlData) {
        const parser = new DOMParser()
        const doc = parser.parseFromString(htmlData, 'text/html')
        const body = doc.body

        // Extract inline styles or computed styles
        const firstElement = body.querySelector('p, span, div, td, th, li, h1, h2, h3, h4, h5, h6')
        if (firstElement) {
          const style = (firstElement as HTMLElement).style
          const computedStyle = window.getComputedStyle(firstElement)

          // Font family
          const fontFamily = style.fontFamily || computedStyle.fontFamily
          if (fontFamily && fontFamily !== 'initial') {
            formatting.fontFamily = fontFamily.split(',')[0].replace(/['"]/g, '').trim()
          }

          // Font size
          const fontSize = style.fontSize || computedStyle.fontSize
          if (fontSize) {
            const sizeMatch = fontSize.match(/(\d+(?:\.\d+)?)(px|pt)?/)
            if (sizeMatch) {
              let size = parseFloat(sizeMatch[1])
              const unit = sizeMatch[2]
              // Convert pt to px (1pt = 1.333px approximately)
              if (unit === 'pt') {
                size = size * 1.333
              }
              formatting.fontSize = Math.round(size)
            }
          }

          // Font weight
          const fontWeight = style.fontWeight || computedStyle.fontWeight
          if (fontWeight) {
            const numWeight = parseInt(fontWeight)
            if (!isNaN(numWeight) && numWeight >= 600) {
              formatting.fontWeight = 'bold'
            } else if (fontWeight === 'bold') {
              formatting.fontWeight = 'bold'
            }
          }

          // Check for bold tag
          if (body.querySelector('b, strong')) {
            formatting.fontWeight = 'bold'
          }

          // Text align
          const textAlign = style.textAlign || computedStyle.textAlign
          if (textAlign && ['left', 'center', 'right'].includes(textAlign)) {
            formatting.textAlign = textAlign as 'left' | 'center' | 'right'
          }

          // Color
          const color = style.color || computedStyle.color
          if (color && color !== 'initial') {
            // Convert rgb/rgba to hex
            const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
            if (rgbMatch) {
              const r = parseInt(rgbMatch[1])
              const g = parseInt(rgbMatch[2])
              const b = parseInt(rgbMatch[3])
              formatting.color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
            }
          }
        }
      }

      // Create new text element
      const newElement: CertificateElement = {
        id: `element-${Date.now()}`,
        type: 'text',
        content: plainText,
        x: canvasSize.width / 2,
        y: canvasSize.height / 2,
        fontSize: formatting.fontSize,
        fontWeight: formatting.fontWeight,
        fontFamily: formatting.fontFamily,
        color: formatting.color,
        alignment: formatting.textAlign,
        locked: false,
        zIndex: elements.length,
      }

      setElements(prev => [...prev, newElement])
    }

    document.addEventListener('paste', handlePaste)

    return () => {
      document.removeEventListener('paste', handlePaste)
    }
  }, [canvasSize, elements.length, setElements])

  // Update canvas size and background
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    canvas.setDimensions({
      width: canvasSize.width,
      height: canvasSize.height,
    })

    if (background.type === 'color') {
      canvas.setBackgroundColor(background.color || '#ffffff', () => {
        canvas.renderAll()
      })
      canvas.setBackgroundImage(null as any, () => {
        canvas.renderAll()
      })
    } else if (background.type === 'image' && background.imageUrl) {
      fabric.Image.fromURL(background.imageUrl, (img) => {
        // Scale to fit canvas exactly while maintaining aspect ratio
        const scaleX = canvasSize.width / (img.width || 1)
        const scaleY = canvasSize.height / (img.height || 1)
        img.set({
          scaleX: scaleX,
          scaleY: scaleY,
          left: 0,
          top: 0,
          originX: 'left',
          originY: 'top',
          selectable: false,
          evented: false,
          lockMovementX: true,
          lockMovementY: true,
          lockRotation: true,
          lockScalingX: true,
          lockScalingY: true,
          hasControls: false,
          hasBorders: false,
          absolutePositioned: true,
        })
        canvas.setBackgroundImage(img, () => {
          canvas.renderAll()
        }, {
          // Ensure background is clipped to canvas bounds
          crossOrigin: 'anonymous',
        })
      }, { crossOrigin: 'anonymous' })
    }
    
    // Force canvas to not exceed its set dimensions
    canvas.clipPath = new fabric.Rect({
      left: 0,
      top: 0,
      width: canvasSize.width,
      height: canvasSize.height,
      absolutePositioned: true,
    })
    canvas.renderAll()
  }, [canvasSize, background])

  // Helper function to apply syntax highlighting to variables in text
  const applyVariableStyles = (textObj: fabric.Textbox) => {
    const text = textObj.text || ''
    const variables = extractVariables(text)
    
    if (variables.length === 0) {
      // Clear any existing styles if no variables
      textObj.styles = {}
      return
    }
    
    // Build styles object for Fabric.js
    // Fabric uses styles[lineIndex][charIndex] format
    const lines = text.split('\n')
    const newStyles: Record<number, Record<number, any>> = {}
    
    let globalCharIndex = 0
    lines.forEach((line, lineIndex) => {
      const lineStart = globalCharIndex
      const lineEnd = lineStart + line.length
      
      variables.forEach(v => {
        // Check if this variable is on this line
        if (v.startIndex >= lineStart && v.startIndex < lineEnd) {
          const localStart = v.startIndex - lineStart
          const localEnd = Math.min(v.endIndex - lineStart, line.length)
          
          if (!newStyles[lineIndex]) {
            newStyles[lineIndex] = {}
          }
          
          const color = getVariableColor(v.name)
          
          // Apply style to each character in the variable
          for (let i = localStart; i < localEnd; i++) {
            newStyles[lineIndex][i] = {
              fill: color,
              fontWeight: 'bold',
            }
          }
        }
      })
      
      globalCharIndex = lineEnd + 1 // +1 for newline
    })
    
    textObj.styles = newStyles
  }

  // Compute display elements - in preview mode, replace variables with actual values
  const displayElements = useMemo(() => {
    if (!isPreviewMode || !previewRowData || !csvData) {
      return elements
    }
    
    // Build bindings from preview row data
    const rowBindings: Record<string, string> = {}
    csvData.headers.forEach(header => {
      rowBindings[header] = String(previewRowData[header] || '')
    })
    
    // Also use explicit variable bindings
    Object.entries(variableBindings).forEach(([varName, columnName]) => {
      if (previewRowData[columnName] !== undefined) {
        rowBindings[varName] = String(previewRowData[columnName] || '')
      }
    })
    
    // Replace variables in all text elements
    return elements.map(el => {
      if (el.type === 'text') {
        return {
          ...el,
          content: replaceAllVariables(el.content, rowBindings)
        }
      }
      return el
    })
  }, [elements, isPreviewMode, previewRowData, csvData, variableBindings])

  // Sync elements with Fabric.js objects
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas || !isReady) return

    // Get current object IDs
    const currentObjectIds = canvas.getObjects().map(obj => obj.data?.elementId).filter(Boolean)
    const newElementIds = displayElements.map(el => el.id)

    // Remove objects that no longer exist in elements
    currentObjectIds.forEach(objId => {
      if (!newElementIds.includes(objId)) {
        const obj = canvas.getObjects().find(o => o.data?.elementId === objId)
        if (obj) canvas.remove(obj)
      }
    })

    // Add or update objects
    displayElements.forEach(element => {
      const existingObj = canvas.getObjects().find(obj => obj.data?.elementId === element.id)

      if (element.type === 'text') {
        // In preview mode, disable all interactivity
        const isLocked = element.locked || isPreviewMode
        
        if (existingObj && existingObj.type === 'textbox') {
          // Update existing text object
          const textObj = existingObj as fabric.Textbox
          textObj.set({
            text: element.content,
            left: element.x,
            top: element.y,
            fontSize: element.fontSize || 16,
            fontWeight: element.fontWeight || 'normal',
            fontFamily: element.fontFamily || 'Arial',
            fill: element.color || '#000000',
            textAlign: element.alignment || 'center',
            lockMovementX: isLocked,
            lockMovementY: isLocked,
            lockRotation: isLocked,
            lockScalingX: isLocked,
            lockScalingY: isLocked,
            selectable: !isLocked,
            angle: element.angle || 0,
            scaleX: element.scaleX || 1,
            scaleY: element.scaleY || 1,
            opacity: element.opacity || 1,
            width: canvasSize.width * 0.8, // 80% of canvas width
            splitByGrapheme: false,
            originX: 'left',
            originY: 'top',
            editable: !isPreviewMode,  // Disable text editing in preview mode
            lockScalingFlip: true,
          })
          // Apply variable syntax highlighting (only in edit mode)
          if (!isPreviewMode) {
            applyVariableStyles(textObj)
          } else {
            // Clear styles in preview mode for clean look
            textObj.styles = {}
          }
          // Prevent width from changing
          textObj.setControlsVisibility({
            ml: false, // middle left
            mr: false, // middle right
          })
          textObj.data = { ...textObj.data, locked: element.locked, zIndex: element.zIndex }
        } else {
          // Create new text object
          const textObj = new fabric.Textbox(element.content, {
            left: element.x,
            top: element.y,
            fontSize: element.fontSize || 16,
            fontWeight: element.fontWeight || 'normal',
            fontFamily: element.fontFamily || 'Arial',
            fill: element.color || '#000000',
            textAlign: element.alignment || 'center',
            lockMovementX: isLocked,
            lockMovementY: isLocked,
            lockRotation: isLocked,
            lockScalingX: isLocked,
            lockScalingY: isLocked,
            selectable: !isLocked,
            angle: element.angle || 0,
            scaleX: element.scaleX || 1,
            scaleY: element.scaleY || 1,
            opacity: element.opacity || 1,
            width: canvasSize.width * 0.8, // 80% of canvas width
            splitByGrapheme: false,
            originX: 'left',
            originY: 'top',
            editable: !isPreviewMode,  // Disable text editing in preview mode
            lockScalingFlip: true,
          })
          // Apply variable syntax highlighting (only in edit mode)
          if (!isPreviewMode) {
            applyVariableStyles(textObj)
          }
          // Prevent width from changing
          textObj.setControlsVisibility({
            ml: false, // middle left
            mr: false, // middle right
          })
          textObj.data = { elementId: element.id, locked: element.locked, zIndex: element.zIndex }
          canvas.add(textObj)
        }
      } else if (element.type === 'image' && element.content) {
        // In preview mode, disable all interactivity
        const isLocked = element.locked || isPreviewMode
        
        if (existingObj && existingObj.type === 'image') {
          // Update existing image object
          existingObj.set({
            left: element.x,
            top: element.y,
            lockMovementX: isLocked,
            lockMovementY: isLocked,
            lockRotation: isLocked,
            lockScalingX: isLocked,
            lockScalingY: isLocked,
            selectable: !isLocked,
            angle: element.angle || 0,
            scaleX: element.scaleX || 1,
            scaleY: element.scaleY || 1,
            opacity: element.opacity || 1,
          })
          existingObj.data = { ...existingObj.data, locked: element.locked, zIndex: element.zIndex }
        } else {
          // Create new image object
          fabric.Image.fromURL(element.content, (img) => {
            img.set({
              left: element.x,
              top: element.y,
              lockMovementX: isLocked,
              lockMovementY: isLocked,
              lockRotation: isLocked,
              lockScalingX: isLocked,
              lockScalingY: isLocked,
              selectable: !isLocked,
              angle: element.angle || 0,
              scaleX: element.scaleX || 1,
              scaleY: element.scaleY || 1,
              opacity: element.opacity || 1,
            })
            img.data = { elementId: element.id, locked: element.locked, zIndex: element.zIndex }
            canvas.add(img)
            canvas.renderAll()
          }, { crossOrigin: 'anonymous' })
        }
      }
    })

    // Re-sort objects by zIndex
    const objects = canvas.getObjects().sort((a, b) => {
      const aIndex = a.data?.zIndex || 0
      const bIndex = b.data?.zIndex || 0
      return aIndex - bIndex
    })

    objects.forEach(obj => {
      canvas.bringToFront(obj)
    })

    canvas.renderAll()
  }, [displayElements, isReady, isPreviewMode, canvasSize.width])

  // Select object when selectedElementId changes
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    if (selectedElementId) {
      const obj = canvas.getObjects().find(o => o.data?.elementId === selectedElementId)
      if (obj) {
        canvas.setActiveObject(obj)
        canvas.renderAll()
      }
    } else {
      canvas.discardActiveObject()
      canvas.renderAll()
    }
  }, [selectedElementId])

  // Auto-resize logic with zoom
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [zoomLevel, setZoomLevel] = useState(1)

  useEffect(() => {
    const calculateScale = () => {
      if (!containerRef.current) return
      const container = containerRef.current
      const padding = 16 // Reduced padding
      const availableWidth = container.clientWidth - padding
      const availableHeight = container.clientHeight - padding

      if (availableWidth <= 0 || availableHeight <= 0) return

      const scaleX = availableWidth / canvasSize.width
      const scaleY = availableHeight / canvasSize.height

      // Fit to screen base scale
      const baseScale = Math.min(scaleX, scaleY, 1)
      setScale(baseScale * zoomLevel)
    }

    const observer = new ResizeObserver(calculateScale)
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    // Also recalculate when canvas size changes
    calculateScale()

    return () => observer.disconnect()
  }, [canvasSize, zoomLevel])

  // Handle mouse wheel zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const delta = e.deltaY > 0 ? -0.1 : 0.1
        setZoomLevel(prev => Math.max(0.1, Math.min(prev + delta, 3)))
      }
    }

    const container = containerRef.current
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false })
      return () => container.removeEventListener('wheel', handleWheel)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-center w-full h-full p-2 overflow-hidden bg-gray-100/50 dark:bg-gray-900/50 relative"
    >
      {/* Preview Mode Indicator */}
      {isPreviewMode && (
        <div className="absolute top-4 left-4 bg-green-500 text-white px-3 py-2 rounded-lg shadow-lg z-10 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <div>
            <div className="text-xs font-semibold">Preview Mode</div>
            <div className="text-[10px] opacity-80">View only • Click MAIN to edit</div>
          </div>
        </div>
      )}

      {/* Zoom indicator */}
      <div className="absolute top-4 right-4 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          Zoom: {Math.round(zoomLevel * 100)}%
        </div>
        <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
          Ctrl + Scroll to zoom
        </div>
      </div>

      {/* Variable Binding Popup - only shows when a specific variable is clicked */}
      {bindingPopup && bindingPopup.variable && csvData && !isPreviewMode && (
        <div
          className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 min-w-[220px]"
          style={{
            left: bindingPopup.x,
            top: bindingPopup.y,
            transform: 'translateX(-50%)'
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span 
                className="font-mono text-sm font-bold px-2 py-0.5 rounded"
                style={{ 
                  backgroundColor: `${getVariableColor(bindingPopup.variable.name)}20`,
                  color: getVariableColor(bindingPopup.variable.name)
                }}
              >
                [{bindingPopup.variable.name}]
              </span>
              <span className="text-gray-400 text-xs">→</span>
            </div>
            <button
              onClick={() => setBindingPopup(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Replace with column:
          </div>
          <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
            {csvData.headers.map(header => (
              <button
                key={header}
                onClick={() => {
                  const targetVar = bindingPopup.variable!
                  const newVarName = `[${header}]`
                  setElements(prev => prev.map(el => {
                    if (el.id === bindingPopup.elementId) {
                      // Replace by position - precise replacement using startIndex
                      const content = el.content
                      const newContent = 
                        content.substring(0, targetVar.startIndex) + 
                        newVarName + 
                        content.substring(targetVar.startIndex + targetVar.fullMatch.length)
                      return {
                        ...el,
                        content: newContent,
                        hasVariables: hasVariables(newContent),
                      }
                    }
                    return el
                  }))
                  setBindingPopup(null)
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-left rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <span 
                  className="font-mono font-bold px-1.5 py-0.5 rounded text-xs"
                  style={{ 
                    backgroundColor: `${getVariableColor(header)}20`,
                    color: getVariableColor(header)
                  }}
                >
                  [{header}]
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        id="certificate-canvas-container"
        className="relative shadow-2xl border-2 border-gray-200 dark:border-gray-700 transition-transform duration-200 ease-out origin-center bg-white"
        style={{
          width: canvasSize.width,
          height: canvasSize.height,
          transform: `scale(${scale})`
        }}
      >
        <canvas
          ref={canvasRef}
          id="certificate-canvas"
        />
      </div>
    </div>
  )
}
