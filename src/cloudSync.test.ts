import { describe, expect, it, vi } from 'vitest'
import { CloudSyncError, readCloudSnapshot, syncCloudSnapshot } from './cloudSync'

const emptyDatabase = { clients: [], cases: [], sessions: [], transactions: [], tasks: [], executions: [], judgments: [], appeals: [], documents: [] }

describe('قراءة snapshot السحابي', () => {
  it('تقبل snapshot مباشرًا أو داخل data', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: emptyDatabase }), { status: 200 }))
    await expect(readCloudSnapshot('https://example.test/read', fetcher)).resolves.toEqual(emptyDatabase)
    expect(fetcher).toHaveBeenCalledWith('https://example.test/read?api=1', expect.objectContaining({ method: 'GET' }))
  })

  it('ترفض استجابة غير متوافقة', async () => {
    const fetcher = async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    await expect(readCloudSnapshot('https://example.test/read', fetcher)).rejects.toBeInstanceOf(CloudSyncError)
  })

  it('تحول أخطاء HTTP إلى خطأ مزامنة واضح', async () => {
    const fetcher = async () => new Response('Unauthorized', { status: 401 })
    await expect(readCloudSnapshot('https://example.test/read', fetcher)).rejects.toThrow('HTTP 401')
  })
})

describe('سياسة تعارض السجلات', () => {
  it('تختار النسخة الأحدث حسب updatedAt وتحفظ النسخة المدمجة', async () => {
    const cloudClient = { id: 'client-1', name: 'من السحابة', clientType: 'استشارة' as const, registeredAt: '2026-09-12', createdAt: '2026-09-12T10:00:00.000Z', updatedAt: '2026-09-12T10:00:00.000Z' }
    const localClient = { id: 'client-1', name: 'من الجهاز', clientType: 'استشارة' as const, registeredAt: '2026-09-12', createdAt: '2026-09-12T09:00:00.000Z', updatedAt: '2026-09-12T09:00:00.000Z' }
    const cloudDatabase = { ...emptyDatabase, clients: [cloudClient] }
    const localDatabase = { ...emptyDatabase, clients: [localClient] }
    let savedBody = ''
    const fetcher = vi.fn(async (_url: URL | RequestInfo, options?: RequestInit) => {
      if (options?.method === 'POST') { savedBody = String(options.body); return new Response(JSON.stringify({ ok: true }), { status: 200 }) }
      return new Response(JSON.stringify({ data: cloudDatabase }), { status: 200 })
    })
    const merged = await syncCloudSnapshot(localDatabase, 'https://example.test/sync', fetcher)
    expect(merged.clients[0]).toEqual(cloudClient)
    expect(JSON.parse(savedBody).data.clients[0]).toEqual(cloudClient)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('تختار نسخة الجهاز عندما يكون تعديلها أحدث', async () => {
    const cloudClient = { id: 'client-1', name: 'قديم', clientType: 'استشارة' as const, registeredAt: '2026-09-12', createdAt: '2026-09-12T09:00:00.000Z', updatedAt: '2026-09-12T09:00:00.000Z' }
    const localClient = { id: 'client-1', name: 'أحدث', clientType: 'استشارة' as const, registeredAt: '2026-09-12', createdAt: '2026-09-12T10:00:00.000Z', updatedAt: '2026-09-12T10:00:00.000Z' }
    const cloudDatabase = { ...emptyDatabase, clients: [cloudClient] }
    const fetcher = vi.fn(async (_url: URL | RequestInfo, options?: RequestInit) => options?.method === 'POST' ? new Response(JSON.stringify({ ok: true }), { status: 200 }) : new Response(JSON.stringify({ data: cloudDatabase }), { status: 200 }))
    const merged = await syncCloudSnapshot({ ...emptyDatabase, clients: [localClient] }, 'https://example.test/sync', fetcher)
    expect(merged.clients[0]).toEqual(localClient)
  })
})
