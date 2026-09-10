const SPREADSHEET_ID = '1bBWsWkX2_ZPYTLDCS7ye9V3fGDHMq-MqotPKAjoyAHE'

const SHEETS = {
  clients: 'العملاء', cases: 'القضايا', sessions: 'الجلسات', tasks: 'المهام', documents: 'المستندات',
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
  result.tasks = rows_(spreadsheet, SHEETS.tasks, task_)
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
