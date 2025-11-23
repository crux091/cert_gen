'use client'

import { useState } from 'react'
import { CertificateElement } from '@/types/certificate'
import { Lock, Unlock, Trash2, Copy, ArrowUp, ArrowDown } from 'lucide-react'
import loadFont from '@/lib/fontLoader'

interface ElementControlsProps {
  element: CertificateElement
  onUpdate: (updates: Partial<CertificateElement>) => void
  onDelete: () => void
  onDuplicate: () => void
}

const fontFamilies = ['Inter', 'Arial', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana']
const fontWeights = ['normal', 'bold', '300', '500', '600', '700', '800']
const alignments: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right']

export default function ElementControls({
  element,
  onUpdate,
  onDelete,
  onDuplicate,
}: ElementControlsProps) {
  const [customFontUrl, setCustomFontUrl] = useState('')
  const [customFontFamily, setCustomFontFamily] = useState('')

  async function handleLoadFont(apply = false) {
    if (!customFontUrl || !customFontFamily) return
    try {
      await loadFont(customFontUrl, customFontFamily)
      if (apply) onUpdate({ fontFamily: customFontFamily })
    } catch (err) {
      // swallow - could show toast in future
      // eslint-disable-next-line no-console
      console.error('Failed to load font', err)
    }
  }

  function tryParseGoogleFonts(url: string) {
    try {
      const m = url.match(/fonts\.google\.com\/specimen\/([^\/?#]+)/i)
      if (!m) return false
      const slug = decodeURIComponent(m[1])
      // specimen slugs often use + for spaces
      const familyName = slug.replace(/\+/g, ' ')
      const familyParam = familyName.replace(/\s+/g, '+')
      const cssUrl = `https://fonts.googleapis.com/css2?family=${familyParam}&display=swap`
      setCustomFontUrl(cssUrl)
      setCustomFontFamily(familyName)
      return true
    } catch (e) {
      return false
    }
  }
  return (
    <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Selected Element
        </h3>
        <div className="flex gap-1">
          <button
            onClick={() => onUpdate({ locked: !element.locked })}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title={element.locked ? 'Unlock' : 'Lock'}
          >
            {element.locked ? (
              <Lock className="w-4 h-4 text-red-500" />
            ) : (
              <Unlock className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            )}
          </button>
          <button
            onClick={onDuplicate}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Duplicate"
          >
            <Copy className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="mb-3">
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Content
        </label>
        <textarea
          value={element.content}
          onChange={(e) => onUpdate({ content: e.target.value })}
          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          rows={2}
          disabled={element.locked}
        />
      </div>

      {/* Position */}
      <div className="mb-3">
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Position
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <input
              type="number"
              value={element.x}
              onChange={(e) => onUpdate({ x: parseInt(e.target.value) || 0 })}
              placeholder="X"
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              disabled={element.locked}
            />
          </div>
          <div>
            <input
              type="number"
              value={element.y}
              onChange={(e) => onUpdate({ y: parseInt(e.target.value) || 0 })}
              placeholder="Y"
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              disabled={element.locked}
            />
          </div>
        </div>
      </div>

      {/* Font Size */}
      <div className="mb-3">
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Font Size
        </label>
        <input
          type="number"
          value={element.fontSize}
          onChange={(e) => onUpdate({ fontSize: parseInt(e.target.value) || 16 })}
          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          disabled={element.locked}
        />
      </div>

      {/* Font Family */}
      <div className="mb-3">
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Font Family
        </label>
        <select
          value={element.fontFamily}
          onChange={(e) => onUpdate({ fontFamily: e.target.value })}
          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          disabled={element.locked}
        >
          {fontFamilies.map(font => (
            <option key={font} value={font}>{font}</option>
          ))}
        </select>
      </div>

      {/* Custom Font Loader */}
      <div className="mb-3">
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Custom Font (from URL)
        </label>
        <input
          type="text"
          placeholder="https://…/stylesheet.css or …/font.woff2"
          value={customFontUrl}
          onChange={(e) => setCustomFontUrl(e.target.value)}
          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-2"
        />
        <input
          type="text"
          placeholder="Font family name to use (e.g. 'My Font')"
          value={customFontFamily}
          onChange={(e) => setCustomFontFamily(e.target.value)}
          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-2"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { tryParseGoogleFonts(customFontUrl) }}
            className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
          >
            From Google
          </button>
          <button
            type="button"
            onClick={() => handleLoadFont(false)}
            className="flex-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
          >
            Load
          </button>
          <button
            type="button"
            onClick={() => handleLoadFont(true)}
            disabled={element.locked}
            className="flex-1 px-2 py-1 text-xs rounded border border-primary-600 bg-primary-600 text-white hover:opacity-95 disabled:opacity-50"
          >
            Load & Apply
          </button>
        </div>
      </div>

      {/* Font Weight */}
      <div className="mb-3">
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Font Weight
        </label>
        <select
          value={element.fontWeight}
          onChange={(e) => onUpdate({ fontWeight: e.target.value })}
          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          disabled={element.locked}
        >
          {fontWeights.map(weight => (
            <option key={weight} value={weight}>{weight}</option>
          ))}
        </select>
      </div>

      {/* Alignment */}
      <div className="mb-3">
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Alignment
        </label>
        <div className="flex gap-2">
          {alignments.map(align => (
            <button
              key={align}
              onClick={() => onUpdate({ alignment: align })}
              disabled={element.locked}
              className={`flex-1 px-2 py-1 text-xs rounded border ${
                element.alignment === align
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
              } disabled:opacity-50`}
            >
              {align}
            </button>
          ))}
        </div>
      </div>

      {/* Color */}
      <div className="mb-3">
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Color
        </label>
        <div className="flex gap-2">
          <input
            type="color"
            value={element.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
            className="w-12 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
            disabled={element.locked}
          />
          <input
            type="text"
            value={element.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
            className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            disabled={element.locked}
          />
        </div>
      </div>

      {/* Z-Index */}
      <div className="mb-3">
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Layer Order (Z-Index)
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => onUpdate({ zIndex: element.zIndex + 1 })}
            disabled={element.locked}
            className="flex-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 flex items-center justify-center gap-1"
          >
            <ArrowUp className="w-3 h-3" /> Forward
          </button>
          <button
            onClick={() => onUpdate({ zIndex: Math.max(1, element.zIndex - 1) })}
            disabled={element.locked}
            className="flex-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 flex items-center justify-center gap-1"
          >
            <ArrowDown className="w-3 h-3" /> Backward
          </button>
        </div>
      </div>
    </div>
  )
}
