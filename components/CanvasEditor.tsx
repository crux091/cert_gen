'use client'

import { useRef, useEffect, useState, useMemo, useCallback, MutableRefObject } from 'react'
import { fabric } from 'fabric'
import { CertificateElement, CanvasBackground, CSVData, VariableBindings, TextSelection, CharacterStyle, RichTextStyles, VariableStyles } from '@/types/certificate'
import { Dispatch, SetStateAction } from 'react'
import { hasVariables, extractVariables, replaceAllVariables } from '@/lib/variableParser'

// CRITICAL: Disable Fabric.js retina scaling to prevent 1/4 canvas rendering issue
// This must be set BEFORE any canvas is created
if (typeof window !== 'undefined') {
  (fabric as any).devicePixelRatio = 1
}

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

// Image loading constants
const IMAGE_LOAD_TIMEOUT = 30000 // 30 seconds timeout for large images

// Utility function to verify image data URL can be loaded
function loadAndVerifyImage(imageUrl: string, timeout: number = IMAGE_LOAD_TIMEOUT): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    let timeoutId: NodeJS.Timeout | null = null
    
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }
    
    timeoutId = setTimeout(() => {
      cleanup()
      img.src = '' // Cancel loading
      reject(new Error('Image load timeout'))
    }, timeout)
    
    img.onload = () => {
      cleanup()
      // Verify image has valid dimensions
      if (img.width > 0 && img.height > 0) {
        resolve(img)
      } else {
        reject(new Error('Image has invalid dimensions'))
      }
    }
    
    img.onerror = () => {
      cleanup()
      reject(new Error('Failed to load image'))
    }
    
    img.src = imageUrl
  })
}

// Safely load fabric.Image with verification and timeout
function loadFabricImageSafe(
  imageUrl: string, 
  timeout: number = IMAGE_LOAD_TIMEOUT
): Promise<fabric.Image> {
  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout | null = null
    let resolved = false
    
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }
    
    timeoutId = setTimeout(() => {
      if (!resolved) {
        cleanup()
        reject(new Error('Fabric image load timeout'))
      }
    }, timeout)
    
    fabric.Image.fromURL(imageUrl, (img) => {
      resolved = true
      cleanup()
      
      // Verify the image was loaded successfully
      if (!img || !img.width || !img.height || img.width === 0 || img.height === 0) {
        reject(new Error('Fabric failed to load image properly'))
        return
      }
      
      resolve(img)
    }, { crossOrigin: 'anonymous' })
  })
}

// Helper function to strip fill colors from styles (fill is for syntax highlighting only)
function stripFillFromStyles(styles: Record<number, Record<number, any>> | undefined): Record<number, Record<number, any>> {
  if (!styles) return {}
  
  const cleanedStyles: Record<number, Record<number, any>> = {}
  
  Object.entries(styles).forEach(([lineIdx, lineStyles]) => {
    const lineIndex = parseInt(lineIdx)
    if (typeof lineStyles === 'object' && lineStyles !== null) {
      Object.entries(lineStyles).forEach(([charIdx, charStyle]) => {
        const charIndex = parseInt(charIdx)
        if (charStyle && typeof charStyle === 'object') {
          // Copy style but exclude fill
          const { fill, ...styleWithoutFill } = charStyle
          if (Object.keys(styleWithoutFill).length > 0) {
            if (!cleanedStyles[lineIndex]) {
              cleanedStyles[lineIndex] = {}
            }
            cleanedStyles[lineIndex][charIndex] = styleWithoutFill
          }
        }
      })
    }
  })
  
  return cleanedStyles
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
  pushToHistory: () => void
  pushToHistoryDebounced: () => void
  onUndo: () => void
  onRedo: () => void
  setTextSelection: Dispatch<SetStateAction<TextSelection>>
  applySelectionStyleRef: MutableRefObject<((style: CharacterStyle) => void) | null>
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
  pushToHistory,
  pushToHistoryDebounced,
  onUndo,
  onRedo,
  setTextSelection,
  applySelectionStyleRef,
}: CanvasEditorProps) {
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null)
  const [isReady, setIsReady] = useState(false)
  
  // Background loading state
  const [isBackgroundLoading, setIsBackgroundLoading] = useState(false)
  const [backgroundError, setBackgroundError] = useState<string | null>(null)
  const lastSuccessfulBackgroundRef = useRef<fabric.Image | null>(null)
  const backgroundLoadIdRef = useRef<number>(0)
  
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

  // Apply style to selected text range
  const applySelectionStyle = useCallback((style: CharacterStyle) => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    
    const activeObject = canvas.getActiveObject() as fabric.Textbox
    if (!activeObject || activeObject.type !== 'textbox') return
    if (!activeObject.isEditing) return
    
    const selectionStart = activeObject.selectionStart ?? 0
    const selectionEnd = activeObject.selectionEnd ?? 0
    
    if (selectionStart === selectionEnd) return // No selection
    
    const text = activeObject.text || ''
    const lines = text.split('\n')
    
    // Extract variables to detect if selection is on a variable
    const variables = extractVariables(text)
    
    // Find which variables are fully or partially selected, with their occurrence index
    const selectedVariables: { name: string; startIndex: number; endIndex: number; occurrenceIndex: number }[] = []
    
    // Count occurrences of each variable name to determine occurrence index
    const variableOccurrences: Record<string, number> = {}
    variables.forEach(v => {
      const occurrenceIndex = variableOccurrences[v.name] || 0
      variableOccurrences[v.name] = occurrenceIndex + 1
      
      // Check if selection overlaps with this variable
      if (selectionStart < v.endIndex && selectionEnd > v.startIndex) {
        selectedVariables.push({ ...v, occurrenceIndex })
      }
    })
    
    // Get current styles or initialize empty
    const currentStyles = activeObject.styles || {}
    const newStyles: Record<number, Record<number, any>> = JSON.parse(JSON.stringify(currentStyles))
    
    // Calculate line/char positions for selection range
    let globalCharIndex = 0
    lines.forEach((line, lineIndex) => {
      const lineStart = globalCharIndex
      const lineEnd = lineStart + line.length
      
      // Check if this line overlaps with selection
      const selStart = Math.max(selectionStart, lineStart)
      const selEnd = Math.min(selectionEnd, lineEnd)
      
      if (selStart < selEnd) {
        // This line has selected characters
        if (!newStyles[lineIndex]) {
          newStyles[lineIndex] = {}
        }
        
        for (let i = selStart - lineStart; i < selEnd - lineStart; i++) {
          if (!newStyles[lineIndex][i]) {
            newStyles[lineIndex][i] = {}
          }
          // Apply/toggle the style
          Object.entries(style).forEach(([key, value]) => {
            if (key === 'fontWeight') {
              // Toggle bold
              newStyles[lineIndex][i].fontWeight = 
                newStyles[lineIndex][i].fontWeight === 'bold' ? 'normal' : value
            } else if (key === 'fontStyle') {
              // Toggle italic
              newStyles[lineIndex][i].fontStyle = 
                newStyles[lineIndex][i].fontStyle === 'italic' ? 'normal' : value
            } else if (key === 'textDecoration') {
              // Toggle underline - Fabric.js uses 'underline' property with boolean
              newStyles[lineIndex][i].underline = 
                newStyles[lineIndex][i].underline === true ? false : true
            } else {
              // Direct set for other styles (fill, fontSize, etc.)
              newStyles[lineIndex][i][key] = value
            }
          })
        }
      }
      
      globalCharIndex = lineEnd + 1 // +1 for newline
    })
    
    // Push to history before applying
    pushToHistory()
    
    // Apply styles to fabric object
    activeObject.styles = newStyles
    canvas.renderAll()
    
    // Build variable styles update - extract the style applied to each variable
    const elementId = activeObject.data?.elementId
    if (elementId) {
      // For each selected variable, save its formatting to variableStyles
      // Key format: "{variableName}_{occurrenceIndex}" to treat each occurrence separately
      const variableStylesUpdate: VariableStyles = {}
      
      selectedVariables.forEach(v => {
        // Use occurrence-based key to treat each occurrence as separate entity
        const varKey = `${v.name}_${v.occurrenceIndex}`
        
        // Get the style applied to the first character of this variable
        // (we assume uniform styling across the variable)
        let varLineIndex = 0
        let varCharIndex = v.startIndex
        
        // Find the line and local char index for this variable
        let charCount = 0
        for (let li = 0; li < lines.length; li++) {
          if (charCount + lines[li].length > v.startIndex) {
            varLineIndex = li
            varCharIndex = v.startIndex - charCount
            break
          }
          charCount += lines[li].length + 1
        }
        
        // Get the style at this position
        const charStyle = newStyles[varLineIndex]?.[varCharIndex] || {}
        
        // Only save relevant formatting properties (not fill which is variable color)
        const styleToSave: CharacterStyle = {}
        if (charStyle.fontWeight && charStyle.fontWeight !== 'normal') {
          styleToSave.fontWeight = charStyle.fontWeight
        }
        if (charStyle.fontStyle && charStyle.fontStyle !== 'normal') {
          styleToSave.fontStyle = charStyle.fontStyle
        }
        if (charStyle.underline) {
          styleToSave.underline = true
        }
        
        if (Object.keys(styleToSave).length > 0) {
          variableStylesUpdate[varKey] = styleToSave
        }
      })
      
      setElements(prev => prev.map(el => {
        if (el.id !== elementId) return el
        
        // Merge with existing variable styles
        const existingVarStyles = el.variableStyles || {}
        const mergedVarStyles = { ...existingVarStyles }
        
        // Update or clear styles for selected variables
        selectedVariables.forEach(v => {
          const varKey = `${v.name}_${v.occurrenceIndex}`
          
          if (variableStylesUpdate[varKey]) {
            mergedVarStyles[varKey] = { 
              ...(mergedVarStyles[varKey] || {}),
              ...variableStylesUpdate[varKey]
            }
          } else {
            // If no style was applied (toggled off), remove it
            // Check if toggle turned it off
            const varLineIndex = (() => {
              let charCount = 0
              for (let li = 0; li < lines.length; li++) {
                if (charCount + lines[li].length > v.startIndex) {
                  return li
                }
                charCount += lines[li].length + 1
              }
              return 0
            })()
            const varCharIndex = (() => {
              let charCount = 0
              for (let li = 0; li < lines.length; li++) {
                if (charCount + lines[li].length > v.startIndex) {
                  return v.startIndex - charCount
                }
                charCount += lines[li].length + 1
              }
              return 0
            })()
            
            const currentCharStyle = newStyles[varLineIndex]?.[varCharIndex] || {}
            
            // Update individual properties based on what was toggled
            if (style.fontWeight) {
              if (currentCharStyle.fontWeight === 'normal' || !currentCharStyle.fontWeight) {
                delete mergedVarStyles[varKey]?.fontWeight
              }
            }
            if (style.fontStyle) {
              if (currentCharStyle.fontStyle === 'normal' || !currentCharStyle.fontStyle) {
                delete mergedVarStyles[varKey]?.fontStyle
              }
            }
            if (style.textDecoration) {
              if (!currentCharStyle.underline) {
                delete mergedVarStyles[varKey]?.underline
              }
            }
            
            // Clean up empty variable style objects
            if (mergedVarStyles[varKey] && Object.keys(mergedVarStyles[varKey]).length === 0) {
              delete mergedVarStyles[varKey]
            }
          }
        })
        
        // Strip fill colors from newStyles before saving (they're variable syntax highlighting, not user styles)
        const stylesToSave: Record<number, Record<number, any>> = {}
        Object.entries(newStyles).forEach(([lineIdx, lineStyles]) => {
          const lineIndex = parseInt(lineIdx)
          Object.entries(lineStyles).forEach(([charIdx, charStyle]) => {
            const charIndex = parseInt(charIdx)
            // Copy style but exclude fill
            const { fill, ...styleWithoutFill } = charStyle || {}
            if (Object.keys(styleWithoutFill).length > 0) {
              if (!stylesToSave[lineIndex]) {
                stylesToSave[lineIndex] = {}
              }
              stylesToSave[lineIndex][charIndex] = styleWithoutFill
            }
          })
        })
        
        return { 
          ...el, 
          styles: Object.keys(stylesToSave).length > 0 ? stylesToSave : undefined,
          variableStyles: Object.keys(mergedVarStyles).length > 0 ? mergedVarStyles : undefined
        }
      }))
    }
  }, [pushToHistory, setElements])
  
  // Register the applySelectionStyle function to the ref
  useEffect(() => {
    applySelectionStyleRef.current = applySelectionStyle
    return () => {
      applySelectionStyleRef.current = null
    }
  }, [applySelectionStyle, applySelectionStyleRef])

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
    const host = canvasHostRef.current
    if (!host || fabricCanvasRef.current) return

    // Patch Fabric Textbox controls once to behave like Canva/Figma:
    // resizing changes container width/height and keeps glyphs unscaled.
    const textboxProto: any = (fabric.Textbox as any).prototype
    if (textboxProto && !textboxProto.__nonStretchResizePatched) {
      const minSize = 10
      const wrapActionHandler = (originalHandler: any) => {
        return function wrappedTextboxResizeHandler(eventData: any, transform: any, x: number, y: number) {
          const performed = originalHandler ? originalHandler(eventData, transform, x, y) : false
          const target = transform?.target as any
          const canvas = target?.canvas as fabric.Canvas | undefined
          if (!target || target.type !== 'textbox' || !canvas) return performed

          const currentFixedHeight = (target.data && typeof target.data.fixedHeight === 'number')
            ? target.data.fixedHeight
            : (typeof target.height === 'number' ? target.height : 0)

          const scaledWidth = Math.max(minSize, Math.round((target.width || 0) * (target.scaleX || 1)))
          const scaledHeight = Math.max(minSize, Math.round((target.height || 0) * (target.scaleY || 1)))

          // If the user dragged vertically (top/bottom/corner), adopt that as the new fixed container height.
          const nextFixedHeight = (target.scaleY && target.scaleY !== 1) ? scaledHeight : currentFixedHeight

          target.data = { ...(target.data || {}), fixedHeight: nextFixedHeight }

          // Convert any scaling into real dimensions and reset scale to avoid glyph distortion.
          // Note: width changes trigger Textbox.initDimensions (re-wrap), which also recalculates height.
          // We immediately restore the fixed container height afterwards.
          if (target.scaleX && target.scaleX !== 1) {
            target.set({ width: scaledWidth, scaleX: 1 })
          }
          if (target.scaleY && target.scaleY !== 1) {
            target.set({ scaleY: 1 })
          }

          // Keep container height stable during wrapping/resizing.
          target.set({ height: nextFixedHeight })
          target.setCoords()
          canvas.requestRenderAll()

          return performed
        }
      }

      const controls = textboxProto.controls
      const keys = ['ml', 'mr', 'mt', 'mb', 'tl', 'tr', 'bl', 'br']
      keys.forEach((k) => {
        if (controls?.[k]?.actionHandler) {
          controls[k].actionHandler = wrapActionHandler(controls[k].actionHandler)
        }
      })

      textboxProto.__nonStretchResizePatched = true
    }

    // IMPORTANT:
    // Fabric mutates the DOM around the canvas (wraps it, adds upper canvas + hidden textarea).
    // If React owns the <canvas> element, React reconciliation can crash with
    // "Failed to execute 'insertBefore'" when Fabric has moved/replaced nodes.
    // To avoid that, we create/attach the <canvas> imperatively inside a stable host div.
    host.innerHTML = ''
    const canvasEl = document.createElement('canvas')
    canvasEl.id = 'certificate-canvas'
    host.appendChild(canvasEl)
    canvasRef.current = canvasEl
    
    // Use container size for the canvas element (display size)
    const container = containerRef.current
    const containerWidth = container?.offsetWidth || 800
    const containerHeight = container?.offsetHeight || 600

    const canvas = new fabric.Canvas(canvasEl, {
      width: containerWidth,
      height: containerHeight,
      backgroundColor: background.type === 'color' ? background.color || '#ffffff' : '#ffffff',
      preserveObjectStacking: true,
      selection: true,
    })

    fabricCanvasRef.current = canvas

    // Store canvas instance on the canvas element for export access
    // @ts-ignore
    canvasEl.__fabricCanvas = canvas

    setIsReady(true)
    // fitCanvasToContainer will be called by the isReady effect

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

      // Save state before this modification for undo
      pushToHistory()

      const elementId = obj.data.elementId
      setElements(prev => prev.map(el => {
        if (el.id === elementId) {
          // Textboxes should persist as true container dimensions (no scale distortion).
          if (obj.type === 'textbox') {
            const textbox = obj as fabric.Textbox
            const nextWidth = Math.round(textbox.width || 0)
            const nextHeight = Math.round(textbox.height || 0)

            // Ensure Fabric object is normalized as well.
            textbox.set({ scaleX: 1, scaleY: 1, width: nextWidth, height: nextHeight })
            textbox.data = { ...(textbox.data || {}), fixedHeight: nextHeight }
            textbox.setCoords()

            return {
              ...el,
              x: Math.round(textbox.left || 0),
              y: Math.round(textbox.top || 0),
              width: nextWidth,
              height: nextHeight,
              angle: textbox.angle || 0,
              scaleX: 1,
              scaleY: 1,
            }
          }

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
        // Do not force width during editing; users define the wrapping box.
        obj.data.fixedHeight = typeof obj.data.fixedHeight === 'number' ? obj.data.fixedHeight : obj.height
        obj.set({ splitByGrapheme: false, height: obj.data.fixedHeight })
        canvas.renderAll()
      }
    })

    canvas.on('text:editing:exited', (e) => {
      const obj = e.target as fabric.Textbox
      if (obj && obj.data?.elementId) {
        // Restore position; keep user-defined wrapping box dimensions.
        const fixedHeight = typeof obj.data.fixedHeight === 'number' ? obj.data.fixedHeight : obj.height
        obj.set({
          splitByGrapheme: false,
          left: obj.data.originalLeft || obj.left,
          top: obj.data.originalTop || obj.top,
          height: fixedHeight,
          scaleX: 1,
          scaleY: 1,
        })
        canvas.renderAll()
      }
    })

    canvas.on('text:changed', (e) => {
      const obj = e.target as fabric.Textbox
      if (!obj || !obj.data?.elementId) return

      // Textbox.initDimensions recalculates height on changes; restore fixed container height.
      const fixedHeight = typeof obj.data.fixedHeight === 'number' ? obj.data.fixedHeight : obj.height
      if (typeof fixedHeight === 'number' && fixedHeight > 0) {
        obj.set({ height: fixedHeight, scaleX: 1, scaleY: 1 })
        canvas.requestRenderAll()
      }

      // Use debounced history push for text changes
      pushToHistoryDebounced()

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
      const elementId = obj.data?.elementId
      
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
      
      // We need to get variableStyles from elements, but elements might be stale
      // So we'll read it via setElements callback to get latest
      setElements(prev => {
        const currentElement = prev.find(el => el.id === elementId)
        const variableFormats = currentElement?.variableStyles || {}
        
        // Build merged styles with variable formatting applied to ALL characters
        const mergedStyles: Record<number, Record<number, any>> = {}
        
        if (variables.length > 0) {
          const lines = text.split('\n')
          
          // Track occurrence count for each variable name
          const variableOccurrences: Record<string, number> = {}
          
          let globalCharIndex = 0
          lines.forEach((line, lineIndex) => {
            const lineStart = globalCharIndex
            const lineEnd = lineStart + line.length
            
            variables.forEach(v => {
              if (v.startIndex >= lineStart && v.startIndex < lineEnd) {
                const localStart = v.startIndex - lineStart
                const localEnd = Math.min(v.endIndex - lineStart, line.length)
                
                if (!mergedStyles[lineIndex]) {
                  mergedStyles[lineIndex] = {}
                }
                
                const color = getVariableColor(v.name)
                
                // Get occurrence index for this variable
                const occurrenceIndex = variableOccurrences[v.name] || 0
                variableOccurrences[v.name] = occurrenceIndex + 1
                
                // Use occurrence-based key to get formatting
                const varKey = `${v.name}_${occurrenceIndex}`
                const varFormat = variableFormats[varKey] || {}
                
                // Apply style to ALL characters of this variable
                for (let i = localStart; i < localEnd; i++) {
                  mergedStyles[lineIndex][i] = {
                    ...varFormat,  // Apply variable-specific formatting
                    fill: color,   // Variable color for syntax highlighting
                  }
                }
              }
            })
            
            globalCharIndex = lineEnd + 1
          })
        }
        
        obj.styles = mergedStyles
        canvas.renderAll()
        
        // Return unchanged elements (we're just reading)
        return prev
      })
    })

    // Keyboard event for deleting objects and undo/redo
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!canvas) return

      const target = e.target as HTMLElement
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

      // Handle Undo (Ctrl+Z)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        // Allow undo even if editing text, but not in input fields
        if (isInputField) return
        e.preventDefault()
        onUndo()
        return
      }

      // Handle Redo (Ctrl+Y or Ctrl+Shift+Z)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z') || (e.shiftKey && e.key === 'Z'))) {
        if (isInputField) return
        e.preventDefault()
        onRedo()
        return
      }

      const activeObject = canvas.getActiveObject()
      if (!activeObject) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Allow deletion if not typing in input
        if (isInputField) {
          return
        }

        // Check if object is locked
        if (activeObject.data?.locked) {
          alert('This element is locked. Please unlock it first to delete.')
          return
        }

        e.preventDefault()

        // Save state before deletion for undo
        pushToHistory()

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
      canvasRef.current = null
      host.innerHTML = ''
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
      const domCanvas = (canvas as any).upperCanvasEl || (canvas as any).lowerCanvasEl || canvasRef.current
      if (!domCanvas) return

      const canvasRect = (domCanvas as HTMLCanvasElement).getBoundingClientRect()
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

  // Track text selection for inline formatting
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    
    // Track selection changes in textbox
    const handleSelectionChanged = () => {
      const activeObject = canvas.getActiveObject() as fabric.Textbox
      if (!activeObject || activeObject.type !== 'textbox' || !activeObject.isEditing) {
        setTextSelection({
          elementId: null,
          start: 0,
          end: 0,
          hasSelection: false,
        })
        return
      }
      
      const start = activeObject.selectionStart ?? 0
      const end = activeObject.selectionEnd ?? 0
      
      setTextSelection({
        elementId: activeObject.data?.elementId || null,
        start,
        end,
        hasSelection: start !== end,
      })
    }
    
    // Clear selection when exiting edit mode
    const handleEditingExited = (e: fabric.IEvent) => {
      setTextSelection({
        elementId: null,
        start: 0,
        end: 0,
        hasSelection: false,
      })
      
      // Sync styles back to element state - use e.target which is the textbox being exited
      const textbox = e.target as fabric.Textbox
      if (textbox && textbox.type === 'textbox' && textbox.data?.elementId) {
        const elementId = textbox.data.elementId
        // Extract only user-applied styles (not variable colors) by filtering out variable positions
        const canvasStyles = textbox.styles || {}
        const text = textbox.text || ''
        const variables = extractVariables(text)
        
        // Create a copy of styles, removing variable-specific styling
        const userStyles: Record<number, Record<number, any>> = {}
        const lines = text.split('\n')
        
        // Build set of variable character positions to exclude variable-specific colors
        const variablePositions = new Set<string>()
        let globalCharIndex = 0
        lines.forEach((line, lineIndex) => {
          const lineStart = globalCharIndex
          const lineEnd = lineStart + line.length
          
          variables.forEach(v => {
            if (v.startIndex >= lineStart && v.startIndex < lineEnd) {
              const localStart = v.startIndex - lineStart
              const localEnd = Math.min(v.endIndex - lineStart, line.length)
              for (let i = localStart; i < localEnd; i++) {
                variablePositions.add(`${lineIndex}-${i}`)
              }
            }
          })
          
          globalCharIndex = lineEnd + 1
        })
        
        // Copy styles, preserving user formatting but excluding variable colors
        Object.entries(canvasStyles).forEach(([lineIdx, lineStyles]) => {
          const lineIndex = parseInt(lineIdx)
          if (typeof lineStyles === 'object' && lineStyles !== null) {
            Object.entries(lineStyles as Record<number, any>).forEach(([charIdx, charStyle]) => {
              const charIndex = parseInt(charIdx)
              const posKey = `${lineIndex}-${charIndex}`
              
              // Copy the style, but for variable positions, don't save the fill color
              // (it will be re-applied by variable highlighting)
              const styleToSave = { ...charStyle }
              if (variablePositions.has(posKey)) {
                delete styleToSave.fill // Don't persist variable colors
              }
              
              // Only save if there's something meaningful left
              if (Object.keys(styleToSave).length > 0) {
                if (!userStyles[lineIndex]) {
                  userStyles[lineIndex] = {}
                }
                userStyles[lineIndex][charIndex] = styleToSave
              }
            })
          }
        })
        
        setElements(prev => prev.map(el => 
          el.id === elementId ? { ...el, styles: userStyles } : el
        ))
      }
    }
    
    canvas.on('text:selection:changed', handleSelectionChanged)
    canvas.on('text:editing:exited', handleEditingExited)
    
    // Also listen to mouse:up for selection changes
    const handleMouseUp = () => {
      setTimeout(handleSelectionChanged, 0)
    }
    document.addEventListener('mouseup', handleMouseUp)
    
    return () => {
      canvas.off('text:selection:changed', handleSelectionChanged)
      canvas.off('text:editing:exited', handleEditingExited)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [setTextSelection, setElements])

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

      // Save state before adding element for undo
      pushToHistory()
      setElements(prev => [...prev, newElement])
    }

    document.addEventListener('paste', handlePaste)

    return () => {
      document.removeEventListener('paste', handlePaste)
    }
  }, [canvasSize, elements.length, setElements, pushToHistory])

  // Update canvas size and background
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    // Set canvas element dimensions to match container for display
    const containerWidth = container.offsetWidth
    const containerHeight = container.offsetHeight
    
    canvas.setDimensions(
      { width: containerWidth, height: containerHeight },
      { cssOnly: false, backstoreOnly: false }
    )
    canvas.clipPath = undefined
    canvas.calcOffset()
    
    // fitWorkspaceToScreen will be called by the isReady effect or resize observer

    if (background.type === 'color') {
      // Clear any background error when switching to color
      setBackgroundError(null)
      setIsBackgroundLoading(false)
      
      // Dispose of previous background image to free memory
      const prevBg = canvas.backgroundImage as fabric.Image | null
      if (prevBg && typeof prevBg.dispose === 'function') {
        prevBg.dispose()
      }
      lastSuccessfulBackgroundRef.current = null
      
      canvas.setBackgroundColor(background.color || '#ffffff', () => {
        canvas.renderAll()
      })
      canvas.setBackgroundImage(null as any, () => {
        canvas.renderAll()
      })
    } else if (background.type === 'image' && background.imageUrl) {
      // Increment load ID to track this specific load operation
      const loadId = ++backgroundLoadIdRef.current
      
      const loadBackgroundImage = async () => {
        setIsBackgroundLoading(true)
        setBackgroundError(null)
        
        try {
          // First verify the image can be loaded
          await loadAndVerifyImage(background.imageUrl!)
          
          // Check if this load operation is still current
          if (loadId !== backgroundLoadIdRef.current) {
            console.log('Background load cancelled - newer load in progress')
            return
          }
          
          // Load with Fabric.js
          const img = await loadFabricImageSafe(background.imageUrl!)
          
          // Check again if still current
          if (loadId !== backgroundLoadIdRef.current) {
            console.log('Background load cancelled after fabric load - newer load in progress')
            if (img && typeof img.dispose === 'function') {
              img.dispose()
            }
            return
          }
          
          // Dispose of previous background image to free memory
          const prevBg = canvas.backgroundImage as fabric.Image | null
          if (prevBg && typeof prevBg.dispose === 'function') {
            prevBg.dispose()
          }
          
          // Scale to fit canvas exactly
          const imgWidth = img.width || 1
          const imgHeight = img.height || 1
          const scaleX = canvasSize.width / imgWidth
          const scaleY = canvasSize.height / imgHeight
          
          // Apply scale before setting as background
          img.scaleX = scaleX
          img.scaleY = scaleY
          img.left = 0
          img.top = 0
          img.originX = 'left'
          img.originY = 'top'
          img.selectable = false
          img.evented = false
          
          // Use setBackgroundImage with the pre-scaled image
          canvas.setBackgroundImage(img, () => {
            canvas.renderAll()
          })
          
          // Store as last successful background
          lastSuccessfulBackgroundRef.current = img
          setBackgroundError(null)
          
        } catch (error) {
          console.error('Failed to load background image:', error)
          
          // Only update state if this is still the current load operation
          if (loadId !== backgroundLoadIdRef.current) {
            return
          }
          
          setBackgroundError(
            error instanceof Error ? error.message : 'Failed to load background image'
          )
          
          // Fallback: try to use last successful background if available
          if (lastSuccessfulBackgroundRef.current) {
            console.log('Using last successful background as fallback')
            const fallbackImg = lastSuccessfulBackgroundRef.current
            
            // Rescale for current canvas size
            const imgWidth = fallbackImg.width || 1
            const imgHeight = fallbackImg.height || 1
            fallbackImg.scaleX = canvasSize.width / imgWidth
            fallbackImg.scaleY = canvasSize.height / imgHeight
            
            canvas.setBackgroundImage(fallbackImg, () => {
              canvas.renderAll()
            })
          } else {
            // No fallback available - set a white background
            canvas.setBackgroundColor('#ffffff', () => {
              canvas.renderAll()
            })
          }
        } finally {
          if (loadId === backgroundLoadIdRef.current) {
            setIsBackgroundLoading(false)
          }
        }
      }
      
      loadBackgroundImage()
    }
    
    canvas.renderAll()
  }, [canvasSize, background])

  // Helper function to apply syntax highlighting to variables in text
  const applyVariableStyles = (textObj: fabric.Textbox, userStyles?: RichTextStyles, variableFormats?: VariableStyles) => {
    const text = textObj.text || ''
    const variables = extractVariables(text)
    
    // Start fresh - we'll rebuild styles from scratch
    const newStyles: Record<number, Record<number, any>> = {}
    
    // First, copy user styles but REMOVE any fill colors (those will be re-applied fresh)
    // This prevents stale variable colors from persisting at wrong positions
    if (userStyles) {
      Object.entries(userStyles).forEach(([lineIdx, lineStyles]) => {
        const lineIndex = parseInt(lineIdx)
        if (!newStyles[lineIndex]) {
          newStyles[lineIndex] = {}
        }
        Object.entries(lineStyles).forEach(([charIdx, charStyle]) => {
          const charIndex = parseInt(charIdx)
          // Copy style but exclude fill - we'll set fill based on current variable positions
          if (charStyle) {
            const { fill, ...styleWithoutFill } = charStyle
            if (Object.keys(styleWithoutFill).length > 0) {
              newStyles[lineIndex][charIndex] = styleWithoutFill
            }
          }
        })
      })
    }
    
    if (variables.length === 0) {
      // No variables - apply user styles without fill colors (use default text color)
      textObj.styles = newStyles
      return
    }
    
    // Build a set of character positions that are inside variables
    const variableCharPositions = new Set<string>() // "lineIndex,charIndex"
    
    // Build styles object for Fabric.js
    // Fabric uses styles[lineIndex][charIndex] format
    const lines = text.split('\n')
    
    // Track occurrence count for each variable name
    const variableOccurrences: Record<string, number> = {}
    
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
          
          // Get the occurrence index for this variable
          const occurrenceIndex = variableOccurrences[v.name] || 0
          variableOccurrences[v.name] = occurrenceIndex + 1
          
          // Use occurrence-based key to get formatting for this specific occurrence
          const varKey = `${v.name}_${occurrenceIndex}`
          const varFormat = variableFormats?.[varKey] || {}
          
          // Apply style to each character in the variable
          // Apply variable color + any user-defined formatting to ALL characters
          for (let i = localStart; i < localEnd; i++) {
            // Mark this position as a variable position
            variableCharPositions.add(`${lineIndex},${i}`)
            
            // Merge with existing style (which may have bold/italic from user)
            newStyles[lineIndex][i] = {
              ...(newStyles[lineIndex][i] || {}),
              ...varFormat,  // Apply variable-specific formatting
              fill: color,   // Apply color for syntax highlighting
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
    
    // Replace variables in all text elements and rebuild styles for preview
    return elements.map(el => {
      if (el.type === 'text') {
        const originalContent = el.content
        const variables = extractVariables(originalContent)
        const variableStylesMap = el.variableStyles || {}
        
        // If no variables, strip fill colors and return
        if (variables.length === 0) {
          return {
            ...el,
            content: replaceAllVariables(el.content, rowBindings),
            styles: stripFillFromStyles(el.styles) // Strip fill colors
          }
        }
        
        // Build new styles for the replaced content
        // We need to track position shifts as variables are replaced
        const newContent = replaceAllVariables(originalContent, rowBindings)
        const newStyles: RichTextStyles = {}
        
        // Calculate position mappings from original to new
        // Sort variables by start position
        const sortedVars = [...variables].sort((a, b) => a.startIndex - b.startIndex)
        
        // Track cumulative offset and occurrence counts
        let offset = 0
        const variableOccurrences: Record<string, number> = {}
        
        const varReplacements: { 
          originalStart: number
          originalEnd: number
          newStart: number
          newEnd: number
          name: string
          occurrenceIndex: number
          replacement: string
        }[] = []
        
        sortedVars.forEach(v => {
          const replacement = rowBindings[v.name] || `[${v.name}]`
          const originalLen = v.endIndex - v.startIndex
          const newLen = replacement.length
          
          // Get occurrence index for this variable
          const occurrenceIndex = variableOccurrences[v.name] || 0
          variableOccurrences[v.name] = occurrenceIndex + 1
          
          varReplacements.push({
            originalStart: v.startIndex,
            originalEnd: v.endIndex,
            newStart: v.startIndex + offset,
            newEnd: v.startIndex + offset + newLen,
            name: v.name,
            occurrenceIndex,
            replacement
          })
          
          offset += newLen - originalLen
        })
        
        // Apply variable styles to replacement positions using occurrence-based keys
        const lines = newContent.split('\n')
        
        varReplacements.forEach(vr => {
          // Use occurrence-based key to get the style for this specific occurrence
          const varKey = `${vr.name}_${vr.occurrenceIndex}`
          const varStyle = variableStylesMap[varKey]
          if (!varStyle) return
          
          // Find which line(s) this replacement spans
          let globalCharIndex = 0
          lines.forEach((line, lineIndex) => {
            const lineStart = globalCharIndex
            const lineEnd = lineStart + line.length
            
            // Check if replacement overlaps with this line
            const repStart = Math.max(vr.newStart, lineStart)
            const repEnd = Math.min(vr.newEnd, lineEnd)
            
            if (repStart < repEnd) {
              if (!newStyles[lineIndex]) {
                newStyles[lineIndex] = {}
              }
              
              // Apply style to each character in the replacement
              for (let i = repStart - lineStart; i < repEnd - lineStart; i++) {
                newStyles[lineIndex][i] = {
                  ...newStyles[lineIndex][i],
                  ...varStyle
                }
              }
            }
            
            globalCharIndex = lineEnd + 1
          })
        })
        
        return {
          ...el,
          content: newContent,
          styles: Object.keys(newStyles).length > 0 ? newStyles : stripFillFromStyles(el.styles)
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

        // Normalize legacy scale-based text sizing into true container dimensions.
        const baseWidth = element.width ?? (canvasSize.width * 0.8)
        const baseHeight = element.height
        const appliedWidth = Math.max(10, Math.round(baseWidth * (element.scaleX || 1)))
        const appliedHeight = Math.max(10, Math.round((baseHeight ?? 0) * (element.scaleY || 1)))
        const hasExplicitHeight = typeof baseHeight === 'number'
        
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
            fontStyle: element.fontStyle || 'normal',
            underline: element.textDecoration === 'underline',
            fill: element.color || '#000000',
            textAlign: element.alignment || 'center',
            lockMovementX: isLocked,
            lockMovementY: isLocked,
            lockRotation: isLocked,
            lockScalingX: isLocked,
            lockScalingY: isLocked,
            selectable: !isLocked,
            angle: element.angle || 0,
            // Keep glyphs unscaled; container size is controlled by width/height.
            scaleX: 1,
            scaleY: 1,
            opacity: element.opacity || 1,
            width: appliedWidth,
            splitByGrapheme: false,
            originX: 'left',
            originY: 'top',
            editable: !isPreviewMode,  // Disable text editing in preview mode
            lockScalingFlip: true,
            lockUniScaling: false,
          })

          // Apply (and persist) a fixed container height (Type Spot).
          const nextHeight = hasExplicitHeight ? appliedHeight : (typeof (textObj.data?.fixedHeight) === 'number' ? textObj.data.fixedHeight : textObj.height)
          textObj.data = { ...(textObj.data || {}), fixedHeight: nextHeight }
          textObj.set({ height: nextHeight })
          // Apply per-character styles from element state (strip fill - it's for syntax highlighting only)
          textObj.styles = stripFillFromStyles(element.styles)
          // Apply variable syntax highlighting (only in edit mode)
          if (!isPreviewMode) {
            // Get original element for variableStyles (displayElements may have modified content)
            const originalElement = elements.find(el => el.id === element.id)
            applyVariableStyles(textObj, element.styles, originalElement?.variableStyles)
          }
          // In preview mode, keep user styles but don't apply variable colors
          textObj.data = { ...textObj.data, locked: element.locked, zIndex: element.zIndex }
        } else {
          // Create new text object
          const textObj = new fabric.Textbox(element.content, {
            left: element.x,
            top: element.y,
            fontSize: element.fontSize || 16,
            fontWeight: element.fontWeight || 'normal',
            fontFamily: element.fontFamily || 'Arial',
            fontStyle: element.fontStyle || 'normal',
            underline: element.textDecoration === 'underline',
            fill: element.color || '#000000',
            textAlign: element.alignment || 'center',
            lockMovementX: isLocked,
            lockMovementY: isLocked,
            lockRotation: isLocked,
            lockScalingX: isLocked,
            lockScalingY: isLocked,
            selectable: !isLocked,
            angle: element.angle || 0,
            scaleX: 1,
            scaleY: 1,
            opacity: element.opacity || 1,
            width: appliedWidth,
            splitByGrapheme: false,
            originX: 'left',
            originY: 'top',
            editable: !isPreviewMode,  // Disable text editing in preview mode
            lockScalingFlip: true,
            lockUniScaling: false,
          })

          const nextHeight = hasExplicitHeight ? appliedHeight : textObj.height
          textObj.data = { elementId: element.id, locked: element.locked, zIndex: element.zIndex, fixedHeight: nextHeight }
          textObj.set({ height: nextHeight })
          // Apply per-character styles from element state (strip fill - it's for syntax highlighting only)
          textObj.styles = stripFillFromStyles(element.styles)
          // Apply variable syntax highlighting (only in edit mode)
          if (!isPreviewMode) {
            // Get original element for variableStyles (displayElements may have modified content)
            const originalElement = elements.find(el => el.id === element.id)
            applyVariableStyles(textObj, element.styles, originalElement?.variableStyles)
          }
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

    // Just render - don't reset viewport (fitCanvasToContainer handles zoom)
    canvas.requestRenderAll()
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

  // Fit-to-screen using Fabric.js viewport transform (preserves native resolution for export)
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoomLevel, setZoomLevel] = useState(1) // User's manual zoom multiplier

  // Fit workspace to screen - uses Fabric.js viewport transform, NOT CSS
  const fitWorkspaceToScreen = useCallback(() => {
    const canvas = fabricCanvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    // Store content dimensions on canvas for export functions
    const designWidth = canvasSize.width
    const designHeight = canvasSize.height
    ;(canvas as any)._contentWidth = designWidth
    ;(canvas as any)._contentHeight = designHeight

    const padding = 50 // Padding around the canvas
    const containerWidth = container.offsetWidth
    const containerHeight = container.offsetHeight

    if (containerWidth <= 0 || containerHeight <= 0) return
    
    // Update canvas element size to match container
    canvas.setDimensions(
      { width: containerWidth, height: containerHeight },
      { cssOnly: false, backstoreOnly: false }
    )

    // Step 1: Calculate scale to fit design in container (with padding)
    const scale = Math.min(
      (containerWidth - padding) / designWidth,
      (containerHeight - padding) / designHeight
    )

    // Apply user's manual zoom multiplier
    const finalScale = scale * zoomLevel

    // Step 2: Calculate centering offsets (panX and panY)
    // This formula ensures the scaled content is mathematically centered
    const panX = (containerWidth - (designWidth * finalScale)) / 2
    const panY = (containerHeight - (designHeight * finalScale)) / 2

    // Step 3: Apply viewport transform: [scaleX, skewY, skewX, scaleY, translateX, translateY]
    canvas.setZoom(finalScale)
    canvas.setViewportTransform([finalScale, 0, 0, finalScale, panX, panY])
    
    // Add clip path to only show the certificate area (prevents seeing outside content)
    canvas.clipPath = new fabric.Rect({
      left: 0,
      top: 0,
      width: designWidth,
      height: designHeight,
      absolutePositioned: true,
    })
    
    canvas.calcOffset()
    canvas.renderAll()
  }, [canvasSize, zoomLevel])

  // Run fitWorkspaceToScreen immediately after canvas is ready and on resize
  useEffect(() => {
    if (!isReady) return

    // Run immediately
    fitWorkspaceToScreen()

    // Also run on container resize
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      fitWorkspaceToScreen()
    })
    observer.observe(container)

    return () => observer.disconnect()
  }, [isReady, fitWorkspaceToScreen])

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
      id="certificate-canvas-container"
      className="flex items-center justify-center w-full h-full p-2 overflow-hidden bg-gray-100/50 dark:bg-gray-900/50 relative"
    >
      {/* Background Loading Indicator */}
      {isBackgroundLoading && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-20 pointer-events-none">
          <div className="bg-white dark:bg-gray-800 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3">
            <svg className="w-6 h-6 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white">Loading Background</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">This may take a moment for large images...</div>
            </div>
          </div>
        </div>
      )}

      {/* Background Error Banner */}
      {backgroundError && !isBackgroundLoading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-20 flex items-center gap-2 max-w-md">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1">
            <div className="text-sm font-semibold">Background Load Failed</div>
            <div className="text-xs opacity-90">{backgroundError}</div>
          </div>
          <button
            onClick={() => setBackgroundError(null)}
            className="text-white/80 hover:text-white p-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

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

      <div ref={canvasHostRef} className="absolute inset-0" />
    </div>
  )
}
