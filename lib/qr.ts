// Uses `qrcode` npm package: npm i qrcode @types/qrcode
import QRCode from 'qrcode'

export async function generateQRDataURL(slug: string, options?: { foreground?: string; background?: string; margin?: number }): Promise<string> {
  const url = `${process.env.NEXT_PUBLIC_BASE_URL}/menu/${slug}`
  return QRCode.toDataURL(url, {
    width: 400,
    margin: options?.margin ?? 2,
    color: { dark: options?.foreground ?? '#000000', light: options?.background ?? '#ffffff' },
  })
}

export function menuURL(slug: string) {
  return `${process.env.NEXT_PUBLIC_BASE_URL}/menu/${slug}`
}
