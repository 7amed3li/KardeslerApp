# Kardeşler Cihangir - Food Ordering Platform Monorepo
# نظام إدارة وطلب الطعام لمطعم الإخوة جيهانغير (إسطنبول)

نظام متكامل لطلب الطعام وإدارة المطبخ والطلبات لمطعم كباب تركي واحد في منطقة جيهانغير، إسطنبول (**Kardeşler Cihangir**). يتكون المشروع من تطبيق موبايل للعملاء، لوحة تحكم ويب للموظفين، خادم واجهات برمجة التطبيقات (API)، وكيل للطباعة الحرارية في المطبخ، وقاعدة بيانات PostgreSQL مع امتداد PostGIS الجغرافي.

---

## 1. هيكلية المشروع (Monorepo Directory Structure)

```
kardeslerAPP/
├── database/        # 🐘 ملفات ترحيل قاعدة البيانات واختبارات الأمان الـ 13 (SQL Migrations)
├── packages/
│   └── shared/      # 📦 المخططات المشتركة، حسابات القروش، اللغات والأنواع (Zod Schemas)
├── backend/         # ⚡ خادم التطبيق ومحرك التسعير وحالات الطلبات (Fastify + Drizzle)
├── admin/           # 💻 لوحة إدارة المطبخ والطلبات الحية مع التنبيه الصوتي (React + Vite)
├── mobile/          # 📱 تطبيق الموبايل للزبائن بـ 3 لغات (Expo React Native)
├── print-agent/     # 🖨️ وكيل الطباعة الحرارية المباشر للبونات (SUNLUX RP8020 ESC/POS)
├── docs/            # 📚 التوثيق الهندسي الشامل مع الترجمة العربية الكاملة
│   ├── architecture.md   # مخططات الهيكلية التفاعلية (Mermaid Diagrams)
│   ├── security.md       # نموذج التهديدات وقوانين الخصوصية التركية (KVKK)
│   ├── api.md            # مواصفات الـ Endpoints والمحرك المالي
│   ├── runbook.md        # دليل التشغيل وإجراءات الطوارئ وإعداد الطابعة
│   └── assumptions.md    # الافتراضات الهندسية المطلوب تأكيدها من المالك
└── package.json     # أوامر التشغيل الموحدة للـ Monorepo عبر pnpm
```

---

## 2. تعليمات التشغيل للمطور المحلي (بدون دوكر / Local Development)

المشروع مصمم ليعمل مباشرة وبكل سلاسة على بيئة المطور المحلية باستخدام **Node.js 22 LTS** و **pnpm** و **PostgreSQL 16**:

### أ. تثبيت الحزم:
```bash
pnpm install
```

### ب. تشغيل وفحص قاعدة البيانات:
```bash
# تطبيق ملفات الهجرة السبعة واختبارات التحقق الـ 13
pnpm run db:migrate
pnpm run db:test
```

### ج. تشغيل الفحص الشامل (Types, Lint, Tests):
```bash
pnpm run check
```

### د. تشغيل الخادم والواجهات:
```bash
# تشغيل خادم الـ API (المنفذ 4000)
cd backend && pnpm run start:dev

# تشغيل لوحة تحكم الإدارة (المنفذ 5173)
cd admin && pnpm run dev

# تجربة طباعة بون المطبخ الحراري (ESC/POS CP857)
cd print-agent && pnpm run test-print
```

---

## 3. نتائج اختبارات قاعدة البيانات (PostgreSQL 16 + PostGIS Output)

تم التحقق من تشغيل واجتياز كافة الاختبارات بنسبة **100% نجاح** على قاعدة بيانات حقيقية:

```
 #  |                          Test Case                          | Status |                                 Verification Details                                  
----+-------------------------------------------------------------+--------+---------------------------------------------------------------------------------------
  1 | Idempotency key duplicate rejection                         | PASS   | Duplicate idempotency key successfully raised unique_violation
  2 | Minimum spend enforcement after discount                    | PASS   | Both raw spend and post-discount spend checks rejected orders below minimum
  3 | Order status transitions and lifecycle timeline             | PASS   | State machine enforced graph, recorded 4 events, and maintained timestamps
  4 | Order and order_items immutability                          | PASS   | Financial columns and line item records are strictly immutable
  5 | Append-only tables (order_events & audit_logs)              | PASS   | Triggers and permissions strictly block UPDATE and DELETE on audit ledgers
  6 | Single coupon per order rule                                | PASS   | Second coupon redemption on the same order raised unique_violation
  7 | Atomic redeem_coupon concurrency & usage cap                | PASS   | Locked row, redeemed once, and rejected subsequent redemption after max_total_uses
  8 | Sold menu items deletion integrity (RESTRICT & soft delete) | PASS   | ON DELETE RESTRICT prevented financial cascade; soft delete functioned properly
  9 | Consecutive numbering and midnight business cutoff          | PASS   | Sequential numbers generated atomically; 01:30 AM projected to previous business date
 10 | Row-Level Security (RLS) customer isolation                 | PASS   | Customer cannot see other patrons data; unset session returns 0 rows; staff sees all
 11 | KVKK account erasure and tax order retention                | PASS   | PII, devices, and addresses purged; historical order retained for tax compliance
 12 | Mandatory Turkish translation enforcement                   | PASS   | Entity lacking Turkish translation was blocked by constraint trigger
 13 | PostGIS delivery zone polygon evaluation                    | PASS   | Inside coordinates matched Cihangir zone; outside coordinates returned 0 zones
(13 rows)
```
