// Per-character style for rich text formatting
export interface CharacterStyle {
  fill?: string           // Text color
  fontWeight?: string     // 'normal' | 'bold' | '300'-'900'
  fontStyle?: string      // 'normal' | 'italic'
  underline?: boolean     // Fabric.js uses boolean for underline
  textDecoration?: string // Legacy - kept for backwards compatibility
  fontSize?: number
  fontFamily?: string
}

// Fabric.js style structure: styles[lineIndex][charIndex] = CharacterStyle
export interface RichTextStyles {
  [lineIndex: number]: {
    [charIndex: number]: CharacterStyle
  }
}

// Text selection state for inline formatting
export interface TextSelection {
  elementId: string | null
  start: number
  end: number
  hasSelection: boolean
}

// Styles applied to specific variable occurrences - keyed by "{variableName}_{occurrenceIndex}"
// Each occurrence of a variable is treated as a separate entity for formatting
// e.g., "Position_0" for first [Position], "Position_1" for second [Position]
export interface VariableStyles {
  [variableKey: string]: CharacterStyle
}

export interface CertificateElement {
  id: string
  type: 'text' | 'image'
  content: string
  x: number
  y: number
  width?: number
  height?: number
  fontSize?: number
  fontWeight?: string
  fontFamily?: string
  fontStyle?: string      // 'normal' | 'italic' for whole element default
  textDecoration?: string // 'underline' | '' for whole element default
  color?: string
  alignment?: 'left' | 'center' | 'right'
  locked: boolean
  zIndex: number
  angle?: number // Rotation angle in degrees
  scaleX?: number // Horizontal scale
  scaleY?: number // Vertical scale
  opacity?: number // 0-1
  hasVariables?: boolean // Indicates if element contains bracketed variables
  styles?: RichTextStyles // Per-character styling for rich text (non-variable text)
  variableStyles?: VariableStyles // Formatting applied to variables (applied to entire replacement)
}

export interface CanvasBackground {
  type: 'color' | 'image'
  color?: string
  imageUrl?: string
}

export interface SavedLayout {
  name: string
  elements: CertificateElement[]
  canvasSize: { width: number; height: number }
  background?: CanvasBackground
  timestamp: number
}

export interface ExportOptions {
  dpi?: number
  quality?: number
  format?: 'png' | 'jpeg' | 'svg' | 'pdf'
  multiplier?: number // Scale multiplier for high-res exports
}

export interface BulkExportData {
  names: string[]
  nameElementId: string
}

export interface CSVData {
  headers: string[]
  rows: Record<string, any>[]
}

export interface VariableBindings {
  [variableName: string]: string // Maps variable name to CSV column name
}

export interface HistoryState {
  elements: CertificateElement[]
  background: CanvasBackground
  canvasSize: { width: number; height: number }
}
