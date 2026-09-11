import type { Database } from './dataStore'

export const defaultCloudEndpoint = 'https://script.google.com/macros/s/AKfycbx5LhdN9WykSLjP0OHBsRQe_uVhFpw2e6mi_fT8J25GtAiz8exTurUfsozo5_a7kofAkA/exec'
const requestTimeoutMs = 15_000
const apiEndpoint = (endpoint: string) => `${endpoint}${endpoint.includes('?') ? '&' : '?'}api=1`

export class CloudSyncError extends Error {}

const collections = ['clients', 'cases', 'sessions', 'transactions', 'tasks', 'executions', 'judgments', 'appeals', 'documents'] as const

type AppsScriptBridge = {
  script: {
    run: {
      withSuccessHandler: (handler: (value: unknown) => void) => AppsScriptBridge['script']['run']
      withFailureHandler: (handler: (error: unknown) => void) => AppsScriptBridge['script']['run']
      getCloudSnapshot?: () => void
      saveCloudSnapshot?: (data: Database) => void
    }
  }
}

const appsScriptBridge = (): AppsScriptBridge | undefined => {
  if (typeof window === 'undefined') return undefined
  const candidate = (window as unknown as { google?: AppsScriptBridge }).google
  return candidate?.script?.run?.getCloudSnapshot && candidate.script.run.saveCloudSnapshot ? candidate : undefined
}

const readViaAppsScript = (): Promise<Database> => new Promise((resolve, reject) => {
  const bridge = appsScriptBridge()
  if (!bridge) return reject(new CloudSyncError('جسر Apps Script غير متاح.'))
  bridge.script.run
    .withSuccessHandler((payload) => {
      const database = extractDatabase(payload)
      if (database) resolve(structuredClone(database))
      else reject(new CloudSyncError('استجابة Apps Script لا تحتوي snapshot متوافقًا.'))
    })
    .withFailureHandler(() => reject(new CloudSyncError('تعذر قراءة البيانات من Apps Script.')))
    .getCloudSnapshot!()
})

const writeViaAppsScript = (database: Database): Promise<void> => new Promise((resolve, reject) => {
  const bridge = appsScriptBridge()
  if (!bridge) return reject(new CloudSyncError('جسر Apps Script غير متاح.'))
  bridge.script.run
    .withSuccessHandler((payload) => {
      if (payload && typeof payload === 'object' && (payload as { ok?: boolean }).ok === true) resolve()
      else reject(new CloudSyncError('رفضت خدمة Apps Script عملية الحفظ.'))
    })
    .withFailureHandler(() => reject(new CloudSyncError('تعذر حفظ البيانات في Apps Script.')))
    .saveCloudSnapshot!(database)
})

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
  if (appsScriptBridge()) return readViaAppsScript()
  if (!endpoint) throw new CloudSyncError('لم يتم إعداد رابط خدمة المزامنة.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    const response = await fetcher(apiEndpoint(endpoint), { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal })
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
  if (appsScriptBridge()) return writeViaAppsScript(database)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  let response: Response
  try {
    response = await fetcher(endpoint, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'upsert', data: database }), signal: controller.signal })
  } finally { clearTimeout(timer) }
  if (response.type === 'opaque') {
    // لا يكشف no-cors نتيجة POST للمتصفح؛ نتحقق بإعادة قراءة snapshot.
    const verified = await readCloudSnapshot(endpoint, fetcher)
    const writable = ['transactions', 'executions', 'judgments', 'appeals'] as const
    if (writable.some((name) => JSON.stringify(verified[name]) !== JSON.stringify(database[name]))) {
      throw new CloudSyncError('لم تتطابق البيانات بعد التحقق من الحفظ السحابي.')
    }
    return
  }
  if (!response.ok) throw new CloudSyncError(`تعذر حفظ السحابة (HTTP ${response.status}).`)
  let payload: unknown
  try { payload = await response.json() } catch { throw new CloudSyncError('استجابة الحفظ السحابي ليست JSON صالحًا.') }
  if (!payload || typeof payload !== 'object' || (payload as { ok?: boolean }).ok !== true) throw new CloudSyncError('رفضت خدمة السحابة عملية الحفظ.')
}

/** Merge the device and cloud snapshots by record id, preferring the newest updatedAt. */
export async function syncCloudSnapshot(local: Database, endpoint = import.meta.env.VITE_APPS_SCRIPT_URL || defaultCloudEndpoint, fetcher: typeof fetch = fetch): Promise<Database> {
  const cloud = await readCloudSnapshot(endpoint, fetcher)
  const merged = {} as Database
  for (const name of collections) {
    const byId = new Map<string, Record<string, unknown>>()
    for (const record of [...(cloud[name] as unknown as Array<Record<string, unknown>>), ...(local[name] as unknown as Array<Record<string, unknown>>)]) {
      const id = String(record.id || '')
      if (!id) continue
      const previous = byId.get(id)
      if (!previous || Date.parse(String(record.updatedAt || '')) >= Date.parse(String(previous.updatedAt || ''))) byId.set(id, record)
    }
    ;(merged as unknown as Record<string, unknown[]>)[name] = Array.from(byId.values())
  }
  await writeCloudSnapshot(merged, endpoint, fetcher)
  return structuredClone(merged)
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
    script.src = `${apiEndpoint(endpoint)}&callback=${encodeURIComponent(callbackName)}`
    document.head.appendChild(script)
  })
}
