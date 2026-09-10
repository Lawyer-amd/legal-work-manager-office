const SPREADSHEET_ID = '1bBWsWkX2_ZPYTLDCS7ye9V3fGDHMq-MqotPKAjoyAHE'

const SHEETS = {
  clients: 'العملاء', cases: 'القضايا', sessions: 'الجلسات', transactions: 'المعاملات', tasks: 'المهام', executions: 'التنفيذ', judgments: 'الأحكام', appeals: 'الاستئناف', documents: 'المستندات',
}
const ALL_COLLECTIONS = ['clients', 'cases', 'sessions', 'transactions', 'tasks', 'executions', 'judgments', 'appeals', 'documents']

function doGet(e) {
  const callback = e && e.parameter && e.parameter.callback
  try {
    const data = readSnapshot_()
    return json_({ ok: true, data: data }, callback)
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message || error) }, callback)
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e && e.postData && e.postData.contents || '{}')
    if (body.action !== 'upsert' || !body.data) return json_({ ok: false, error: 'طلب حفظ غير صالح.' })
    var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID)
    Object.keys(SHEETS).forEach(function (name) { writeRows_(spreadsheet, SHEETS[name], body.data[name] || []) })
    return json_({ ok: true })
  } catch (error) { return json_({ ok: false, error: String(error && error.message || error) }) }
}

function writeRows_(spreadsheet, sheetName, rows) {
  var sheet = spreadsheet.getSheetByName(sheetName)
  if (!sheet || !rows.length) return
  var range = sheet.getDataRange()
  var values = range.getValues()
  var headers = values.length ? values[0].map(String) : Object.keys(rows[0])
  if (!headers.length) return
  var output = rows.map(function (record) { return headers.map(function (header) { var value = record[header]; if (Array.isArray(value) || (value && typeof value === 'object')) value = JSON.stringify(value); return value == null ? '' : value }) })
  if (sheet.getMaxRows() > 1) sheet.getRange(2, 1, sheet.getMaxRows() - 1, headers.length).clearContent()
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
  if (output.length) sheet.getRange(2, 1, output.length, headers.length).setValues(output)
}

function json_(value, callback) {
  const payload = JSON.stringify(value)
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + payload + ');').setMimeType(ContentService.MimeType.JAVASCRIPT)
  }
  return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON)
}

function readSnapshot_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID)
  const result = {}
  ALL_COLLECTIONS.forEach(function (name) { result[name] = [] })
  result.clients = rows_(spreadsheet, SHEETS.clients, client_)
  result.cases = rows_(spreadsheet, SHEETS.cases, legalCase_)
  result.sessions = rows_(spreadsheet, SHEETS.sessions, session_)
  result.transactions = rows_(spreadsheet, SHEETS.transactions, transaction_)
  result.tasks = rows_(spreadsheet, SHEETS.tasks, task_)
  result.executions = rows_(spreadsheet, SHEETS.executions, execution_)
  result.judgments = rows_(spreadsheet, SHEETS.judgments, judgment_)
  result.appeals = rows_(spreadsheet, SHEETS.appeals, appeal_)
  result.documents = rows_(spreadsheet, SHEETS.documents, document_)
  return result
}

function rows_(spreadsheet, sheetName, mapper) {
  const sheet = spreadsheet.getSheetByName(sheetName)
  if (!sheet || sheet.getLastRow() < 2) return []
  const values = sheet.getDataRange().getDisplayValues()
  const headers = values.shift().map(normalize_)
  return values.map(function (row) { return mapper(row, headers) }).filter(function (record) { return record.id })
}

function value_(row, headers, names) {
  for (var i = 0; i < names.length; i += 1) {
    var index = headers.indexOf(normalize_(names[i]))
    if (index >= 0) return String(row[index] || '').trim()
  }
  return ''
}

function normalize_(value) { return String(value || '').trim().toLowerCase().replace(/[\s_]+/g, '') }
function base_(row, headers) {
  var id = value_(row, headers, ['id', 'المعرف', 'معرف'])
  var now = new Date().toISOString()
  return { id: id, createdAt: value_(row, headers, ['createdAt', 'تاريخ الإنشاء']) || now, updatedAt: value_(row, headers, ['updatedAt', 'تاريخ التحديث']) || now }
}
function client_(row, headers) {
  return Object.assign(base_(row, headers), { name: value_(row, headers, ['name', 'الاسم']), clientType: value_(row, headers, ['clientType', 'نوع العميل']) || 'استشارة', phone: value_(row, headers, ['phone', 'رقم الجوال']), nationalId: value_(row, headers, ['nationalId', 'رقم الهوية']), birthDate: value_(row, headers, ['birthDate', 'تاريخ الميلاد']), gender: value_(row, headers, ['gender', 'الجنس']), iban: value_(row, headers, ['iban', 'الآيبان']), registeredAt: value_(row, headers, ['registeredAt', 'تاريخ التسجيل']) || new Date().toISOString().slice(0, 10), sortOrder: Number(value_(row, headers, ['sortOrder', 'ترتيب']) || 0) })
}
function legalCase_(row, headers) {
  return Object.assign(base_(row, headers), { caseNumber: value_(row, headers, ['caseNumber', 'رقم القضية']), classification: value_(row, headers, ['classification', 'التصنيف']), clientId: value_(row, headers, ['clientId', 'معرف العميل']), opponentName: value_(row, headers, ['opponentName', 'الخصم']), status: value_(row, headers, ['status', 'الحالة']) || 'قيد النظر', previousActionDate: value_(row, headers, ['previousActionDate', 'تاريخ الإجراء السابق']), nextActionDate: value_(row, headers, ['nextActionDate', 'تاريخ الإجراء القادم']), assignedLawyer: value_(row, headers, ['assignedLawyer', 'المحامي']), originalAgencyNumber: value_(row, headers, ['originalAgencyNumber', 'رقم الوكالة']), assignedAgencyNumber: value_(row, headers, ['assignedAgencyNumber', 'رقم الوكالة المعين']), agencyExpiryDate: value_(row, headers, ['agencyExpiryDate', 'تاريخ انتهاء الوكالة']), najizUrl: value_(row, headers, ['najizUrl', 'رابط ناجز']), driveFolderUrl: value_(row, headers, ['driveFolderUrl', 'رابط الملف']), sortOrder: Number(value_(row, headers, ['sortOrder', 'ترتيب']) || 0) })
}
function session_(row, headers) {
  return Object.assign(base_(row, headers), { caseId: value_(row, headers, ['caseId', 'معرف القضية']), date: value_(row, headers, ['date', 'التاريخ']), time: value_(row, headers, ['time', 'الوقت']), status: value_(row, headers, ['status', 'الحالة']) || 'جديدة', summary: value_(row, headers, ['summary', 'ملخص الجلسة', 'وصف الموعد']), decisions: value_(row, headers, ['decisions', 'قرارات الجلسة']), sortOrder: Number(value_(row, headers, ['sortOrder', 'ترتيب']) || 0) })
}
function task_(row, headers) {
  return Object.assign(base_(row, headers), { statement: value_(row, headers, ['statement', 'بيان المهمة']), caseId: value_(row, headers, ['caseId', 'معرف القضية']), executionId: value_(row, headers, ['executionId', 'معرف التنفيذ']), clientName: value_(row, headers, ['clientName', 'اسم العميل']), taskDate: value_(row, headers, ['taskDate', 'تاريخ المهمة']), nextDate: value_(row, headers, ['nextDate', 'التاريخ القادم']), assignee: value_(row, headers, ['assignee', 'المسؤول']), notes: value_(row, headers, ['notes', 'ملاحظات']), status: value_(row, headers, ['status', 'الحالة']) || 'جديدة', sortOrder: Number(value_(row, headers, ['sortOrder', 'ترتيب']) || 0) })
}
function document_(row, headers) {
  var clientId = value_(row, headers, ['clientId', 'معرف العميل'])
  var caseId = value_(row, headers, ['caseId', 'معرف القضية'])
  var links = []
  if (clientId) links.push({ type: 'clients', id: clientId })
  if (caseId) links.push({ type: 'cases', id: caseId })
  return Object.assign(base_(row, headers), { name: value_(row, headers, ['name', 'الاسم']), documentType: value_(row, headers, ['documentType', 'النوع']), url: value_(row, headers, ['url', 'الرابط']), notes: value_(row, headers, ['notes', 'ملاحظات']), documentDate: value_(row, headers, ['documentDate', 'تاريخ المستند']), links: links })
}
function transaction_(row, headers) { return Object.assign(base_(row, headers), { statement: value_(row, headers, ['statement', 'بيان المعاملة']), caseId: value_(row, headers, ['caseId', 'معرف القضية']), clientName: value_(row, headers, ['clientName', 'اسم العميل']), opponentName: value_(row, headers, ['opponentName', 'الخصم']), reviewDate: value_(row, headers, ['reviewDate', 'تاريخ المراجعة']), nextDate: value_(row, headers, ['nextDate', 'التاريخ القادم']), notes: value_(row, headers, ['notes', 'ملاحظات']), status: value_(row, headers, ['status', 'الحالة']) || 'مستمرة', sortOrder: Number(value_(row, headers, ['sortOrder', 'ترتيب']) || 0) }) }
function execution_(row, headers) { return Object.assign(base_(row, headers), { requestNumber: value_(row, headers, ['requestNumber', 'رقم الطلب']), claimant: value_(row, headers, ['claimant', 'طالب التنفيذ']), respondent: value_(row, headers, ['respondent', 'المنفذ ضده']), court: value_(row, headers, ['court', 'المحكمة']), circuitNumber: value_(row, headers, ['circuitNumber', 'رقم الدائرة']), caseId: value_(row, headers, ['caseId', 'معرف القضية']), externalCaseNumber: value_(row, headers, ['externalCaseNumber', 'رقم القضية الخارجية']), judgmentId: value_(row, headers, ['judgmentId', 'معرف الحكم']), externalJudgmentNumber: value_(row, headers, ['externalJudgmentNumber', 'رقم صك الحكم']), notes: value_(row, headers, ['notes', 'ملاحظات']), decision34Number: value_(row, headers, ['decision34Number', 'رقم قرار 34']), decision34Date: value_(row, headers, ['decision34Date', 'تاريخ قرار 34']), decision46Number: value_(row, headers, ['decision46Number', 'رقم قرار 46']), decision46Date: value_(row, headers, ['decision46Date', 'تاريخ قرار 46']), status: value_(row, headers, ['status', 'الحالة']) || 'قيد التنفيذ', followUps: [], sortOrder: Number(value_(row, headers, ['sortOrder', 'ترتيب']) || 0) }) }
function judgment_(row, headers) { return Object.assign(base_(row, headers), { caseId: value_(row, headers, ['caseId', 'معرف القضية']), deedNumber: value_(row, headers, ['deedNumber', 'رقم الصك']), deedUrl: value_(row, headers, ['deedUrl', 'رابط الصك']), judgmentDate: value_(row, headers, ['judgmentDate', 'تاريخ الحكم']), judgmentType: value_(row, headers, ['judgmentType', 'نوع الحكم']) || 'ابتدائي', summary: value_(row, headers, ['summary', 'الملخص']), notificationDate: value_(row, headers, ['notificationDate', 'تاريخ التبليغ']), sortOrder: Number(value_(row, headers, ['sortOrder', 'ترتيب']) || 0) }) }
function appeal_(row, headers) { return Object.assign(base_(row, headers), { caseId: value_(row, headers, ['caseId', 'معرف القضية']), judgmentId: value_(row, headers, ['judgmentId', 'معرف الحكم']), judgmentText: value_(row, headers, ['judgmentText', 'نص الحكم']), judgmentDate: value_(row, headers, ['judgmentDate', 'تاريخ الحكم']), deadlineStartDate: value_(row, headers, ['deadlineStartDate', 'بداية المهلة']) || value_(row, headers, ['judgmentDate', 'تاريخ الحكم']), durationDays: Number(value_(row, headers, ['durationDays', 'مدة المهلة']) || 30), status: value_(row, headers, ['status', 'الحالة']) || 'فترة اعتراضية', sortOrder: Number(value_(row, headers, ['sortOrder', 'ترتيب']) || 0) }) }
