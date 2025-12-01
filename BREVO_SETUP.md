# 🚀 Brevo Setup Guide

## Quick Setup (5 Minutes)

### Step 1: Sign Up for Brevo (Free)
1. Go to [brevo.com](https://www.brevo.com)
2. Click **Sign Up Free**
3. Use your email address (e.g., `rtcruz3@student.apc.edu.ph`)
4. Verify your email

### Step 2: Get API Key
1. Log in to [Brevo Dashboard](https://app.brevo.com)
2. Go to **Settings** → **SMTP & API** → **API Keys**
3. Click **Generate a new API key**
4. Name it "Certificate Generator"
5. Copy the API key (starts with `xkeysib-...`)

### Step 3: Configure App
Edit `.env.local`:
```env
BREVO_API_KEY=xkeysib-paste_your_key_here
BREVO_FROM_EMAIL=rtcruz3@student.apc.edu.ph
BREVO_FROM_NAME=Certificate Generator
```

### Step 4: Restart Server
```bash
npm run dev
```

## ✅ Ready to Send!

Your email feature is now configured with:
- **300 emails per day** (free tier)
- **Full attachment support**
- **Your own email address** as sender
- **No domain verification needed** for your signup email

## Usage

1. Click **📧 Email** button
2. Compose email (subject + body)
3. Select name field for personalization
4. Upload Excel file with recipients
5. Click **Generate & Send**

## Troubleshooting

**"Invalid API key"**
- Make sure you copied the full key from Brevo
- Keys start with `xkeysib-`
- Restart dev server after adding key

**Emails not sending**
- Check Brevo dashboard → Email → Logs
- Verify your API key is active
- Check daily limit (300 emails/day on free tier)

**Emails in spam**
- First email might go to spam - mark as "Not Spam"
- Brevo has good deliverability
- Use professional email content

## Brevo Free Tier

✅ 300 emails per day  
✅ Unlimited contacts  
✅ Full attachment support  
✅ Email tracking  
✅ No credit card required  

## Support

- [Brevo Documentation](https://developers.brevo.com/)
- [Brevo Dashboard](https://app.brevo.com)
- [API Keys](https://app.brevo.com/settings/keys/api)
