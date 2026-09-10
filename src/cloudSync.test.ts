import { describe, expect, it, vi } from 'vitest'
import { CloudSyncError, readCloudSnapshot } from './cloudSync'

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
