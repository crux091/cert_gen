'use client'

import { useRef } from 'react'
import { Upload, Image as ImageIcon, Palette, Trash2 } from 'lucide-react'
import { CanvasBackground } from '@/types/certificate'
import { Dispatch, SetStateAction } from 'react'

interface BackgroundControlsProps {
  background: CanvasBackground
  setBackground: Dispatch<SetStateAction<CanvasBackground>>
}

export default function BackgroundControls({
  background,
  setBackground,
}: BackgroundControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, etc.)')
      return
    }

    // Read the file and convert to base64
    const reader = new FileReader()
    reader.onload = (event) => {
      const imageUrl = event.target?.result as string
      setBackground({
        type: 'image',
        imageUrl,
      })
    }
    reader.onerror = () => {
      alert('Failed to read the image file. Please try again.')
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveBackground = () => {
    setBackground({
      type: 'color',
      color: '#ffffff',
    })
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleImageButtonClick = () => {
    // When switching to image mode, open file picker
    if (background.type !== 'image') {
      setBackground({ type: 'image' })
    }
    // Always trigger file picker when clicking the Image button
    setTimeout(() => {
      fileInputRef.current?.click()
    }, 100)
  }

  return (
    <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Background
      </h3>

      {/* Background Type Toggle */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setBackground({ type: 'color', color: background.color || '#ffffff' })}
          className={`flex-1 px-3 py-2 text-sm rounded border flex items-center justify-center gap-2 ${
            background.type === 'color'
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
          }`}
        >
          <Palette className="w-4 h-4" />
          Color
        </button>
        <button
          onClick={handleImageButtonClick}
          className={`flex-1 px-3 py-2 text-sm rounded border flex items-center justify-center gap-2 ${
            background.type === 'image'
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          Image
        </button>
      </div>

      {/* Color Picker */}
      {background.type === 'color' && (
        <div className="mb-3">
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Background Color
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              value={background.color || '#ffffff'}
              onChange={(e) => setBackground({ type: 'color', color: e.target.value })}
              className="w-12 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
            />
            <input
              type="text"
              value={background.color || '#ffffff'}
              onChange={(e) => setBackground({ type: 'color', color: e.target.value })}
              className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        </div>
      )}

      {/* Image Upload */}
      {background.type === 'image' && (
        <div className="mb-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          
          {background.imageUrl ? (
            <div className="space-y-2">
              <div className="relative w-full h-32 border-2 border-gray-300 dark:border-gray-600 rounded overflow-hidden">
                <img
                  src={background.imageUrl}
                  alt="Background preview"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded text-sm flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Change Image
                </button>
                <button
                  onClick={handleRemoveBackground}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full px-4 py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex flex-col items-center justify-center gap-2 text-gray-600 dark:text-gray-400"
            >
              <Upload className="w-8 h-8" />
              <span className="text-sm">Click to upload image</span>
              <span className="text-xs">PNG, JPG, or GIF</span>
            </button>
          )}
        </div>
      )}

      {background.type === 'image' && background.imageUrl && (
        <p className="text-xs text-green-600 dark:text-green-400">
          ✓ Background image uploaded
        </p>
      )}
    </div>
  )
}
