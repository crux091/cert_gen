import { fabric } from 'fabric'
import jsPDF from 'jspdf'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { CertificateElement, ExportOptions, CSVData, VariableBindings } from '@/types/certificate'
import { replaceAllVariables, getAllUniqueVariables } from './variableParser'

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

/**
 * Check if a string appears to be an image URL
 */
function isImageURL(value: string): boolean {
  if (!value || typeof value !== 'string') return false
  const trimmed = value.trim().toLowerCase()
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:image') ||
    trimmed.endsWith('.png') ||
    trimmed.endsWith('.jpg') ||
    trimmed.endsWith('.jpeg') ||
    trimmed.endsWith('.gif') ||
    trimmed.endsWith('.svg') ||
    trimmed.endsWith('.webp')
  )
}

/**
 * Load image from URL and return as Fabric.js Image object
 */
async function loadImageFromURL(url: string): Promise<fabric.Image> {
  return new Promise((resolve, reject) => {
    fabric.Image.fromURL(
      url,
      (img) => {
        if (!img) {
          reject(new Error(`Failed to load image from URL: ${url}`))
        } else {
          resolve(img)
        }
      },
      { crossOrigin: 'anonymous' }
    )
  })
}

/**
 * Apply character-level formatting from one text to another in Fabric.js
 * Preserves bold, italic, color, etc. from original bracketed variable to replacement text
 */
function applyFormattingToReplacement(
  textObj: fabric.Textbox,
  originalText: string,
  variableName: string,
  replacementValue: string
): void {
  const bracketedVar = `[${variableName}]`
  const varIndex = originalText.indexOf(bracketedVar)
  
  if (varIndex === -1 || !textObj.styles) return

  // Get line and character index of the variable
  let currentIndex = 0
  let foundLine = -1
  let foundChar = -1

  const lines = originalText.split('\n')
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]
    if (currentIndex + line.length >= varIndex) {
      foundLine = lineNum
      foundChar = varIndex - currentIndex
      break
    }
    currentIndex += line.length + 1 // +1 for newline
  }

  if (foundLine === -1) return

  // Extract styles from the bracketed variable position
  const lineStyles = textObj.styles[foundLine]
  if (!lineStyles) return

  // Get style from first character of the variable
  const originalStyle = lineStyles[foundChar]
  if (!originalStyle) return

  // Calculate new text and position
  const beforeVar = originalText.substring(0, varIndex)
  const afterVar = originalText.substring(varIndex + bracketedVar.length)
  const newText = beforeVar + replacementValue + afterVar

  // Update text content
  textObj.set({ text: newText })

  // Re-calculate line and position after replacement
  const newLines = newText.split('\n')
  currentIndex = 0
  let newFoundLine = -1
  let newFoundChar = -1

  for (let lineNum = 0; lineNum < newLines.length; lineNum++) {
    const line = newLines[lineNum]
    if (currentIndex + line.length >= varIndex) {
      newFoundLine = lineNum
      newFoundChar = varIndex - currentIndex
      break
    }
    currentIndex += line.length + 1
  }

  if (newFoundLine === -1) return

  // Apply the original style to all characters of the replacement
  if (!textObj.styles[newFoundLine]) {
    textObj.styles[newFoundLine] = {}
  }

  for (let i = 0; i < replacementValue.length; i++) {
    textObj.styles[newFoundLine][newFoundChar + i] = { ...originalStyle }
  }
}

/**
 * Bulk export certificates with variable replacements from CSV data
 * @param csvData - CSV data with headers and rows
 * @param variableBindings - Map of variable names to CSV column names
 * @param elements - Array of certificate elements
 * @param setElements - Function to update elements
 * @param canvasElement - The container element with Fabric.js canvas
 * @param format - Export format (png or pdf)
 * @param onProgress - Callback for progress updates
 */
export async function bulkExportWithVariables(
  csvData: CSVData,
  variableBindings: VariableBindings,
  elements: CertificateElement[],
  setElements: (elements: CertificateElement[]) => void,
  canvasElement: HTMLElement,
  format: 'png' | 'pdf',
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const zip = new JSZip()
  const originalElements = JSON.parse(JSON.stringify(elements)) // Deep clone
  const extension = format === 'png' ? '.png' : '.pdf'
  const fabricCanvas = getFabricCanvas(canvasElement)

  if (!fabricCanvas) {
    throw new Error('Fabric.js canvas not found')
  }

  // Get all variables from text elements
  const textElements = elements.filter(el => el.type === 'text')
  const allTextContent = textElements.map(el => el.content).join(' ')
  const allVariables = getAllUniqueVariables([allTextContent])
  
  // Auto-build bindings: variable name → column name (they're the same with new approach)
  // Variables are now directly named after columns (e.g., [Name] maps to "Name" column)
  const effectiveBindings: VariableBindings = {}
  const unboundVars: string[] = []
  
  for (const varName of allVariables) {
    if (csvData.headers.includes(varName)) {
      effectiveBindings[varName] = varName // Variable name equals column name
    } else {
      unboundVars.push(varName)
    }
  }
  
  if (unboundVars.length > 0) {
    throw new Error(`Unbound variables detected: ${unboundVars.map(v => `[${v}]`).join(', ')}. Click on variables in the canvas to bind them to columns.`)
  }

  // Check for mixed data types in bound columns
  const boundColumns = Object.values(effectiveBindings)
  for (const column of boundColumns) {
    const values = csvData.rows.map(row => row[column])
    const hasImages = values.some(v => isImageURL(String(v)))
    const hasText = values.some(v => !isImageURL(String(v)))
    
    if (hasImages && hasText) {
      throw new Error(`Column "${column}" contains mixed data types (images and text). All values must be either images or text.`)
    }
  }

  try {
    for (let rowIndex = 0; rowIndex < csvData.rows.length; rowIndex++) {
      const row = csvData.rows[rowIndex]
      
      // Validate row data - check for missing required values
      for (const [varName, columnName] of Object.entries(effectiveBindings)) {
        const value = row[columnName]
        if (value === undefined || value === null || String(value).trim() === '') {
          throw new Error(`Export failed: Missing data in column "${columnName}" for row ${rowIndex + 1}`)
        }
      }

      // Create row-specific bindings (variable name -> actual value)
      const rowBindings: Record<string, string> = {}
      Object.entries(effectiveBindings).forEach(([varName, columnName]) => {
        rowBindings[varName] = String(row[columnName])
      })

      // Update elements with variable replacements
      const updatedElements = elements.map(el => {
        if (el.type === 'text' && el.hasVariables) {
          const replacedContent = replaceAllVariables(el.content, rowBindings)
          return { ...el, content: replacedContent }
        }
        return el
      })

      setElements(updatedElements)

      // Wait for Fabric.js to update and render
      await new Promise(resolve => setTimeout(resolve, 500))

      // Handle image replacements (if any variables are bound to image columns)
      const fabricObjects = fabricCanvas.getObjects()
      for (const [varName, columnName] of Object.entries(effectiveBindings)) {
        const value = row[columnName]
        if (isImageURL(String(value))) {
          // Find textbox containing this variable and replace with image
          const textObj = fabricObjects.find(obj => 
            obj.type === 'textbox' && 
            (obj as fabric.Textbox).text?.includes(`[${varName}]`)
          ) as fabric.Textbox

          if (textObj) {
            try {
              const img = await loadImageFromURL(String(value))
              img.set({
                left: textObj.left,
                top: textObj.top,
                scaleX: (textObj.width || 100) / (img.width || 1),
                scaleY: (textObj.height || 100) / (img.height || 1),
              })
              
              fabricCanvas.remove(textObj)
              fabricCanvas.add(img)
              fabricCanvas.renderAll()
            } catch (error) {
              console.error(`Failed to load image for [${varName}]:`, error)
              throw new Error(`Failed to load image from URL in column "${columnName}": ${value}`)
            }
          }
        }
      }

      // Generate certificate
      const blob = await generateCertificateBlob(canvasElement, format)
      
      // Generate filename from first bound variable or row number
      const firstVarName = Object.keys(effectiveBindings)[0]
      const firstValue = firstVarName ? rowBindings[firstVarName] : `Row ${rowIndex + 1}`
      const filename = sanitizeFilename(`Certificate - ${firstValue}${extension}`)
      zip.file(filename, blob)

      // Update progress
      if (onProgress) {
        onProgress(rowIndex + 1, csvData.rows.length)
      }

      // Restore original canvas before next iteration
      fabricCanvas.clear()
      fabricCanvas.renderAll()
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Restore original elements
    setElements(originalElements)

    // Generate and download zip
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    saveAs(zipBlob, `certificates-${Date.now()}.zip`)
  } catch (error) {
    console.error('Bulk export with variables error:', error)
    // Restore original elements on error
    setElements(originalElements)
    throw error
  }
}
