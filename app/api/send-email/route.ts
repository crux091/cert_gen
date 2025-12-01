import { NextRequest, NextResponse } from 'next/server'
import * as brevo from '@getbrevo/brevo'

const apiInstance = new brevo.TransactionalEmailsApi()
const apiKey = process.env.BREVO_API_KEY
console.log('Brevo API Key present:', !!apiKey, 'Length:', apiKey?.length)
apiInstance.setApiKey(
  brevo.TransactionalEmailsApiApiKeys.apiKey,
  apiKey || ''
)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    
    const to = formData.get('to') as string
    const recipientName = formData.get('recipientName') as string
    const subject = formData.get('subject') as string
    const html = formData.get('html') as string
    const attachment = formData.get('attachment') as Blob
    const filename = formData.get('filename') as string || 'certificate.pdf'

    console.log('Received request:', { to, recipientName, subject, hasHtml: !!html, hasAttachment: !!attachment, filename })

    if (!to || !subject || !html || !attachment) {
      const missing = []
      if (!to) missing.push('to')
      if (!subject) missing.push('subject')
      if (!html) missing.push('html')
      if (!attachment) missing.push('attachment')
      
      console.error('Missing required fields:', missing)
      return NextResponse.json(
        { error: 'Missing required fields', missing },
        { status: 400 }
      )
    }

    console.log('All required fields present, checking attachment size...')

    // Check attachment size (40MB Brevo limit)
    const maxSize = 40 * 1024 * 1024 // 40MB
    if (attachment.size > maxSize) {
      console.error('Attachment too large:', attachment.size)
      return NextResponse.json(
        { error: 'Attachment too large. Maximum size is 40MB' },
        { status: 400 }
      )
    }

    console.log(`Processing email to ${to}, attachment size: ${(attachment.size / 1024).toFixed(2)}KB`)

    // Convert blob to base64 for Brevo
    console.log('Converting attachment to base64...')
    const arrayBuffer = await attachment.arrayBuffer()
    const base64Content = Buffer.from(arrayBuffer).toString('base64')
    console.log('Base64 conversion complete, length:', base64Content.length)

    // Send email with Brevo
    const sendSmtpEmail = new brevo.SendSmtpEmail()
    sendSmtpEmail.sender = {
      email: process.env.BREVO_FROM_EMAIL || '',
      name: process.env.BREVO_FROM_NAME || 'Certificate Generator'
    }
    console.log('Sender configured:', sendSmtpEmail.sender)
    sendSmtpEmail.to = [{ email: to, name: recipientName }]
    sendSmtpEmail.subject = subject
    sendSmtpEmail.htmlContent = html
    sendSmtpEmail.attachment = [
      {
        name: filename,
        content: base64Content,
      },
    ]

    console.log('Attempting to send email via Brevo...')
    const result = await apiInstance.sendTransacEmail(sendSmtpEmail)

    console.log(`Email sent successfully to ${to}`, result)

    return NextResponse.json({
      success: true,
      messageId: result.body?.messageId || 'sent',
      recipient: to,
    })
  } catch (error: any) {
    console.error('Email sending error:', error)
    console.error('Error details:', error.response?.body || error.body)
    return NextResponse.json(
      { 
        error: 'Failed to send email',
        details: error.message || error.response?.body?.message || error.body?.message || 'Unknown error'
      },
      { status: 500 }
    )
  }
}
