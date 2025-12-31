'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Edit3, Eye, FileText } from 'lucide-react'
import { CertificateElement, CSVData, CanvasBackground, VariableBindings } from '@/types/certificate'
import { replaceAllVariables } from '@/lib/variableParser'
import { fabric } from 'fabric'

// CRITICAL: Disable Fabric.js retina scaling to prevent rendering issues
if (typeof window !== 'undefined') {
  (fabric as any).devicePixelRatio = 1
}

interface SlidePreviewPanelProps {
  csvData: CSVData
  elements: CertificateElement[]
  canvasSize: { width: number; height: number }
  background: CanvasBackground
  selectedPreviewIndex: number | null
  onSelectPreview: (index: number | null) => void
  variableBindings: VariableBindings
}

export default function SlidePreviewPanel({
  csvData,
  elements,
  canvasSize,
  background,
  selectedPreviewIndex,
  onSelectPreview,
  variableBindings,
}: SlidePreviewPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map())
  const [panelWidth, setPanelWidth] = useState(208) // Default w-52 = 208px
  const [isResizing, setIsResizing] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const cardRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
  const panelRef = useRef<HTMLDivElement>(null)

  // Get the first column header for labeling previews
  const primaryColumn = csvData.headers[0] || 'Row'

  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(150, Math.min(500, e.clientX))
      setPanelWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  // Generate thumbnail for a specific row
  const generateThumbnail = useCallback(async (rowIndex: number): Promise<string> => {
    const row = csvData.rows[rowIndex]
    
    // Build bindings for this row
    // First, add direct column name mappings (for auto-bound variables where name matches column)
    const rowBindings: Record<string, string> = {}
    csvData.headers.forEach(header => {
      rowBindings[header] = String(row[header] || '')
    })
    
    // Also add explicit variable bindings (for manually bound variables)
    Object.entries(variableBindings).forEach(([varName, columnName]) => {
      if (row[columnName] !== undefined) {
        rowBindings[varName] = String(row[columnName] || '')
      }
    })

    // Create a hidden canvas for rendering
    const hiddenCanvas = document.createElement('canvas')
    hiddenCanvas.width = canvasSize.width
    hiddenCanvas.height = canvasSize.height
    
    const fabricCanvas = new fabric.StaticCanvas(hiddenCanvas, {
      width: canvasSize.width,
      height: canvasSize.height,
      backgroundColor: background.type === 'color' ? background.color || '#ffffff' : '#ffffff',
    })

    // Add background image if exists
    if (background.type === 'image' && background.imageUrl) {
      await new Promise<void>((resolve) => {
        const TIMEOUT = 15000 // 15 second timeout for preview thumbnails
        let resolved = false
        
        const timeoutId = setTimeout(() => {
          if (!resolved) {
            resolved = true
            console.warn('Background image load timeout for preview thumbnail')
            resolve() // Continue without background image
          }
        }, TIMEOUT)
        
        fabric.Image.fromURL(background.imageUrl!, (img) => {
          if (resolved) return // Already timed out
          resolved = true
          clearTimeout(timeoutId)
          
          // Verify image loaded successfully
          if (!img || !img.width || !img.height) {
            console.warn('Background image failed to load properly for thumbnail')
            resolve() // Continue without background
            return
          }
          
          // Scale to fit canvas exactly (not maintain aspect ratio)
          const scaleX = canvasSize.width / (img.width || 1)
          const scaleY = canvasSize.height / (img.height || 1)
          img.set({
            scaleX: scaleX,
            scaleY: scaleY,
            left: 0,
            top: 0,
            originX: 'left',
            originY: 'top',
          })
          
          fabricCanvas.setBackgroundImage(img, () => {
            resolve()
          })
        }, { crossOrigin: 'anonymous' })
      })
    }

    // Add elements with replaced variables
    for (const el of elements) {
      if (el.type === 'text') {
        // Always try to replace variables - replaceAllVariables is safe even if no variables exist
        const content = replaceAllVariables(el.content, rowBindings)
        
        const textbox = new fabric.Textbox(content, {
          left: el.x,
          top: el.y,
          width: el.width || canvasSize.width * 0.8,
          fontSize: el.fontSize || 16,
          fontFamily: el.fontFamily || 'Arial',
          fill: el.color || '#000000',
          fontWeight: el.fontWeight || 'normal',
          textAlign: el.alignment || 'center',
          angle: el.angle || 0,
          scaleX: el.scaleX || 1,
          scaleY: el.scaleY || 1,
          opacity: el.opacity || 1,
          selectable: false,
          evented: false,
        })
        fabricCanvas.add(textbox)
      } else if (el.type === 'image' && el.content) {
        await new Promise<void>((resolve) => {
          const TIMEOUT = 10000 // 10 second timeout for element images
          let resolved = false
          
          const timeoutId = setTimeout(() => {
            if (!resolved) {
              resolved = true
              console.warn(`Element image load timeout for ${el.id}`)
              resolve() // Continue without this image
            }
          }, TIMEOUT)
          
          fabric.Image.fromURL(el.content, (img) => {
            if (resolved) return // Already timed out
            resolved = true
            clearTimeout(timeoutId)
            
            // Verify image loaded successfully
            if (!img || !img.width || !img.height) {
              console.warn(`Element image failed to load properly for ${el.id}`)
              resolve() // Continue without this image
              return
            }
            
            img.set({
              left: el.x,
              top: el.y,
              scaleX: el.scaleX || (el.width ? el.width / (img.width || 1) : 1),
              scaleY: el.scaleY || (el.height ? el.height / (img.height || 1) : 1),
              angle: el.angle || 0,
              opacity: el.opacity || 1,
              selectable: false,
              evented: false,
            })
            fabricCanvas.add(img)
            resolve()
          }, { crossOrigin: 'anonymous' })
        })
      }
    }

    fabricCanvas.renderAll()

    // Generate thumbnail at low resolution
    const dataUrl = fabricCanvas.toDataURL({
      format: 'png',
      quality: 0.8,
      multiplier: 0.15, // 15% scale for thumbnails
    })

    // Cleanup
    fabricCanvas.dispose()

    return dataUrl
  }, [csvData, elements, canvasSize, background, variableBindings])

  // Create a cache key based on elements content and bindings to detect when to regenerate
  const bindingsKey = useMemo(() => {
    return Object.entries(variableBindings).map(([k, v]) => `${k}:${v}`).join('|')
  }, [variableBindings])

  const elementsKey = useMemo(() => {
    const elKey = elements.map(el => `${el.id}-${el.content}-${el.x}-${el.y}`).join('|')
    return `${elKey}||${bindingsKey}`
  }, [elements, bindingsKey])

  // Clear thumbnail cache when template changes
  const prevElementsKeyRef = useRef(elementsKey)
  useEffect(() => {
    if (prevElementsKeyRef.current !== elementsKey) {
      setThumbnails(new Map())
      prevElementsKeyRef.current = elementsKey
    }
  }, [elementsKey])

  // Generate initial thumbnails immediately for first visible items
  useEffect(() => {
    if (elements.length === 0) return // Wait for elements to load
    
    // Small delay to ensure canvas is ready
    const timer = setTimeout(async () => {
      const initialCount = Math.min(5, csvData.rows.length)
      for (let i = 0; i < initialCount; i++) {
        if (!thumbnails.has(i)) {
          try {
            const thumbnail = await generateThumbnail(i)
            setThumbnails((prev) => new Map(prev).set(i, thumbnail))
          } catch (err) {
            console.error(`Failed to generate thumbnail for row ${i}:`, err)
          }
        }
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [csvData.rows.length, generateThumbnail, elements.length, thumbnails.size])

  // Set up IntersectionObserver for lazy loading remaining thumbnails
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = parseInt(entry.target.getAttribute('data-index') || '-1')
            if (index >= 0 && !thumbnails.has(index)) {
              generateThumbnail(index).then((thumbnail) => {
                setThumbnails((prev) => new Map(prev).set(index, thumbnail))
              }).catch((err) => {
                console.error(`Failed to generate thumbnail for row ${index}:`, err)
              })
            }
          }
        })
      },
      {
        root: scrollContainer,
        rootMargin: '200px',
        threshold: 0.01,
      }
    )

    return () => {
      observerRef.current?.disconnect()
    }
  }, [generateThumbnail, thumbnails])

  // Observe card elements when they mount
  useEffect(() => {
    const observer = observerRef.current
    if (!observer) return

    cardRefs.current.forEach((el) => {
      observer.observe(el)
    })

    return () => {
      observer.disconnect()
    }
  }, [csvData.rows.length])

  // Register card ref
  const setCardRef = useCallback((index: number, el: HTMLButtonElement | null) => {
    if (el) {
      cardRefs.current.set(index, el)
      observerRef.current?.observe(el)
    } else {
      const existing = cardRefs.current.get(index)
      if (existing) {
        observerRef.current?.unobserve(existing)
      }
      cardRefs.current.delete(index)
    }
  }, [])

  if (isCollapsed) {
    return (
      <div className="flex-none w-10 bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center pt-3">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-1.5 rounded-md bg-blue-500 hover:bg-blue-600 text-white transition-colors"
          title="Expand preview panel"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="mt-4 flex flex-col items-center gap-1">
          <FileText className="w-4 h-4 text-gray-400" />
          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium" style={{ writingMode: 'vertical-rl' }}>
            {csvData.rows.length} slides
          </span>
        </div>
      </div>
    )
  }

  return (
    <div 
      ref={panelRef}
      className="flex-none bg-gray-100 dark:bg-gray-900 flex flex-col relative"
      style={{ width: panelWidth }}
    >
      {/* Resize handle - positioned on the right edge */}
      <div
        onMouseDown={handleMouseDown}
        className={`absolute top-0 right-0 w-1.5 h-full cursor-ew-resize transition-colors z-20 ${
          isResizing ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-700 hover:bg-blue-400 dark:hover:bg-blue-500'
        }`}
        title="Drag to resize"
      />
      
      {/* Content wrapper with right margin to avoid resize handle */}
      <div className="flex flex-col h-full mr-1.5">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 dark:border-gray-700">
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            Slides ({csvData.rows.length + 1})
          </span>
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1.5 rounded-md bg-blue-500 hover:bg-blue-600 text-white transition-colors"
            title="Collapse panel"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Scroll container with custom scrollbar */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-2 space-y-2 preview-scrollbar"
        >
          {/* MAIN Template Card - Pinned at top */}
          <button
            onClick={() => onSelectPreview(null)}
            className={`w-full rounded-lg border-2 transition-all ${
              selectedPreviewIndex === null
                ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
            }`}
          >
          <div className="p-1">
            {/* Template preview - show placeholder */}
            <div 
              className="w-full bg-white dark:bg-gray-800 rounded flex items-center justify-center"
              style={{ aspectRatio: `${canvasSize.width} / ${canvasSize.height}` }}
            >
              <div className="text-center">
                <Edit3 className="w-6 h-6 mx-auto text-blue-500 mb-1" />
                <span className="text-[10px] text-gray-500 dark:text-gray-400">Template</span>
              </div>
            </div>
          </div>
          <div className="px-2 py-1.5 border-t border-gray-200 dark:border-gray-700 flex items-center gap-1.5">
            <Edit3 className="w-3 h-3 text-blue-500" />
            <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">MAIN</span>
            <span className="text-[10px] text-gray-500 dark:text-gray-400">• Editable</span>
          </div>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-2 py-1">
          <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600" />
          <span className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">Previews</span>
          <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600" />
        </div>

        {/* Preview Cards */}
        {csvData.rows.map((row, index) => (
          <button
            key={index}
            ref={(el) => setCardRef(index, el)}
            data-index={index}
            onClick={() => onSelectPreview(index)}
            className={`w-full rounded-lg border-2 transition-all ${
              selectedPreviewIndex === index
                ? 'border-green-500 ring-2 ring-green-200 dark:ring-green-800'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
            }`}
          >
            <div className="p-1">
              {/* Thumbnail */}
              <div 
                className="w-full bg-gray-200 dark:bg-gray-700 rounded overflow-hidden"
                style={{ aspectRatio: `${canvasSize.width} / ${canvasSize.height}` }}
              >
                {thumbnails.has(index) ? (
                  <img 
                    src={thumbnails.get(index)} 
                    alt={`Preview ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      <Eye className="w-4 h-4 mx-auto text-gray-400 mb-0.5 animate-pulse" />
                      <span className="text-[8px] text-gray-400">Loading...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="px-2 py-1.5 border-t border-gray-200 dark:border-gray-700 flex items-center gap-1.5">
              <Eye className="w-3 h-3 text-gray-400" />
              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300 truncate">
                {index + 1}. {String(row[primaryColumn] || `Row ${index + 1}`).substring(0, 20)}
              </span>
            </div>
          </button>
        ))}
        </div>
      </div>
    </div>
  )
}
