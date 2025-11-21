'use client'

import { useRef, useEffect, useState } from 'react'
import { Rnd } from 'react-rnd'
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
  const canvasRef = useRef<HTMLDivElement>(null)

  // Handle keyboard events for deleting elements
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      console.log('Key pressed:', e.key, 'Selected:', selectedElementId)
      
      if (!selectedElementId) {
        console.log('No element selected')
        return
      }

      // Check if Delete or Backspace key is pressed
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't delete if user is typing in an input field
        const target = e.target as HTMLElement
        console.log('Target:', target.tagName, 'isContentEditable:', target.isContentEditable)
        
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          console.log('Ignoring - user is typing in input field')
          return
        }

        // Prevent default behavior
        e.preventDefault()

        // Find the selected element
        const selectedElement = elements.find(el => el.id === selectedElementId)
        console.log('Selected element:', selectedElement)
        
        // Check if element is locked
        if (selectedElement?.locked) {
          alert('This element is locked. Please unlock it first to delete.')
          return
        }

        console.log('Deleting element:', selectedElementId)
        // Delete the selected element
        setElements(prev => prev.filter(el => el.id !== selectedElementId))
        setSelectedElementId(null)
      }
    }

    // Add event listener
    document.addEventListener('keydown', handleKeyDown)
    console.log('Keyboard listener added')
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      console.log('Keyboard listener removed')
    }
  }, [selectedElementId, elements, setElements, setSelectedElementId])

  const handleElementUpdate = (id: string, x: number, y: number) => {
    setElements(prev =>
      prev.map(el => (el.id === id ? { ...el, x, y } : el))
    )
  }

  const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex)

  const getBackgroundStyle = () => {
    if (background.type === 'image' && background.imageUrl) {
      return {
        backgroundImage: `url(${background.imageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    }
    return {
      backgroundColor: background.color || '#ffffff',
    }
  }

  return (
    <div className="flex items-center justify-center min-h-full p-8">
      <div
        ref={canvasRef}
        id="certificate-canvas"
        className="relative shadow-2xl certificate-canvas border-2 border-gray-200 dark:border-gray-700"
        style={{
          width: canvasSize.width,
          height: canvasSize.height,
          ...getBackgroundStyle(),
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setSelectedElementId(null)
          }
        }}
      >
        {sortedElements.map((element) => (
          <Rnd
            key={element.id}
            position={{ x: element.x, y: element.y }}
            onDragStop={(e, d) => {
              handleElementUpdate(element.id, d.x, d.y)
            }}
            enableResizing={false}
            disableDragging={element.locked}
            bounds="parent"
            onMouseDown={() => {
              if (!element.locked) {
                setSelectedElementId(element.id)
              }
            }}
            style={{ zIndex: element.zIndex }}
          >
            <div
              className={`cursor-move ${
                element.locked ? 'element-locked' : ''
              } ${selectedElementId === element.id ? 'element-selected' : ''}`}
              style={{
                fontSize: element.fontSize,
                fontWeight: element.fontWeight,
                fontFamily: element.fontFamily,
                color: element.color,
                textAlign: element.alignment,
                whiteSpace: 'nowrap',
                userSelect: 'none',
              }}
            >
              {element.content}
            </div>
          </Rnd>
        ))}
      </div>
    </div>
  )
}
