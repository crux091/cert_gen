'use client'

import { useRef, useEffect, useState } from 'react'
import { fabric } from 'fabric'
import { CertificateElement, CanvasBackground } from '@/types/certificate'
import { Dispatch, SetStateAction } from 'react'

interface CanvasEditorProps {
  elements: CertificateElement[]
  setElements: Dispatch<SetStateAction<CertificateElement[]>>
  selectedElementId: string | null
  setSelectedElementId: Dispatch<SetStateAction<string | null>>
  canvasSize: { width: number; height: number }
  background: CanvasBackground
}

export default function CanvasEditor({
  elements,
  setElements,
  selectedElementId,
  setSelectedElementId,
  canvasSize,
  background,
}: CanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null)
  const [isReady, setIsReady] = useState(false)

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
      const obj = e.target
      if (obj && obj.data?.elementId) {
        setSelectedElementId(obj.data.elementId)
      }
    })

    canvas.on('text:changed', (e) => {
      const obj = e.target as fabric.Textbox
      if (!obj || !obj.data?.elementId) return

      const elementId = obj.data.elementId
      setElements(prev => prev.map(el => {
        if (el.id === elementId) {
          return {
            ...el,
            content: obj.text || '',
          }
        }
        return el
      }))
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
    } else if (background.type === 'image' && background.imageUrl) {
      fabric.Image.fromURL(background.imageUrl, (img) => {
        img.scaleToWidth(canvasSize.width)
        img.scaleToHeight(canvasSize.height)
        canvas.setBackgroundImage(img, () => {
          canvas.renderAll()
        })
      }, { crossOrigin: 'anonymous' })
    }
  }, [canvasSize, background])

  // Sync elements with Fabric.js objects
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas || !isReady) return

    // Get current object IDs
    const currentObjectIds = canvas.getObjects().map(obj => obj.data?.elementId).filter(Boolean)
    const newElementIds = elements.map(el => el.id)

    // Remove objects that no longer exist in elements
    currentObjectIds.forEach(objId => {
      if (!newElementIds.includes(objId)) {
        const obj = canvas.getObjects().find(o => o.data?.elementId === objId)
        if (obj) canvas.remove(obj)
      }
    })

    // Add or update objects
    elements.forEach(element => {
      const existingObj = canvas.getObjects().find(obj => obj.data?.elementId === element.id)

      if (element.type === 'text') {
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
            lockMovementX: element.locked,
            lockMovementY: element.locked,
            lockRotation: element.locked,
            lockScalingX: element.locked,
            lockScalingY: element.locked,
            selectable: !element.locked,
            angle: element.angle || 0,
            scaleX: element.scaleX || 1,
            scaleY: element.scaleY || 1,
            opacity: element.opacity || 1,
            width: canvasSize.width * 0.8, // 80% of canvas width
            splitByGrapheme: false,
            originX: 'center',
            originY: 'center',
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
            lockMovementX: element.locked,
            lockMovementY: element.locked,
            lockRotation: element.locked,
            lockScalingX: element.locked,
            lockScalingY: element.locked,
            selectable: !element.locked,
            angle: element.angle || 0,
            scaleX: element.scaleX || 1,
            scaleY: element.scaleY || 1,
            opacity: element.opacity || 1,
            width: canvasSize.width * 0.8, // 80% of canvas width
            splitByGrapheme: false,
            originX: 'center',
            originY: 'center',
          })
          textObj.data = { elementId: element.id, locked: element.locked, zIndex: element.zIndex }
          canvas.add(textObj)
        }
      } else if (element.type === 'image' && element.content) {
        if (existingObj && existingObj.type === 'image') {
          // Update existing image object
          existingObj.set({
            left: element.x,
            top: element.y,
            lockMovementX: element.locked,
            lockMovementY: element.locked,
            lockRotation: element.locked,
            lockScalingX: element.locked,
            lockScalingY: element.locked,
            selectable: !element.locked,
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
              lockMovementX: element.locked,
              lockMovementY: element.locked,
              lockRotation: element.locked,
              lockScalingX: element.locked,
              lockScalingY: element.locked,
              selectable: !element.locked,
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
  }, [elements, isReady])

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
      {/* Zoom indicator */}
      <div className="absolute top-4 right-4 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          Zoom: {Math.round(zoomLevel * 100)}%
        </div>
        <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
          Ctrl + Scroll to zoom
        </div>
      </div>

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
