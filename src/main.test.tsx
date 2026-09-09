// @vitest-environment jsdom
import { act } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'

const click = async (element: Element | undefined) => {
  if (!element) throw new Error('العنصر المطلوب غير موجود')
  await act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}
const button = (name: string) => [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === name || item.getAttribute('aria-label') === name)

describe('واجهة التطبيق', () => {
  beforeAll(async () => {
    localStorage.clear()
    document.body.innerHTML = '<div id="root"></div>'
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    await act(async () => { await import('./main') })
  })

  it('تعرض مساحات العمل الأساسية والإعدادات دون زر إضافة سجل عام', async () => {
    await click(button('القضايا'))
    expect(button('العملاء')).toBeDefined()
    expect(button('الاستئناف')).toBeDefined()
    expect(button('سلة المحذوفات')).toBeDefined()
    expect(button('المستندات')).toBeDefined()
    expect(button('الإعدادات')).toBeDefined()
    expect(button('إضافة سجل')).toBeUndefined()
  })

  it('تعرض فهرس المستندات ونموذج الربط بسجلات التطبيق', async () => {
    await click(button('المستندات'))
    expect(document.body.textContent).toContain('فهرس المستندات')
    await click(button('إضافة مستند'))
    expect(document.body.textContent).toContain('رابط المستند على Google Drive')
    expect(document.body.textContent).toContain('ربط المستند بالسجلات')
    expect(document.body.textContent).toContain('عميل تجريبي')
  })

  it('يستخدم الحذف خطوتي تحقق ويمكن إلغاؤه دون حذف السجل', async () => {
    await click(button('العملاء'))
    await click(button('حذف'))
    expect(document.body.textContent).toContain('الخطوة 1 من 2')
    await click(button('متابعة'))
    expect(document.body.textContent).toContain('الخطوة 2 من 2')
    expect(button('موافق، نقل إلى السلة')).toBeDefined()
    await click(button('إلغاء'))
    expect(document.body.textContent).toContain('عميل تجريبي')
  })

  it('تعرض سلة المحذوفات وحالتها الفارغة', async () => {
    await click(button('سلة المحذوفات'))
    expect(document.body.textContent).toContain('تُحذف السجلات نهائيًا تلقائيًا بعد 30 يومًا')
    expect(document.body.textContent).toContain('السلة فارغة')
  })

  it('تعرض سجل الوكالات القريبة من الانتهاء في لوحة المتابعة', async () => {
    await click(button('القضايا'))
    await click(button('تعديل'))
    const label = [...document.querySelectorAll('label')].find((item) => item.textContent?.includes('تاريخ انتهاء الوكالة'))
    const dateInput = label?.querySelector('input') as HTMLInputElement | null
    if (!dateInput) throw new Error('حقل انتهاء الوكالة غير موجود')
    await act(async () => {
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 5)
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      valueSetter?.call(dateInput, tomorrow.toISOString().slice(0, 10))
      dateInput.dispatchEvent(new Event('input', { bubbles: true }))
      dateInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await click(button('حفظ التعديل'))
    await click(button('اليوم'))
    expect(document.body.textContent).toContain('الوكالات القريبة من الانتهاء')
    expect(document.body.textContent).toContain('متبقي 5 يوم')
  })

  it('تعرض مركز المواعيد وتنتقل إلى اللوحة المرتبطة من عنصر المتابعة', async () => {
    await click(button('اليوم'))
    expect(document.body.textContent).toContain('أقرب المواعيد والإجراءات')
    expect(document.body.textContent).toContain('جلسات اليوم وما يحتاج تحديثًا')
    expect(document.body.textContent).toContain('إجراءات مرتبطة بوقت')
    await click(button('وكالة'))
    expect(document.body.textContent).toContain('انتهاء الوكالة')
    await click(button('فتح القضايا'))
    expect(document.body.textContent).toContain('القضايا الحالية')
  })

  it('تحفظ إعدادات الواجهة وتطبّق اسم المكتب', async () => {
    await click(button('الإعدادات'))
    expect(document.body.textContent).toContain('التنبيه قبل انتهاء الوكالة بالأيام')
    const officeInput = [...document.querySelectorAll('input')].find((item) => item.value === 'إدارة العمل القانوني')
    if (!officeInput) throw new Error('حقل اسم المكتب غير موجود')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(officeInput, 'مكتب الاختبار')
      officeInput.dispatchEvent(new Event('input', { bubbles: true }))
      officeInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await click(button('حفظ الإعدادات'))
    expect(document.body.textContent).toContain('مكتب الاختبار')
    expect(localStorage.getItem('legal-work-manager:settings:v1')).toContain('مكتب الاختبار')
  })
})
