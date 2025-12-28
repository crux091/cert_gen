'use client'

import { useState, useRef, useEffect, Dispatch, SetStateAction } from 'react'
import {
  Layout, Type, Image as ImageIcon, Download, Settings,
  Trash2, Save, FolderOpen, Upload, Palette,
  AlignLeft, AlignCenter, AlignRight,
  Lock, Unlock, Copy, ArrowUp, ArrowDown, FileText, Loader2, X,
  MousePointer2, Grid, Link2, Info
} from 'lucide-react'
import { CertificateElement, CanvasBackground, SavedLayout, CSVData, VariableBindings } from '@/types/certificate'
import { exportToPNG, exportToPDF, bulkExportCertificates } from '@/lib/exportService'
import { parseExcelFile, parseExcelFileToDataset, isValidExcelFile } from '@/lib/xlsx'
import loadFont from '@/lib/fontLoader'
import EmailSender from './EmailSender'
import { getAllUniqueVariables } from '@/lib/variableParser'

interface RibbonProps {
  elements: CertificateElement[]
  setElements: Dispatch<SetStateAction<CertificateElement[]>>
  selectedElementId: string | null
  setSelectedElementId: Dispatch<SetStateAction<string | null>>
  canvasSize: { width: number; height: number }
  setCanvasSize: Dispatch<SetStateAction<{ width: number; height: number }>>
  background: CanvasBackground
  setBackground: Dispatch<SetStateAction<CanvasBackground>>
  csvData: CSVData | null
  setCsvData: Dispatch<SetStateAction<CSVData | null>>
  variableBindings: VariableBindings
  setVariableBindings: Dispatch<SetStateAction<VariableBindings>>
}

const fontFamilies = ['Inter', 'Arial', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana']
const fontWeights = ['normal', 'bold', '300', '500', '600', '700', '800']
const alignments: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right']
const STORAGE_KEY = 'certificate-saved-layouts'

// --- Helper Components (Defined outside to prevent re-renders) ---

const TabButton = ({ id, label, activeTab, setActiveTab }: { id: string, label: string, activeTab: string, setActiveTab: (id: string) => void }) => (
  <button
    onClick={() => setActiveTab(id)}
    className={`px-3 sm:px-4 py-2 min-w-[60px] sm:min-w-[80px] text-xs sm:text-sm font-medium rounded-t-lg border-t border-x transition-all relative -mb-px flex items-center justify-center ${activeTab === id
        ? 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400 border-b-transparent z-10'
        : 'bg-transparent border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
      }`}
  >
    {label}
  </button>
)

const Group = ({ label, children }: { label: string, children: React.ReactNode }) => (
  <div className="flex flex-col h-full px-2 sm:px-3 border-r border-gray-200 dark:border-gray-700 last:border-0 min-w-max relative group/section">
    <div className="flex-1 flex items-center gap-1 sm:gap-2 justify-center">
      {children}
    </div>
    <div className="text-[9px] sm:text-[10px] text-center text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider mt-1 select-none group-hover/section:text-gray-800 dark:group-hover/section:text-gray-200 transition-colors">
      {label}
    </div>
  </div>
)

const ActionButton = ({ onClick, icon: Icon, label, active = false, disabled = false, color = 'default' }: any) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex flex-col items-center justify-center px-1.5 py-1.5 rounded-lg transition-all duration-200 gap-1 min-w-[50px] sm:min-w-[64px] max-w-[70px] sm:max-w-[80px] ${active
        ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-700 shadow-sm'
        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 hover:shadow-sm'
      } ${disabled ? 'opacity-50 cursor-not-allowed grayscale' : 'active:scale-95 active:shadow-inner'} ${color === 'red' ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300' : ''
      }`}
    title={label}
  >
    <Icon className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:scale-110" strokeWidth={1.5} />
    <span className="text-[9px] sm:text-[10px] font-medium w-full text-center truncate px-0.5 leading-tight">{label}</span>
  </button>
)

export default function Ribbon({
  elements,
  setElements,
  selectedElementId,
  setSelectedElementId,
  canvasSize,
  setCanvasSize,
  background,
  setBackground,
  csvData,
  setCsvData,
  variableBindings,
  setVariableBindings,
}: RibbonProps) {
  const [activeTab, setActiveTab] = useState('home')

  // Export State
  const [isExporting, setIsExporting] = useState(false)
  const [bulkNames, setBulkNames] = useState<string[]>([])
  const [nameElementId, setNameElementId] = useState<string>('')
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 })
  const excelInputRef = useRef<HTMLInputElement>(null)
  const datasetInputRef = useRef<HTMLInputElement>(null)

  // Canvas Element Ref for EmailSender
  const [canvasElement, setCanvasElement] = useState<HTMLElement | null>(null)
  
  // Find canvas element
  useEffect(() => {
    const canvas = document.getElementById('certificate-canvas-container')
    if (canvas) {
      setCanvasElement(canvas)
    }
  }, [])

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
    const canvasElement = document.getElementById('certificate-canvas-container')
    if (!canvasElement) {
      alert('Canvas container not found')
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
      alert(`Successfully exported as ${format.toUpperCase()}!`)
    } catch (error) {
      console.error('Export error:', error)
      alert(`Failed to export certificate: ${error instanceof Error ? error.message : 'Unknown error'}`)
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

  const handleDatasetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!isValidExcelFile(file)) {
      alert('Please upload a valid dataset file (.xlsx, .xls, or .csv)')
      return
    }

    try {
      const data = await parseExcelFileToDataset(file)
      setCsvData(data)
      alert(`Dataset loaded: ${data.rows.length} rows, ${data.headers.length} columns`)
    } catch (error) {
      console.error('Dataset parse error:', error)
      alert('Failed to parse dataset file')
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
    const canvasElement = document.getElementById('certificate-canvas')?.parentElement
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
      alert(`Failed to complete bulk export: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsExporting(false)
      setBulkProgress({ current: 0, total: 0 })
    }
  }

  const handleVariableBulkExport = async (format: 'png' | 'pdf') => {
    if (!csvData) {
      alert('Please upload a dataset first')
      return
    }

    const textContents = elements.filter(el => el.type === 'text').map(el => el.content)
    const detectedVariables = getAllUniqueVariables(textContents)
    
    if (detectedVariables.length === 0) {
      alert('No variables detected in text elements. Add bracketed variables like [Name] first.')
      return
    }

    const unboundVars = detectedVariables.filter(v => !variableBindings[v])
    if (unboundVars.length > 0) {
      alert(`Please bind all variables before exporting. Unbound variables: ${unboundVars.map(v => `[${v}]`).join(', ')}`)
      return
    }

    const canvasElement = document.getElementById('certificate-canvas')?.parentElement
    if (!canvasElement) {
      alert('Canvas not found')
      return
    }

    setIsExporting(true)
    setBulkProgress({ current: 0, total: csvData.rows.length })

    try {
      const { bulkExportWithVariables } = await import('@/lib/exportService')
      await bulkExportWithVariables(
        csvData,
        variableBindings,
        elements,
        setElements,
        canvasElement,
        format,
        (current, total) => setBulkProgress({ current, total })
      )
      alert('Variable-based bulk export completed!')
    } catch (error) {
      console.error('Variable bulk export error:', error)
      alert(`Failed to complete export: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsExporting(false)
      setBulkProgress({ current: 0, total: 0 })
    }
  }

  const handlePreviewFirstCertificate = () => {
    if (!csvData || csvData.rows.length === 0) {
      alert('No data rows available for preview')
      return
    }

    const textContents = elements.filter(el => el.type === 'text').map(el => el.content)
    const detectedVariables = getAllUniqueVariables(textContents)
    
    if (detectedVariables.length === 0) {
      alert('No variables detected to preview')
      return
    }

    const unboundVars = detectedVariables.filter(v => !variableBindings[v])
    if (unboundVars.length > 0) {
      alert(`Cannot preview: Unbound variables: ${unboundVars.map(v => `[${v}]`).join(', ')}`)
      return
    }

    // Get first row
    const firstRow = csvData.rows[0]
    
    // Create row-specific bindings
    const rowBindings: Record<string, string> = {}
    Object.entries(variableBindings).forEach(([varName, columnName]) => {
      rowBindings[varName] = String(firstRow[columnName] || '')
    })

    // Update elements with preview data
    const { replaceAllVariables } = require('@/lib/variableParser')
    const previewElements = elements.map(el => {
      if (el.type === 'text' && el.hasVariables) {
        const replacedContent = replaceAllVariables(el.content, rowBindings)
        return { ...el, content: replacedContent }
      }
      return el
    })

    setElements(previewElements)
    alert('Preview loaded with first row data. Click again to refresh or export to restore originals.')
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
      const imageUrl = event.target?.result as string

      // Load image to get dimensions and auto-resize canvas
      const img = new Image()
      img.onload = () => {
        setCanvasSize({ width: img.width, height: img.height })
        setBackground({ type: 'image', imageUrl })
      }
      img.onerror = () => {
        alert('Failed to load image dimensions')
        setBackground({ type: 'image', imageUrl })
      }
      img.src = imageUrl
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

  return (
    <div className="w-full flex flex-col bg-gray-50 dark:bg-gray-950 border-b border-gray-300 dark:border-gray-700 shadow-sm select-none">
      {/* Tabs Header */}
      <div className="flex px-2 sm:px-4 pt-1 border-b border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 gap-0">
        <TabButton id="home" label="Home" activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton id="insert" label="Insert" activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton id="design" label="Design" activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton id="layout" label="Layout" activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton id="import" label="Import" activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton id="export" label="Export" activeTab={activeTab} setActiveTab={setActiveTab} />
      </div>

      {/* Ribbon Content Panel */}
      <div className="h-24 sm:h-28 bg-white dark:bg-gray-800 flex items-stretch px-2 sm:px-4 py-1.5 sm:py-2 overflow-x-auto custom-scrollbar shadow-inner gap-0 sm:gap-2">

        {/* IMPORT TAB */}
        {activeTab === 'import' && (
          <>
            <Group label="Background Type">
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setBackground({ type: 'color', color: background.color || '#ffffff' })}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md border transition-all ${background.type === 'color'
                      ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 dark:border-blue-600 text-blue-700 dark:text-blue-300 shadow-sm'
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
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md border transition-all ${background.type === 'image'
                      ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 dark:border-blue-600 text-blue-700 dark:text-blue-300 shadow-sm'
                      : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                >
                  <ImageIcon className="w-4 h-4" /> Template Image
                </button>
              </div>
            </Group>

            <Group label="Import Template">
              {background.type === 'color' ? (
                <div className="flex flex-col items-center gap-2 p-2 bg-white dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600">
                  <input
                    type="color"
                    value={background.color || '#ffffff'}
                    onChange={(e) => setBackground({ type: 'color', color: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer border-none p-0 bg-transparent"
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
                    label="Upload Image"
                    onClick={() => bgImageInputRef.current?.click()}
                  />
                  {background.imageUrl && (
                    <button
                      onClick={() => setBackground({ type: 'color', color: '#ffffff' })}
                      className="text-[10px] font-medium text-red-600 dark:text-red-400 hover:underline hover:text-red-700 dark:hover:text-red-300"
                    >
                      Remove Image
                    </button>
                  )}
                </div>
              )}
            </Group>

            <Group label="Instructions">
              <div className="flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-400 max-w-xs p-2">
                <p className="font-semibold text-blue-600 dark:text-blue-400">📋 How to Import</p>
                <p className="text-[10px]">1. Click &quot;Template Image&quot; button</p>
                <p className="text-[10px]">2. Upload your certificate template</p>
                <p className="text-[10px]">3. Canvas auto-resizes to image size</p>
                <p className="text-[10px]">4. Add text elements for dynamic fields</p>
              </div>
            </Group>
          </>
        )}

        {/* HOME TAB */}
        {activeTab === 'home' && (
          <>
            <Group label="Actions">
              <ActionButton
                icon={Trash2}
                label="Clear All"
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
              <div className="flex gap-1">
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
              </div>
            </Group>

            {selectedElement && (
              <>
                <Group label="Clipboard">
                  <div className="flex gap-1">
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
                  </div>
                </Group>

                <Group label="Typography">
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2 items-center">
                      <select
                        value={selectedElement.fontFamily}
                        onChange={(e) => updateElement({ fontFamily: e.target.value })}
                        className="w-32 sm:w-40 px-2 py-1.5 text-xs sm:text-sm border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      >
                        {fontFamilies.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <input
                        type="number"
                        value={selectedElement.fontSize}
                        onChange={(e) => updateElement({ fontSize: parseInt(e.target.value) || 16 })}
                        className="w-12 sm:w-16 px-2 py-1.5 text-xs sm:text-sm border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        title="Font Size"
                      />
                    </div>
                    <div className="flex gap-2 items-center">
                      <div className="flex bg-gray-100 dark:bg-gray-700 rounded-md p-1 border border-gray-200 dark:border-gray-600">
                        <button
                          onClick={() => updateElement({ fontWeight: selectedElement.fontWeight === 'bold' ? 'normal' : 'bold' })}
                          className={`p-1.5 rounded transition-all w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center ${selectedElement.fontWeight === 'bold' ? 'bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-400' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                          title="Bold"
                        >
                          <span className="font-bold text-xs sm:text-sm">B</span>
                        </button>
                      </div>
                      <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />
                      <div className="flex items-center gap-2 border border-gray-200 dark:border-gray-600 rounded-md p-1 pr-2 bg-white dark:bg-gray-700">
                        <input
                          type="color"
                          value={selectedElement.color}
                          onChange={(e) => updateElement({ color: e.target.value })}
                          className="w-5 h-5 sm:w-6 sm:h-6 rounded cursor-pointer border-none p-0 bg-transparent"
                          title="Text Color"
                        />
                        <span className="text-[10px] sm:text-xs font-mono text-gray-500">{selectedElement.color}</span>
                      </div>
                    </div>
                  </div>
                </Group>

                <Group label="Web Fonts">
                  <div className="flex flex-col gap-2 w-48 sm:w-64">
                    <input
                      type="text"
                      placeholder="Google Fonts URL"
                      value={customFontUrl}
                      onChange={(e) => {
                        setCustomFontUrl(e.target.value)
                        tryParseGoogleFonts(e.target.value)
                      }}
                      className="px-3 py-1.5 text-xs border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Font Family Name"
                        value={customFontFamily}
                        onChange={(e) => setCustomFontFamily(e.target.value)}
                        className="flex-1 px-3 py-1.5 text-xs border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      <button
                        onClick={() => handleLoadFont(true)}
                        disabled={!customFontUrl || !customFontFamily}
                        className="px-3 sm:px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm whitespace-nowrap"
                      >
                        Load
                      </button>
                    </div>
                  </div>
                </Group>

                <Group label="Paragraph">
                  <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-md p-1 border border-gray-200 dark:border-gray-600">
                    {alignments.map(align => (
                      <button
                        key={align}
                        onClick={() => updateElement({ alignment: align })}
                        className={`p-2 rounded transition-all w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center ${selectedElement.alignment === align
                            ? 'bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-400'
                            : 'hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300'
                          }`}
                        title={`Align ${align}`}
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
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-all bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:shadow-sm flex justify-center"
                    >
                      <ArrowUp className="w-3 h-3 sm:w-4 sm:h-4" />
                    </button>
                    <button
                      onClick={() => updateElement({ zIndex: Math.max(1, selectedElement.zIndex - 1) })}
                      title="Send Backward"
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-all bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:shadow-sm flex justify-center"
                    >
                      <ArrowDown className="w-3 h-3 sm:w-4 sm:h-4" />
                    </button>
                    <button
                      onClick={() => updateElement({ locked: !selectedElement.locked })}
                      title={selectedElement.locked ? "Unlock" : "Lock"}
                      className={`p-1.5 rounded transition-all border hover:shadow-sm col-span-2 flex justify-center items-center gap-1 text-[10px] font-medium ${selectedElement.locked
                          ? 'bg-red-50 border-red-200 text-red-600 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
                          : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-50'
                        }`}
                    >
                      {selectedElement.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      {selectedElement.locked ? "Locked" : "Lock"}
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
                // Calculate proportional font size based on canvas dimensions
                // Use 3% of canvas height as the base font size for better scaling
                const baseFontSize = Math.round(canvasSize.height * 0.03)
                const fontSize = Math.max(16, Math.min(baseFontSize, 72)) // Min 16px, max 72px
                
                // Position text in the center of the canvas
                const centerX = Math.round(canvasSize.width / 2)
                const centerY = Math.round(canvasSize.height / 2)
                
                const newElement: CertificateElement = {
                  id: Date.now().toString(),
                  type: 'text',
                  content: 'New Text',
                  x: centerX, y: centerY,
                  fontSize: fontSize, fontWeight: 'normal', fontFamily: 'Inter',
                  color: '#000000', alignment: 'center',
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
            <Group label="Canvas Size">
              <div className="flex flex-col gap-2 p-2 bg-white dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold w-6 text-gray-700 dark:text-gray-300">W:</span>
                  <input
                    type="number"
                    value={canvasSize.width}
                    onChange={(e) => setCanvasSize(prev => ({ ...prev, width: parseInt(e.target.value) || 800 }))}
                    className="w-16 px-2 py-1 text-xs border rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold w-6 text-gray-700 dark:text-gray-300">H:</span>
                  <input
                    type="number"
                    value={canvasSize.height}
                    onChange={(e) => setCanvasSize(prev => ({ ...prev, height: parseInt(e.target.value) || 600 }))}
                    className="w-16 px-2 py-1 text-xs border rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
            </Group>
          </>
        )}

        {/* LAYOUT TAB */}
        {activeTab === 'layout' && (
          <>
            <Group label="Templates">
              <div className="flex gap-2">
                {showSaveInput ? (
                  <div className="flex flex-col gap-1 w-40 p-2 bg-white dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600">
                    <input
                      type="text"
                      value={layoutName}
                      onChange={(e) => setLayoutName(e.target.value)}
                      placeholder="Layout name..."
                      className="px-2 py-1 text-xs border rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
                      autoFocus
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={handleSaveLayout}
                        className="flex-1 bg-blue-600 text-white text-[10px] font-semibold rounded py-1.5 hover:bg-blue-700 transition-all hover:shadow-md"
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
            <Group label="Dataset Upload">
              <input
                ref={datasetInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleDatasetUpload}
                className="hidden"
              />
              <ActionButton
                icon={Upload}
                label="Upload Dataset"
                onClick={() => datasetInputRef.current?.click()}
              />
              {csvData && (
                <div className="flex flex-col justify-center px-2 py-1 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-200 dark:border-green-800">
                  <span className="text-xs font-bold text-green-700 dark:text-green-400">{csvData.rows.length} rows</span>
                  <span className="text-[10px] text-green-600 dark:text-green-500">{csvData.headers.length} columns</span>
                </div>
              )}
            </Group>

            {/* Variable bindings are now done by clicking on text with [variables] directly on the canvas */}
            
            {csvData && (() => {
              const textContents = elements.filter(el => el.type === 'text').map(el => el.content)
              const detectedVariables = getAllUniqueVariables(textContents)
              // With the new approach, variables are "bound" if they match a column name
              const unboundVars = detectedVariables.filter(v => !csvData.headers.includes(v))
              
              return detectedVariables.length > 0 && (
                <Group label="Variables">
                  <div className="flex flex-col gap-1 px-2 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-1.5">
                      <Info className="w-3 h-3 text-blue-500" />
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">
                        Click variables on canvas to bind
                      </span>
                    </div>
                    <span className={`text-xs font-medium ${unboundVars.length > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                      {unboundVars.length > 0 
                        ? `⚠ ${unboundVars.length} unbound: ${unboundVars.slice(0, 3).map(v => `[${v}]`).join(', ')}${unboundVars.length > 3 ? '...' : ''}`
                        : '✓ All variables bound'}
                    </span>
                  </div>
                </Group>
              )
            })()}

            {csvData && (() => {
              const textContents = elements.filter(el => el.type === 'text').map(el => el.content)
              const detectedVariables = getAllUniqueVariables(textContents)
              // Variables are bound if they match a column name
              const unboundVars = detectedVariables.filter(v => !csvData.headers.includes(v))
              const canExport = detectedVariables.length > 0 && unboundVars.length === 0
              
              return detectedVariables.length > 0 && (
                <>
                  <Group label="Preview">
                    <ActionButton
                      icon={MousePointer2}
                      label="Preview First"
                      onClick={handlePreviewFirstCertificate}
                      disabled={!canExport}
                    />
                  </Group>

                  <Group label="Variable Bulk Export">
                    <div className="flex gap-2">
                      <ActionButton
                        icon={isExporting ? Loader2 : Download}
                        label={isExporting ? `${bulkProgress.current}/${bulkProgress.total}` : "PNG All"}
                        onClick={() => handleVariableBulkExport('png')}
                        disabled={isExporting || !canExport}
                      />
                      <ActionButton
                        icon={isExporting ? Loader2 : Download}
                        label={isExporting ? `${bulkProgress.current}/${bulkProgress.total}` : "PDF All"}
                        onClick={() => handleVariableBulkExport('pdf')}
                        disabled={isExporting || !canExport}
                      />
                    </div>
                    {!canExport && unboundVars.length > 0 && (
                      <div className="text-[10px] text-yellow-600 dark:text-yellow-400 px-2 py-1">
                        Bind all variables first
                      </div>
                    )}
                  </Group>
                </>
              )
            })()}

            <Group label="Single Export">
              <div className="flex gap-2">
                <ActionButton
                  icon={isExporting ? Loader2 : Download}
                  label="PNG"
                  onClick={() => handleSingleExport('png')}
                  disabled={isExporting}
                />
                <ActionButton
                  icon={isExporting ? Loader2 : Download}
                  label="PDF"
                  onClick={() => handleSingleExport('pdf')}
                  disabled={isExporting}
                />
              </div>
            </Group>

            <Group label="Legacy Data Source">
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
                <div className="flex flex-col justify-center px-2 py-1 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-200 dark:border-green-800">
                  <span className="text-xs font-bold text-green-700 dark:text-green-400">{bulkNames.length} records</span>
                </div>
              )}
            </Group>

            <Group label="Legacy Mapping">
              <div className="flex flex-col justify-center w-48 p-2 bg-white dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600">
                <label className="text-[9px] font-semibold text-gray-600 dark:text-gray-400 mb-1">Replace Element:</label>
                <select
                  value={nameElementId}
                  onChange={(e) => setNameElementId(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">Select...</option>
                  {elements.map(el => (
                    <option key={el.id} value={el.id}>{el.content.substring(0, 20)}...</option>
                  ))}
                </select>
              </div>
            </Group>

            <Group label="Legacy Bulk Export">
              <ActionButton
                icon={isExporting ? Loader2 : FileText}
                label={isExporting ? `${bulkProgress.current}/${bulkProgress.total}` : "Export All"}
                onClick={handleBulkExport}
                disabled={isExporting || bulkNames.length === 0 || !nameElementId}
              />
            </Group>

            <Group label="Email">
              <div className="flex items-center px-2">
                <EmailSender
                  elements={elements}
                  setElements={setElements}
                  canvasElement={canvasElement}
                />
              </div>
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
