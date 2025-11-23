<<<<<<< HEAD
/**
 * Dynamically load a custom font from a URL
 * @param url - URL to font file (.woff2, .woff, .ttf) or CSS stylesheet
 * @param fontFamily - The font-family name to use
 */
export default async function loadFont(url: string, fontFamily: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Check if it's a CSS file (stylesheet URL)
      if (url.includes('.css') || url.includes('fonts.googleapis.com')) {
        // Load as stylesheet
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = url
        link.onload = () => resolve()
        link.onerror = () => reject(new Error('Failed to load font stylesheet'))
        document.head.appendChild(link)
      } else {
        // Load as font file using CSS Font Loading API
        const fontFace = new FontFace(fontFamily, `url(${url})`)
        
        fontFace.load()
          .then((loadedFace) => {
            document.fonts.add(loadedFace)
            resolve()
          })
          .catch((error) => {
            reject(new Error(`Failed to load font: ${error.message}`))
          })
      }
    } catch (error) {
      reject(error)
    }
  })
}
=======
export async function loadFont(url: string, family: string): Promise<void> {
  if (typeof document === 'undefined') return

  // If URL looks like a CSS stylesheet (e.g., Google Fonts), inject a link
  const isStylesheet = /\.css($|\?|#)|fonts.googleapis.com/.test(url)
  if (isStylesheet) {
    // avoid duplicate links
    const existing = Array.from(document.head.querySelectorAll('link')).find(
      (l) => l.getAttribute('data-custom-font') === url || l.href === url
    )
    if (existing) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    link.setAttribute('data-custom-font', url)
    document.head.appendChild(link)
    // stylesheet will load fonts as needed; give browser a moment
    await new Promise((res) => {
      link.onload = () => res(undefined)
      link.onerror = () => res(undefined)
      // fallback timeout
      setTimeout(res, 1500)
    })
    return
  }

  // For direct font file URLs (woff, woff2, ttf, otf), prefer FontFace API
  try {
    // detect format from extension
    const extMatch = url.match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/)
    let format = 'woff2'
    if (extMatch) {
      const ext = extMatch[1].toLowerCase()
      if (ext === 'woff') format = 'woff'
      if (ext === 'ttf' || ext === 'otf') format = ext
      if (ext === 'eot') format = 'eot'
    }

    // Avoid adding duplicate faces
    // FontFace lists are not easily searchable by family+src, so still attempt load
    // Use FontFace API
    // @ts-ignore
    const face = new FontFace(family, `url(${url}) format('${format}')`)
    await face.load()
    // @ts-ignore
    document.fonts.add(face)
    return
  } catch (err) {
    // Fallback: inject @font-face CSS rule
    const styleId = `custom-font-${btoa(url).replace(/=/g, '')}`
    if (document.getElementById(styleId)) return
    const style = document.createElement('style')
    style.id = styleId
    const css = `@font-face { font-family: '${family}'; src: url('${url}'); font-display: swap; }`
    style.appendChild(document.createTextNode(css))
    document.head.appendChild(style)
    await new Promise((res) => setTimeout(res, 300))
  }
}

export default loadFont
>>>>>>> 72506e9b3d86b7fb45d58a5cf99c545b5ee28368
