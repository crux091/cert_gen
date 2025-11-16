'use client'

import { useState, useRef, Dispatch, SetStateAction } from 'react'
import { Download, FileText, Upload, Loader2 } from 'lucide-react'
import { CertificateElement } from '@/types/certificate'
import { exportToPNG, exportToPDF, bulkExportCertificates } from '@/lib/exportService'
import { parseExcelFile, isValidExcelFile } from '@/lib/xlsx'

interface ExportControlsProps {
  elements: CertificateElement[]
  setElements: Dispatch<SetStateAction<CertificateElement[]>>
  canvasSize: { width: number; height: number }
}

export default function ExportControls({ elements, setElements, canvasSize }: ExportControlsProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<'png' | 'pdf'>('png')
  const [bulkNames, setBulkNames] = useState<string[]>([])
  const [nameElementId, setNameElementId] = useState<string>('')
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSingleExport = async () => {
    const canvasElement = document.getElementById('certificate-canvas')
    if (!canvasElement) {
      alert('Canvas not found')
      return
    }

    setIsExporting(true)
    try {
      const filename = `certificate-${Date.now()}.${exportFormat}`
      if (exportFormat === 'png') {
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!isValidExcelFile(file)) {
      alert('Please upload a valid Excel file (.xlsx, .xls, or .csv)')
      return
    }

    try {
      const { names } = await parseExcelFile(file, 0) // Use first column
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
        exportFormat,
        (current, total) => {
          setBulkProgress({ current, total })
        }
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

  return (
    <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Export
      </h3>

      {/* Format Selection */}
      <div className="mb-3">
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Export Format
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => setExportFormat('png')}
            className={`flex-1 px-3 py-2 text-sm rounded border ${
              exportFormat === 'png'
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
            }`}
          >
            PNG
          </button>
          <button
            onClick={() => setExportFormat('pdf')}
            className={`flex-1 px-3 py-2 text-sm rounded border ${
              exportFormat === 'pdf'
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
            }`}
          >
            PDF
          </button>
        </div>
      </div>

      {/* Single Export */}
      <button
        onClick={handleSingleExport}
        disabled={isExporting}
        className="w-full mb-3 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {isExporting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Exporting...
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            Export Single
          </>
        )}
      </button>

      {/* Bulk Export Section */}
      <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Bulk Export
        </h4>

        {/* Upload Excel */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full mb-2 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Upload Excel
        </button>

        {bulkNames.length > 0 && (
          <p className="text-xs text-green-600 dark:text-green-400 mb-2">
            {bulkNames.length} names loaded
          </p>
        )}

        {/* Select Name Element */}
        <div className="mb-2">
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Name Element
          </label>
          <select
            value={nameElementId}
            onChange={(e) => setNameElementId(e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">Select element to replace</option>
            {elements.map(el => (
              <option key={el.id} value={el.id}>
                {el.content.substring(0, 30)}...
              </option>
            ))}
          </select>
        </div>

        {/* Bulk Export Button */}
        <button
          onClick={handleBulkExport}
          disabled={isExporting || bulkNames.length === 0 || !nameElementId}
          className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isExporting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {bulkProgress.current} / {bulkProgress.total}
            </>
          ) : (
            <>
              <FileText className="w-4 h-4" />
              Export Bulk ({bulkNames.length})
            </>
          )}
        </button>
      </div>
    </div>
  )
}
