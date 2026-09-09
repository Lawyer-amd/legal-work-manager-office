export type CaseStatus = 'صلح' | 'تحرير' | 'قيد النظر' | 'متوقفة' | 'مشطوبة' | 'استئناف' | 'منتهية'
export type ClientType = 'استشارة' | 'تعقيب' | 'عقد توكيل' | 'عن بعد'
export type SessionStatus = 'جديدة' | 'منتهية'
export type TransactionStatus = 'مستمرة' | 'معلقة' | 'منتهية'
export type TaskStatus = 'جديدة' | 'قيد التنفيذ' | 'مؤجلة' | 'منجزة' | 'ملغاة'
export type ExecutionStatus = 'قيد التنفيذ' | 'سداد جزئي' | 'جار التحويل' | 'منتهي'
export type JudgmentType = 'ابتدائي' | 'نهائي' | 'قطعي' | 'منقوض'
export type AppealStatus = 'قيد النظر' | 'فترة اعتراضية' | 'منتهي'
export type DocumentOwnerType = 'clients' | 'cases' | 'sessions' | 'transactions' | 'tasks' | 'executions' | 'judgments' | 'appeals'
export interface DocumentLink { type: DocumentOwnerType; id: string }
export interface LegalDocument extends RecordBase { name: string; documentType: string; url: string; notes?: string; documentDate?: string; links: DocumentLink[] }

export interface RecordBase { id: string; createdAt: string; updatedAt: string; deletedAt?: string }
export interface Client extends RecordBase { name: string; clientType: ClientType; phone?: string; nationalId?: string; birthDate?: string; gender?: string; iban?: string; registeredAt: string; sortOrder?: number }
export interface LegalCase extends RecordBase { caseNumber: string; classification: string; clientId: string; opponentName: string; status: CaseStatus; previousActionDate?: string; nextActionDate?: string; assignedLawyer?: string; originalAgencyNumber?: string; assignedAgencyNumber?: string; agencyExpiryDate?: string; najizUrl?: string; driveFolderUrl?: string; sortOrder?: number }
export interface Session extends RecordBase { caseId: string; date: string; time?: string; status: SessionStatus; summary?: string; decisions?: string; sortOrder: number }
export interface Transaction extends RecordBase { statement: string; caseId?: string; clientName?: string; opponentName?: string; reviewDate?: string; nextDate?: string; notes?: string; status: TransactionStatus; sortOrder: number }
export interface WorkTask extends RecordBase { statement: string; caseId?: string; executionId?: string; clientName?: string; taskDate?: string; nextDate?: string; assignee?: string; notes?: string; status: TaskStatus; sortOrder: number }
export interface ExecutionFollowUp { id: string; actionDate?: string; action: string; performedBy?: string; result?: string; nextAction?: string; nextDate?: string; notes?: string; createTask?: boolean; taskCreated?: boolean }
export interface ExecutionRequest extends RecordBase { requestNumber: string; claimant: string; respondent: string; court?: string; circuitNumber?: string; caseId?: string; externalCaseNumber?: string; judgmentId?: string; externalJudgmentNumber?: string; notes?: string; decision34Number?: string; decision34Date?: string; decision46Number?: string; decision46Date?: string; status: ExecutionStatus; followUps: ExecutionFollowUp[]; sortOrder: number }
export interface Judgment extends RecordBase { caseId: string; deedNumber: string; deedUrl?: string; judgmentDate: string; judgmentType: JudgmentType; summary?: string; notificationDate?: string; sortOrder: number }
export interface Appeal extends RecordBase { caseId: string; judgmentId?: string; judgmentText: string; judgmentDate: string; deadlineStartDate: string; durationDays: number; status: AppealStatus; sortOrder: number }
export interface Database { clients: Client[]; cases: LegalCase[]; sessions: Session[]; transactions: Transaction[]; tasks: WorkTask[]; executions: ExecutionRequest[]; judgments: Judgment[]; appeals: Appeal[]; documents: LegalDocument[] }
export type RecordType = keyof Database
export interface TrashEntry { type: RecordType; record: RecordBase; label: string; blockedReason?: string; daysRemaining: number }

const key = 'legal-work-manager:v1'
const retentionMs = 30 * 24 * 60 * 60 * 1000
const today = new Date().toISOString().slice(0, 10)
const uid = () => crypto.randomUUID()
const stamp = () => new Date().toISOString()
const active = <T extends RecordBase>(record?: T) => Boolean(record && !record.deletedAt)
const seed = (): Database => {
  const now = stamp(), clientId = uid(), caseId = uid()
  return {
    clients: [{ id: clientId, name: 'عميل تجريبي', clientType: 'استشارة', phone: '0500000000', registeredAt: today, sortOrder: 0, createdAt: now, updatedAt: now }],
    cases: [{ id: caseId, caseNumber: '1447/001', classification: 'مدنية', clientId, opponentName: 'خصم تجريبي', status: 'قيد النظر', assignedLawyer: 'المحامي المكلف', sortOrder: 0, createdAt: now, updatedAt: now }],
    sessions: [], transactions: [], tasks: [], executions: [], judgments: [], appeals: [], documents: [],
  }
}

export class DataStoreError extends Error {}

export class DataStore {
  private db: Database
  private loadWarning = ''
  constructor() { this.db = this.load(); this.cleanupTrash() }

  private load(): Database {
    const saved = localStorage.getItem(key)
    if (!saved) { const initial = seed(); localStorage.setItem(key, JSON.stringify(initial)); return initial }
    try {
      const parsed = JSON.parse(saved) as Partial<Database>
      return {
        clients: parsed.clients ?? [], cases: parsed.cases ?? [], sessions: parsed.sessions ?? [], transactions: parsed.transactions ?? [], tasks: parsed.tasks ?? [], executions: parsed.executions ?? [], judgments: parsed.judgments ?? [],
        appeals: (parsed.appeals ?? []).map((appeal) => ({ ...appeal, judgmentText: appeal.judgmentText ?? '', deadlineStartDate: appeal.judgmentDate, status: appeal.status ?? 'فترة اعتراضية' })),
        documents: (parsed.documents ?? []).map((document) => ({ ...document, links: document.links ?? [] })),
      }
    } catch {
      const backupKey = `${key}:corrupt:${Date.now()}`
      try { localStorage.setItem(backupKey, saved) } catch { /* مساحة التخزين ممتلئة */ }
      this.loadWarning = `تعذر قراءة البيانات السابقة. حُفظت نسخة إنقاذ باسم ${backupKey}.`
      const initial = seed(); localStorage.setItem(key, JSON.stringify(initial)); return initial
    }
  }

  private save() { localStorage.setItem(key, JSON.stringify(this.db)) }
  private collection(type: RecordType) { return this.db[type] as RecordBase[] }
  private requireActive<T extends RecordBase>(records: T[], id: string | undefined, message: string) {
    const record = records.find((item) => item.id === id)
    if (!active(record)) throw new DataStoreError(message)
    return record!
  }
  private requireRecord(type: RecordType, id: string) {
    const record = this.collection(type).find((item) => item.id === id)
    if (!record) throw new DataStoreError('السجل المطلوب غير موجود.')
    return record
  }
  private nextOrder(type: RecordType) { return Math.max(-1, ...this.collection(type).map((item) => Number((item as RecordBase & { sortOrder?: number }).sortOrder ?? -1))) + 1 }
  private add<T extends RecordBase>(type: RecordType, input: Omit<T, keyof RecordBase>) {
    const now = stamp(), record = { ...input, id: uid(), createdAt: now, updatedAt: now } as T
    this.collection(type).push(record); this.save(); return record
  }
  private update<T extends RecordBase>(type: RecordType, id: string, input: Omit<T, keyof RecordBase>) {
    const records = this.collection(type), index = records.findIndex((item) => item.id === id)
    if (index < 0) throw new DataStoreError('تعذر العثور على السجل المطلوب تعديله.')
    records[index] = { ...records[index], ...input, id, updatedAt: stamp() }; this.save()
  }
  private reorder(type: RecordType, ids: string[]) {
    const wanted = new Set(ids)
    const records = [...this.collection(type)].sort((a, b) => Number((a as RecordBase & { sortOrder?: number }).sortOrder ?? 0) - Number((b as RecordBase & { sortOrder?: number }).sortOrder ?? 0) || a.createdAt.localeCompare(b.createdAt))
    const selected = ids.map((id) => records.find((record) => record.id === id)).filter(Boolean) as RecordBase[]
    let index = 0
    const stable = records.map((record) => wanted.has(record.id) ? selected[index++] : record)
    stable.forEach((record, sortOrder) => Object.assign(record, { sortOrder, updatedAt: stamp() }))
    this.save()
  }

  snapshot = () => structuredClone(this.db)
  getLoadWarning = () => this.loadWarning
  addClient(input: Omit<Client, keyof RecordBase>) { return this.add<Client>('clients', { ...input, sortOrder: this.nextOrder('clients') }) }
  updateClient(id: string, input: Omit<Client, keyof RecordBase>) { this.update<Client>('clients', id, input) }
  addCase(input: Omit<LegalCase, keyof RecordBase>) { this.requireActive(this.db.clients, input.clientId, 'العميل غير موجود أو موجود في السلة.'); return this.add<LegalCase>('cases', { ...input, sortOrder: this.nextOrder('cases') }) }
  updateCase(id: string, input: Omit<LegalCase, keyof RecordBase>) { this.requireActive(this.db.clients, input.clientId, 'العميل غير موجود أو موجود في السلة.'); this.update<LegalCase>('cases', id, input) }

  private validateSession(input: Omit<Session, keyof RecordBase>, editingId?: string) {
    this.requireActive(this.db.cases, input.caseId, 'القضية غير موجودة أو موجودة في السلة.')
    if (input.status === 'جديدة' && this.db.sessions.some((item) => active(item) && item.caseId === input.caseId && item.status === 'جديدة' && item.id !== editingId)) throw new DataStoreError('توجد جلسة جديدة لهذه القضية. أنهِ الجلسة السابقة أولًا.')
  }
  addSession(input: Omit<Session, keyof RecordBase>) { this.validateSession(input); return this.add<Session>('sessions', { ...input, sortOrder: input.sortOrder ?? this.nextOrder('sessions') }) }
  updateSession(id: string, input: Omit<Session, keyof RecordBase>) { this.validateSession(input, id); this.update<Session>('sessions', id, input) }
  private validateCase(caseId?: string) { if (caseId) this.requireActive(this.db.cases, caseId, 'القضية المرتبطة غير موجودة أو موجودة في السلة.') }
  addTransaction(input: Omit<Transaction, keyof RecordBase>) { this.validateCase(input.caseId); return this.add<Transaction>('transactions', { ...input, sortOrder: input.sortOrder ?? this.nextOrder('transactions') }) }
  updateTransaction(id: string, input: Omit<Transaction, keyof RecordBase>) { this.validateCase(input.caseId); this.update<Transaction>('transactions', id, input) }
  addTask(input: Omit<WorkTask, keyof RecordBase>) { this.validateCase(input.caseId); if (input.executionId) this.requireActive(this.db.executions, input.executionId, 'طلب التنفيذ المرتبط غير موجود.'); return this.add<WorkTask>('tasks', { ...input, sortOrder: input.sortOrder ?? this.nextOrder('tasks') }) }
  updateTask(id: string, input: Omit<WorkTask, keyof RecordBase>) { this.validateCase(input.caseId); if (input.executionId) this.requireActive(this.db.executions, input.executionId, 'طلب التنفيذ المرتبط غير موجود.'); this.update<WorkTask>('tasks', id, input) }

  private validateExecution(input: Omit<ExecutionRequest, keyof RecordBase>) {
    if (!input.caseId && !input.externalCaseNumber?.trim()) throw new DataStoreError('القضية إلزامية.')
    if (!input.judgmentId && !input.externalJudgmentNumber?.trim()) throw new DataStoreError('الحكم إلزامي.')
    this.validateCase(input.caseId)
    if (input.judgmentId) { const judgment = this.requireActive(this.db.judgments, input.judgmentId, 'الحكم المرتبط غير موجود أو موجود في السلة.'); if (input.caseId && judgment.caseId !== input.caseId) throw new DataStoreError('الحكم لا يتبع القضية المختارة.') }
  }
  addExecution(input: Omit<ExecutionRequest, keyof RecordBase>) { this.validateExecution(input); return this.add<ExecutionRequest>('executions', { ...input, sortOrder: input.sortOrder ?? this.nextOrder('executions') }) }
  updateExecution(id: string, input: Omit<ExecutionRequest, keyof RecordBase>) { this.validateExecution(input); this.update<ExecutionRequest>('executions', id, input) }
  addJudgment(input: Omit<Judgment, keyof RecordBase>) { this.requireActive(this.db.cases, input.caseId, 'القضية المرتبطة بالحكم غير موجودة.'); return this.add<Judgment>('judgments', { ...input, sortOrder: input.sortOrder ?? this.nextOrder('judgments') }) }
  updateJudgment(id: string, input: Omit<Judgment, keyof RecordBase>) { this.requireActive(this.db.cases, input.caseId, 'القضية المرتبطة بالحكم غير موجودة.'); this.update<Judgment>('judgments', id, input) }
  private validateAppeal(input: Omit<Appeal, keyof RecordBase>) {
    this.requireActive(this.db.cases, input.caseId, 'القضية المرتبطة بالاستئناف غير موجودة.')
    if (input.judgmentId) { const judgment = this.requireActive(this.db.judgments, input.judgmentId, 'الحكم المرتبط بالاستئناف غير موجود.'); if (judgment.caseId !== input.caseId) throw new DataStoreError('الحكم لا يتبع القضية المختارة.') }
  }
  addAppeal(input: Omit<Appeal, keyof RecordBase>) { this.validateAppeal(input); return this.add<Appeal>('appeals', { ...input, sortOrder: input.sortOrder ?? this.nextOrder('appeals') }) }
  updateAppeal(id: string, input: Omit<Appeal, keyof RecordBase>) { this.validateAppeal(input); this.update<Appeal>('appeals', id, input) }
  private validateDocument(input: Omit<LegalDocument, keyof RecordBase>) {
    if (!input.name.trim() || !input.documentType.trim()) throw new DataStoreError('اسم المستند ونوعه مطلوبان.')
    let url: URL
    try { url = new URL(input.url) } catch { throw new DataStoreError('رابط المستند غير صحيح.') }
    if (!['http:', 'https:'].includes(url.protocol)) throw new DataStoreError('يجب أن يبدأ رابط المستند بـ http أو https.')
    if (!input.links.length) throw new DataStoreError('اربط المستند بسجل واحد على الأقل.')
    const unique = new Set<string>()
    input.links.forEach((link) => {
      if (unique.has(`${link.type}:${link.id}`)) throw new DataStoreError('يوجد ارتباط مكرر للمستند.')
      unique.add(`${link.type}:${link.id}`)
      this.requireActive(this.collection(link.type), link.id, 'أحد السجلات المرتبطة غير موجود أو موجود في السلة.')
    })
  }
  addDocument(input: Omit<LegalDocument, keyof RecordBase>) { this.validateDocument(input); return this.add<LegalDocument>('documents', { ...input, name: input.name.trim(), documentType: input.documentType.trim(), url: input.url.trim() }) }
  updateDocument(id: string, input: Omit<LegalDocument, keyof RecordBase>) { this.validateDocument(input); this.update<LegalDocument>('documents', id, { ...input, name: input.name.trim(), documentType: input.documentType.trim(), url: input.url.trim() }) }
  documentsFor(type: DocumentOwnerType, id: string) { return this.db.documents.filter((document) => active(document) && document.links.some((link) => link.type === type && link.id === id)).map((document) => structuredClone(document)) }

  reorderClients(ids: string[]) { this.reorder('clients', ids) }
  reorderCases(ids: string[]) { this.reorder('cases', ids) }
  reorderSessions(ids: string[]) { this.reorder('sessions', ids) }
  reorderTransactions(ids: string[]) { this.reorder('transactions', ids) }
  reorderTasks(ids: string[]) { this.reorder('tasks', ids) }
  reorderExecutions(ids: string[]) { this.reorder('executions', ids) }
  reorderJudgments(ids: string[]) { this.reorder('judgments', ids) }
  reorderAppeals(ids: string[]) { this.reorder('appeals', ids) }
  moveToTrash(type: RecordType, id: string) { const record = this.requireRecord(type, id); record.deletedAt = stamp(); record.updatedAt = stamp(); this.save() }

  private restoreBlock(type: RecordType, record: RecordBase): string | undefined {
    if (type === 'cases' && !active(this.db.clients.find((item) => item.id === (record as LegalCase).clientId))) return 'استعد العميل المرتبط أولًا.'
    if (type === 'sessions') { const item = record as Session; if (!active(this.db.cases.find((c) => c.id === item.caseId))) return 'استعد القضية المرتبطة أولًا.'; if (item.status === 'جديدة' && this.db.sessions.some((s) => active(s) && s.caseId === item.caseId && s.status === 'جديدة' && s.id !== item.id)) return 'توجد جلسة جديدة فعالة للقضية نفسها.' }
    if (type === 'transactions' || type === 'tasks') { const item = record as Transaction | WorkTask; if (item.caseId && !active(this.db.cases.find((c) => c.id === item.caseId))) return 'استعد القضية المرتبطة أولًا.' }
    if (type === 'tasks' && (record as WorkTask).executionId && !active(this.db.executions.find((e) => e.id === (record as WorkTask).executionId))) return 'استعد طلب التنفيذ المرتبط أولًا.'
    if (type === 'judgments' && !active(this.db.cases.find((c) => c.id === (record as Judgment).caseId))) return 'استعد القضية المرتبطة أولًا.'
    if (type === 'executions') { const item = record as ExecutionRequest; if (item.caseId && !active(this.db.cases.find((c) => c.id === item.caseId))) return 'استعد القضية المرتبطة أولًا.'; if (item.judgmentId && !active(this.db.judgments.find((j) => j.id === item.judgmentId))) return 'استعد الحكم المرتبط أولًا.' }
    if (type === 'appeals') { const item = record as Appeal; if (!active(this.db.cases.find((c) => c.id === item.caseId))) return 'استعد القضية المرتبطة أولًا.'; if (item.judgmentId && !active(this.db.judgments.find((j) => j.id === item.judgmentId))) return 'استعد الحكم المرتبط أولًا.' }
  }
  restore(type: RecordType, id: string) { const record = this.requireRecord(type, id), reason = this.restoreBlock(type, record); if (reason) throw new DataStoreError(reason); delete record.deletedAt; record.updatedAt = stamp(); this.save() }
  private label(type: RecordType, record: RecordBase) {
    if (type === 'clients') return (record as Client).name
    if (type === 'cases') return `قضية ${(record as LegalCase).caseNumber}`
    if (type === 'sessions') return `جلسة ${(record as Session).date}`
    if (type === 'transactions') return (record as Transaction).statement
    if (type === 'tasks') return (record as WorkTask).statement
    if (type === 'executions') return `طلب ${(record as ExecutionRequest).requestNumber}`
    if (type === 'judgments') return `صك ${(record as Judgment).deedNumber}`
    if (type === 'appeals') return (record as Appeal).judgmentText || 'استئناف'
    return (record as LegalDocument).name
  }
  getTrash(): TrashEntry[] {
    const now = Date.now(), result: TrashEntry[] = []
    ;(Object.keys(this.db) as RecordType[]).forEach((type) => this.collection(type).filter((record) => record.deletedAt).forEach((record) => result.push({ type, record: structuredClone(record), label: this.label(type, record), blockedReason: this.restoreBlock(type, record), daysRemaining: Math.max(0, Math.ceil((new Date(record.deletedAt!).getTime() + retentionMs - now) / 86_400_000)) })))
    return result.sort((a, b) => new Date(b.record.deletedAt!).getTime() - new Date(a.record.deletedAt!).getTime())
  }
  cleanupTrash() {
    const expired = (record: RecordBase) => Boolean(record.deletedAt && new Date(record.deletedAt).getTime() <= Date.now() - retentionMs)
    this.db.sessions = this.db.sessions.filter((x) => !expired(x))
    this.db.documents = this.db.documents.filter((x) => !expired(x))
    this.db.transactions = this.db.transactions.filter((x) => !expired(x))
    this.db.appeals = this.db.appeals.filter((x) => !expired(x))
    this.db.tasks = this.db.tasks.filter((x) => !expired(x))
    this.db.executions = this.db.executions.filter((x) => !expired(x) || this.db.tasks.some((t) => t.executionId === x.id))
    this.db.judgments = this.db.judgments.filter((x) => !expired(x) || this.db.executions.some((e) => e.judgmentId === x.id) || this.db.appeals.some((a) => a.judgmentId === x.id))
    this.db.cases = this.db.cases.filter((x) => !expired(x) || this.db.sessions.some((s) => s.caseId === x.id) || this.db.transactions.some((t) => t.caseId === x.id) || this.db.tasks.some((t) => t.caseId === x.id) || this.db.executions.some((e) => e.caseId === x.id) || this.db.judgments.some((j) => j.caseId === x.id) || this.db.appeals.some((a) => a.caseId === x.id))
    this.db.clients = this.db.clients.filter((x) => !expired(x) || this.db.cases.some((c) => c.clientId === x.id))
    this.save()
  }
}

export const isActive = <T extends RecordBase>(record: T) => !record.deletedAt
export const formatDate = (date?: string) => date ? new Intl.DateTimeFormat('ar-SA-u-ca-islamic', { dateStyle: 'medium' }).format(new Date(`${date}T12:00:00`)) : '—'
