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
}

export interface BulkExportData {
  names: string[]
  nameElementId: string
}
