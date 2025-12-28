import * as XLSX from 'xlsx'

export interface ExcelData {
  names: string[]
  headers: string[]
}

/**
 * Parse Excel file and extract names from a specific column
 * @param file - The Excel file to parse
 * @param columnIndex - The index of the column to extract (0-based)
 * @returns Object containing names and headers
 */
export async function parseExcelFile(
  file: File,
  columnIndex: number = 0
): Promise<ExcelData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })
        
        // Get the first worksheet
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        
        // Convert to JSON
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
        
        if (jsonData.length === 0) {
          reject(new Error('Excel file is empty'))
          return
        }

        // Extract headers (first row)
        const headers = jsonData[0].map(h => String(h))
        
        // Extract names from specified column (skip header row)
        const names = jsonData
          .slice(1)
          .map(row => row[columnIndex])
          .filter(name => name !== undefined && name !== null && String(name).trim() !== '')
          .map(name => String(name).trim())

        if (names.length === 0) {
          reject(new Error('No valid names found in the specified column'))
          return
        }

        resolve({ names, headers })
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    reader.readAsBinaryString(file)
  })
}

/**
 * Validate Excel file
 * @param file - The file to validate
 * @returns true if valid, false otherwise
 */
export function isValidExcelFile(file: File): boolean {
  const validExtensions = ['.xlsx', '.xls', '.csv']
  const fileName = file.name.toLowerCase()
  return validExtensions.some(ext => fileName.endsWith(ext))
}

/**
 * Get column letter from index (0 = A, 1 = B, etc.)
 * @param index - Column index (0-based)
 * @returns Column letter
 */
export function getColumnLetter(index: number): string {
  let letter = ''
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter
    index = Math.floor(index / 26) - 1
  }
  return letter
}

export interface CSVData {
  headers: string[]
  rows: Record<string, any>[]
}

/**
 * Parse Excel/CSV file and return full dataset with headers and rows
 * @param file - The Excel or CSV file to parse
 * @returns Object containing headers array and rows as key-value objects
 */
export async function parseExcelFileToDataset(file: File): Promise<CSVData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })
        
        // Get the first worksheet
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        
        // Convert to JSON with headers
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
        
        if (jsonData.length === 0) {
          reject(new Error('File is empty'))
          return
        }

        // Extract headers (first row)
        const headers = jsonData[0].map(h => String(h).trim())
        
        // Convert rows to objects with header keys
        const rows = jsonData.slice(1)
          .filter(row => row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== ''))
          .map(row => {
            const obj: Record<string, any> = {}
            headers.forEach((header, index) => {
              obj[header] = row[index] !== undefined ? row[index] : ''
            })
            return obj
          })

        if (rows.length === 0) {
          reject(new Error('No data rows found in file'))
          return
        }

        resolve({ headers, rows })
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    reader.readAsBinaryString(file)
  })
}
