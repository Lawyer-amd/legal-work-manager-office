import type { Database } from './dataStore'

export const defaultCloudEndpoint = 'https://script.google.com/macros/s/AKfycbyVbNxiYsiLynGzV31BQ_7BlL3m0shlfMOeOepqxQmHr7RNoWwfSOPHy32bMahpJAk31A/exec'
const requestTimeoutMs = 15_000

export class CloudSyncError extends Error {}

const collections = ['clients', 'cases', 'sessions', 'transactions', 'tasks', 'executions', 'judgments', 'appeals', 'documents'] as const

const isDatabase = (value: unknown): value is Database => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return collections.every((name) => Array.isArray(candidate[name]))
}

const extractDatabase = (value: unknown): Database | undefined => {
  if (isDatabase(value)) return value
  if (value && typeof value === 'object') {
    const envelope = value as { data?: unknown; snapshot?: unknown; database?: unknown }
    if (isDatabase(envelope.data)) return envelope.data
    if (isDatabase(envelope.snapshot)) return envelope.snapshot
    if (isDatabase(envelope.database)) return envelope.database
  }
  return undefined
}

export async function readCloudSnapshot(endpoint = import.meta.env.VITE_APPS_SCRIPT_URL || defaultCloudEndpoint, fetcher: typeof fetch = fetch): Promise<Database> {
  if (!endpoint) throw new CloudSyncError('لم يتم إعداد رابط خدمة المزامنة.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    const response = await fetcher(endpoint, { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal })
    if (!response.ok) throw new CloudSyncError(`تعذر قراءة السحابة (HTTP ${response.status}).`)
    let payload: unknown
    try { payload = await response.json() } catch { throw new CloudSyncError('استجابة السحابة ليست JSON صالحًا.') }
    const database = extractDatabase(payload)
    if (!database) throw new CloudSyncError('استجابة السحابة لا تحتوي snapshot متوافقًا مع مخطط التطبيق.')
    return structuredClone(database)
  } catch (error) {
    if (error instanceof CloudSyncError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') throw new CloudSyncError('انتهت مهلة قراءة البيانات السحابية بعد 15 ثانية.')
    if (error instanceof TypeError && typeof document !== 'undefined') return readCloudSnapshotJsonp(endpoint)
    throw new CloudSyncError('تعذر الاتصال بخدمة البيانات السحابية.')
  } finally { clearTimeout(timer) }
}

export async function writeCloudSnapshot(database: Database, endpoint = import.meta.env.VITE_APPS_SCRIPT_URL || defaultCloudEndpoint, fetcher: typeof fetch = fetch): Promise<void> {
  const response = await fetcher(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8', Accept: 'application/json' }, body: JSON.stringify({ action: 'upsert', data: database }) })
  if (response.type === 'opaque') return
  if (!response.ok) throw new CloudSyncError(`تعذر حفظ السحابة (HTTP ${response.status}).`)
  let payload: unknown
  try { payload = await response.json() } catch { throw new CloudSyncError('استجابة الحفظ السحابي ليست JSON صالحًا.') }
  if (!payload || typeof payload !== 'object' || (payload as { ok?: boolean }).ok !== true) throw new CloudSyncError('رفضت خدمة السحابة عملية الحفظ.')
}

function readCloudSnapshotJsonp(endpoint: string): Promise<Database> {
  return new Promise((resolve, reject) => {
    const callbackName = `__legalCloudSnapshot_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const script = document.createElement('script')
    const cleanup = () => { window.clearTimeout(timer); delete (window as unknown as Record<string, unknown>)[callbackName]; script.remove() }
    const timer = window.setTimeout(() => { cleanup(); reject(new CloudSyncError('انتهت مهلة قراءة السحابة عبر مسار التوافق.')) }, requestTimeoutMs)
    ;(window as unknown as Record<string, unknown>)[callbackName] = (payload: unknown) => {
      cleanup()
      const database = extractDatabase(payload)
      if (database) resolve(structuredClone(database))
      else reject(new CloudSyncError('استجابة السحابة لا تحتوي snapshot متوافقًا مع مخطط التطبيق.'))
    }
    script.onerror = () => { cleanup(); reject(new CloudSyncError('تعذر الاتصال بخدمة البيانات السحابية.')) }
    script.src = `${endpoint}${endpoint.includes('?') ? '&' : '?'}callback=${encodeURIComponent(callbackName)}`
    document.head.appendChild(script)
  })
}
