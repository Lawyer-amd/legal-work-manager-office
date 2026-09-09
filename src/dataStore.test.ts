// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { DataStore, DataStoreError, isActive } from './dataStore'

const storageKey = 'legal-work-manager:v1'
const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()

describe('DataStore', () => {
  beforeEach(() => localStorage.clear())

  it('ينشئ البيانات التجريبية ويحفظها بين مرات الفتح', () => {
    const first = new DataStore()
    const client = first.addClient({ name: 'عميل اختبار', clientType: 'استشارة', registeredAt: '2026-09-08' })
    const second = new DataStore()
    expect(second.snapshot().clients.some((item) => item.id === client.id)).toBe(true)
  })

  it('يرحل البيانات القديمة عند غياب المجموعات الجديدة', () => {
    localStorage.setItem(storageKey, JSON.stringify({ clients: [], cases: [], sessions: [] }))
    const snapshot = new DataStore().snapshot()
    expect(snapshot.transactions).toEqual([])
    expect(snapshot.tasks).toEqual([])
    expect(snapshot.executions).toEqual([])
    expect(snapshot.judgments).toEqual([])
    expect(snapshot.appeals).toEqual([])
  })

  it('ينقل السجل إلى السلة دون حذفه فورًا', () => {
    const store = new DataStore()
    const client = store.addClient({ name: 'للحذف', clientType: 'عن بعد', registeredAt: '2026-09-08' })
    store.moveToTrash('clients', client.id)
    const deleted = store.snapshot().clients.find((item) => item.id === client.id)
    expect(deleted).toBeDefined()
    expect(isActive(deleted!)).toBe(false)
  })

  it('يحذف جلسة منتهية السلة بعد أكثر من 30 يومًا', () => {
    const store = new DataStore()
    const snapshot = store.snapshot()
    const legalCase = snapshot.cases[0]
    const session = store.addSession({ caseId: legalCase.id, date: '2026-09-01', status: 'منتهية', sortOrder: 0 })
    const saved = store.snapshot()
    saved.sessions.find((item) => item.id === session.id)!.deletedAt = oldDate
    localStorage.setItem(storageKey, JSON.stringify(saved))
    expect(new DataStore().snapshot().sessions.some((item) => item.id === session.id)).toBe(false)
  })

  it('يؤجل حذف العميل النهائي إذا بقيت قضية فعالة تشير إليه', () => {
    const first = new DataStore()
    const saved = first.snapshot()
    saved.clients[0].deletedAt = oldDate
    localStorage.setItem(storageKey, JSON.stringify(saved))
    expect(new DataStore().snapshot().clients).toHaveLength(1)
  })

  it('يحذف القضية من السلة بعد 30 يومًا إذا لم تبق مراجع', () => {
    const first = new DataStore()
    const saved = first.snapshot()
    saved.cases[0].deletedAt = oldDate
    localStorage.setItem(storageKey, JSON.stringify(saved))
    expect(new DataStore().snapshot().cases).toHaveLength(0)
  })

  it('يستعيد سجلًا محذوفًا', () => {
    const store = new DataStore()
    const client = store.addClient({ name: 'عميل للاستعادة', clientType: 'استشارة', registeredAt: '2026-09-08' })
    store.moveToTrash('clients', client.id)
    store.restore('clients', client.id)
    expect(store.snapshot().clients.find((item) => item.id === client.id)?.deletedAt).toBeUndefined()
  })

  it('يمنع استعادة قضية قبل استعادة عميلها', () => {
    const store = new DataStore()
    const snapshot = store.snapshot()
    store.moveToTrash('cases', snapshot.cases[0].id)
    store.moveToTrash('clients', snapshot.clients[0].id)
    expect(() => store.restore('cases', snapshot.cases[0].id)).toThrow(DataStoreError)
    expect(store.getTrash().find((item) => item.type === 'cases')?.blockedReason).toContain('العميل')
  })

  it('يرفض جلسة مرتبطة بقضية غير موجودة', () => {
    const store = new DataStore()
    expect(() => store.addSession({ caseId: 'missing', date: '2026-10-01', status: 'منتهية', sortOrder: 0 })).toThrow(DataStoreError)
  })

  it('يرفض جلستين جديدتين للقضية نفسها داخل مخزن البيانات', () => {
    const store = new DataStore()
    const caseId = store.snapshot().cases[0].id
    store.addSession({ caseId, date: '2026-10-01', status: 'جديدة', sortOrder: 0 })
    expect(() => store.addSession({ caseId, date: '2026-11-01', status: 'جديدة', sortOrder: 1 })).toThrow(DataStoreError)
  })

  it('يحفظ نسخة إنقاذ إذا كانت بيانات التخزين تالفة', () => {
    localStorage.setItem(storageKey, '{not-json')
    const store = new DataStore()
    expect(store.getLoadWarning()).toContain('نسخة إنقاذ')
    expect(Object.keys(localStorage).some((item) => item.startsWith(`${storageKey}:corrupt:`))).toBe(true)
  })

  it('يحفظ مستندًا واحدًا ويربطه بأكثر من سجل', () => {
    const store = new DataStore()
    const snapshot = store.snapshot()
    const document = store.addDocument({ name: 'صك الحكم', documentType: 'صك حكم', url: 'https://drive.google.com/file/d/example/view', links: [{ type: 'clients', id: snapshot.clients[0].id }, { type: 'cases', id: snapshot.cases[0].id }] })
    expect(store.documentsFor('clients', snapshot.clients[0].id)[0].id).toBe(document.id)
    expect(store.documentsFor('cases', snapshot.cases[0].id)[0].id).toBe(document.id)
  })

  it('يرفض رابط مستند غير صالح أو مستندًا بلا ارتباط', () => {
    const store = new DataStore()
    const clientId = store.snapshot().clients[0].id
    expect(() => store.addDocument({ name: 'مستند', documentType: 'مرفق', url: 'drive-file', links: [{ type: 'clients', id: clientId }] })).toThrow(DataStoreError)
    expect(() => store.addDocument({ name: 'مستند', documentType: 'مرفق', url: 'https://drive.google.com/file', links: [] })).toThrow(DataStoreError)
  })

  it('ينقل المستند إلى السلة ثم يستعيده مع ارتباطاته', () => {
    const store = new DataStore()
    const clientId = store.snapshot().clients[0].id
    const document = store.addDocument({ name: 'وكالة العميل', documentType: 'وكالة', url: 'https://drive.google.com/file/d/agency/view', links: [{ type: 'clients', id: clientId }] })
    store.moveToTrash('documents', document.id)
    expect(store.documentsFor('clients', clientId)).toHaveLength(0)
    store.restore('documents', document.id)
    expect(store.documentsFor('clients', clientId)[0].name).toBe('وكالة العميل')
  })
})
