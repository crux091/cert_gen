import * as XLSX from 'xlsx'
import { fabric } from 'fabric'
import { CertificateElement } from '@/types/certificate'

export interface EmailRecipient {
  email: string
  name: string
}

export interface EmailData {
  subject: string
  recipients: EmailRecipient[]
}

/**
 * Read Word file content (requires manual extraction as HTML)
 * Since browsers can't directly read .docx, users need to save as HTML or use a converter
 */
export async function readWordFileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        // If it's HTML (from Word saved as HTML), use it directly
        if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
          resolve(content)
        } else {
          // For plain text or other formats
          resolve(content)
        }
      } catch (error) {
        reject(error)
      }
    }
    
    reader.onerror = () => reject(new Error('Failed to read file'))
    
    // Read as text (works for HTML and txt)
    if (file.name.endsWith('.html') || file.name.endsWith('.htm') || file.name.endsWith('.txt')) {
      reader.readAsText(file)
    } else {
      reject(new Error('Please use HTML format (Save Word document as HTML) or plain text (.txt)'))
    }
  })
}

/**
 * Read Excel file to get email recipients list
 * Expected format: Column A = Name, Column B = Email
 */
export async function readRecipientsFromExcel(file: File): Promise<EmailRecipient[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        
        // Get first sheet
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][]
        
        // Parse recipients (skip header row)
        const recipients: EmailRecipient[] = []
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i]
          if (row[0] && row[1]) { // Name and Email columns
            // Clean and validate email
            let email = row[1].toString().trim()
            // Remove any duplicate domain parts (e.g., user@domain.com@domain.com)
            const emailParts = email.split('@')
            if (emailParts.length > 2) {
              // Take first part + last domain
              email = emailParts[0] + '@' + emailParts[emailParts.length - 1]
            }
            
            recipients.push({
              name: row[0].toString().trim(),
              email: email,
            })
          }
        }
        
        resolve(recipients)
      } catch (error) {
        reject(error)
      }
    }
    
    reader.onerror = () => reject(new Error('Failed to read Excel file'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Generate certificate blob for a specific recipient
 */
async function generateCertificateForRecipient(
  canvasElement: HTMLElement,
  elements: CertificateElement[],
  setElements: (elements: CertificateElement[]) => void,
  nameElementId: string,
  recipientName: string,
  format: 'png' | 'pdf' = 'pdf',
  dpi: number = 300
): Promise<Blob> {
  const getFabricCanvas = (element: HTMLElement): fabric.Canvas | null => {
    const canvas = element.querySelector('canvas')
    if (!canvas) return null
    // @ts-ignore
    return canvas.__fabricCanvas || canvas.__canvas || null
  }

  // Update the name element
  const updatedElements = elements.map(el =>
    el.id === nameElementId ? { ...el, content: recipientName } : el
  )
  setElements(updatedElements)

  // Wait for canvas to update
  await new Promise(resolve => setTimeout(resolve, 300))

  const fabricCanvas = getFabricCanvas(canvasElement)
  if (!fabricCanvas) {
    throw new Error('Fabric.js canvas not found')
  }

  try {
    await document.fonts.ready
  } catch (e) {
    console.warn('Font loading wait failed', e)
  }

  // Reduce multiplier for email to keep file size manageable (max 40MB)
  // Use lower quality for email attachments
  const multiplier = Math.min(dpi / 96, 2) // Cap at 2x for email

  // Deselect all objects before export
  fabricCanvas.discardActiveObject()
  fabricCanvas.renderAll()

  if (format === 'png') {
    const dataURL = fabricCanvas.toDataURL({
      format: 'png',
      quality: 0.8, // Reduced quality for smaller file size
      multiplier: multiplier,
      enableRetinaScaling: false,
    })

    const response = await fetch(dataURL)
    return response.blob()
  } else {
    // PDF format
    const jsPDF = (await import('jspdf')).default
    const dataURL = fabricCanvas.toDataURL({
      format: 'jpeg', // Use JPEG instead of PNG for smaller size
      quality: 0.85, // Reduced quality for smaller file size
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
 * Prepare email data for sending
 * This generates certificates and returns email data that can be used with backend API
 */
export async function prepareEmailsWithCertificates(
  recipients: EmailRecipient[],
  subject: string,
  emailBodyHtml: string,
  canvasElement: HTMLElement,
  elements: CertificateElement[],
  setElements: (elements: CertificateElement[]) => void,
  nameElementId: string,
  format: 'png' | 'pdf' = 'pdf',
  onProgress?: (current: number, total: number) => void
): Promise<{
  recipient: EmailRecipient
  certificateBlob: Blob
  certificateFilename: string
}[]> {
  const originalElements = JSON.parse(JSON.stringify(elements))
  const emailsData: {
    recipient: EmailRecipient
    certificateBlob: Blob
    certificateFilename: string
  }[] = []

  try {
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i]
      
      // Generate certificate
      const blob = await generateCertificateForRecipient(
        canvasElement,
        elements,
        setElements,
        nameElementId,
        recipient.name,
        format
      )

      const extension = format === 'png' ? '.png' : '.pdf'
      const filename = `Certificate_${recipient.name.replace(/[<>:"/\\|?*]/g, '_')}${extension}`

      emailsData.push({
        recipient,
        certificateBlob: blob,
        certificateFilename: filename,
      })

      if (onProgress) {
        onProgress(i + 1, recipients.length)
      }

      // Small delay between generations
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Restore original elements
    setElements(originalElements)

    return emailsData
  } catch (error) {
    // Restore original elements on error
    setElements(originalElements)
    throw error
  }
}

/**
 * Create mailto links for each recipient with certificate
 * Note: This is a fallback for browser-based sending, but has limitations (attachment size, etc.)
 */
export function generateMailtoLinks(
  recipient: EmailRecipient,
  subject: string,
  bodyText: string
): string {
  const mailtoLink = `mailto:${recipient.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`
  return mailtoLink
}

/**
 * Open email client for each recipient (browser limitation: can't attach files via mailto)
 * This will open the default email client for manual attachment
 */
export async function sendEmailsViaMailto(
  emailsData: {
    recipient: EmailRecipient
    certificateBlob: Blob
    certificateFilename: string
  }[],
  subject: string,
  bodyText: string
): Promise<void> {
  alert(`⚠️ Browser Limitation: Your default email client will open for each recipient. You'll need to manually attach the certificates that will be downloaded.`)
  
  // Note: We can't automatically attach files via mailto
  // User will need to manually attach from downloads
  for (const data of emailsData) {
    const mailtoLink = generateMailtoLinks(data.recipient, subject, bodyText)
    window.open(mailtoLink, '_blank')
    
    // Small delay between opening windows
    await new Promise(resolve => setTimeout(resolve, 500))
  }
}

/**
 * Download all certificates as individual files for manual email attachment
 */
export async function downloadCertificatesForManualEmail(
  emailsData: {
    recipient: EmailRecipient
    certificateBlob: Blob
    certificateFilename: string
  }[]
): Promise<void> {
  const { saveAs } = await import('file-saver')
  
  for (const data of emailsData) {
    saveAs(data.certificateBlob, data.certificateFilename)
    // Small delay between downloads
    await new Promise(resolve => setTimeout(resolve, 300))
  }
}

/**
 * Create FormData for backend API call (if you have a backend email service)
 * This is the recommended approach for production
 */
export function createEmailFormData(
  recipient: EmailRecipient,
  subject: string,
  emailBodyHtml: string,
  certificateBlob: Blob,
  certificateFilename: string
): FormData {
  const formData = new FormData()
  formData.append('to', recipient.email)
  formData.append('recipientName', recipient.name)
  formData.append('subject', subject)
  formData.append('html', emailBodyHtml)
  formData.append('attachment', certificateBlob, certificateFilename)
  return formData
}

/**
 * Send email via backend API (requires backend implementation)
 * Example: POST /api/send-email with FormData
 */
export async function sendEmailViaAPI(
  apiEndpoint: string,
  recipient: EmailRecipient,
  subject: string,
  emailBodyHtml: string,
  certificateBlob: Blob,
  certificateFilename: string
): Promise<Response> {
  const formData = createEmailFormData(
    recipient,
    subject,
    emailBodyHtml,
    certificateBlob,
    certificateFilename
  )

  return fetch(apiEndpoint, {
    method: 'POST',
    body: formData,
  })
}
