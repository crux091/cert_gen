import html2canvas from 'html2canvas'
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
 * Export certificate as PNG
 * @param canvasElement - The DOM element to capture
 * @param filename - The name of the file to save
 * @param options - Export options (DPI, quality)
 */
export async function exportToPNG(
  canvasElement: HTMLElement,
  filename: string,
  options: ExportOptions = { dpi: 300, quality: 1 }
): Promise<void> {
  const scale = (options.dpi || 300) / 96 // 96 is the default screen DPI
  
  const canvas = await html2canvas(canvasElement, {
    scale,
    backgroundColor: null,
    logging: false,
    useCORS: true,
    allowTaint: true,
  })

  canvas.toBlob(
    (blob) => {
      if (blob) {
        saveAs(blob, sanitizeFilename(filename))
      }
    },
    'image/png',
    options.quality || 1
  )
}

/**
 * Export certificate as PDF
 * @param canvasElement - The DOM element to capture
 * @param filename - The name of the file to save
 * @param options - Export options (DPI)
 */
export async function exportToPDF(
  canvasElement: HTMLElement,
  filename: string,
  options: ExportOptions = { dpi: 300 }
): Promise<void> {
  const scale = (options.dpi || 300) / 96
  
  const canvas = await html2canvas(canvasElement, {
    scale,
    backgroundColor: null,
    logging: false,
    useCORS: true,
    allowTaint: true,
  })

  const imgData = canvas.toDataURL('image/png')
  
  // Calculate PDF dimensions to match canvas aspect ratio
  const imgWidth = canvas.width / scale
  const imgHeight = canvas.height / scale
  
  // Create PDF with custom dimensions
  const pdf = new jsPDF({
    orientation: imgWidth > imgHeight ? 'landscape' : 'portrait',
    unit: 'px',
    format: [imgWidth, imgHeight],
  })

  pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)
  pdf.save(sanitizeFilename(filename))
}

/**
 * Generate certificate image as blob for bulk export
 */
async function generateCertificateBlob(
  canvasElement: HTMLElement,
  format: 'png' | 'pdf',
  options: ExportOptions = { dpi: 300 }
): Promise<Blob> {
  const scale = (options.dpi || 300) / 96
  
  const canvas = await html2canvas(canvasElement, {
    scale,
    backgroundColor: null,
    logging: false,
    useCORS: true,
    allowTaint: true,
  })

  if (format === 'png') {
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          resolve(blob!)
        },
        'image/png',
        options.quality || 1
      )
    })
  } else {
    const imgData = canvas.toDataURL('image/png')
    const imgWidth = canvas.width / scale
    const imgHeight = canvas.height / scale
    
    const pdf = new jsPDF({
      orientation: imgWidth > imgHeight ? 'landscape' : 'portrait',
      unit: 'px',
      format: [imgWidth, imgHeight],
    })

    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)
    return pdf.output('blob')
  }
}

/**
 * Bulk export certificates with different names
 * @param names - Array of names to generate certificates for
 * @param nameElementId - ID of the element to replace with each name
 * @param elements - Array of certificate elements
 * @param setElements - Function to update elements
 * @param canvasElement - The DOM element to capture
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

      // Wait longer for DOM and React to update
      await new Promise(resolve => setTimeout(resolve, 300))

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
