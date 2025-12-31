import { fabric } from 'fabric'
import jsPDF from 'jspdf'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { CertificateElement, ExportOptions, CSVData, VariableBindings, VariableStyles, RichTextStyles, CharacterStyle, CanvasBackground } from '@/types/certificate'
import { replaceAllVariables, getAllUniqueVariables, extractVariables } from './variableParser'

// CRITICAL: Disable Fabric.js retina scaling to prevent rendering issues
if (typeof window !== 'undefined') {
  (fabric as any).devicePixelRatio = 1
}

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

function nextFrame(): Promise<void> {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
    } else {
      setTimeout(() => resolve(), 0)
    }
  })
}

function buildRowBindings(
  csvData: CSVData,
  variableBindings: VariableBindings,
  row: Record<string, any>
): Record<string, string> {
  const bindings: Record<string, string> = {}

  // Auto-bind: [HeaderName] -> row[HeaderName]
  for (const header of csvData.headers) {
    bindings[header] = String(row?.[header] ?? '')
  }

  // Explicit bindings override/extend: [VarName] -> row[ColumnName]
  for (const [varName, columnName] of Object.entries(variableBindings)) {
    bindings[varName] = String(row?.[columnName] ?? '')
  }

  return bindings
}

function buildLineStartIndices(text: string): number[] {
  const starts: number[] = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      starts.push(i + 1)
    }
  }
  return starts
}

function globalIndexToLineChar(lineStarts: number[], globalIndex: number): { line: number; ch: number } {
  // Find the greatest lineStart <= globalIndex
  let line = 0
  for (let i = 0; i < lineStarts.length; i++) {
    if (lineStarts[i] <= globalIndex) {
      line = i
    } else {
      break
    }
  }
  return { line, ch: globalIndex - lineStarts[line] }
}

function getStyleAtGlobalIndex(
  styles: RichTextStyles | undefined,
  text: string,
  globalIndex: number
): CharacterStyle | undefined {
  if (!styles) return undefined
  const lineStarts = buildLineStartIndices(text)
  const { line, ch } = globalIndexToLineChar(lineStarts, globalIndex)
  return styles?.[line]?.[ch]
}

type ReplacementSpan = {
  originalStart: number
  originalEnd: number
  newStart: number
  newEnd: number
  name: string
  occurrenceIndex: number
  replacement: string
}

function remapRichTextStylesForReplacements(
  originalText: string,
  replacedText: string,
  originalStyles: RichTextStyles | undefined,
  variableStyles: VariableStyles | undefined,
  replacements: ReplacementSpan[]
): RichTextStyles | undefined {
  if (!originalStyles && !variableStyles) return undefined

  const newStyles: RichTextStyles = {}

  const originalLineStarts = buildLineStartIndices(originalText)
  const newLineStarts = buildLineStartIndices(replacedText)

  const replacementsSorted = [...replacements].sort((a, b) => a.originalStart - b.originalStart)

  const deltaBefore = (originalIndex: number): number => {
    let delta = 0
    for (const r of replacementsSorted) {
      if (r.originalEnd <= originalIndex) {
        delta += (r.newEnd - r.newStart) - (r.originalEnd - r.originalStart)
      } else {
        break
      }
    }
    return delta
  }

  const isWithinReplacement = (originalIndex: number): ReplacementSpan | null => {
    for (const r of replacementsSorted) {
      if (originalIndex >= r.originalStart && originalIndex < r.originalEnd) return r
      if (r.originalStart > originalIndex) break
    }
    return null
  }

  // 1) Shift/copy all non-variable original styles
  if (originalStyles) {
    for (const [lineKey, lineMap] of Object.entries(originalStyles)) {
      const lineIndex = Number(lineKey)
      const lineStart = originalLineStarts[lineIndex] ?? 0
      for (const [chKey, style] of Object.entries(lineMap)) {
        const chIndex = Number(chKey)
        const originalGlobal = lineStart + chIndex

        if (isWithinReplacement(originalGlobal)) {
          continue
        }

        const newGlobal = originalGlobal + deltaBefore(originalGlobal)
        if (newGlobal < 0) continue
        if (newGlobal >= replacedText.length) continue

        const { line, ch } = globalIndexToLineChar(newLineStarts, newGlobal)
        if (!newStyles[line]) newStyles[line] = {}
        newStyles[line][ch] = { ...(newStyles[line][ch] || {}), ...(style as CharacterStyle) }
      }
    }
  }

  // 2) Apply variable occurrence styles (or fallback to placeholder's first-char style)
  for (const r of replacementsSorted) {
    const varKey = `${r.name}_${r.occurrenceIndex}`
    const fallback = getStyleAtGlobalIndex(originalStyles, originalText, r.originalStart)
    const varStyle = (variableStyles && variableStyles[varKey]) || fallback
    if (!varStyle) continue

    for (let i = 0; i < r.replacement.length; i++) {
      const newGlobal = r.newStart + i
      if (newGlobal < 0) continue
      if (newGlobal >= replacedText.length) continue
      const { line, ch } = globalIndexToLineChar(newLineStarts, newGlobal)
      if (!newStyles[line]) newStyles[line] = {}
      newStyles[line][ch] = { ...(newStyles[line][ch] || {}), ...(varStyle as CharacterStyle) }
    }
  }

  return Object.keys(newStyles).length > 0 ? newStyles : undefined
}

function computeTextWithRowBindings(el: CertificateElement, rowBindings: Record<string, string>): { text: string; styles?: RichTextStyles } {
  const originalText = el.content
  // IMPORTANT: Do not rely on el.hasVariables.
  // Previews replace variables even when this flag is missing/false.
  const variables = extractVariables(originalText)
  const hasVariables = variables.length > 0
  const replacedText = hasVariables ? replaceAllVariables(originalText, rowBindings) : originalText

  if (!hasVariables) {
    return { text: replacedText, styles: el.styles }
  }

  const sortedVars = [...variables].sort((a, b) => a.startIndex - b.startIndex)
  const variableOccurrences: Record<string, number> = {}

  let offset = 0
  const spans: ReplacementSpan[] = []
  for (const v of sortedVars) {
    const replacement = String(rowBindings[v.name] ?? `[${v.name}]`)
    const originalLen = v.endIndex - v.startIndex
    const newLen = replacement.length

    const occurrenceIndex = variableOccurrences[v.name] || 0
    variableOccurrences[v.name] = occurrenceIndex + 1

    spans.push({
      originalStart: v.startIndex,
      originalEnd: v.endIndex,
      newStart: v.startIndex + offset,
      newEnd: v.startIndex + offset + newLen,
      name: v.name,
      occurrenceIndex,
      replacement,
    })

    offset += newLen - originalLen
  }

  const styles = remapRichTextStylesForReplacements(
    originalText,
    replacedText,
    el.styles,
    el.variableStyles,
    spans
  )

  return { text: replacedText, styles }
}

async function renderCertificateToStaticCanvas(
  elements: CertificateElement[],
  canvasSize: { width: number; height: number },
  background: CanvasBackground,
  rowBindings?: Record<string, string>
): Promise<fabric.StaticCanvas> {
  const exportCanvasEl = document.createElement('canvas')
  exportCanvasEl.width = canvasSize.width
  exportCanvasEl.height = canvasSize.height

  const staticCanvas = new fabric.StaticCanvas(exportCanvasEl, {
    width: canvasSize.width,
    height: canvasSize.height,
    backgroundColor: background.type === 'color' ? background.color || '#ffffff' : '#ffffff',
  })

  // Background image
  if (background.type === 'image' && background.imageUrl) {
    await new Promise<void>((resolve) => {
      fabric.Image.fromURL(
        background.imageUrl!,
        (img) => {
          if (!img || !img.width || !img.height) {
            resolve()
            return
          }
          img.set({
            scaleX: canvasSize.width / (img.width || 1),
            scaleY: canvasSize.height / (img.height || 1),
            left: 0,
            top: 0,
            originX: 'left',
            originY: 'top',
          })
          staticCanvas.setBackgroundImage(img, () => resolve())
        },
        { crossOrigin: 'anonymous' }
      )
    })
  }

  const sorted = [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))

  for (const el of sorted) {
    if (el.type === 'text') {
      // If a text element is exactly a single variable and that variable resolves to an image URL,
      // render it as an image (common pattern for photo/logo placeholders).
      if (rowBindings) {
        const vars = extractVariables(el.content)
        if (
          vars.length === 1 &&
          vars[0].startIndex === 0 &&
          vars[0].endIndex === el.content.length
        ) {
          const value = String(rowBindings[vars[0].name] ?? '')
          if (isImageURL(value)) {
            try {
              const img = await loadImageFromURL(value)
              const imgWidth = img.width || 1
              const imgHeight = img.height || 1
              const targetWidth = el.width || imgWidth
              const targetHeight = el.height || imgHeight

              img.set({
                left: el.x,
                top: el.y,
                scaleX: (targetWidth / imgWidth) * (el.scaleX || 1),
                scaleY: (targetHeight / imgHeight) * (el.scaleY || 1),
                angle: el.angle || 0,
                opacity: el.opacity ?? 1,
                originX: 'left',
                originY: 'top',
              })
              staticCanvas.add(img)
              continue
            } catch (e) {
              console.warn('Failed to load image variable for export:', e)
            }
          }
        }
      }

      const { text, styles } = rowBindings ? computeTextWithRowBindings(el, rowBindings) : { text: el.content, styles: el.styles }

      const textbox = new fabric.Textbox(text, {
        left: el.x,
        top: el.y,
        width: el.width || 200,
        height: el.height,
        fontSize: el.fontSize || 24,
        fontFamily: el.fontFamily || 'Arial',
        fontWeight: el.fontWeight || 'normal',
        fontStyle: el.fontStyle || 'normal',
        underline: el.textDecoration === 'underline',
        fill: el.color || '#000000',
        textAlign: el.alignment || 'left',
        angle: el.angle || 0,
        scaleX: el.scaleX || 1,
        scaleY: el.scaleY || 1,
        opacity: el.opacity ?? 1,
        originX: 'left',
        originY: 'top',
        splitByGrapheme: false,
      })

      if (styles) {
        textbox.styles = styles as any
      }

      staticCanvas.add(textbox)
    } else if (el.type === 'image') {
      if (!el.content) continue
      try {
        const img = await loadImageFromURL(el.content)
        const imgWidth = img.width || 1
        const imgHeight = img.height || 1
        const targetWidth = el.width || imgWidth
        const targetHeight = el.height || imgHeight

        img.set({
          left: el.x,
          top: el.y,
          scaleX: (targetWidth / imgWidth) * (el.scaleX || 1),
          scaleY: (targetHeight / imgHeight) * (el.scaleY || 1),
          angle: el.angle || 0,
          opacity: el.opacity ?? 1,
          originX: 'left',
          originY: 'top',
        })

        staticCanvas.add(img)
      } catch (e) {
        console.warn('Failed to load image element for export:', e)
      }
    }
  }

  staticCanvas.renderAll()
  // Give Fabric a frame to finalize text measurements
  await nextFrame()
  staticCanvas.renderAll()

  return staticCanvas
}

async function exportStaticCanvasToBlob(
  canvas: fabric.StaticCanvas,
  format: 'png' | 'pdf',
  options: ExportOptions = { dpi: 300 }
): Promise<Blob> {
  const multiplier = options.multiplier || (options.dpi || 300) / 96

  const dataURL = canvas.toDataURL({
    format: 'png',
    quality: options.quality || 1,
    multiplier,
    enableRetinaScaling: false,
  })

  if (format === 'png') {
    const response = await fetch(dataURL)
    return response.blob()
  }

  const width = canvas.getWidth()
  const height = canvas.getHeight()
  const pdf = new jsPDF({
    orientation: width > height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [width, height],
  })
  pdf.addImage(dataURL, 'PNG', 0, 0, width, height)
  return pdf.output('blob')
}

export async function exportRowWithVariables(
  row: Record<string, any>,
  csvData: CSVData,
  variableBindings: VariableBindings,
  elements: CertificateElement[],
  canvasSize: { width: number; height: number },
  background: CanvasBackground,
  filename: string,
  format: 'png' | 'pdf',
  options: ExportOptions = { dpi: 300, quality: 1 }
): Promise<void> {
  try {
    await document.fonts.ready
  } catch (e) {
    console.warn('Font loading wait failed', e)
  }

  const rowBindings = buildRowBindings(csvData, variableBindings, row)
  const staticCanvas = await renderCertificateToStaticCanvas(elements, canvasSize, background, rowBindings)
  const blob = await exportStaticCanvasToBlob(staticCanvas, format, options)
  saveAs(blob, sanitizeFilename(filename))
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
  
  // Save current viewport state
  const currentViewport = fabricCanvas.viewportTransform?.slice() || [1, 0, 0, 1, 0, 0]
  const currentZoom = fabricCanvas.getZoom()
  const currentWidth = fabricCanvas.getWidth()
  const currentHeight = fabricCanvas.getHeight()
  
  // Get the content dimensions from canvas data attributes or use default
  const contentWidth = (fabricCanvas as any)._contentWidth || currentWidth
  const contentHeight = (fabricCanvas as any)._contentHeight || currentHeight
  
  // Reset viewport to 1:1 for export
  fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0])
  fabricCanvas.setZoom(1)
  fabricCanvas.setDimensions({ width: contentWidth, height: contentHeight }, { cssOnly: false, backstoreOnly: false })
  fabricCanvas.renderAll()

  // Export to data URL with high quality
  const dataURL = fabricCanvas.toDataURL({
    format: 'png',
    quality: options.quality || 1,
    multiplier: multiplier,
    enableRetinaScaling: false,
  })
  
  // Restore viewport state
  fabricCanvas.setDimensions({ width: currentWidth, height: currentHeight }, { cssOnly: false, backstoreOnly: false })
  fabricCanvas.setZoom(currentZoom)
  fabricCanvas.setViewportTransform(currentViewport as any)
  fabricCanvas.renderAll()

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
  
  // Save current viewport state
  const currentViewport = fabricCanvas.viewportTransform?.slice() || [1, 0, 0, 1, 0, 0]
  const currentZoom = fabricCanvas.getZoom()
  const currentWidth = fabricCanvas.getWidth()
  const currentHeight = fabricCanvas.getHeight()
  
  // Get the content dimensions from canvas data attributes or use default
  const contentWidth = (fabricCanvas as any)._contentWidth || currentWidth
  const contentHeight = (fabricCanvas as any)._contentHeight || currentHeight
  
  // Reset viewport to 1:1 for export
  fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0])
  fabricCanvas.setZoom(1)
  fabricCanvas.setDimensions({ width: contentWidth, height: contentHeight }, { cssOnly: false, backstoreOnly: false })
  fabricCanvas.renderAll()

  // Export to data URL
  const dataURL = fabricCanvas.toDataURL({
    format: 'png',
    quality: 1,
    multiplier: multiplier,
    enableRetinaScaling: false,
  })

  // Get canvas dimensions for PDF
  const width = contentWidth * multiplier
  const height = contentHeight * multiplier
  
  // Restore viewport state
  fabricCanvas.setDimensions({ width: currentWidth, height: currentHeight }, { cssOnly: false, backstoreOnly: false })
  fabricCanvas.setZoom(currentZoom)
  fabricCanvas.setViewportTransform(currentViewport as any)
  fabricCanvas.renderAll()

  // Create PDF with exact canvas dimensions
  const pdf = new jsPDF({
    orientation: width > height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [contentWidth, contentHeight],
  })

  // Add image to PDF
  pdf.addImage(dataURL, 'PNG', 0, 0, contentWidth, contentHeight)
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

  // Save current viewport state and dimensions
  const currentViewport = fabricCanvas.viewportTransform?.slice() || [1, 0, 0, 1, 0, 0]
  const currentZoom = fabricCanvas.getZoom()
  const currentWidth = fabricCanvas.getWidth()
  const currentHeight = fabricCanvas.getHeight()
  const contentWidth = (fabricCanvas as any)._contentWidth || currentWidth
  const contentHeight = (fabricCanvas as any)._contentHeight || currentHeight

  // Reset viewport to export the design area only
  fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0])
  fabricCanvas.setZoom(1)
  fabricCanvas.setDimensions({ width: contentWidth, height: contentHeight }, { cssOnly: false, backstoreOnly: false })
  fabricCanvas.renderAll()

  if (format === 'png') {
    const dataURL = fabricCanvas.toDataURL({
      format: 'png',
      quality: options.quality || 1,
      multiplier: multiplier,
      enableRetinaScaling: false,
    })

    // Restore viewport
    fabricCanvas.setDimensions({ width: currentWidth, height: currentHeight }, { cssOnly: false, backstoreOnly: false })
    fabricCanvas.setZoom(currentZoom)
    fabricCanvas.setViewportTransform(currentViewport as any)
    fabricCanvas.renderAll()

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

    const width = contentWidth * multiplier
    const height = contentHeight * multiplier

    const pdf = new jsPDF({
      orientation: width > height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [contentWidth, contentHeight],
    })

    pdf.addImage(dataURL, 'PNG', 0, 0, contentWidth, contentHeight)

    // Restore viewport
    fabricCanvas.setDimensions({ width: currentWidth, height: currentHeight }, { cssOnly: false, backstoreOnly: false })
    fabricCanvas.setZoom(currentZoom)
    fabricCanvas.setViewportTransform(currentViewport as any)
    fabricCanvas.renderAll()

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
  canvasSize: { width: number; height: number },
  background: CanvasBackground,
  format: 'png' | 'pdf',
  onProgress?: (current: number, total: number) => void,
  options: ExportOptions = { dpi: 300, quality: 1 }
): Promise<void> {
  return bulkExportWithVariablesHeadless(
    csvData,
    variableBindings,
    elements,
    canvasSize,
    background,
    format,
    onProgress,
    options
  )
}

/**
 * Headless bulk export for the main UI. Uses the design canvas size + background
 * and renders each row off-screen to guarantee the exported output matches the preview.
 */
export async function bulkExportWithVariablesHeadless(
  csvData: CSVData,
  variableBindings: VariableBindings,
  elements: CertificateElement[],
  canvasSize: { width: number; height: number },
  background: CanvasBackground,
  format: 'png' | 'pdf',
  onProgress?: (current: number, total: number) => void,
  options: ExportOptions = { dpi: 300, quality: 1 }
): Promise<void> {
  const zip = new JSZip()
  const extension = format === 'png' ? '.png' : '.pdf'

  try {
    await document.fonts.ready
  } catch (e) {
    console.warn('Font loading wait failed', e)
  }

  // Validate bound columns for mixed image/text
  const boundColumns = Object.values(variableBindings)
  for (const column of boundColumns) {
    const values = csvData.rows.map(r => r[column])
    const hasImages = values.some(v => isImageURL(String(v)))
    const hasText = values.some(v => !isImageURL(String(v)))
    if (hasImages && hasText) {
      throw new Error(`Column "${column}" contains mixed data types (images and text). All values must be either images or text.`)
    }
  }

  for (let rowIndex = 0; rowIndex < csvData.rows.length; rowIndex++) {
    const row = csvData.rows[rowIndex]
    const rowBindings = buildRowBindings(csvData, variableBindings, row)

    const staticCanvas = await renderCertificateToStaticCanvas(elements, canvasSize, background, rowBindings)
    const blob = await exportStaticCanvasToBlob(staticCanvas, format, options)

    const firstKey = Object.keys(variableBindings)[0] || csvData.headers[0]
    const firstValue = firstKey ? rowBindings[firstKey] : `Row ${rowIndex + 1}`
    const filename = sanitizeFilename(`Certificate - ${firstValue}${extension}`)
    zip.file(filename, blob)

    if (onProgress) onProgress(rowIndex + 1, csvData.rows.length)

    // Small yield to keep UI responsive
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  saveAs(zipBlob, `certificates-${Date.now()}.zip`)
}
