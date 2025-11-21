'use client'

import { useState, useRef, useEffect, Dispatch, SetStateAction } from 'react'
import {
  Layout, Type, Image as ImageIcon, Download, Settings,
  Trash2, Save, FolderOpen, Upload, Palette,
  AlignLeft, AlignCenter, AlignRight,
  Lock, Unlock, Copy, ArrowUp, ArrowDown, FileText, Loader2, X,
  MousePointer2, Grid
} from 'lucide-react'
import { CertificateElement, CanvasBackground, SavedLayout } from '@/types/certificate'
import { exportToPNG, exportToPDF, bulkExportCertificates } from '@/lib/exportService'
import { parseExcelFile, isValidExcelFile } from '@/lib/xlsx'
import loadFont from '@/lib/fontLoader'

interface RibbonProps {
  elements: CertificateElement[]
  setElements: Dispatch<SetStateAction<CertificateElement[]>>
  selectedElementId: string | null
  setSelectedElementId: Dispatch<SetStateAction<string | null>>
  canvasSize: { width: number; height: number }
  setCanvasSize: Dispatch<SetStateAction<{ width: number; height: number }>>
  background: CanvasBackground
  setBackground: Dispatch<SetStateAction<CanvasBackground>>
}

const fontFamilies = ['Inter', 'Arial', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana']
const fontWeights = ['normal', 'bold', '300', '500', '600', '700', '800']
const alignments: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right']
const STORAGE_KEY = 'certificate-saved-layouts'

export default function Ribbon({
  elements,
  setElements,
  selectedElementId,
  setSelectedElementId,
  canvasSize,
  setCanvasSize,
  background,
  setBackground,
}: RibbonProps) {
  const [activeTab, setActiveTab] = useState('home')

  // Export State
  const [isExporting, setIsExporting] = useState(false)
  const [bulkNames, setBulkNames] = useState<string[]>([])
  const [nameElementId, setNameElementId] = useState<string>('')
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 })
  const excelInputRef = useRef<HTMLInputElement>(null)

  // Background State
  const bgImageInputRef = useRef<HTMLInputElement>(null)

  // Layout State
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>([])
  const [layoutName, setLayoutName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [showLoadModal, setShowLoadModal] = useState(false)

  // Font State
  const [customFontUrl, setCustomFontUrl] = useState('')
  const [customFontFamily, setCustomFontFamily] = useState('')

  const selectedElement = elements.find(el => el.id === selectedElementId)

  // Load layouts
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        setSavedLayouts(JSON.parse(saved))
      }
    } catch (error) {
      console.error('Failed to load saved layouts:', error)
    }
  }, [])

  // Save layouts
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedLayouts))
    } catch (error) {
      console.error('Failed to save layouts:', error)
    }
  }, [savedLayouts])

  // --- Handlers ---

  const handleSingleExport = async (format: 'png' | 'pdf') => {
    const canvasElement = document.getElementById('certificate-canvas')
    if (!canvasElement) {
      alert('Canvas not found')
      return
    }

    setIsExporting(true)
    try {
      const filename = `certificate-${Date.now()}.${format}`
      if (format === 'png') {
        await exportToPNG(canvasElement, filename, { dpi: 300, quality: 1 })
      } else {
        await exportToPDF(canvasElement, filename, { dpi: 300 })
      }
    } catch (error) {
      console.error('Export error:', error)
      alert('Failed to export certificate')
    } finally {
      setIsExporting(false)
    }
  }

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!isValidExcelFile(file)) {
      alert('Please upload a valid Excel file (.xlsx, .xls, or .csv)')
      return
    }

    try {
      const { names } = await parseExcelFile(file, 0)
      setBulkNames(names)
      alert(`Loaded ${names.length} names from Excel file`)
    } catch (error) {
      console.error('Excel parse error:', error)
      alert('Failed to parse Excel file')
    }
  }

  const handleBulkExport = async () => {
    if (bulkNames.length === 0) {
      alert('Please upload an Excel file first')
      return
    }
    if (!nameElementId) {
      alert('Please select which element to replace with names')
      return
    }
    const canvasElement = document.getElementById('certificate-canvas')
    if (!canvasElement) {
      alert('Canvas not found')
      return
    }

    setIsExporting(true)
    setBulkProgress({ current: 0, total: bulkNames.length })

    try {
      await bulkExportCertificates(
        bulkNames,
        nameElementId,
        elements,
        setElements,
        canvasElement,
        'pdf', // Defaulting to PDF for bulk for now, or could add toggle
        (current, total) => setBulkProgress({ current, total })
      )
      alert('Bulk export completed!')
    } catch (error) {
      console.error('Bulk export error:', error)
      alert('Failed to complete bulk export')
    } finally {
      setIsExporting(false)
      setBulkProgress({ current: 0, total: 0 })
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file')
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      setBackground({ type: 'image', imageUrl: event.target?.result as string })
    }
    reader.readAsDataURL(file)
  }

  const handleSaveLayout = () => {
    if (!layoutName.trim()) {
      alert('Please enter a layout name')
      return
    }
    const newLayout: SavedLayout = {
      name: layoutName.trim(),
      elements: JSON.parse(JSON.stringify(elements)),
      canvasSize: { ...canvasSize },
      background: { ...background },
      timestamp: Date.now(),
    }
    setSavedLayouts(prev => {
      const existingIndex = prev.findIndex(l => l.name === newLayout.name)
      if (existingIndex >= 0) {
        const updated = [...prev]
        updated[existingIndex] = newLayout
        return updated
      }
      return [...prev, newLayout]
    })
    setLayoutName('')
    setShowSaveInput(false)
    alert(`Layout "${newLayout.name}" saved!`)
  }

  const handleLoadLayout = (layout: SavedLayout) => {
    if (confirm(`Load layout "${layout.name}"? Current work will be replaced.`)) {
      setElements(JSON.parse(JSON.stringify(layout.elements)))
      setCanvasSize({ ...layout.canvasSize })
      if (layout.background) setBackground({ ...layout.background })
      setShowLoadModal(false)
    }
  }

  const updateElement = (updates: Partial<CertificateElement>) => {
    if (!selectedElement) return
    setElements(prev => prev.map(el => el.id === selectedElement.id ? { ...el, ...updates } : el))
  }

  // --- Font Helpers ---

  async function handleLoadFont(apply = false) {
    if (!customFontUrl || !customFontFamily) return
    try {
      await loadFont(customFontUrl, customFontFamily)
      if (apply && selectedElement) {
        updateElement({ fontFamily: customFontFamily })
      }
      alert(`Font "${customFontFamily}" loaded!`)
    } catch (err) {
      console.error('Failed to load font', err)
      alert('Failed to load font. Check URL and CORS settings.')
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

  // --- Render Helpers ---

  const TabButton = ({ id, label }: { id: string, label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-5 py-2.5 text-sm font-semibold border-b-3 transition-all relative ${
        activeTab === id
          ? 'border-primary-600 dark:border-primary-500 text-primary-700 dark:text-primary-300 bg-gray-50 dark:bg-gray-800'
          : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50/50 dark:hover:bg-gray-800/50'
      }`}
    >
      {label}
    </button>
  )

  const Group = ({ label, children }: { label: string, children: React.ReactNode }) => (
    <div className="flex flex-col h-full px-3 border-r border-gray-300 dark:border-gray-600 last:border-0 min-w-max">
      <div className="flex-1 flex items-center gap-2 justify-center py-2">
        {children}
      </div>
      <div className="text-[9px] text-center text-gray-600 dark:text-gray-300 font-medium uppercase tracking-wide pt-1 border-t border-gray-200 dark:border-gray-700">
        {label}
      </div>
    </div>
  )

  const ActionButton = ({ onClick, icon: Icon, label, active = false, disabled = false, color = 'default' }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center px-3 py-2 rounded-md transition-all gap-1 min-w-[70px] border ${
        active
          ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-primary-300 dark:border-primary-700 shadow-sm'
          : 'bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-600 hover:shadow-sm'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02]'} ${
        color === 'red' ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30' : ''
      }`}
      title={label}
    >
      <Icon className="w-5 h-5" />
      <span className="text-[10px] font-medium whitespace-nowrap text-inherit">{label}</span>
    </button>
  )

  return (
    <div className="w-full bg-gray-50 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 shadow-md flex flex-col">
      {/* Tabs */}
      <div className="flex px-2 bg-white dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700 flex-shrink-0">
        <TabButton id="home" label="Home" />
        <TabButton id="insert" label="Insert" />
        <TabButton id="design" label="Design" />
        <TabButton id="layout" label="Layout" />
        <TabButton id="export" label="Export" />
      </div>

      {/* Ribbon Content */}
      <div className="min-h-28 flex items-stretch p-3 flex-wrap gap-1 flex-shrink-0">

        {/* HOME TAB */}
        {activeTab === 'home' && (
          <>
            <Group label="Actions">
              <ActionButton
                icon={Trash2}
                label="Clear"
                color="red"
                onClick={() => {
                  if (confirm('Clear canvas?')) {
                    setElements([])
                    setSelectedElementId(null)
                  }
                }}
              />
            </Group>

            <Group label="Export">
              <ActionButton
                icon={Download}
                label="PNG"
                onClick={() => handleSingleExport('png')}
                disabled={isExporting}
              />
              <ActionButton
                icon={FileText}
                label="PDF"
                onClick={() => handleSingleExport('pdf')}
                disabled={isExporting}
              />
            </Group>

            {selectedElement && (
              <>
                <Group label="Clipboard">
                  <ActionButton
                    icon={Copy}
                    label="Duplicate"
                    onClick={() => {
                      const newEl = { ...selectedElement, id: Date.now().toString(), x: selectedElement.x + 20, y: selectedElement.y + 20 }
                      setElements(prev => [...prev, newEl])
                    }}
                  />
                  <ActionButton
                    icon={Trash2}
                    label="Delete"
                    color="red"
                    onClick={() => {
                      setElements(prev => prev.filter(el => el.id !== selectedElement.id))
                      setSelectedElementId(null)
                    }}
                  />
                </Group>

                <Group label="Font">
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <select
                        value={selectedElement.fontFamily}
                        onChange={(e) => updateElement({ fontFamily: e.target.value })}
                        className="w-32 px-2 py-1 text-xs border rounded bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      >
                        {fontFamilies.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <input
                        type="number"
                        value={selectedElement.fontSize}
                        onChange={(e) => updateElement({ fontSize: parseInt(e.target.value) || 16 })}
                        className="w-16 px-2 py-1 text-xs border rounded bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        title="Font Size"
                      />
                    </div>
                    <div className="flex gap-1 bg-white dark:bg-gray-700 rounded p-1 border border-gray-200 dark:border-gray-600">
                      <button
                        onClick={() => updateElement({ fontWeight: selectedElement.fontWeight === 'bold' ? 'normal' : 'bold' })}
                        className={`p-1.5 rounded transition-all ${selectedElement.fontWeight === 'bold' ? 'bg-primary-100 dark:bg-primary-900/30 shadow-sm scale-105' : 'hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                      >
                        <span className="font-bold text-xs">B</span>
                      </button>
                      <div className="w-px bg-gray-300 dark:bg-gray-600 mx-1" />
                      <input
                        type="color"
                        value={selectedElement.color}
                        onChange={(e) => updateElement({ color: e.target.value })}
                        className="w-7 h-7 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
                        title="Text Color"
                      />
                    </div>
                  </div>
                </Group>

                <Group label="Custom Font">
                  <div className="flex flex-col gap-1 w-48">
                    <input
                      type="text"
                      placeholder="Google Fonts URL or CSS URL"
                      value={customFontUrl}
                      onChange={(e) => {
                        setCustomFontUrl(e.target.value)
                        tryParseGoogleFonts(e.target.value)
                      }}
                      className="px-2 py-1 text-[10px] border rounded bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <div className="flex gap-1">
                      <input
                        type="text"
                        placeholder="Font Style"
                        value={customFontFamily}
                        onChange={(e) => setCustomFontFamily(e.target.value)}
                        className="flex-1 px-2 py-1 text-[10px] border rounded bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                      <button
                        onClick={() => handleLoadFont(true)}
                        disabled={!customFontUrl || !customFontFamily}
                        className="px-3 py-1 text-[10px] font-semibold bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-md"
                      >
                        Load
                      </button>
                    </div>
                  </div>
                </Group>

                <Group label="Paragraph">
                  <div className="flex gap-1 bg-white dark:bg-gray-700 rounded p-1 border border-gray-200 dark:border-gray-600">
                    {alignments.map(align => (
                      <button
                        key={align}
                        onClick={() => updateElement({ alignment: align })}
                        className={`p-2 rounded transition-all ${
                          selectedElement.alignment === align
                            ? 'bg-primary-100 dark:bg-primary-900/30 shadow-sm scale-105'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-600'
                        }`}
                      >
                        {align === 'left' && <AlignLeft className="w-4 h-4" />}
                        {align === 'center' && <AlignCenter className="w-4 h-4" />}
                        {align === 'right' && <AlignRight className="w-4 h-4" />}
                      </button>
                    ))}
                  </div>
                </Group>

                <Group label="Arrange">
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      onClick={() => updateElement({ zIndex: selectedElement.zIndex + 1 })}
                      title="Bring Forward"
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-all bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:shadow-sm"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => updateElement({ zIndex: Math.max(1, selectedElement.zIndex - 1) })}
                      title="Send Backward"
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-all bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:shadow-sm"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => updateElement({ locked: !selectedElement.locked })}
                      title={selectedElement.locked ? "Unlock" : "Lock"}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-all bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:shadow-sm col-span-2"
                    >
                      {selectedElement.locked ? <Lock className="w-4 h-4 text-red-500" /> : <Unlock className="w-4 h-4" />}
                    </button>
                  </div>
                </Group>
              </>
            )}
          </>
        )}

        {/* INSERT TAB */}
        {activeTab === 'insert' && (
          <Group label="Elements">
            <ActionButton
              icon={Type}
              label="Text Box"
              onClick={() => {
                const newElement: CertificateElement = {
                  id: Date.now().toString(),
                  type: 'text',
                  content: 'New Text',
                  x: 100, y: 100,
                  fontSize: 24, fontWeight: 'normal', fontFamily: 'Inter',
                  color: '#000000', alignment: 'left',
                  locked: false, zIndex: elements.length + 1,
                }
                setElements(prev => [...prev, newElement])
                setSelectedElementId(newElement.id)
                setActiveTab('home') // Switch to home to edit
              }}
            />
          </Group>
        )}

        {/* DESIGN TAB */}
        {activeTab === 'design' && (
          <>
            <Group label="Background Type">
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setBackground({ type: 'color', color: background.color || '#ffffff' })}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded border transition-all ${
                    background.type === 'color'
                      ? 'bg-primary-100 dark:bg-primary-900/30 border-primary-500 dark:border-primary-600 text-primary-700 dark:text-primary-300 shadow-sm'
                      : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  <Palette className="w-4 h-4" /> Color
                </button>
                <button
                  onClick={() => {
                    if (background.type !== 'image') setBackground({ type: 'image' })
                    setTimeout(() => bgImageInputRef.current?.click(), 100)
                  }}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded border transition-all ${
                    background.type === 'image'
                      ? 'bg-primary-100 dark:bg-primary-900/30 border-primary-500 dark:border-primary-600 text-primary-700 dark:text-primary-300 shadow-sm'
                      : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  <ImageIcon className="w-4 h-4" /> Image
                </button>
              </div>
            </Group>

            <Group label="Properties">
              {background.type === 'color' ? (
                <div className="flex flex-col items-center gap-2 p-2 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                  <input
                    type="color"
                    value={background.color || '#ffffff'}
                    onChange={(e) => setBackground({ type: 'color', color: e.target.value })}
                    className="w-12 h-12 rounded cursor-pointer border-2 border-gray-300 dark:border-gray-600"
                  />
                  <span className="text-[10px] font-mono text-gray-600 dark:text-gray-400">{background.color}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <input
                    ref={bgImageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <ActionButton
                    icon={Upload}
                    label="Upload"
                    onClick={() => bgImageInputRef.current?.click()}
                  />
                  {background.imageUrl && (
                    <button
                      onClick={() => setBackground({ type: 'color', color: '#ffffff' })}
                      className="text-[10px] font-medium text-red-600 dark:text-red-400 hover:underline hover:text-red-700 dark:hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </Group>
          </>
        )}

        {/* LAYOUT TAB */}
        {activeTab === 'layout' && (
          <>
            <Group label="Canvas Size">
              <div className="flex flex-col gap-2 p-2 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold w-8 text-gray-700 dark:text-gray-300">W:</span>
                  <input
                    type="number"
                    value={canvasSize.width}
                    onChange={(e) => setCanvasSize(prev => ({ ...prev, width: parseInt(e.target.value) || 800 }))}
                    className="w-20 px-2 py-1 text-xs border rounded bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold w-8 text-gray-700 dark:text-gray-300">H:</span>
                  <input
                    type="number"
                    value={canvasSize.height}
                    onChange={(e) => setCanvasSize(prev => ({ ...prev, height: parseInt(e.target.value) || 600 }))}
                    className="w-20 px-2 py-1 text-xs border rounded bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>
            </Group>

            <Group label="Templates">
              <div className="flex gap-2">
                {showSaveInput ? (
                  <div className="flex flex-col gap-1 w-40 p-2 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                    <input
                      type="text"
                      value={layoutName}
                      onChange={(e) => setLayoutName(e.target.value)}
                      placeholder="Layout name..."
                      className="px-2 py-1 text-xs border rounded bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-primary-500"
                      autoFocus
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={handleSaveLayout}
                        className="flex-1 bg-primary-600 text-white text-[10px] font-semibold rounded py-1.5 hover:bg-primary-700 transition-all hover:shadow-md"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setShowSaveInput(false)}
                        className="flex-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 text-[10px] font-semibold rounded py-1.5 hover:bg-gray-300 dark:hover:bg-gray-500 transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <ActionButton icon={Save} label="Save" onClick={() => setShowSaveInput(true)} />
                )}

                <ActionButton icon={FolderOpen} label="Load" onClick={() => setShowLoadModal(true)} />
              </div>
            </Group>
          </>
        )}

        {/* EXPORT TAB */}
        {activeTab === 'export' && (
          <>
            <Group label="Data Source">
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleExcelUpload}
                className="hidden"
              />
              <ActionButton
                icon={Upload}
                label="Upload Excel"
                onClick={() => excelInputRef.current?.click()}
              />
              {bulkNames.length > 0 && (
                <div className="flex flex-col justify-center px-2 py-1 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                  <span className="text-xs font-bold text-green-700 dark:text-green-400">{bulkNames.length} records</span>
                </div>
              )}
            </Group>

            <Group label="Mapping">
              <div className="flex flex-col justify-center w-40 p-2 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                <label className="text-[9px] font-semibold text-gray-600 dark:text-gray-400 mb-1">Replace Element:</label>
                <select
                  value={nameElementId}
                  onChange={(e) => setNameElementId(e.target.value)}
                  className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Select...</option>
                  {elements.map(el => (
                    <option key={el.id} value={el.id}>{el.content.substring(0, 15)}...</option>
                  ))}
                </select>
              </div>
            </Group>

            <Group label="Batch">
              <ActionButton
                icon={isExporting ? Loader2 : FileText}
                label={isExporting ? `${bulkProgress.current}/${bulkProgress.total}` : "Export All"}
                onClick={handleBulkExport}
                disabled={isExporting || bulkNames.length === 0 || !nameElementId}
              />
            </Group>
          </>
        )}
      </div>

      {/* Load Layout Modal */}
      {showLoadModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 w-80 max-h-[80vh] flex flex-col shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Load Layout</h3>
              <button onClick={() => setShowLoadModal(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
              {savedLayouts.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No saved layouts</p>
              ) : (
                savedLayouts.map(layout => (
                  <div key={layout.name} className="flex items-center justify-between p-2 border rounded hover:bg-gray-50 dark:hover:bg-gray-700">
                    <span className="text-sm truncate flex-1">{layout.name}</span>
                    <div className="flex gap-1">
                      <button onClick={() => handleLoadLayout(layout)} className="p-1 text-primary-600 hover:bg-primary-50 rounded"><FolderOpen className="w-4 h-4" /></button>
                      <button onClick={() => {
                        if (confirm('Delete?')) setSavedLayouts(prev => prev.filter(l => l.name !== layout.name))
                      }} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
