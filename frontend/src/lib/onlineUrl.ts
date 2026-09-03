export function normalizeOnlineUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

export async function openOnlineUrl(value: string) {
  const url = normalizeOnlineUrl(value)
  if (!url) throw new Error('线上地址无效')
  if (window.studyMKDDesktop) {
    await window.studyMKDDesktop.openExternalUrl(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
