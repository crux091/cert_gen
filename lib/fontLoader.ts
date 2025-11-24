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
