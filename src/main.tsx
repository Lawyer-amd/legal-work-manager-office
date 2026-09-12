import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { type AppealStatus, type CaseStatus, type ClientType, DataStore, DataStoreError, type DocumentLink, type DocumentOwnerType, type ExecutionFollowUp, type ExecutionStatus, formatDate, isActive, type JudgmentType, type RecordType, type TaskStatus, type TransactionStatus } from './dataStore'
import { CloudSyncError, defaultCloudEndpoint, readCloudSnapshot, syncCloudSnapshot, writeCloudSnapshot } from './cloudSync'

const workspaceDefinitions = [
  { id: 'اليوم', label: 'اليوم', description: 'المواعيد والتنبيهات', sections: ['لوحة المتابعة'] },
  { id: 'القضايا', label: 'القضايا', description: 'ملفات القضايا ونتائجها', sections: ['القضايا', 'الأحكام', 'الاستئناف', 'التنفيذ'] },
  { id: 'العمل', label: 'العمل', description: 'جلسات ومهام ومعاملات', sections: ['الجلسات', 'المهام', 'المعاملات'] },
  { id: 'العملاء', label: 'العملاء', description: 'بيانات العملاء', sections: ['العملاء'] },
  { id: 'المستندات', label: 'المستندات', description: 'فهرس روابط الملفات', sections: ['المستندات'] },
] as const
type WorkspaceId = typeof workspaceDefinitions[number]['id']
type AppSettings = { officeName: string; landingWorkspace: WorkspaceId; agencyWarningDays: number; compactTables: boolean }
const settingsKey = 'legal-work-manager:settings:v1'
const defaultSettings: AppSettings = { officeName: 'إدارة العمل القانوني', landingWorkspace: 'اليوم', agencyWarningDays: 20, compactTables: false }
const loadSettings = (): AppSettings => {
  try {
    const parsed = JSON.parse(localStorage.getItem(settingsKey) ?? '{}') as Partial<AppSettings>
    return { ...defaultSettings, ...parsed }
  } catch { return defaultSettings }
}
const sectionForWorkspace = (workspace: WorkspaceId) => workspaceDefinitions.find((item) => item.id === workspace)?.sections[0] ?? 'لوحة المتابعة'
const workspaceForSection = (section: string): WorkspaceId => workspaceDefinitions.find((item) => item.sections.includes(section as never))?.id ?? 'اليوم'
const store = new DataStore()

function App() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [activeSection, setActiveSection] = useState<string>(() => sectionForWorkspace(loadSettings().landingWorkspace))
  const [revision, setRevision] = useState(0)
  const data = useMemo(() => store.snapshot(), [revision])
  const clients = data.clients.filter(isActive)
  const legalCases = data.cases.filter(isActive)
  const transactions = data.transactions.filter(isActive)
  const tasks = data.tasks.filter(isActive)
  const executions = data.executions.filter(isActive)
  const judgments = data.judgments.filter(isActive)
  const appeals = data.appeals.filter(isActive)
  const activeSessions = data.sessions.filter(isActive).filter((session) => session.status === 'جديدة')
  const [dirty, setDirty] = useState(false)
  const autoReadStarted = useRef(false)
  const refresh = () => { setDirty(true); setRevision((value) => value + 1) }
  const [cloudMessage, setCloudMessage] = useState('')
  const [cloudBusy, setCloudBusy] = useState(false)
  const readCloud = async () => {
    setCloudBusy(true); setCloudMessage('جاري قراءة البيانات السحابية…')
    try { store.replaceSnapshot(await readCloudSnapshot()); setDirty(false); setRevision((value) => value + 1); setCloudMessage('تمت قراءة snapshot السحابي وحفظه محليًا. لم تُرسل أي تغييرات للسحابة.') }
    catch (error) { setCloudMessage(error instanceof CloudSyncError ? error.message : 'تعذر قراءة البيانات السحابية.') }
    finally { setCloudBusy(false) }
  }
  const writeCloud = async () => {
    if (!window.confirm('سيتم استبدال صفوف Google Sheets بنسخة هذا الجهاز. تأكد من القراءة أولًا لتجنب فقد بيانات سحابية. هل تريد المتابعة؟')) return
    setCloudBusy(true); setCloudMessage('جاري حفظ البيانات السحابية…')
    try { await writeCloudSnapshot(store.snapshot()); setDirty(false); setCloudMessage('تم حفظ نسخة البيانات في السحابة.') }
    catch (error) { setCloudMessage(error instanceof CloudSyncError ? error.message : 'تعذر حفظ البيانات السحابية.') }
    finally { setCloudBusy(false) }
  }
  const syncCloud = async () => {
    setCloudBusy(true); setCloudMessage('جاري دمج بيانات الجهاز والسحابة…')
    try { store.replaceSnapshot(await syncCloudSnapshot(store.snapshot())); setDirty(false); setRevision((value) => value + 1); setCloudMessage('تمت المزامنة الثنائية بنجاح. حُفظت النسخة المدمجة في السحابة وعلى هذا الجهاز.') }
    catch (error) { setCloudMessage(error instanceof CloudSyncError ? error.message : 'تعذر تنفيذ المزامنة الثنائية.') }
    finally { setCloudBusy(false) }
  }
  useEffect(() => {
    if (import.meta.env.MODE === 'test') return
    if (autoReadStarted.current) return
    autoReadStarted.current = true
    void readCloud()
  }, [])
  useEffect(() => {
    if (!dirty || cloudBusy) return
    const timer = window.setTimeout(async () => {
      try { await writeCloudSnapshot(store.snapshot()); setDirty(false); setCloudMessage('تم حفظ التعديل تلقائيًا في السحابة.') }
      catch (error) { setCloudMessage(error instanceof CloudSyncError ? error.message : 'تعذر الحفظ التلقائي في السحابة.') }
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [revision, dirty, cloudBusy])
  useEffect(() => { const timer = window.setInterval(() => { store.cleanupTrash(); setRevision((value) => value + 1) }, 60_000); return () => window.clearInterval(timer) }, [])

  return (
    <main className={`app-shell ${settings.compactTables ? 'compact-tables' : ''}`}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">م</span><div><h1>{settings.officeName}</h1><p>منظم العمل القانوني</p></div></div>
        <nav className="workspace-nav" aria-label="مساحات العمل">
          {workspaceDefinitions.map((workspace) => <button aria-label={workspace.label} onClick={() => setActiveSection(sectionForWorkspace(workspace.id))} className={workspaceForSection(activeSection) === workspace.id ? 'active' : ''} key={workspace.id}><b>{workspace.label}</b><small>{workspace.description}</small></button>)}
        </nav>
        {workspaceForSection(activeSection) !== 'اليوم' && <nav className="section-nav" aria-label="لوحات مساحة العمل">{workspaceDefinitions.find((item) => item.id === workspaceForSection(activeSection))?.sections.map((section) => <button onClick={() => setActiveSection(section)} className={activeSection === section ? 'active' : ''} key={section}>{section}</button>)}</nav>}
        <div className="sidebar-footer"><button onClick={() => setActiveSection('الإعدادات')} className={activeSection === 'الإعدادات' ? 'active' : ''}>الإعدادات</button><button onClick={() => setActiveSection('سلة المحذوفات')} className={activeSection === 'سلة المحذوفات' ? 'active' : ''}>سلة المحذوفات</button></div>
      </aside>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">{activeSection === 'لوحة المتابعة' ? 'مركز يوم العمل' : workspaceForSection(activeSection)}</p>
            <h2>{activeSection === 'لوحة المتابعة' ? 'اليوم' : activeSection}</h2>
          </div>
          <div className="header-quick-actions"><button className="header-settings" onClick={() => setActiveSection('الإعدادات')}>الإعدادات</button><button className="header-settings" onClick={() => setActiveSection('سلة المحذوفات')}>سلة المحذوفات</button></div>
        </header>
        {store.getLoadWarning() && <p className="notice warning">{store.getLoadWarning()}</p>}
        {cloudMessage && <p className="notice" role="status">{cloudMessage}</p>}
        {activeSection === 'لوحة المتابعة' ? <Dashboard clients={clients} cases={legalCases} sessions={activeSessions} transactions={transactions} tasks={tasks} executions={executions} appeals={appeals} agencyWarningDays={settings.agencyWarningDays} onOpenSection={setActiveSection} /> : activeSection === 'العملاء' ? <ClientsPanel clients={clients} cases={legalCases} sessions={data.sessions.filter(isActive)} refresh={refresh} /> : activeSection === 'القضايا' ? <CasesPanel clients={clients} cases={legalCases} sessions={data.sessions.filter(isActive)} refresh={refresh} /> : activeSection === 'الجلسات' ? <SessionsPanel clients={clients} cases={legalCases} sessions={data.sessions.filter(isActive)} refresh={refresh} /> : activeSection === 'المعاملات' ? <TransactionsPanel clients={clients} cases={legalCases} transactions={transactions} refresh={refresh} /> : activeSection === 'المهام' ? <TasksPanel clients={clients} cases={legalCases} tasks={tasks} refresh={refresh} /> : activeSection === 'التنفيذ' ? <ExecutionsPanel clients={clients} cases={legalCases} judgments={judgments} executions={executions} refresh={refresh} /> : activeSection === 'الأحكام' ? <JudgmentsPanel clients={clients} cases={legalCases} judgments={judgments} refresh={refresh} /> : activeSection === 'الاستئناف' ? <AppealsPanel clients={clients} cases={legalCases} judgments={judgments} appeals={appeals} refresh={refresh} /> : activeSection === 'المستندات' ? <DocumentsPanel data={data} refresh={refresh} /> : activeSection === 'سلة المحذوفات' ? <TrashPanel refresh={refresh} /> : activeSection === 'الإعدادات' ? <SettingsPanel settings={settings} onSave={(next) => { localStorage.setItem(settingsKey, JSON.stringify(next)); setSettings(next) }} onReset={() => { localStorage.removeItem(settingsKey); setSettings(defaultSettings) }} onReadCloud={readCloud} onWriteCloud={writeCloud} onSyncCloud={syncCloud} cloudBusy={cloudBusy} /> : <SectionPlaceholder title={activeSection} />}
      </section>
    </main>
  )
}

const daysUntil = (date: string) => {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(`${date}T00:00:00`).getTime() - start.getTime()) / 86_400_000)
}

const datePlusDays = (date: string, durationDays: number) => {
  const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + durationDays)
  return value.toISOString().slice(0, 10)
}
type DashboardItem = { id: string; kind: 'جلسة' | 'إجراء قضية' | 'معاملة' | 'مهمة' | 'تنفيذ' | 'استئناف' | 'وكالة'; section: string; title: string; detail: string; date: string; time?: string; days: number }
const deadlineLabel = (days: number) => days < 0 ? `متأخر ${Math.abs(days)} يوم` : days === 0 ? 'اليوم' : days <= 3 ? `خلال ${days} أيام` : `متبقي ${days} يوم`

function Dashboard({ clients, cases, sessions, transactions, tasks, executions, appeals, agencyWarningDays, onOpenSection }: { clients: ReturnType<DataStore['snapshot']>['clients']; cases: ReturnType<DataStore['snapshot']>['cases']; sessions: ReturnType<DataStore['snapshot']>['sessions']; transactions: ReturnType<DataStore['snapshot']>['transactions']; tasks: ReturnType<DataStore['snapshot']>['tasks']; executions: ReturnType<DataStore['snapshot']>['executions']; appeals: ReturnType<DataStore['snapshot']>['appeals']; agencyWarningDays: number; onOpenSection: (section: string) => void }) {
  const [range, setRange] = useState<'today' | '3' | '7' | '30' | 'all'>('7')
  const [kind, setKind] = useState<DashboardItem['kind'] | 'الكل'>('الكل')
  const caseDetails = (caseId?: string) => {
    const legalCase = cases.find((item) => item.id === caseId)
    const client = clients.find((item) => item.id === legalCase?.clientId)
    return { number: legalCase?.caseNumber ?? 'قضية خارج المكتب', parties: `${client?.name ?? '—'} ضد ${legalCase?.opponentName ?? '—'}` }
  }
  const timeline: DashboardItem[] = [
    ...sessions.map((session) => { const details = caseDetails(session.caseId); return { id: `session-${session.id}`, kind: 'جلسة' as const, section: 'الجلسات', title: `جلسة القضية ${details.number}`, detail: details.parties, date: session.date, time: session.time, days: daysUntil(session.date) } }),
    ...cases.filter((item) => item.status !== 'منتهية' && item.nextActionDate).map((legalCase) => { const details = caseDetails(legalCase.id); return { id: `case-${legalCase.id}`, kind: 'إجراء قضية' as const, section: 'القضايا', title: `إجراء قادم — ${details.number}`, detail: details.parties, date: legalCase.nextActionDate!, days: daysUntil(legalCase.nextActionDate!) } }),
    ...transactions.filter((item) => item.status !== 'منتهية' && item.nextDate).map((item) => { const details = caseDetails(item.caseId); return { id: `transaction-${item.id}`, kind: 'معاملة' as const, section: 'المعاملات', title: item.statement, detail: item.caseId ? `${details.number} — ${details.parties}` : `${item.clientName ?? '—'} ضد ${item.opponentName ?? '—'}`, date: item.nextDate!, days: daysUntil(item.nextDate!) } }),
    ...tasks.filter((item) => !['منجزة', 'ملغاة'].includes(item.status) && (item.nextDate || item.taskDate)).map((item) => { const details = caseDetails(item.caseId); const date = item.nextDate || item.taskDate!; return { id: `task-${item.id}`, kind: 'مهمة' as const, section: 'المهام', title: item.statement, detail: item.caseId ? `${details.number} — ${details.parties}` : item.clientName ?? 'مهمة عامة', date, days: daysUntil(date) } }),
    ...executions.filter((item) => item.status !== 'منتهي').flatMap((item) => item.followUps.filter((followUp) => followUp.nextAction && followUp.nextDate).map((followUp) => ({ id: `execution-${item.id}-${followUp.id}`, kind: 'تنفيذ' as const, section: 'التنفيذ', title: followUp.nextAction!, detail: `طلب ${item.requestNumber} — ${item.claimant} ضد ${item.respondent}`, date: followUp.nextDate!, days: daysUntil(followUp.nextDate!) }))),
    ...appeals.filter((item) => item.status !== 'منتهي' && item.judgmentDate).map((item) => { const details = caseDetails(item.caseId); const date = datePlusDays(item.judgmentDate, item.durationDays); return { id: `appeal-${item.id}`, kind: 'استئناف' as const, section: 'الاستئناف', title: `آخر يوم للاستئناف — ${details.number}`, detail: item.judgmentText || details.parties, date, days: daysUntil(date) } }),
    ...cases.filter((item) => item.status !== 'منتهية' && item.agencyExpiryDate).map((item) => { const details = caseDetails(item.id); return { id: `agency-${item.id}`, kind: 'وكالة' as const, section: 'القضايا', title: `انتهاء الوكالة — ${details.number}`, detail: details.parties, date: item.agencyExpiryDate!, days: daysUntil(item.agencyExpiryDate!) } }),
  ].sort((a: DashboardItem, b: DashboardItem) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
  const agencyWatch = timeline.filter((item) => item.kind === 'وكالة' && item.days >= 0 && item.days < agencyWarningDays)
  const rangeDays = range === 'today' ? 0 : range === 'all' ? Infinity : Number(range)
  const shownTimeline = timeline.filter((item) => (kind === 'الكل' || item.kind === kind) && item.days <= rangeDays)
  const sessionToday = timeline.filter((item) => item.kind === 'جلسة' && item.days === 0)
  const staleSessions = timeline.filter((item) => item.kind === 'جلسة' && item.days < 0)
  const overdue = timeline.filter((item) => item.days < 0)
  const today = timeline.filter((item) => item.days === 0)
  const appealUrgent = timeline.filter((item) => item.kind === 'استئناف' && item.days <= 7)
  const actionItems = shownTimeline.filter((item) => item.kind !== 'جلسة').slice(0, 6)

  return <>
    <section className="dashboard-hero">
      <div><p className="eyebrow">مركز يوم العمل</p><h3>المواعيد والإجراءات التي تحتاج متابعة</h3><p>تُرتّب البيانات حسب التاريخ، وتشمل الجلسات والمهام والتنفيذ والاستئناف والوكالات.</p></div>
      <div className="hero-date"><small>اليوم</small><b>{new Intl.DateTimeFormat('ar-SA-u-ca-islamic', { dateStyle: 'full' }).format(new Date())}</b></div>
    </section>
    {overdue.length > 0 && <section className="deadline-alert" role="status"><div><b>{overdue.length} موعد أو إجراء متأخر</b><span>راجع العناصر المتأخرة أولًا قبل متابعة المواعيد القادمة.</span></div><button onClick={() => { setRange('all'); setKind('الكل') }}>عرض المتأخر</button></section>}
    <div className="dashboard-stats">
      <Stat label="جلسات اليوم" value={sessionToday.length} urgent={sessionToday.length > 0} />
      <Stat label="مواعيد متأخرة" value={overdue.length} urgent={overdue.length > 0} />
      <Stat label="استحقاقات اليوم" value={today.length} urgent={today.length > 0} />
      <Stat label={`وكالات خلال ${agencyWarningDays} يومًا`} value={agencyWatch.length} urgent={agencyWatch.length > 0} />
    </div>

    <section className="dashboard-section agenda-section" aria-labelledby="agenda-title">
      <div className="dashboard-section-head"><div><p className="eyebrow">جدول العمل</p><h3 id="agenda-title">أقرب المواعيد والإجراءات</h3></div><div className="dashboard-filters" aria-label="تصفية المواعيد">{([['today', 'اليوم'], ['3', '3 أيام'], ['7', '7 أيام'], ['30', '30 يومًا'], ['all', 'الكل']] as const).map(([value, label]) => <button key={value} className={range === value ? 'selected' : ''} onClick={() => setRange(value)}>{label}</button>)}</div></div>
      <div className="kind-filters">{(['الكل', 'جلسة', 'إجراء قضية', 'معاملة', 'مهمة', 'تنفيذ', 'استئناف', 'وكالة'] as const).map((value) => <button key={value} className={kind === value ? 'selected' : ''} onClick={() => setKind(value)}>{value}</button>)}</div>
      {shownTimeline.length ? <div className="timeline-list">{shownTimeline.slice(0, 12).map((item) => <article className={`timeline-item ${item.days < 0 ? 'overdue' : item.days <= 3 ? 'soon' : ''}`} key={item.id}><span className="timeline-kind">{item.kind}</span><div><h4>{item.title}</h4><p>{item.detail}</p></div><div className="timeline-date"><b>{formatDate(item.date)}</b><small>{item.time || item.date}</small></div><span className="deadline-chip">{deadlineLabel(item.days)}</span><button className="secondary" onClick={() => onOpenSection(item.section)}>فتح اللوحة</button></article>)}</div> : <div className="empty-state"><h3>لا توجد مواعيد ضمن هذا النطاق</h3><p>غيّر المدة أو نوع السجل لعرض عناصر أخرى.</p></div>}
    </section>

    <section className="dashboard-grid">
      <article className="dashboard-card sessions-card"><div className="dashboard-section-head"><div><p className="eyebrow">الجلسات</p><h3>جلسات اليوم وما يحتاج تحديثًا</h3></div><button className="secondary" onClick={() => onOpenSection('الجلسات')}>فتح الجلسات</button></div>
        <div className="session-summary"><div><small>اليوم</small><b>{sessionToday.length}</b></div><div><small>تحتاج تحديثًا</small><b className={staleSessions.length ? 'danger-text' : ''}>{staleSessions.length}</b></div></div>
        {(sessionToday.length || staleSessions.length) ? <div className="compact-list">{[...staleSessions, ...sessionToday].slice(0, 5).map((item) => <div key={item.id}><span className={item.days < 0 ? 'danger-text' : ''}>{deadlineLabel(item.days)}</span><b>{item.title}</b><small>{item.detail}</small></div>)}</div> : <p className="muted">لا توجد جلسات اليوم أو جلسات تحتاج تحديثًا.</p>}
      </article>
      <article className="dashboard-card actions-card"><div className="dashboard-section-head"><div><p className="eyebrow">متابعة</p><h3>إجراءات مرتبطة بوقت</h3></div></div>
        {actionItems.length ? <div className="compact-list">{actionItems.map((item) => <button key={item.id} onClick={() => onOpenSection(item.section)}><span className={item.days < 0 ? 'danger-text' : ''}>{deadlineLabel(item.days)}</span><b>{item.title}</b><small>{item.detail}</small></button>)}</div> : <p className="muted">لا توجد إجراءات زمنية ضمن النطاق المختار.</p>}
      </article>
    </section>

    <section className="dashboard-grid">
      <section className="agency-watch dashboard-card" aria-labelledby="agency-watch-title">
        <div className="dashboard-section-head"><div><p className="eyebrow">تنبيه الوكالات</p><h3 id="agency-watch-title">الوكالات القريبة من الانتهاء</h3><p className="muted">قضايا فعالة بقي على وكالتها أقل من {agencyWarningDays} يومًا.</p></div><button className="secondary" onClick={() => onOpenSection('القضايا')}>فتح القضايا</button></div>
      {agencyWatch.length ? <div className="table-wrap"><table><thead><tr><th>رقم القضية</th><th>الأطراف</th><th>انتهاء الوكالة</th><th>المتبقي</th></tr></thead><tbody>
        {agencyWatch.map((item) => <tr key={item.id}><td>{item.title.replace('انتهاء الوكالة — ', '')}</td><td>{item.detail}</td><td><b>{formatDate(item.date)}</b><small className="block">{item.date}</small></td><td><span className={`agency-countdown ${item.days <= 3 ? 'critical' : ''}`}>{item.days === 0 ? 'تنتهي اليوم' : `متبقي ${item.days} يوم`}</span></td></tr>)}
      </tbody></table></div> : <div className="empty-state"><h3>لا توجد وكالات قريبة من الانتهاء</h3><p>تظهر هنا الوكالات التي بقي على انتهائها أقل من {agencyWarningDays} يومًا.</p></div>}
      </section>
      <article className="dashboard-card appeal-card"><div className="dashboard-section-head"><div><p className="eyebrow">الاستئناف</p><h3>المهل القريبة أو المنتهية</h3></div><button className="secondary" onClick={() => onOpenSection('الاستئناف')}>فتح الاستئناف</button></div>
        {appealUrgent.length ? <div className="compact-list">{appealUrgent.slice(0, 5).map((item) => <div key={item.id}><span className={item.days < 0 ? 'danger-text' : ''}>{deadlineLabel(item.days)}</span><b>{item.title}</b><small>{item.detail}</small></div>)}</div> : <p className="muted">لا توجد مهلات استئناف حرجة حاليًا.</p>}
      </article>
    </section>
  </>
}
function Stat({ label, value, urgent = false }: { label: string; value: string | number; urgent?: boolean }) { return <article className={`stat ${urgent ? 'urgent-stat' : ''}`}><p>{label}</p><strong>{value}</strong></article> }
function SectionPlaceholder({ title }: { title: string }) { return <div className="empty-state"><h3>{title}</h3><p>ستظهر سجلات هذه اللوحة هنا بعد إكمال نموذجها وقواعدها الخاصة.</p></div> }

function TwoStepDeleteDialog({ title, message, onCancel, onConfirm }: { title: string; message: string; onCancel: () => void; onConfirm: () => void }) {
  const [step, setStep] = useState<1 | 2>(1)
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div className="delete-dialog">
    <p className="step-indicator">الخطوة {step} من 2</p>
    <h3 id="delete-title">{title}</h3>
    <p>{step === 1 ? message : 'تأكيد أخير: سيُنقل السجل إلى سلة المحذوفات لمدة 30 يومًا.'}</p>
    <div className="form-actions"><button onClick={onCancel}>إلغاء</button>{step === 1 ? <button className="danger-button" onClick={() => setStep(2)}>متابعة</button> : <button className="danger-button" onClick={onConfirm}>موافق، نقل إلى السلة</button>}</div>
  </div></div>
}

const typeNames: Record<RecordType, string> = { clients: 'عميل', cases: 'قضية', sessions: 'جلسة', transactions: 'معاملة', tasks: 'مهمة', executions: 'طلب تنفيذ', judgments: 'حكم', appeals: 'استئناف', documents: 'مستند' }

function SettingsPanel({ settings, onSave, onReset, onReadCloud, onWriteCloud, onSyncCloud, cloudBusy }: { settings: AppSettings; onSave: (settings: AppSettings) => void; onReset: () => void; onReadCloud: () => void; onWriteCloud: () => void; onSyncCloud: () => void; cloudBusy: boolean }) {
  const [form, setForm] = useState(settings)
  const [message, setMessage] = useState('')
  useEffect(() => setForm(settings), [settings])
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    onSave({ ...form, officeName: form.officeName.trim() || defaultSettings.officeName, agencyWarningDays: Math.max(1, Math.min(90, Number(form.agencyWarningDays) || 20)) })
    setMessage('تم حفظ الإعدادات على هذا الجهاز.')
  }
  return <section className="panel settings-panel">
    <div className="section-actions"><div><h3>الإعدادات</h3><p className="muted">خيارات العرض والمتابعة التي تناسب طريقة عمل المكتب. لا تغيّر هذه الإعدادات سجلات القضايا أو المستندات.</p></div></div>
    {message && <p className="notice" role="status">{message}</p>}
    <form className="record-form" onSubmit={submit}>
      <label>اسم المكتب في الواجهة<input value={form.officeName} onChange={(event) => setForm({ ...form, officeName: event.target.value })} /></label>
      <label>الصفحة عند فتح التطبيق<select value={form.landingWorkspace} onChange={(event) => setForm({ ...form, landingWorkspace: event.target.value as WorkspaceId })}>{workspaceDefinitions.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.label}</option>)}</select></label>
      <label>التنبيه قبل انتهاء الوكالة بالأيام<input type="number" min="1" max="90" value={form.agencyWarningDays} onChange={(event) => setForm({ ...form, agencyWarningDays: Number(event.target.value) })} /><small>يُعرض التنبيه في صفحة اليوم للقضايا الفعالة.</small></label>
      <label className="setting-toggle">كثافة الجداول<input type="checkbox" checked={form.compactTables} onChange={(event) => setForm({ ...form, compactTables: event.target.checked })} /><span>عرض مضغوط للصفوف</span></label>
      <div className="form-actions"><button type="button" onClick={() => { onReset(); setMessage('تمت استعادة إعدادات العرض الافتراضية.') }}>استعادة الإعدادات الافتراضية</button><button className="primary" type="submit">حفظ الإعدادات</button></div>
    </form>
    <div className="settings-note"><b>حفظ محلي</b><p>تحفظ هذه الخيارات في متصفح هذا الجهاز، وتبقى بيانات التطبيق وسجلاته مستقلة عنها.</p></div>
    <div className="settings-note"><b>المزامنة السحابية</b><p>المزامنة الثنائية تقرأ Sheets وتدمج السجلات الأحدث ثم تحفظ النسخة المدمجة.</p><button className="secondary" type="button" onClick={onReadCloud} disabled={cloudBusy}>{cloudBusy ? 'جاري القراءة…' : 'قراءة البيانات السحابية الآن'}</button> <button className="primary" type="button" onClick={onWriteCloud} disabled={cloudBusy}>{cloudBusy ? 'جاري الحفظ…' : 'حفظ البيانات في السحابة'}</button> <button className="secondary" type="button" onClick={onSyncCloud} disabled={cloudBusy}>{cloudBusy ? 'جاري الدمج…' : 'مزامنة ثنائية الآن'}</button></div>
  </section>
}

function DocumentsPanel({ data, refresh }: { data: ReturnType<DataStore['snapshot']>; refresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string>()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string }>()
  const [message, setMessage] = useState('')
  const empty = { name: '', documentType: 'مرفق عام', url: '', notes: '', documentDate: '', links: [] as DocumentLink[] }
  const [form, setForm] = useState(empty)
  const documents = data.documents.filter(isActive)
  const ownerGroups: { type: DocumentOwnerType; title: string; items: { id: string; label: string }[] }[] = [
    { type: 'clients', title: 'العملاء', items: data.clients.filter(isActive).map((item) => ({ id: item.id, label: item.name })) },
    { type: 'cases', title: 'القضايا', items: data.cases.filter(isActive).map((item) => ({ id: item.id, label: `قضية ${item.caseNumber}` })) },
    { type: 'sessions', title: 'الجلسات', items: data.sessions.filter(isActive).map((item) => ({ id: item.id, label: `جلسة ${formatDate(item.date)}` })) },
    { type: 'transactions', title: 'المعاملات', items: data.transactions.filter(isActive).map((item) => ({ id: item.id, label: item.statement })) },
    { type: 'tasks', title: 'المهام', items: data.tasks.filter(isActive).map((item) => ({ id: item.id, label: item.statement })) },
    { type: 'executions', title: 'التنفيذ', items: data.executions.filter(isActive).map((item) => ({ id: item.id, label: `طلب ${item.requestNumber}` })) },
    { type: 'judgments', title: 'الأحكام', items: data.judgments.filter(isActive).map((item) => ({ id: item.id, label: `صك ${item.deedNumber}` })) },
    { type: 'appeals', title: 'الاستئناف', items: data.appeals.filter(isActive).map((item) => ({ id: item.id, label: item.judgmentText || 'استئناف' })) },
  ]
  const ownerLabel = (link: DocumentLink) => ownerGroups.find((group) => group.type === link.type)?.items.find((item) => item.id === link.id)?.label ?? 'سجل في السلة'
  const clear = () => { setForm(empty); setEditingId(undefined); setShowForm(false); setMessage('') }
  const toggleLink = (link: DocumentLink) => setForm((current) => {
    const exists = current.links.some((item) => item.type === link.type && item.id === link.id)
    return { ...current, links: exists ? current.links.filter((item) => item.type !== link.type || item.id !== link.id) : [...current.links, link] }
  })
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    try {
      if (editingId) store.updateDocument(editingId, form); else store.addDocument(form)
      clear(); refresh()
    } catch (error) { setMessage(error instanceof DataStoreError ? error.message : 'تعذر حفظ المستند.') }
  }
  const edit = (document: typeof documents[number]) => { setEditingId(document.id); setForm({ name: document.name, documentType: document.documentType, url: document.url, notes: document.notes ?? '', documentDate: document.documentDate ?? '', links: document.links }); setShowForm(true); setMessage('') }
  return <section className="panel">
    <div className="section-actions"><div><h3>فهرس المستندات</h3><p className="muted">اربط ملف Google Drive بسجل واحد أو بعدة سجلات، ثم افتحه مباشرة من التطبيق.</p></div>{showForm ? <button className="primary" type="submit" form="document-form">{editingId ? 'حفظ التعديل' : 'حفظ المستند'}</button> : <button className="primary" onClick={() => { clear(); setShowForm(true) }}>إضافة مستند</button>}</div>
    {message && <p className="notice warning" role="alert">{message}</p>}
    {showForm && <form id="document-form" className="record-form document-form" onSubmit={submit}>
      <label>اسم المستند<input autoFocus required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="مثال: صك الحكم النهائي" /></label>
      <label>نوع المستند<select value={form.documentType} onChange={(event) => setForm({ ...form, documentType: event.target.value })}>{['مرفق عام', 'هوية', 'عقد توكيل', 'وكالة', 'ضبط جلسة', 'صك حكم', 'مذكرة استئناف', 'قرار استئناف', 'قرار 34', 'قرار 46', 'خطاب', 'مستند متابعة'].map((type) => <option key={type}>{type}</option>)}</select></label>
      <label className="wide">رابط المستند على Google Drive<input required type="url" dir="ltr" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://drive.google.com/..." /></label>
      <label>تاريخ المستند<input type="date" value={form.documentDate} onChange={(event) => setForm({ ...form, documentDate: event.target.value })} /></label>
      <label>ملاحظات<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      <fieldset className="document-links wide"><legend>ربط المستند بالسجلات</legend>{ownerGroups.filter((group) => group.items.length).map((group) => <section key={group.type}><h4>{group.title}</h4><div>{group.items.map((item) => { const checked = form.links.some((link) => link.type === group.type && link.id === item.id); return <label className="document-check" key={item.id}><input type="checkbox" checked={checked} onChange={() => toggleLink({ type: group.type, id: item.id })} />{item.label}</label> })}</div></section>)}</fieldset>
      <div className="form-actions"><button type="button" onClick={clear}>إلغاء</button></div>
    </form>}
    {documents.length ? <div className="table-wrap"><table><thead><tr><th>المستند</th><th>النوع</th><th>التاريخ</th><th>مرتبط بـ</th><th>الرابط</th><th>الإجراءات</th></tr></thead><tbody>{documents.map((document) => <tr key={document.id}><td><b>{document.name}</b>{document.notes && <small className="block">{document.notes}</small>}</td><td>{document.documentType}</td><td>{document.documentDate ? formatDate(document.documentDate) : '—'}</td><td><div className="document-badges">{document.links.map((link) => <span key={`${link.type}:${link.id}`}>{typeNames[link.type]}: {ownerLabel(link)}</span>)}</div></td><td><a className="document-open" href={document.url} target="_blank" rel="noreferrer">فتح المستند</a></td><td className="row-actions"><button onClick={() => edit(document)}>تعديل</button><button className="danger-link" onClick={() => setDeleteTarget({ id: document.id, name: document.name })}>حذف</button></td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>لا توجد مستندات مرتبطة</h3><p>أضف أول رابط لمستند محفوظ على Google Drive.</p></div>}
    {deleteTarget && <TwoStepDeleteDialog title="نقل المستند إلى سلة المحذوفات" message={`هل تريد نقل المستند «${deleteTarget.name}» إلى السلة؟`} onCancel={() => setDeleteTarget(undefined)} onConfirm={() => { store.moveToTrash('documents', deleteTarget.id); setDeleteTarget(undefined); refresh() }} />}
  </section>
}

function TrashPanel({ refresh }: { refresh: () => void }) {
  const [message, setMessage] = useState('')
  const entries = store.getTrash()
  const restore = (type: RecordType, id: string) => {
    try { store.restore(type, id); setMessage('تمت استعادة السجل بنجاح.'); refresh() }
    catch (error) { setMessage(error instanceof DataStoreError ? error.message : 'تعذرت استعادة السجل.') }
  }
  return <section className="panel">
    <div className="section-actions"><div><h3>سلة المحذوفات</h3><p className="muted">تُحذف السجلات نهائيًا تلقائيًا بعد 30 يومًا إذا لم تمنعها علاقات مرتبطة.</p></div></div>
    {message && <p className="notice" role="status">{message}</p>}
    {entries.length ? <div className="table-wrap"><table><thead><tr><th>النوع</th><th>السجل</th><th>تاريخ الحذف</th><th>المدة المتبقية</th><th>الاستعادة</th></tr></thead><tbody>
      {entries.map((entry) => <tr key={`${entry.type}:${entry.record.id}`}><td>{typeNames[entry.type]}</td><td>{entry.label}</td><td>{new Date(entry.record.deletedAt!).toLocaleString('ar-SA')}</td><td>{entry.daysRemaining} يومًا</td><td><button className="secondary" disabled={Boolean(entry.blockedReason)} title={entry.blockedReason} onClick={() => restore(entry.type, entry.record.id)}>استعادة</button>{entry.blockedReason && <small className="block blocked-reason">{entry.blockedReason}</small>}</td></tr>)}
    </tbody></table></div> : <div className="empty-state"><h3>السلة فارغة</h3><p>لا توجد سجلات محذوفة حاليًا.</p></div>}
  </section>
}

function ClientsPanel({ clients, cases, sessions, refresh }: { clients: ReturnType<DataStore['snapshot']>['clients']; cases: ReturnType<DataStore['snapshot']>['cases']; sessions: ReturnType<DataStore['snapshot']>['sessions']; refresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string>()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string }>()
  const [draggedId, setDraggedId] = useState<string>()
  const [name, setName] = useState('')
  const [clientType, setClientType] = useState<ClientType>('استشارة')
  const [phone, setPhone] = useState('')
  const [nationalId, setNationalId] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState('')
  const [iban, setIban] = useState('')
  const [formError, setFormError] = useState('')
  const orderedClients = [...clients].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const normalizedName = name.trim()
    const normalizedPhone = phone.trim()
    if (!normalizedName) return setFormError('أدخل اسم العميل قبل الحفظ.')
    if (!normalizedPhone) return setFormError('أدخل رقم الجوال قبل الحفظ.')
    if (!/^[0-9٠-٩+()\s-]{7,20}$/.test(normalizedPhone)) return setFormError('أدخل رقم جوال صالحًا قبل الحفظ.')
    if (!gender) return setFormError('اختر الجنس أو «شركة» قبل الحفظ.')
    setFormError('')
    const input = { name: normalizedName, clientType, phone: normalizedPhone, nationalId, birthDate, gender, iban, registeredAt: editingId ? clients.find((client) => client.id === editingId)?.registeredAt ?? new Date().toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10) }
    if (editingId) store.updateClient(editingId, input); else store.addClient(input)
    clearForm(); refresh()
  }
  const clearForm = () => { setName(''); setPhone(''); setNationalId(''); setBirthDate(''); setGender(''); setIban(''); setClientType('استشارة'); setFormError(''); setEditingId(undefined); setShowForm(false) }
  const edit = (id: string) => {
    const client = clients.find((item) => item.id === id); if (!client) return
    setEditingId(id); setName(client.name); setClientType(client.clientType); setPhone(client.phone ?? ''); setNationalId(client.nationalId ?? ''); setBirthDate(client.birthDate ?? ''); setGender(client.gender ?? ''); setIban(client.iban ?? ''); setFormError(''); setShowForm(true)
  }
  return <section className="panel">
    <div className="section-actions"><h3>العملاء</h3><div className="section-actions-buttons"><button className="secondary" onClick={() => { const nextFor = (clientId: string) => { const caseIds = cases.filter((legalCase) => legalCase.clientId === clientId).map((legalCase) => legalCase.id); return sessions.filter((session) => caseIds.includes(session.caseId) && session.status === 'جديدة').map((session) => `${session.date}${session.time ?? ''}`).sort()[0] ?? '9999' }; store.reorderClients([...clients].sort((a, b) => nextFor(a.id).localeCompare(nextFor(b.id))).map((client) => client.id)); refresh() }}>إعادة الترتيب حسب الموعد الأقرب</button>{showForm ? <button className="primary" type="submit" form="client-form">{editingId ? 'حفظ التعديل' : 'حفظ العميل'}</button> : <button className="primary" onClick={() => { clearForm(); setShowForm(true) }}>إضافة عميل</button>}</div></div>
    {showForm && <form id="client-form" className="record-form" noValidate onSubmit={submit}>
      <p className="form-help wide">الحقول المعلّمة بـ <b>*</b> إلزامية قبل الحفظ.</p>
      <label>اسم العميل <b>*</b><input autoFocus value={name} onChange={(event) => { setName(event.target.value); setFormError('') }} /></label>
      <label>نوع العميل<select value={clientType} onChange={(event) => setClientType(event.target.value as ClientType)}>{['استشارة', 'تعقيب', 'عقد توكيل', 'عن بعد'].map((type) => <option key={type}>{type}</option>)}</select></label>
      <label>رقم الجوال <b>*</b><input inputMode="tel" value={phone} onChange={(event) => { setPhone(event.target.value); setFormError('') }} /></label>
      <label>رقم الهوية<input value={nationalId} onChange={(event) => setNationalId(event.target.value)} /></label>
      <label>تاريخ الميلاد<input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></label>
      <label>الجنس <b>*</b><select value={gender} onChange={(event) => { setGender(event.target.value); setFormError('') }}><option value="">اختر</option>{['ذكر', 'أنثى', 'شركة', 'أخرى'].map((option) => <option key={option}>{option}</option>)}</select></label>
      <label>رقم الآيبان<input value={iban} onChange={(event) => setIban(event.target.value)} /></label>
      {formError && <p className="form-error wide" role="alert">{formError}</p>}
      <div className="form-actions"><button type="button" onClick={clearForm}>إلغاء</button></div>
    </form>}
    <div className="table-wrap"><table><thead><tr><th>العميل</th><th>مرتبط بـ</th><th>نوع العميل</th><th>تاريخ التسجيل</th><th>الإجراء</th></tr></thead><tbody>
      {orderedClients.map((client) => { const linked = cases.filter((legalCase) => legalCase.clientId === client.id); return <tr draggable onDragStart={() => setDraggedId(client.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (!draggedId || draggedId === client.id) return; const reordered = [...orderedClients]; const from = reordered.findIndex((item) => item.id === draggedId); const to = reordered.findIndex((item) => item.id === client.id); reordered.splice(to, 0, reordered.splice(from, 1)[0]); store.reorderClients(reordered.map((item) => item.id)); setDraggedId(undefined); refresh() }} key={client.id}><td>{client.name}</td><td>{linked.length ? linked.map((legalCase) => legalCase.caseNumber).join('، ') : '—'}</td><td>{client.clientType}</td><td>{client.registeredAt}</td><td className="row-actions"><button onClick={() => edit(client.id)}>تعديل</button><button className="danger-link" onClick={() => setDeleteTarget({ id: client.id, name: client.name })}>حذف</button></td></tr> })}
    </tbody></table></div>
    {deleteTarget && <TwoStepDeleteDialog title="نقل العميل إلى سلة المحذوفات" message={`هل تريد نقل العميل «${deleteTarget.name}» إلى السلة؟`} onCancel={() => setDeleteTarget(undefined)} onConfirm={() => { store.moveToTrash('clients', deleteTarget.id); setDeleteTarget(undefined); refresh() }} />}
  </section>
}

function CasesPanel({ clients, cases, sessions, refresh }: { clients: ReturnType<DataStore['snapshot']>['clients']; cases: ReturnType<DataStore['snapshot']>['cases']; sessions: ReturnType<DataStore['snapshot']>['sessions']; refresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string>()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; number: string }>()
  const [draggedId, setDraggedId] = useState<string>()
  const empty = { caseNumber: '', classification: '', clientId: '', opponentName: '', status: 'قيد النظر' as CaseStatus, previousActionDate: '', nextActionDate: '', assignedLawyer: '', originalAgencyNumber: '', assignedAgencyNumber: '', agencyExpiryDate: '', najizUrl: '', driveFolderUrl: '' }
  const [form, setForm] = useState(empty)
  const set = (field: keyof typeof empty, value: string) => setForm((current) => ({ ...current, [field]: value }))
  const clear = () => { setForm(empty); setEditingId(undefined); setShowForm(false) }
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); if (!form.caseNumber.trim() || !form.clientId || !form.opponentName.trim()) return
    const input = { ...form, caseNumber: form.caseNumber.trim(), opponentName: form.opponentName.trim() }
    if (editingId) store.updateCase(editingId, input); else store.addCase(input)
    clear(); refresh()
  }
  const edit = (legalCase: typeof cases[number]) => { setEditingId(legalCase.id); setForm({ ...empty, ...legalCase }); setShowForm(true) }
  const orderedCases = [...cases].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const renderCasesTable = (rows: typeof cases) => <div className="table-wrap"><table><thead><tr><th>رقم القضية</th><th>العميل ضد الخصم</th><th>الحالة</th><th>المحامي المكلف</th><th>الإجراء</th></tr></thead><tbody>
    {rows.map((legalCase) => { const client = clients.find((item) => item.id === legalCase.clientId); return <tr draggable onDragStart={() => setDraggedId(legalCase.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (!draggedId || draggedId === legalCase.id) return; const reordered = [...rows]; const from = reordered.findIndex((item) => item.id === draggedId); const to = reordered.findIndex((item) => item.id === legalCase.id); reordered.splice(to, 0, reordered.splice(from, 1)[0]); store.reorderCases(reordered.map((item) => item.id)); setDraggedId(undefined); refresh() }} key={legalCase.id}><td>{legalCase.caseNumber}</td><td>{client?.name ?? 'عميل في سلة المحذوفات'} ضد {legalCase.opponentName}</td><td>{legalCase.status}</td><td>{legalCase.assignedLawyer || '—'}</td><td className="row-actions"><button onClick={() => edit(legalCase)}>تعديل</button><button className="danger-link" onClick={() => setDeleteTarget({ id: legalCase.id, number: legalCase.caseNumber })}>حذف</button></td></tr> })}
  </tbody></table></div>
  return <section className="panel">
    <div className="section-actions"><h3>القضايا</h3><div className="section-actions-buttons"><button className="secondary" onClick={() => { const nextFor = (caseId: string) => sessions.filter((session) => session.caseId === caseId && session.status === 'جديدة').map((session) => `${session.date}${session.time ?? ''}`).sort()[0] ?? cases.find((legalCase) => legalCase.id === caseId)?.nextActionDate ?? '9999'; store.reorderCases([...cases].sort((a, b) => nextFor(a.id).localeCompare(nextFor(b.id))).map((legalCase) => legalCase.id)); refresh() }}>إعادة الترتيب حسب الموعد الأقرب</button>{showForm ? <button className="primary" type="submit" form="case-form">{editingId ? 'حفظ التعديل' : 'حفظ القضية'}</button> : <button className="primary" onClick={() => { clear(); setShowForm(true) }}>إضافة قضية</button>}</div></div>
    {showForm && <form id="case-form" className="record-form case-form" onSubmit={submit}>
      <label>رقم القضية<input required value={form.caseNumber} onChange={(event) => set('caseNumber', event.target.value)} /></label>
      <label>تصنيف القضية<input value={form.classification} onChange={(event) => set('classification', event.target.value)} /></label>
      <label>العميل<select required value={form.clientId} onChange={(event) => set('clientId', event.target.value)}><option value="">اختر العميل</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
      <label>اسم الخصم<input required value={form.opponentName} onChange={(event) => set('opponentName', event.target.value)} /></label>
      <label>الحالة<select value={form.status} onChange={(event) => set('status', event.target.value)}>{['صلح', 'تحرير', 'قيد النظر', 'متوقفة', 'مشطوبة', 'استئناف', 'منتهية'].map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>تاريخ الإجراء السابق<input type="date" value={form.previousActionDate} onChange={(event) => set('previousActionDate', event.target.value)} /></label>
      <label>تاريخ الإجراء القادم<input type="date" value={form.nextActionDate} onChange={(event) => set('nextActionDate', event.target.value)} /></label>
      <label>المحامي المكلف<input value={form.assignedLawyer} onChange={(event) => set('assignedLawyer', event.target.value)} /></label>
      <label>رقم الوكالة الأصلية<input value={form.originalAgencyNumber} onChange={(event) => set('originalAgencyNumber', event.target.value)} /></label>
      <label>رقم وكالة المكلف<input value={form.assignedAgencyNumber} onChange={(event) => set('assignedAgencyNumber', event.target.value)} /></label>
      <label>تاريخ انتهاء الوكالة<input type="date" value={form.agencyExpiryDate} onChange={(event) => set('agencyExpiryDate', event.target.value)} /></label>
      <label>رابط القضية على ناجز<input type="url" dir="ltr" value={form.najizUrl} onChange={(event) => set('najizUrl', event.target.value)} /></label>
      <label>رابط أو مجلد Drive<input type="url" dir="ltr" value={form.driveFolderUrl} onChange={(event) => set('driveFolderUrl', event.target.value)} /></label>
      {editingId && <section className="case-history"><h4>سجل الجلسات</h4>{sessions.filter((session) => session.caseId === editingId).length ? sessions.filter((session) => session.caseId === editingId).sort((a, b) => a.date.localeCompare(b.date)).map((session) => <article key={session.id}><div><b>{formatDate(session.date)}</b> · {session.time || 'بدون وقت'} <span className={`status ${session.status === 'جديدة' ? 'new' : 'done'}`}>{session.status}</span></div>{session.status === 'منتهية' && <><p><b>الملخص:</b> {session.summary || '—'}</p><p><b>القرارات:</b> {session.decisions || '—'}</p></>}</article>) : <p>لا توجد جلسات مرتبطة بهذه القضية.</p>}</section>}
      <div className="form-actions"><button type="button" onClick={clear}>إلغاء</button></div>
    </form>}
    <h4 className="table-title">القضايا الحالية</h4>
    {renderCasesTable(orderedCases.filter((legalCase) => legalCase.status !== 'منتهية'))}
    <h4 className="table-title ended-title">القضايا المنتهية</h4>
    {renderCasesTable(orderedCases.filter((legalCase) => legalCase.status === 'منتهية'))}
    {deleteTarget && <TwoStepDeleteDialog title="نقل القضية إلى سلة المحذوفات" message={`هل تريد نقل القضية «${deleteTarget.number}» إلى السلة؟`} onCancel={() => setDeleteTarget(undefined)} onConfirm={() => { store.moveToTrash('cases', deleteTarget.id); setDeleteTarget(undefined); refresh() }} />}
  </section>
}

function SessionsPanel({ clients, cases, sessions, refresh }: { clients: ReturnType<DataStore['snapshot']>['clients']; cases: ReturnType<DataStore['snapshot']>['cases']; sessions: ReturnType<DataStore['snapshot']>['sessions']; refresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string>()
  const [confirmPrevious, setConfirmPrevious] = useState<string>()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; date: string }>()
  const [draggedId, setDraggedId] = useState<string>()
  const empty = { caseId: '', date: '', time: '', status: 'جديدة' as 'جديدة' | 'منتهية', summary: '', decisions: '', sortOrder: 0 }
  const [form, setForm] = useState(empty)
  const selectedCase = cases.find((legalCase) => legalCase.id === form.caseId)
  const selectedClient = clients.find((client) => client.id === selectedCase?.clientId)
  const clear = () => { setForm(empty); setEditingId(undefined); setShowForm(false) }
  const save = (endPrevious = false) => {
    const input = { ...form, sortOrder: form.sortOrder || Date.parse(form.date) }
    const prior = sessions.find((session) => session.caseId === form.caseId && session.status === 'جديدة' && session.id !== editingId)
    if (prior && form.status === 'جديدة' && !endPrevious) { setConfirmPrevious(prior.id); return }
    if (prior && form.status === 'جديدة') store.updateSession(prior.id, { ...prior, status: 'منتهية' })
    if (editingId) store.updateSession(editingId, input); else store.addSession(input)
    clear(); setConfirmPrevious(undefined); refresh()
  }
  const edit = (session: typeof sessions[number]) => { setEditingId(session.id); setForm({ caseId: session.caseId, date: session.date, time: session.time ?? '', status: session.status, summary: session.summary ?? '', decisions: session.decisions ?? '', sortOrder: session.sortOrder }); setShowForm(true) }
  const ordered = [...sessions].sort((a, b) => a.sortOrder - b.sortOrder || `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`))
  const renderSessionsTable = (rows: typeof sessions) => <div className="table-wrap"><table><thead><tr><th>اليوم</th><th>تاريخ الجلسة</th><th>الوقت</th><th>رقم القضية</th><th>القضية</th><th>تصنيف القضية</th><th>المحامي</th><th>انتهاء الوكالة</th><th>حالة الجلسة</th><th>الإجراءات</th></tr></thead><tbody>
    {rows.map((session) => { const legalCase = cases.find((item) => item.id === session.caseId); const client = clients.find((item) => item.id === legalCase?.clientId); return <tr draggable onDragStart={() => setDraggedId(session.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (!draggedId || draggedId === session.id) return; const reordered = [...rows]; const from = reordered.findIndex((item) => item.id === draggedId); const to = reordered.findIndex((item) => item.id === session.id); reordered.splice(to, 0, reordered.splice(from, 1)[0]); store.reorderSessions(reordered.map((item) => item.id)); setDraggedId(undefined); refresh() }} key={session.id}><td>{new Intl.DateTimeFormat('ar-SA', { weekday: 'long' }).format(new Date(`${session.date}T12:00:00`))}</td><td>{formatDate(session.date)}</td><td>{session.time || '—'}</td><td>{legalCase?.caseNumber ?? 'قضية في السلة'}</td><td>{client?.name ?? 'عميل في السلة'} ضد {legalCase?.opponentName ?? '—'}</td><td>{legalCase?.classification || '—'}</td><td>{legalCase?.assignedLawyer || '—'}</td><td>{legalCase?.agencyExpiryDate || '—'}</td><td><span className={`status ${session.status === 'جديدة' ? 'new' : 'done'}`}>{session.status}</span></td><td className="row-actions"><button onClick={() => edit(session)}>تعديل</button><button className="danger-link" onClick={() => setDeleteTarget({ id: session.id, date: formatDate(session.date) })}>حذف</button></td></tr> })}
  </tbody></table></div>
  return <section className="panel">
    <div className="section-actions"><h3>الجلسات</h3><div className="section-actions-buttons"><button className="secondary" onClick={() => { store.reorderSessions([...sessions].sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`)).map((session) => session.id)); refresh() }}>إعادة الترتيب حسب الموعد الأقرب</button><button className="primary" onClick={() => { clear(); setShowForm(true) }}>إضافة جلسة</button></div></div>
    {showForm && <form className="record-form case-form" onSubmit={(event) => { event.preventDefault(); if (form.caseId && form.date) save() }}>
      <label>القضية<select required value={form.caseId} onChange={(event) => setForm({ ...form, caseId: event.target.value })}><option value="">اختر القضية</option>{cases.map((legalCase) => { const client = clients.find((item) => item.id === legalCase.clientId); return <option key={legalCase.id} value={legalCase.id}>{legalCase.caseNumber} ({client?.name ?? 'عميل في السلة'} ضد {legalCase.opponentName})</option> })}</select></label>
      <label>تاريخ الجلسة<input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
      <label>وقت الجلسة<input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></label>
      <label>حالة الجلسة<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as 'جديدة' | 'منتهية' })}><option>جديدة</option><option>منتهية</option></select></label>
      {selectedCase && <article className="linked-case"><h4>بيانات القضية المرتبطة</h4><p><b>الأطراف:</b> {selectedClient?.name} ضد {selectedCase.opponentName}</p><p><b>التصنيف:</b> {selectedCase.classification || '—'} &nbsp; <b>المحامي:</b> {selectedCase.assignedLawyer || '—'}</p><p><b>الوكالات:</b> {selectedCase.originalAgencyNumber || '—'} / {selectedCase.assignedAgencyNumber || '—'}</p><p>{selectedCase.najizUrl && <a href={selectedCase.najizUrl} target="_blank">رابط ناجز</a>} {selectedCase.driveFolderUrl && <a href={selectedCase.driveFolderUrl} target="_blank">مجلد Drive</a>}</p></article>}
      <label className="wide">ملخص الجلسة<textarea value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} /></label>
      <label className="wide">قرارات الجلسة<textarea value={form.decisions} onChange={(event) => setForm({ ...form, decisions: event.target.value })} /></label>
      <div className="form-actions"><button type="button" onClick={clear}>إلغاء</button><button className="primary" type="submit">{editingId ? 'حفظ التعديل' : 'حفظ الجلسة'}</button></div>
    </form>}
    <h4 className="table-title">الجلسات الجديدة</h4>
    {renderSessionsTable(ordered.filter((session) => session.status === 'جديدة'))}
    <h4 className="table-title ended-title">الجلسات المنتهية</h4>
    {renderSessionsTable(ordered.filter((session) => session.status === 'منتهية'))}
    {confirmPrevious && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="delete-dialog"><h3>جلسة جديدة موجودة</h3><p>توجد جلسة جديدة لهذه القضية. هل تريد إنهاء الجلسة السابقة ثم إنشاء هذه الجلسة؟</p><div className="form-actions"><button onClick={() => setConfirmPrevious(undefined)}>إلغاء</button><button className="primary" onClick={() => save(true)}>موافق، إنهاء السابقة</button></div></div></div>}
    {deleteTarget && <TwoStepDeleteDialog title="نقل الجلسة إلى سلة المحذوفات" message={`هل تريد نقل جلسة ${deleteTarget.date} إلى السلة؟`} onCancel={() => setDeleteTarget(undefined)} onConfirm={() => { store.moveToTrash('sessions', deleteTarget.id); setDeleteTarget(undefined); refresh() }} />}
  </section>
}

function TransactionsPanel({ clients, cases, transactions, refresh }: { clients: ReturnType<DataStore['snapshot']>['clients']; cases: ReturnType<DataStore['snapshot']>['cases']; transactions: ReturnType<DataStore['snapshot']>['transactions']; refresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string>()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string }>()
  const [draggedId, setDraggedId] = useState<string>()
  const empty = { statement: '', caseId: '', clientName: '', opponentName: '', reviewDate: '', nextDate: '', notes: '', status: 'مستمرة' as TransactionStatus, sortOrder: 0 }
  const [form, setForm] = useState(empty)
  const selectedCase = cases.find((legalCase) => legalCase.id === form.caseId)
  const selectedClient = clients.find((client) => client.id === selectedCase?.clientId)
  const set = (field: keyof typeof empty, value: string) => setForm((current) => ({ ...current, [field]: value }))
  const clear = () => { setForm(empty); setEditingId(undefined); setShowForm(false) }
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); if (!form.statement.trim()) return
    const input = { ...form, caseId: form.caseId || undefined, clientName: selectedCase ? selectedClient?.name : form.clientName, opponentName: selectedCase ? selectedCase.opponentName : form.opponentName, sortOrder: form.sortOrder || Date.parse(form.nextDate || form.reviewDate || '9999-12-31') }
    if (editingId) store.updateTransaction(editingId, input); else store.addTransaction(input)
    clear(); refresh()
  }
  const edit = (transaction: typeof transactions[number]) => { setEditingId(transaction.id); setForm({ statement: transaction.statement, caseId: transaction.caseId ?? '', clientName: transaction.clientName ?? '', opponentName: transaction.opponentName ?? '', reviewDate: transaction.reviewDate ?? '', nextDate: transaction.nextDate ?? '', notes: transaction.notes ?? '', status: transaction.status, sortOrder: transaction.sortOrder }); setShowForm(true) }
  const ordered = [...transactions].sort((a, b) => a.sortOrder - b.sortOrder)
  return <section className="panel">
    <div className="section-actions"><h3>المعاملات</h3><div className="section-actions-buttons"><button className="secondary" onClick={() => { store.reorderTransactions([...transactions].sort((a, b) => (a.nextDate || a.reviewDate || '9999').localeCompare(b.nextDate || b.reviewDate || '9999')).map((item) => item.id)); refresh() }}>إعادة الترتيب حسب الموعد الأقرب</button><button className="primary" onClick={() => { clear(); setShowForm(true) }}>إضافة معاملة</button></div></div>
    {showForm && <form className="record-form" onSubmit={submit}>
      <label className="wide">بيان المعاملة<input required value={form.statement} onChange={(event) => set('statement', event.target.value)} /></label>
      <label>القضية (اختياري)<select value={form.caseId} onChange={(event) => set('caseId', event.target.value)}><option value="">بدون قضية</option>{cases.map((legalCase) => { const client = clients.find((item) => item.id === legalCase.clientId); return <option key={legalCase.id} value={legalCase.id}>{legalCase.caseNumber} ({client?.name ?? 'عميل في السلة'} ضد {legalCase.opponentName})</option> })}</select></label>
      <label>اسم العميل<input disabled={Boolean(selectedCase)} value={selectedCase ? selectedClient?.name ?? '' : form.clientName} onChange={(event) => set('clientName', event.target.value)} /></label>
      <label>اسم الخصم<input disabled={Boolean(selectedCase)} value={selectedCase ? selectedCase.opponentName : form.opponentName} onChange={(event) => set('opponentName', event.target.value)} /></label>
      <label>تاريخ المراجعة<input type="date" value={form.reviewDate} onChange={(event) => set('reviewDate', event.target.value)} /></label>
      <label>التاريخ القادم<input type="date" value={form.nextDate} onChange={(event) => set('nextDate', event.target.value)} /></label>
      <label>الحالة<select value={form.status} onChange={(event) => set('status', event.target.value)}>{['مستمرة', 'معلقة', 'منتهية'].map((status) => <option key={status}>{status}</option>)}</select></label>
      <label className="wide">الملاحظات<textarea value={form.notes} onChange={(event) => set('notes', event.target.value)} /></label>
      <div className="form-actions"><button type="button" onClick={clear}>إلغاء</button><button className="primary" type="submit">{editingId ? 'حفظ التعديل' : 'حفظ المعاملة'}</button></div>
    </form>}
    <div className="table-wrap"><table><thead><tr><th>بيان المعاملة</th><th>القضية</th><th>الأطراف</th><th>تاريخ المراجعة</th><th>التاريخ القادم</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{ordered.map((transaction) => { const legalCase = cases.find((item) => item.id === transaction.caseId); const client = clients.find((item) => item.id === legalCase?.clientId); return <tr draggable onDragStart={() => setDraggedId(transaction.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (!draggedId || draggedId === transaction.id) return; const reordered = [...ordered]; const from = reordered.findIndex((item) => item.id === draggedId); const to = reordered.findIndex((item) => item.id === transaction.id); reordered.splice(to, 0, reordered.splice(from, 1)[0]); store.reorderTransactions(reordered.map((item) => item.id)); setDraggedId(undefined); refresh() }} key={transaction.id}><td>{transaction.statement}</td><td>{legalCase?.caseNumber ?? '—'}</td><td>{client?.name ?? transaction.clientName ?? '—'} ضد {legalCase?.opponentName ?? transaction.opponentName ?? '—'}</td><td>{transaction.reviewDate || '—'}</td><td>{transaction.nextDate ? formatDate(transaction.nextDate) : '—'}</td><td>{transaction.status}</td><td className="row-actions"><button onClick={() => edit(transaction)}>تعديل</button><button className="danger-link" onClick={() => setDeleteTarget({ id: transaction.id, name: transaction.statement })}>حذف</button></td></tr> })}</tbody></table></div>
    {deleteTarget && <TwoStepDeleteDialog title="نقل المعاملة إلى سلة المحذوفات" message={`هل تريد نقل المعاملة «${deleteTarget.name}» إلى السلة؟`} onCancel={() => setDeleteTarget(undefined)} onConfirm={() => { store.moveToTrash('transactions', deleteTarget.id); setDeleteTarget(undefined); refresh() }} />}
  </section>
}

function TasksPanel({ clients, cases, tasks, refresh }: { clients: ReturnType<DataStore['snapshot']>['clients']; cases: ReturnType<DataStore['snapshot']>['cases']; tasks: ReturnType<DataStore['snapshot']>['tasks']; refresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string>()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string }>()
  const [draggedId, setDraggedId] = useState<string>()
  const empty = { statement: '', caseId: '', clientName: '', taskDate: '', nextDate: '', assignee: '', notes: '', status: 'جديدة' as TaskStatus, sortOrder: 0 }
  const [form, setForm] = useState(empty)
  const set = (field: keyof typeof empty, value: string) => setForm((current) => ({ ...current, [field]: value }))
  const clear = () => { setForm(empty); setEditingId(undefined); setShowForm(false) }
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); if (!form.statement.trim()) return
    const input = { ...form, caseId: form.caseId || undefined, sortOrder: form.sortOrder || Date.parse(form.nextDate || form.taskDate || '9999-12-31') }
    if (editingId) store.updateTask(editingId, input); else store.addTask(input)
    clear(); refresh()
  }
  const edit = (task: typeof tasks[number]) => { setEditingId(task.id); setForm({ statement: task.statement, caseId: task.caseId ?? '', clientName: task.clientName ?? '', taskDate: task.taskDate ?? '', nextDate: task.nextDate ?? '', assignee: task.assignee ?? '', notes: task.notes ?? '', status: task.status, sortOrder: task.sortOrder }); setShowForm(true) }
  const ordered = [...tasks].sort((a, b) => a.sortOrder - b.sortOrder)
  return <section className="panel">
    <div className="section-actions"><h3>المهام</h3><div className="section-actions-buttons"><button className="secondary" onClick={() => { store.reorderTasks([...tasks].sort((a, b) => (a.nextDate || a.taskDate || '9999').localeCompare(b.nextDate || b.taskDate || '9999')).map((task) => task.id)); refresh() }}>إعادة الترتيب حسب الموعد الأقرب</button><button className="primary" onClick={() => { clear(); setShowForm(true) }}>إضافة مهمة</button></div></div>
    {showForm && <form className="record-form" onSubmit={submit}>
      <label className="wide">بيان المهمة<input required autoFocus value={form.statement} onChange={(event) => set('statement', event.target.value)} placeholder="مثال: إعداد مذكرة أو التواصل مع العميل" /></label>
      <label>القضية (اختياري)<select value={form.caseId} onChange={(event) => { const caseId = event.target.value; const legalCase = cases.find((item) => item.id === caseId); const client = clients.find((item) => item.id === legalCase?.clientId); setForm((current) => ({ ...current, caseId, clientName: client?.name ?? current.clientName })) }}><option value="">بدون قضية</option>{cases.map((legalCase) => { const client = clients.find((item) => item.id === legalCase.clientId); return <option key={legalCase.id} value={legalCase.id}>{legalCase.caseNumber} ({client?.name ?? 'عميل في السلة'} ضد {legalCase.opponentName})</option> })}</select></label>
      <label>العميل (نص اختياري)<input value={form.clientName} onChange={(event) => set('clientName', event.target.value)} /></label>
      <label>تاريخ المهمة<input type="date" value={form.taskDate} onChange={(event) => set('taskDate', event.target.value)} /></label>
      <label>التاريخ القادم<input type="date" value={form.nextDate} onChange={(event) => set('nextDate', event.target.value)} /></label>
      <label>المسؤول<input value={form.assignee} onChange={(event) => set('assignee', event.target.value)} /></label>
      <label>الحالة<select value={form.status} onChange={(event) => set('status', event.target.value)}>{['جديدة', 'قيد التنفيذ', 'مؤجلة', 'منجزة', 'ملغاة'].map((status) => <option key={status}>{status}</option>)}</select></label>
      <label className="wide">الملاحظات<textarea value={form.notes} onChange={(event) => set('notes', event.target.value)} /></label>
      <div className="form-actions"><button type="button" onClick={clear}>إلغاء</button><button className="primary" type="submit">{editingId ? 'حفظ التعديل' : 'حفظ المهمة'}</button></div>
    </form>}
    <div className="table-wrap"><table><thead><tr><th>بيان المهمة</th><th>رقم القضية</th><th>العميل</th><th>تاريخ المهمة</th><th>التاريخ القادم</th><th>المسؤول</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{ordered.map((task) => { const legalCase = cases.find((item) => item.id === task.caseId); return <tr draggable onDragStart={() => setDraggedId(task.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (!draggedId || draggedId === task.id) return; const reordered = [...ordered]; const from = reordered.findIndex((item) => item.id === draggedId); const to = reordered.findIndex((item) => item.id === task.id); reordered.splice(to, 0, reordered.splice(from, 1)[0]); store.reorderTasks(reordered.map((item) => item.id)); setDraggedId(undefined); refresh() }} key={task.id}><td>{task.statement}</td><td>{legalCase?.caseNumber ?? '—'}</td><td>{task.clientName || '—'}</td><td>{task.taskDate || '—'}</td><td>{task.nextDate ? formatDate(task.nextDate) : '—'}</td><td>{task.assignee || '—'}</td><td>{task.status}</td><td className="row-actions"><button onClick={() => edit(task)}>تعديل</button><button className="danger-link" onClick={() => setDeleteTarget({ id: task.id, name: task.statement })}>حذف</button></td></tr> })}</tbody></table></div>
    {deleteTarget && <TwoStepDeleteDialog title="نقل المهمة إلى سلة المحذوفات" message={`هل تريد نقل المهمة «${deleteTarget.name}» إلى السلة؟`} onCancel={() => setDeleteTarget(undefined)} onConfirm={() => { store.moveToTrash('tasks', deleteTarget.id); setDeleteTarget(undefined); refresh() }} />}
  </section>
}

function ExecutionsPanel({ clients, cases, judgments, executions, refresh }: { clients: ReturnType<DataStore['snapshot']>['clients']; cases: ReturnType<DataStore['snapshot']>['cases']; judgments: ReturnType<DataStore['snapshot']>['judgments']; executions: ReturnType<DataStore['snapshot']>['executions']; refresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string>()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; number: string }>()
  const [followDeleteTarget, setFollowDeleteTarget] = useState<{ id: string; action: string }>()
  const [draggedId, setDraggedId] = useState<string>()
  const [caseEntryMode, setCaseEntryMode] = useState<'existing' | 'manual'>('existing')
  const [judgmentEntryMode, setJudgmentEntryMode] = useState<'existing' | 'manual'>('existing')
  const empty = { requestNumber: '', claimant: '', respondent: '', court: '', circuitNumber: '', caseId: '', externalCaseNumber: '', judgmentId: '', externalJudgmentNumber: '', notes: '', decision34Number: '', decision34Date: '', decision46Number: '', decision46Date: '', status: 'قيد التنفيذ' as ExecutionStatus, followUps: [] as ExecutionFollowUp[], sortOrder: 0 }
  const emptyFollow = { actionDate: '', action: '', performedBy: '', result: '', nextAction: '', nextDate: '', notes: '', createTask: false }
  const [form, setForm] = useState(empty)
  const [follow, setFollow] = useState(emptyFollow)
  const set = (field: keyof typeof empty, value: string) => setForm((current) => ({ ...current, [field]: value }))
  const clear = () => { setForm(empty); setFollow(emptyFollow); setEditingId(undefined); setCaseEntryMode('existing'); setJudgmentEntryMode('existing'); setShowForm(false) }
  const addFollowUp = () => {
    if (!follow.action.trim()) return
    setForm((current) => ({ ...current, followUps: [...current.followUps, { ...follow, id: crypto.randomUUID() }] }))
    setFollow(emptyFollow)
  }
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); if (!form.requestNumber.trim() || !form.claimant.trim() || !form.respondent.trim() || !(form.caseId || form.externalCaseNumber.trim()) || !(form.judgmentId || form.externalJudgmentNumber.trim())) return
    let input = { ...form, caseId: form.caseId || undefined, externalCaseNumber: form.externalCaseNumber || undefined, judgmentId: form.judgmentId || undefined, externalJudgmentNumber: form.externalJudgmentNumber || undefined, sortOrder: form.sortOrder || Math.min(...form.followUps.map((item) => Date.parse(item.nextDate || '9999-12-31')), Date.parse('9999-12-31')) }
    const execution = editingId ? (store.updateExecution(editingId, input), { id: editingId }) : store.addExecution(input)
    input = { ...input, followUps: input.followUps.map((item) => {
      if (item.createTask && !item.taskCreated && item.nextAction) {
        const legalCase = cases.find((record) => record.id === input.caseId); const client = clients.find((record) => record.id === legalCase?.clientId)
        store.addTask({ statement: item.nextAction, caseId: input.caseId, executionId: execution.id, clientName: client?.name, taskDate: item.actionDate, nextDate: item.nextDate, assignee: item.performedBy, notes: item.notes, status: 'جديدة', sortOrder: Date.parse(item.nextDate || '9999-12-31') })
        return { ...item, taskCreated: true }
      }
      return item
    }) }
    store.updateExecution(execution.id, input); clear(); refresh()
  }
  const edit = (execution: typeof executions[number]) => { setEditingId(execution.id); setCaseEntryMode(execution.caseId ? 'existing' : 'manual'); setJudgmentEntryMode(execution.judgmentId ? 'existing' : 'manual'); setForm({ requestNumber: execution.requestNumber, claimant: execution.claimant, respondent: execution.respondent, court: execution.court ?? '', circuitNumber: execution.circuitNumber ?? '', caseId: execution.caseId ?? '', externalCaseNumber: execution.externalCaseNumber ?? '', judgmentId: execution.judgmentId ?? '', externalJudgmentNumber: execution.externalJudgmentNumber ?? '', notes: execution.notes ?? '', decision34Number: execution.decision34Number ?? '', decision34Date: execution.decision34Date ?? '', decision46Number: execution.decision46Number ?? '', decision46Date: execution.decision46Date ?? '', status: execution.status, followUps: execution.followUps, sortOrder: execution.sortOrder }); setShowForm(true) }
  const ordered = [...executions].sort((a, b) => a.sortOrder - b.sortOrder)
  const nextStep = (execution: typeof executions[number]) => [...execution.followUps].reverse().find((item) => item.nextAction)
  const renderTable = (rows: typeof executions) => <div className="table-wrap"><table><thead><tr><th>رقم الطلب</th><th>طالب التنفيذ ضد المنفذ ضده</th><th>حالة التنفيذ</th><th>الإجراء القادم</th><th>موعده</th><th>الإجراءات</th></tr></thead><tbody>{rows.map((execution) => { const next = nextStep(execution); return <tr draggable onDragStart={() => setDraggedId(execution.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (!draggedId || draggedId === execution.id) return; const reordered = [...rows]; const from = reordered.findIndex((item) => item.id === draggedId); const to = reordered.findIndex((item) => item.id === execution.id); reordered.splice(to, 0, reordered.splice(from, 1)[0]); store.reorderExecutions(reordered.map((item) => item.id)); setDraggedId(undefined); refresh() }} key={execution.id}><td>{execution.requestNumber}</td><td>{execution.claimant} ضد {execution.respondent}</td><td>{execution.status}</td><td>{next?.nextAction || '—'}</td><td>{next?.nextDate ? formatDate(next.nextDate) : '—'}</td><td className="row-actions"><button onClick={() => edit(execution)}>تعديل</button><button className="danger-link" onClick={() => setDeleteTarget({ id: execution.id, number: execution.requestNumber })}>حذف</button></td></tr> })}</tbody></table></div>
  return <section className="panel">
    <div className="section-actions"><h3>التنفيذ</h3><div className="section-actions-buttons"><button className="secondary" onClick={() => { store.reorderExecutions([...executions].sort((a, b) => (nextStep(a)?.nextDate || '9999').localeCompare(nextStep(b)?.nextDate || '9999')).map((item) => item.id)); refresh() }}>إعادة الترتيب حسب الموعد الأقرب</button><button className="primary" onClick={() => { clear(); setShowForm(true) }}>إضافة طلب تنفيذ</button></div></div>
    {showForm && <form className="record-form" onSubmit={submit}>
      <label>رقم الطلب<input required value={form.requestNumber} onChange={(event) => set('requestNumber', event.target.value)} /></label>
      <label>طريقة إدخال القضية<select value={caseEntryMode} onChange={(event) => { const mode = event.target.value as 'existing' | 'manual'; setCaseEntryMode(mode); if (mode === 'manual') { setJudgmentEntryMode('manual'); setForm((current) => ({ ...current, caseId: '', judgmentId: '' })) } else setForm((current) => ({ ...current, externalCaseNumber: '', externalJudgmentNumber: '' })) }}><option value="existing">من قضايا المكتب</option><option value="manual">قضية من خارج المكتب</option></select></label>
      {caseEntryMode === 'existing' ? <label className="wide">القضية<select required value={form.caseId} onChange={(event) => { const caseId = event.target.value; const legalCase = cases.find((item) => item.id === caseId); const client = clients.find((item) => item.id === legalCase?.clientId); const judgment = judgments.find((item) => item.caseId === caseId); setForm((current) => ({ ...current, caseId, externalCaseNumber: '', claimant: client?.name ?? '', respondent: legalCase?.opponentName ?? '', judgmentId: judgment?.id ?? '', externalJudgmentNumber: '' })) }}><option value="">اختر القضية</option>{cases.map((legalCase) => { const client = clients.find((item) => item.id === legalCase.clientId); return <option key={legalCase.id} value={legalCase.id}>{legalCase.caseNumber} ({client?.name ?? 'عميل في السلة'} ضد {legalCase.opponentName})</option> })}</select></label> : <label className="wide">رقم القضية الخارجية<input required value={form.externalCaseNumber} onChange={(event) => set('externalCaseNumber', event.target.value)} /></label>}
      <label>طالب التنفيذ<input required value={form.claimant} onChange={(event) => set('claimant', event.target.value)} /><small>{caseEntryMode === 'existing' ? 'يُسحب من العميل ويمكن تعديله يدويًا' : 'إدخال يدوي إلزامي'}</small></label>
      <label>المنفذ ضده<input required value={form.respondent} onChange={(event) => set('respondent', event.target.value)} /><small>{caseEntryMode === 'existing' ? 'يُسحب من الخصم ويمكن تعديله يدويًا' : 'إدخال يدوي إلزامي'}</small></label>
      <label>المحكمة المختصة<input value={form.court} onChange={(event) => set('court', event.target.value)} /></label>
      <label>رقم الدائرة<input value={form.circuitNumber} onChange={(event) => set('circuitNumber', event.target.value)} /></label>
      <label>طريقة إدخال الحكم<select value={judgmentEntryMode} onChange={(event) => { const mode = event.target.value as 'existing' | 'manual'; setJudgmentEntryMode(mode); setForm((current) => ({ ...current, judgmentId: mode === 'manual' ? '' : current.judgmentId, externalJudgmentNumber: mode === 'existing' ? '' : current.externalJudgmentNumber })) }}><option value="existing" disabled={caseEntryMode === 'manual'}>من أحكام المكتب</option><option value="manual">إدخال رقم الصك يدويًا</option></select></label>
      {judgmentEntryMode === 'existing' ? <label>الحكم<select required value={form.judgmentId} onChange={(event) => set('judgmentId', event.target.value)}><option value="">اختر الحكم</option>{judgments.filter((judgment) => judgment.caseId === form.caseId).map((judgment) => <option key={judgment.id} value={judgment.id}>صك {judgment.deedNumber} — {judgment.judgmentType}</option>)}</select></label> : <label>رقم صك الحكم<input required value={form.externalJudgmentNumber} onChange={(event) => set('externalJudgmentNumber', event.target.value)} /></label>}
      <label>حالة التنفيذ<select value={form.status} onChange={(event) => set('status', event.target.value)}>{['قيد التنفيذ', 'سداد جزئي', 'جار التحويل', 'منتهي'].map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>رقم قرار 34<input value={form.decision34Number} onChange={(event) => set('decision34Number', event.target.value)} /></label>
      <label>تاريخ قرار 34<input type="date" value={form.decision34Date} onChange={(event) => set('decision34Date', event.target.value)} /><small>هجري: {formatDate(form.decision34Date)}</small></label>
      <label>رقم قرار 46<input value={form.decision46Number} onChange={(event) => set('decision46Number', event.target.value)} /></label>
      <label>تاريخ قرار 46<input type="date" value={form.decision46Date} onChange={(event) => set('decision46Date', event.target.value)} /><small>هجري: {formatDate(form.decision46Date)}</small></label>
      <label className="wide">ملاحظات الطلب<textarea value={form.notes} onChange={(event) => set('notes', event.target.value)} /></label>
      <section className="follow-up wide"><h4>سجل المتابعة</h4>{form.followUps.map((item) => <article key={item.id}><span>{item.actionDate || 'بدون تاريخ'}</span><b>{item.action}</b><span>{item.performedBy || '—'}</span><span>{item.result || '—'}</span><span>{item.nextAction || '—'}</span><span>{item.nextDate ? formatDate(item.nextDate) : '—'}</span><span>{item.notes || '—'}</span><button type="button" className="danger-link" onClick={() => setFollowDeleteTarget({ id: item.id, action: item.action })}>حذف</button></article>)}
        <div className="follow-fields"><input type="date" aria-label="تاريخ الإجراء" value={follow.actionDate} onChange={(event) => setFollow({ ...follow, actionDate: event.target.value })} /><input placeholder="ماذا تم" value={follow.action} onChange={(event) => setFollow({ ...follow, action: event.target.value })} /><input placeholder="من قام به" value={follow.performedBy} onChange={(event) => setFollow({ ...follow, performedBy: event.target.value })} /><input placeholder="النتيجة" value={follow.result} onChange={(event) => setFollow({ ...follow, result: event.target.value })} /><input placeholder="الإجراء القادم" value={follow.nextAction} onChange={(event) => setFollow({ ...follow, nextAction: event.target.value })} /><input type="date" aria-label="تاريخ الإجراء القادم" value={follow.nextDate} onChange={(event) => setFollow({ ...follow, nextDate: event.target.value })} /><input placeholder="ملاحظات" value={follow.notes} onChange={(event) => setFollow({ ...follow, notes: event.target.value })} /><label className="check"><input type="checkbox" checked={follow.createTask} onChange={(event) => setFollow({ ...follow, createTask: event.target.checked })} /> إنشاء مهمة</label><button type="button" className="secondary" onClick={addFollowUp}>إضافة للسجل</button></div>
      </section>
      <div className="form-actions"><button type="button" onClick={clear}>إلغاء</button><button className="primary" type="submit">{editingId ? 'حفظ التعديل' : 'حفظ طلب التنفيذ'}</button></div>
    </form>}
    <h4 className="table-title">طلبات التنفيذ الجارية</h4>{renderTable(ordered.filter((item) => item.status !== 'منتهي'))}
    <h4 className="table-title ended-title">طلبات التنفيذ المنتهية</h4>{renderTable(ordered.filter((item) => item.status === 'منتهي'))}
    {followDeleteTarget && <TwoStepDeleteDialog title="حذف سطر المتابعة" message={`هل تريد حذف الإجراء «${followDeleteTarget.action}» من سجل المتابعة؟`} onCancel={() => setFollowDeleteTarget(undefined)} onConfirm={() => { setForm((current) => ({ ...current, followUps: current.followUps.filter((record) => record.id !== followDeleteTarget.id) })); setFollowDeleteTarget(undefined) }} />}
    {deleteTarget && <TwoStepDeleteDialog title="نقل طلب التنفيذ إلى السلة" message={`هل تريد نقل الطلب «${deleteTarget.number}» إلى السلة؟`} onCancel={() => setDeleteTarget(undefined)} onConfirm={() => { store.moveToTrash('executions', deleteTarget.id); setDeleteTarget(undefined); refresh() }} />}
  </section>
}

function JudgmentsPanel({ clients, cases, judgments, refresh }: { clients: ReturnType<DataStore['snapshot']>['clients']; cases: ReturnType<DataStore['snapshot']>['cases']; judgments: ReturnType<DataStore['snapshot']>['judgments']; refresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string>()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; number: string }>()
  const [draggedId, setDraggedId] = useState<string>()
  const empty = { caseId: '', deedNumber: '', deedUrl: '', judgmentDate: '', judgmentType: 'ابتدائي' as JudgmentType, summary: '', notificationDate: '', sortOrder: 0 }
  const [form, setForm] = useState(empty)
  const set = (field: keyof typeof empty, value: string) => setForm((current) => ({ ...current, [field]: value }))
  const clear = () => { setForm(empty); setEditingId(undefined); setShowForm(false) }
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); if (!form.caseId || !form.deedNumber.trim() || !form.judgmentDate) return
    const input = { ...form, deedNumber: form.deedNumber.trim(), sortOrder: form.sortOrder || Date.parse(form.judgmentDate) }
    if (editingId) store.updateJudgment(editingId, input); else store.addJudgment(input)
    clear(); refresh()
  }
  const edit = (judgment: typeof judgments[number]) => { setEditingId(judgment.id); setForm({ caseId: judgment.caseId, deedNumber: judgment.deedNumber, deedUrl: judgment.deedUrl ?? '', judgmentDate: judgment.judgmentDate, judgmentType: judgment.judgmentType, summary: judgment.summary ?? '', notificationDate: judgment.notificationDate ?? '', sortOrder: judgment.sortOrder }); setShowForm(true) }
  const ordered = [...judgments].sort((a, b) => a.sortOrder - b.sortOrder)
  return <section className="panel">
    <div className="section-actions"><h3>الأحكام</h3><div className="section-actions-buttons"><button className="secondary" onClick={() => { store.reorderJudgments([...judgments].sort((a, b) => a.judgmentDate.localeCompare(b.judgmentDate)).map((item) => item.id)); refresh() }}>إعادة الترتيب حسب تاريخ الحكم</button><button className="primary" onClick={() => { clear(); setShowForm(true) }}>إضافة حكم</button></div></div>
    {showForm && <form className="record-form" onSubmit={submit}>
      <label className="wide">القضية<select required value={form.caseId} onChange={(event) => set('caseId', event.target.value)}><option value="">اختر القضية</option>{cases.map((legalCase) => { const client = clients.find((item) => item.id === legalCase.clientId); return <option key={legalCase.id} value={legalCase.id}>{legalCase.caseNumber} ({client?.name ?? 'عميل في السلة'} ضد {legalCase.opponentName})</option> })}</select></label>
      <label>رقم صك الحكم<input required value={form.deedNumber} onChange={(event) => set('deedNumber', event.target.value)} /></label>
      <label>رابط صك الحكم<input type="url" dir="ltr" value={form.deedUrl} onChange={(event) => set('deedUrl', event.target.value)} /></label>
      <label>تاريخ الحكم<input required type="date" value={form.judgmentDate} onChange={(event) => set('judgmentDate', event.target.value)} /><small>هجري: {formatDate(form.judgmentDate)}</small></label>
      <label>نوع الحكم<select value={form.judgmentType} onChange={(event) => set('judgmentType', event.target.value)}>{['ابتدائي', 'نهائي', 'قطعي', 'منقوض'].map((type) => <option key={type}>{type}</option>)}</select></label>
      <label>تاريخ التبليغ أو التسلّم<input type="date" value={form.notificationDate} onChange={(event) => set('notificationDate', event.target.value)} /><small>هجري: {formatDate(form.notificationDate)}</small></label>
      <label className="wide">ملخص الحكم<textarea value={form.summary} onChange={(event) => set('summary', event.target.value)} /></label>
      <div className="form-actions"><button type="button" onClick={clear}>إلغاء</button><button className="primary" type="submit">{editingId ? 'حفظ التعديل' : 'حفظ الحكم'}</button></div>
    </form>}
    <div className="table-wrap"><table><thead><tr><th>القضية</th><th>رقمها</th><th>نوع الحكم</th><th>تاريخ صك الحكم</th><th>رقم الصك</th><th>الإجراءات</th></tr></thead><tbody>{ordered.map((judgment) => { const legalCase = cases.find((item) => item.id === judgment.caseId); const client = clients.find((item) => item.id === legalCase?.clientId); return <tr draggable onDragStart={() => setDraggedId(judgment.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (!draggedId || draggedId === judgment.id) return; const reordered = [...ordered]; const from = reordered.findIndex((item) => item.id === draggedId); const to = reordered.findIndex((item) => item.id === judgment.id); reordered.splice(to, 0, reordered.splice(from, 1)[0]); store.reorderJudgments(reordered.map((item) => item.id)); setDraggedId(undefined); refresh() }} key={judgment.id}><td>{client?.name ?? 'عميل في السلة'} ضد {legalCase?.opponentName ?? '—'}</td><td>{legalCase?.caseNumber ?? 'قضية في السلة'}</td><td>{judgment.judgmentType}</td><td>{judgment.judgmentDate}<small className="block">{formatDate(judgment.judgmentDate)}</small></td><td>{judgment.deedUrl ? <a href={judgment.deedUrl} target="_blank" rel="noreferrer">{judgment.deedNumber}</a> : judgment.deedNumber}</td><td className="row-actions"><button onClick={() => edit(judgment)}>تعديل</button><button className="danger-link" onClick={() => setDeleteTarget({ id: judgment.id, number: judgment.deedNumber })}>حذف</button></td></tr> })}</tbody></table></div>
    {deleteTarget && <TwoStepDeleteDialog title="نقل الحكم إلى سلة المحذوفات" message={`هل تريد نقل الحكم ذي الصك رقم «${deleteTarget.number}» إلى السلة؟`} onCancel={() => setDeleteTarget(undefined)} onConfirm={() => { store.moveToTrash('judgments', deleteTarget.id); setDeleteTarget(undefined); refresh() }} />}
  </section>
}

const appealDeadline = (startDate: string, durationDays: number) => {
  if (!startDate || !durationDays) return ''
  const date = new Date(`${startDate}T12:00:00`); date.setDate(date.getDate() + durationDays)
  return date.toISOString().slice(0, 10)
}
const countdownText = (deadline: string) => {
  if (!deadline) return '—'
  const today = new Date(); today.setHours(12, 0, 0, 0)
  const days = Math.ceil((new Date(`${deadline}T12:00:00`).getTime() - today.getTime()) / 86_400_000)
  return days > 0 ? `متبقي ${days} يوم` : days === 0 ? 'آخر يوم' : `انتهت منذ ${Math.abs(days)} يوم`
}

function AppealsPanel({ clients, cases, judgments, appeals, refresh }: { clients: ReturnType<DataStore['snapshot']>['clients']; cases: ReturnType<DataStore['snapshot']>['cases']; judgments: ReturnType<DataStore['snapshot']>['judgments']; appeals: ReturnType<DataStore['snapshot']>['appeals']; refresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string>()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; deed: string }>()
  const [draggedId, setDraggedId] = useState<string>()
  const empty = { caseId: '', judgmentId: '', judgmentText: '', judgmentDate: '', deadlineStartDate: '', durationDays: 30, status: 'فترة اعتراضية' as AppealStatus, sortOrder: 0 }
  const [form, setForm] = useState(empty)
  const deadline = appealDeadline(form.judgmentDate, form.durationDays)
  const clear = () => { setForm(empty); setEditingId(undefined); setShowForm(false) }
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); if (!form.caseId || !form.judgmentText.trim() || !form.judgmentDate || form.durationDays < 1) return
    const input = { ...form, judgmentId: form.judgmentId || undefined, deadlineStartDate: form.judgmentDate, sortOrder: form.sortOrder || Date.parse(deadline) }
    if (editingId) store.updateAppeal(editingId, input); else store.addAppeal(input)
    clear(); refresh()
  }
  const edit = (appeal: typeof appeals[number]) => { const judgment = judgments.find((item) => item.id === appeal.judgmentId); setEditingId(appeal.id); setForm({ caseId: appeal.caseId, judgmentId: appeal.judgmentId ?? '', judgmentText: appeal.judgmentText || (judgment ? `صك ${judgment.deedNumber} — ${judgment.judgmentType}` : ''), judgmentDate: appeal.judgmentDate, deadlineStartDate: appeal.judgmentDate, durationDays: appeal.durationDays, status: appeal.status ?? 'فترة اعتراضية', sortOrder: appeal.sortOrder }); setShowForm(true) }
  const ordered = [...appeals].sort((a, b) => a.sortOrder - b.sortOrder)
  const renderAppealsTable = (rows: typeof appeals) => <div className="table-wrap"><table><thead><tr><th>القضية</th><th>الحكم</th><th>تاريخ الحكم وبدء المهلة</th><th>المدة</th><th>آخر يوم</th><th>العداد التنازلي</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{rows.map((appeal) => { const legalCase = cases.find((item) => item.id === appeal.caseId); const judgment = judgments.find((item) => item.id === appeal.judgmentId); const finalDay = appealDeadline(appeal.judgmentDate, appeal.durationDays); return <tr draggable onDragStart={() => setDraggedId(appeal.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (!draggedId || draggedId === appeal.id) return; const reordered = [...rows]; const from = reordered.findIndex((item) => item.id === draggedId); const to = reordered.findIndex((item) => item.id === appeal.id); reordered.splice(to, 0, reordered.splice(from, 1)[0]); store.reorderAppeals(reordered.map((item) => item.id)); setDraggedId(undefined); refresh() }} key={appeal.id}><td>{legalCase?.caseNumber ?? 'قضية في السلة'}</td><td>{appeal.judgmentText || (judgment ? `صك ${judgment.deedNumber}` : '—')}</td><td>{formatDate(appeal.judgmentDate)}</td><td>{appeal.durationDays} يومًا</td><td>{formatDate(finalDay)}</td><td><span className={`countdown ${countdownText(finalDay).startsWith('انتهت') ? 'expired' : ''}`}>{countdownText(finalDay)}</span></td><td>{appeal.status}</td><td className="row-actions"><button onClick={() => edit(appeal)}>تعديل</button><button className="danger-link" onClick={() => setDeleteTarget({ id: appeal.id, deed: appeal.judgmentText || judgment?.deedNumber || '' })}>حذف</button></td></tr> })}</tbody></table></div>
  return <section className="panel">
    <div className="section-actions"><h3>الاستئناف</h3><div className="section-actions-buttons"><button className="secondary" onClick={() => { store.reorderAppeals([...appeals].sort((a, b) => appealDeadline(a.judgmentDate, a.durationDays).localeCompare(appealDeadline(b.judgmentDate, b.durationDays))).map((item) => item.id)); refresh() }}>إعادة الترتيب حسب انتهاء المهلة</button><button className="primary" onClick={() => { clear(); setShowForm(true) }}>إضافة استئناف</button></div></div>
    {showForm && <form className="record-form" onSubmit={submit}>
      <label className="wide">القضية<select required value={form.caseId} onChange={(event) => { const caseId = event.target.value; const judgment = judgments.find((item) => item.caseId === caseId); setForm((current) => ({ ...current, caseId, judgmentId: judgment?.id ?? '', judgmentText: judgment ? `صك ${judgment.deedNumber} — ${judgment.judgmentType}` : '', judgmentDate: judgment?.judgmentDate ?? '', deadlineStartDate: judgment?.judgmentDate ?? '' })) }}><option value="">اختر القضية</option>{cases.map((legalCase) => { const client = clients.find((item) => item.id === legalCase.clientId); return <option key={legalCase.id} value={legalCase.id}>{legalCase.caseNumber} ({client?.name ?? 'عميل في السلة'} ضد {legalCase.opponentName})</option> })}</select></label>
      <label>الحكم المسجل<select value={form.judgmentId} onChange={(event) => { const judgment = judgments.find((item) => item.id === event.target.value); setForm((current) => ({ ...current, judgmentId: event.target.value, judgmentText: judgment ? `صك ${judgment.deedNumber} — ${judgment.judgmentType}` : current.judgmentText, judgmentDate: judgment?.judgmentDate ?? current.judgmentDate, deadlineStartDate: judgment?.judgmentDate ?? current.judgmentDate })) }}><option value="">إدخال يدوي فقط</option>{judgments.filter((judgment) => judgment.caseId === form.caseId).map((judgment) => <option key={judgment.id} value={judgment.id}>صك {judgment.deedNumber} — {judgment.judgmentType}</option>)}</select></label>
      <label>بيان الحكم<input required value={form.judgmentText} onChange={(event) => setForm({ ...form, judgmentText: event.target.value })} /><small>يُسحب تلقائيًا ويمكن تعديله يدويًا</small></label>
      <label>تاريخ صدور الحكم وبداية المهلة<input required type="date" value={form.judgmentDate} onChange={(event) => setForm({ ...form, judgmentDate: event.target.value, deadlineStartDate: event.target.value })} /><small>هجري: {formatDate(form.judgmentDate)}</small></label>
      <label>مدة المهلة بالأيام<input required min="1" type="number" value={form.durationDays} onChange={(event) => setForm({ ...form, durationDays: Number(event.target.value) })} /></label>
      <label>حالة الاستئناف<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as AppealStatus })}>{['قيد النظر', 'فترة اعتراضية', 'منتهي'].map((status) => <option key={status}>{status}</option>)}</select></label>
      <article className="deadline-preview wide"><div><small>آخر يوم</small><b>{deadline ? formatDate(deadline) : '—'}</b><span>{deadline}</span></div><strong>{countdownText(deadline)}</strong></article>
      <div className="form-actions"><button type="button" onClick={clear}>إلغاء</button><button className="primary" type="submit">{editingId ? 'حفظ التعديل' : 'حفظ الاستئناف'}</button></div>
    </form>}
    <h4 className="table-title">الاستئنافات الحالية</h4>{renderAppealsTable(ordered.filter((appeal) => appeal.status !== 'منتهي'))}
    <h4 className="table-title ended-title">الاستئنافات المنتهية</h4>{renderAppealsTable(ordered.filter((appeal) => appeal.status === 'منتهي'))}
    {deleteTarget && <TwoStepDeleteDialog title="نقل الاستئناف إلى السلة" message={`هل تريد نقل استئناف الحكم «${deleteTarget.deed}» إلى السلة؟`} onCancel={() => setDeleteTarget(undefined)} onConfirm={() => { store.moveToTrash('appeals', deleteTarget.id); setDeleteTarget(undefined); refresh() }} />}
  </section>
}

const isGitHubPages = window.location.hostname === 'lawyer-amd.github.io'

if (isGitHubPages) {
  // GitHub Pages cannot reliably send an authenticated POST to a web app whose
  // access is restricted to the owner. Keep the public URL as an entry point,
  // then run the application inside Apps Script where google.script.run uses
  // the signed-in Google account without CORS or public API access.
  window.location.replace(defaultCloudEndpoint)
} else {
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
}
