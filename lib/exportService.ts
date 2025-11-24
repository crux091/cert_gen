import { fabric } from 'fabric'
import jsPDF from 'jspdf'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { CertificateElement, ExportOptions } from '@/types/certificate'

/**
 * Sanitize filename by replacing invalid characters
 */
function sanitizeFilename(filename: string): string {
  return filename.replace(/[<>:"/\\|?*]/g, '_').trim()
}

/**
 * Get Fabric.js canvas instance from canvas element
 */
function getFabricCanvas(canvasElement: HTMLElement): fabric.Canvas | null {
  const canvas = canvasElement.querySelector('canvas')
  if (!canvas) {
    console.error('Canvas element not found in container')
    return null
  }
  
  // Check if canvas instance is stored on the element (most reliable)
  // @ts-ignore
  if (canvas.__fabricCanvas) {
    // @ts-ignore
    return canvas.__fabricCanvas
  }
  
  // Fallback: try __canvas property
  // @ts-ignore
  if (canvas.__canvas) {
    // @ts-ignore
    return canvas.__canvas
  }
  
  console.error('Fabric.js canvas instance not found. Make sure the canvas is initialized.')
  return null
}

/**
 * Export certificate as PNG using Fabric.js
 * @param canvasElement - The container element with Fabric.js canvas
 * @param filename - The name of the file to save
 * @param options - Export options (DPI, quality, multiplier)
 */
export async function exportToPNG(
  canvasElement: HTMLElement,
  filename: string,
  options: ExportOptions = { dpi: 300, quality: 1 }
): Promise<void> {
  const fabricCanvas = getFabricCanvas(canvasElement)
  if (!fabricCanvas) {
    throw new Error('Fabric.js canvas not found')
  }

  // Wait for fonts to load
  try {
    await document.fonts.ready
  } catch (e) {
    console.warn('Font loading wait failed', e)
  }

  // Calculate multiplier from DPI (default 96 DPI screen)
  const multiplier = options.multiplier || (options.dpi || 300) / 96

  // Deselect all objects before export
  fabricCanvas.discardActiveObject()
  fabricCanvas.renderAll()

  // Export to data URL with high quality
  const dataURL = fabricCanvas.toDataURL({
    format: 'png',
    quality: options.quality || 1,
    multiplier: multiplier,
    enableRetinaScaling: false,
  })

  // Convert data URL to blob and download
  fetch(dataURL)
    .then(res => res.blob())
    .then(blob => {
      saveAs(blob, sanitizeFilename(filename))
    })
    .catch(err => {
      console.error('Export failed:', err)
      throw err
    })
}

/**
 * Export certificate as PDF using Fabric.js
 * @param canvasElement - The container element with Fabric.js canvas
 * @param filename - The name of the file to save
 * @param options - Export options (DPI, multiplier)
 */
export async function exportToPDF(
  canvasElement: HTMLElement,
  filename: string,
  options: ExportOptions = { dpi: 300 }
): Promise<void> {
  const fabricCanvas = getFabricCanvas(canvasElement)
  if (!fabricCanvas) {
    throw new Error('Fabric.js canvas not found')
  }

  try {
    await document.fonts.ready
  } catch (e) {
    console.warn('Font loading wait failed', e)
  }

  const multiplier = options.multiplier || (options.dpi || 300) / 96

  // Deselect all objects before export
  fabricCanvas.discardActiveObject()
  fabricCanvas.renderAll()

  // Export to data URL
  const dataURL = fabricCanvas.toDataURL({
    format: 'png',
    quality: 1,
    multiplier: multiplier,
    enableRetinaScaling: false,
  })

  // Get canvas dimensions
  const width = (fabricCanvas.width || 800) * multiplier
  const height = (fabricCanvas.height || 600) * multiplier

  // Create PDF with exact canvas dimensions
  const pdf = new jsPDF({
    orientation: width > height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [width / multiplier, height / multiplier],
  })

  // Add image to PDF
  pdf.addImage(dataURL, 'PNG', 0, 0, width / multiplier, height / multiplier)
  pdf.save(sanitizeFilename(filename))
}

/**
 * Export certificate as SVG using Fabric.js
 * @param canvasElement - The container element with Fabric.js canvas
 * @param filename - The name of the file to save
 */
export async function exportToSVG(
  canvasElement: HTMLElement,
  filename: string
): Promise<void> {
  const fabricCanvas = getFabricCanvas(canvasElement)
  if (!fabricCanvas) {
    throw new Error('Fabric.js canvas not found')
  }

  // Deselect all objects before export
  fabricCanvas.discardActiveObject()
  fabricCanvas.renderAll()

  // Export to SVG
  const svgString = fabricCanvas.toSVG()
  
  // Create blob and download
  const blob = new Blob([svgString], { type: 'image/svg+xml' })
  saveAs(blob, sanitizeFilename(filename))
}

/**
 * Generate certificate image as blob for bulk export
 */
async function generateCertificateBlob(
  canvasElement: HTMLElement,
  format: 'png' | 'pdf',
  options: ExportOptions = { dpi: 300 }
): Promise<Blob> {
  const fabricCanvas = getFabricCanvas(canvasElement)
  if (!fabricCanvas) {
    throw new Error('Fabric.js canvas not found')
  }

  try {
    await document.fonts.ready
  } catch (e) {
    console.warn('Font loading wait failed', e)
  }

  const multiplier = options.multiplier || (options.dpi || 300) / 96

  // Deselect all objects before export
  fabricCanvas.discardActiveObject()
  fabricCanvas.renderAll()

  if (format === 'png') {
    const dataURL = fabricCanvas.toDataURL({
      format: 'png',
      quality: options.quality || 1,
      multiplier: multiplier,
      enableRetinaScaling: false,
    })

    // Convert data URL to blob
    const response = await fetch(dataURL)
    return response.blob()
  } else {
    // PDF format
    const dataURL = fabricCanvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: multiplier,
      enableRetinaScaling: false,
    })

    const width = (fabricCanvas.width || 800) * multiplier
    const height = (fabricCanvas.height || 600) * multiplier

    const pdf = new jsPDF({
      orientation: width > height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [width / multiplier, height / multiplier],
    })

    pdf.addImage(dataURL, 'PNG', 0, 0, width / multiplier, height / multiplier)
    return pdf.output('blob')
  }
}

/**
 * Bulk export certificates with different names
 * @param names - Array of names to generate certificates for
 * @param nameElementId - ID of the element to replace with each name
 * @param elements - Array of certificate elements
 * @param setElements - Function to update elements
 * @param canvasElement - The container element with Fabric.js canvas
 * @param format - Export format (png or pdf)
 * @param onProgress - Callback for progress updates
 */
export async function bulkExportCertificates(
  names: string[],
  nameElementId: string,
  elements: CertificateElement[],
  setElements: (elements: CertificateElement[]) => void,
  canvasElement: HTMLElement,
  format: 'png' | 'pdf',
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const zip = new JSZip()
  const originalElements = JSON.parse(JSON.stringify(elements)) // Deep clone
  const extension = format === 'png' ? '.png' : '.pdf'

  try {
    for (let i = 0; i < names.length; i++) {
      const name = names[i]
      
      // Update the name element
      const updatedElements = elements.map(el =>
        el.id === nameElementId ? { ...el, content: name } : el
      )
      setElements(updatedElements)

      // Wait for Fabric.js to update and render
      await new Promise(resolve => setTimeout(resolve, 500))

      // Generate certificate
      const blob = await generateCertificateBlob(canvasElement, format)
      
      // Add to zip
      const filename = sanitizeFilename(`Certificate - ${name}${extension}`)
      zip.file(filename, blob)

      // Update progress
      if (onProgress) {
        onProgress(i + 1, names.length)
      }
    }

    // Restore original elements
    setElements(originalElements)

    // Generate and download zip
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    saveAs(zipBlob, `certificates-${Date.now()}.zip`)
  } catch (error) {
    console.error('Bulk export error:', error)
    // Restore original elements on error
    setElements(originalElements)
    throw error
  }
}

/**
 * Update element content for preview (useful for testing bulk export)
 */
export function updateElementContent(
  elements: CertificateElement[],
  elementId: string,
  content: string
): CertificateElement[] {
  return elements.map(el =>
    el.id === elementId ? { ...el, content } : el
  )
}
