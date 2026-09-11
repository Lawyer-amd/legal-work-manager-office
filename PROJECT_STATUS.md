# حالة مشروع إدارة العمل القانوني

## الوضع الحالي

- الفرع: `astra-008-redesign`
- التطبيق المنشور يعمل عبر Google Apps Script بصلاحية وصول «أنا فقط».
- قاعدة البيانات المشتركة هي Google Sheets، والمرفقات/المستندات عبر روابط Google Drive.
- الإصدار المنشور الأخير هو Apps Script deployment 13.
- رابط التطبيق: https://script.google.com/macros/s/AKfycbx5LhdN9WykSLjP0OHBsRQe_uVhFpw2e6mi_fT8J25GtAiz8exTurUfsozo5_a7kofAkA/exec

## ما تم إنجازه

- قراءة وكتابة Snapshot لجميع اللوحات الأساسية.
- إصلاح ملف `apps-script/Index.html` ونشره بنجاح.
- إضافة زر «مزامنة ثنائية الآن» يدمج السجلات حسب `updatedAt` ثم يحفظ النسخة المدمجة.
- الاختبارات الحالية: 24/24 ناجحة، والبناء ناجح.

## القيود

- لا تغيّر صلاحية Apps Script من «أنا فقط».
- لا تعدّل بيانات Sheets الحقيقية أو تحذفها دون اختبار واضح وموافقة.
- لا تعتمد على GitHub Pages للتشغيل اليومي؛ Apps Script هو رابط التشغيل الأساسي.
