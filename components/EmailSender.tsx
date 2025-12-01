'use client'

import { useState, useRef } from 'react'
import { Mail, Upload, Table, Send, X, Download, CheckCircle, Bold, Image } from 'lucide-react'
import {
  readRecipientsFromExcel,
  prepareEmailsWithCertificates,
  downloadCertificatesForManualEmail,
  EmailRecipient,
} from '@/lib/emailService'
import { CertificateElement } from '@/types/certificate'

interface EmailSenderProps {
  elements: CertificateElement[]
  setElements: (elements: CertificateElement[]) => void
  canvasElement: HTMLElement | null
}

export default function EmailSender({
  elements,
  setElements,
  canvasElement,
}: EmailSenderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<'compose' | 'certificates' | 'recipients' | 'preview' | 'sending'>('compose')
  
  // Files
  const [emailBody, setEmailBody] = useState<string>('')
  const [recipientsFile, setRecipientsFile] = useState<File | null>(null)
  const [recipients, setRecipients] = useState<EmailRecipient[]>([])
  
  // Email settings
  const [subject, setSubject] = useState<string>('')
  const [nameElementId, setNameElementId] = useState<string>('')
  const [certificateFormat, setCertificateFormat] = useState<'png' | 'pdf'>('pdf')
  
  // Progress
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [generatedEmails, setGeneratedEmails] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<boolean>(false)

  const recipientsInputRef = useRef<HTMLInputElement>(null)
  const emailBodyRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Get text elements for name field selection
  const textElements = elements.filter(el => el.type === 'text')

  const handleComposeNext = () => {
    if (!emailBody.trim()) {
      setError('Please enter email content')
      return
    }
    setError(null)
    setStep('certificates')
  }

  const insertBoldText = () => {
    const editor = emailBodyRef.current
    if (!editor) return
    
    editor.focus()
    document.execCommand('bold', false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey && e.key === 'b') {
      e.preventDefault()
      insertBoldText()
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      
      const editor = emailBodyRef.current
      if (!editor) return

      editor.focus()
      
      // Create image wrapper with resize handles
      const wrapper = document.createElement('span')
      wrapper.contentEditable = 'false'
      wrapper.style.display = 'inline-block'
      wrapper.style.position = 'relative'
      wrapper.style.maxWidth = '100%'
      wrapper.style.cursor = 'default'
      
      const img = document.createElement('img')
      img.src = base64
      img.alt = 'Image'
      img.style.width = '300px'
      img.style.height = 'auto'
      img.style.display = 'block'
      img.style.cursor = 'nwse-resize'
      img.draggable = false
      
      // Add resize functionality
      let isResizing = false
      let startX = 0
      let startWidth = 0
      
      img.addEventListener('mousedown', (e) => {
        e.preventDefault()
        isResizing = true
        startX = e.clientX
        startWidth = img.offsetWidth
        
        const handleMouseMove = (e: MouseEvent) => {
          if (!isResizing) return
          const deltaX = e.clientX - startX
          const newWidth = Math.max(50, Math.min(800, startWidth + deltaX))
          img.style.width = newWidth + 'px'
        }
        
        const handleMouseUp = () => {
          isResizing = false
          document.removeEventListener('mousemove', handleMouseMove)
          document.removeEventListener('mouseup', handleMouseUp)
          // Update state after resize
          if (editor) {
            setEmailBody(editor.innerHTML)
          }
        }
        
        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
      })
      
      wrapper.appendChild(img)
      
      // Insert at cursor position
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        range.deleteContents()
        range.insertNode(wrapper)
        
        // Move cursor after image
        range.setStartAfter(wrapper)
        range.setEndAfter(wrapper)
        selection.removeAllRanges()
        selection.addRange(range)
      } else {
        editor.appendChild(wrapper)
      }
      
      // Update state
      setEmailBody(editor.innerHTML)
      setError(null)
    }
    reader.onerror = () => {
      setError('Failed to read image file')
    }
    reader.readAsDataURL(file)

    if (imageInputRef.current) {
      imageInputRef.current.value = ''
    }
  }

  const handleRecipientsFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setRecipientsFile(file)

    try {
      const recipientsList = await readRecipientsFromExcel(file)
      if (recipientsList.length === 0) {
        throw new Error('No recipients found in Excel file. Make sure Column A has names and Column B has emails.')
      }
      setRecipients(recipientsList)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read Excel file')
      setRecipientsFile(null)
    }
  }

  const handleGenerateCertificates = async () => {
    if (!canvasElement || !nameElementId || !subject) {
      setError('Please select a name field and enter email subject')
      return
    }

    setError(null)
    setStep('sending')
    setProgress({ current: 0, total: recipients.length })

    try {
      const emailsData = await prepareEmailsWithCertificates(
        recipients,
        subject,
        emailBody,
        canvasElement,
        elements,
        setElements,
        nameElementId,
        certificateFormat,
        (current, total) => setProgress({ current, total })
      )

      setGeneratedEmails(emailsData)
      
      // Send emails via API
      setProgress({ current: 0, total: emailsData.length })
      let sentCount = 0
      let failedCount = 0
      const failedRecipients: string[] = []

      for (let i = 0; i < emailsData.length; i++) {
        const data = emailsData[i]
        
        try {
          // Send via API
          const formData = new FormData()
          formData.append('to', data.recipient.email)
          formData.append('recipientName', data.recipient.name)
          formData.append('subject', subject)
          formData.append('html', emailBody)
          formData.append('attachment', data.certificateBlob)
          formData.append('filename', data.certificateFilename)

          const response = await fetch('/api/send-email', {
            method: 'POST',
            body: formData,
          })

          if (!response.ok) {
            throw new Error(`Failed to send to ${data.recipient.email}`)
          }

          sentCount++
        } catch (err) {
          console.error(`Failed to send email to ${data.recipient.name}:`, err)
          failedCount++
          failedRecipients.push(`${data.recipient.name} (${data.recipient.email})`)
        }

        setProgress({ current: i + 1, total: emailsData.length })
        
        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      if (failedCount > 0) {
        setError(`Sent ${sentCount} emails successfully. Failed to send ${failedCount} emails to: ${failedRecipients.join(', ')}`)
      }

      setSuccess(true)
      setProgress(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate certificates')
      setStep('preview')
      setProgress(null)
    }
  }

  const handleDownloadCertificates = async () => {
    try {
      await downloadCertificatesForManualEmail(generatedEmails)
      alert('Certificates downloaded! You can now attach them to your emails manually.')
    } catch (err) {
      setError('Failed to download certificates')
    }
  }

  const resetForm = () => {
    setIsOpen(false)
    setStep('compose')
    setEmailBody('')
    setRecipientsFile(null)
    setRecipients([])
    setSubject('')
    setNameElementId('')
    setProgress(null)
    setGeneratedEmails([])
    setError(null)
    setSuccess(false)
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Mail size={20} />
        Send Certificates via Email
      </button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Mail size={24} />
            Send Certificates via Email
          </h2>
          <button
            onClick={resetForm}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X size={24} />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Step 1: Compose Email */}
        {step === 'compose' && (
          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Step 1: Compose Email</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Write or paste your email content below. This will be sent to all recipients.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email Content <span className="text-red-500">*</span>
                </label>
                
                {/* Formatting Toolbar */}
                <div className="flex gap-2 mb-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-t-lg border border-b-0 border-gray-300 dark:border-gray-600">
                  <button
                    type="button"
                    onClick={insertBoldText}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded hover:bg-gray-100 dark:hover:bg-gray-500 transition-colors text-gray-700 dark:text-gray-200"
                    title="Bold text (select text first)"
                  >
                    <Bold size={16} />
                    <span className="text-sm">Bold</span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded hover:bg-gray-100 dark:hover:bg-gray-500 transition-colors text-gray-700 dark:text-gray-200"
                    title="Insert image"
                  >
                    <Image size={16} />
                    <span className="text-sm">Image</span>
                  </button>
                  
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </div>

                <div
                  ref={emailBodyRef}
                  contentEditable
                  onInput={(e) => setEmailBody(e.currentTarget.innerHTML)}
                  onKeyDown={handleKeyDown}
                  className="w-full min-h-64 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-b-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white overflow-auto focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  data-placeholder="Enter your email message here...

Example:
Dear Recipient,

Congratulations on your achievement! Please find your certificate attached.

Best regards"
                  style={{
                    minHeight: '16rem'
                  }}
                />
                <style jsx>{`
                  [contenteditable][data-placeholder]:empty:before {
                    content: attr(data-placeholder);
                    color: #9ca3af;
                    white-space: pre-wrap;
                  }
                `}</style>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Select text and click Bold or press <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs">Ctrl+B</kbd> to format. Click and drag images to resize them.
                </p>
              </div>

              <button
                onClick={handleComposeNext}
                disabled={!emailBody.trim()}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Next: Certificate Settings
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Certificate Settings */}
        {step === 'certificates' && (
          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Step 2: Certificate Settings</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Configure how certificates will be generated and attached.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select Name Field <span className="text-red-500">*</span>
                </label>
                <select
                  value={nameElementId}
                  onChange={(e) => setNameElementId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  disabled={textElements.length === 0}
                >
                  <option value="">Choose text element to replace with recipient names</option>
                  {textElements.map(el => (
                    <option key={el.id} value={el.id}>
                      {el.content.substring(0, 50)}
                    </option>
                  ))}
                </select>
                {textElements.length === 0 && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    ⚠️ No text elements found on certificate. Please close this dialog, go to Insert tab, and add text to your certificate first.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Certificate Format
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="pdf"
                      checked={certificateFormat === 'pdf'}
                      onChange={(e) => setCertificateFormat(e.target.value as 'pdf')}
                      className="mr-2"
                    />
                    PDF
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="png"
                      checked={certificateFormat === 'png'}
                      onChange={(e) => setCertificateFormat(e.target.value as 'png')}
                      className="mr-2"
                    />
                    PNG
                  </label>
                </div>
              </div>

              <button
                onClick={() => setStep('recipients')}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Next: Upload Recipients
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Upload Recipients */}
        {step === 'recipients' && (
          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Step 3: Upload Recipients</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Upload an Excel file (.xlsx) with recipients. <strong>Column A = Name, Column B = Email</strong>
              </p>
            </div>

            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
              <input
                ref={recipientsInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleRecipientsFileSelect}
                className="hidden"
              />
              <Table className="mx-auto mb-4 text-gray-400" size={48} />
              <button
                onClick={() => recipientsInputRef.current?.click()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Upload className="inline mr-2" size={16} />
                Select Recipients File
              </button>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Excel format: Column A = Name, Column B = Email
              </p>
              {recipientsFile && (
                <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                  ✓ {recipientsFile.name}
                </p>
              )}
            </div>

            <button
              onClick={() => setStep('certificates')}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Back
            </button>
          </div>
        )}

        {/* Step 4: Preview & Send */}
        {step === 'preview' && (
          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Step 4: Review & Send</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email Subject <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter email subject"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                <h4 className="font-semibold mb-2 text-gray-900 dark:text-white">Recipients ({recipients.length})</h4>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {recipients.slice(0, 10).map((r, i) => (
                    <div key={i} className="text-sm text-gray-600 dark:text-gray-400">
                      {r.name} - {r.email}
                    </div>
                  ))}
                  {recipients.length > 10 && (
                    <div className="text-sm text-gray-500 dark:text-gray-500 italic">
                      ... and {recipients.length - 10} more
                    </div>
                  )}
                </div>
              </div>

              {(!nameElementId || !subject) && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>Required:</strong>
                    {!subject && ' Enter an email subject.'}
                    {!nameElementId && ' Go back to Step 2 and select the name field on your certificate.'}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setStep('recipients')}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleGenerateCertificates}
                  disabled={!nameElementId || !subject}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="inline mr-2" size={16} />
                  Generate Certificates
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Sending Progress */}
        {step === 'sending' && !success && progress && (
          <div className="p-6 space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                {progress.current <= recipients.length ? 'Generating Certificates...' : 'Sending Emails...'}
              </h3>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 mb-2">
                <div
                  className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {progress.current} of {progress.total} {progress.current <= recipients.length ? 'certificates generated' : 'emails sent'}
              </p>
            </div>
          </div>
        )}

        {/* Step 6: Success */}
        {success && (
          <div className="p-6 space-y-4">
            <div className="text-center">
              <CheckCircle className="mx-auto mb-4 text-green-500" size={64} />
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                Emails Sent Successfully!
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                {generatedEmails.length} certificates sent to recipients
              </p>
            </div>

            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-sm text-green-800 dark:text-green-200">
                ✓ All certificates have been generated and emailed to recipients
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleDownloadCertificates}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download className="inline mr-2" size={16} />
                Download Certificates (Backup)
              </button>
            </div>

            <button
              onClick={resetForm}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
