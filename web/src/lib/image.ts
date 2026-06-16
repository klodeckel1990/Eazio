/** Foto auf ≤maxDim px JPEG eindampfen — base64 ohne data:-Präfix.
 *  Geteilt von Nährwert-Scan (CustomFoodSheet) und Mahlzeiten-Foto (Tracker). */
export async function toJpegBase64(file: File, maxDim = 1400): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('image_load_failed'))
    el.src = URL.createObjectURL(file)
  })
  try {
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]!
  } finally {
    URL.revokeObjectURL(img.src)
  }
}
