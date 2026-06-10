// Barcode scanning — native app only. The plugin is imported dynamically so
// not a single byte of it lands in the web bundle's startup path.

interface CapacitorGlobal {
  Capacitor?: { isNativePlatform?: () => boolean }
}

export function isNativeApp(): boolean {
  return Boolean((window as CapacitorGlobal).Capacitor?.isNativePlatform?.())
}

/** Opens the native scanner. Returns the raw code, or null when cancelled. */
export async function scanBarcode(): Promise<string | null> {
  const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } = await import(
    '@capacitor/barcode-scanner'
  )
  try {
    const result = await CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHint.ALL,
      scanInstructions: 'Barcode in den Rahmen halten',
    })
    return result.ScanResult || null
  } catch {
    return null // user dismissed the scanner
  }
}
