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
  color?: string
  alignment?: 'left' | 'center' | 'right'
  locked: boolean
  zIndex: number
  angle?: number // Rotation angle in degrees
  scaleX?: number // Horizontal scale
  scaleY?: number // Vertical scale
  opacity?: number // 0-1
  hasVariables?: boolean // Indicates if element contains bracketed variables
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
