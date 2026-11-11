# فرضيات التصميم والقرارات التي تحتاج إلى تأكيد
# Architecture & Product Assumptions (`NEEDS CONFIRMATION`)

يوثّق هذا الملف جميع الفرضيات التقنية والتشغيلية التي تم اعتمادها أثناء بناء الـ Backend لنظام **Kardeşler Cihangir**، مع تمييز كل بند بوسم **`NEEDS CONFIRMATION`** لمراجعته وتأكيده قبل الإطلاق الفعلي (Production Launch).

---

## 1. الدفع الإلكتروني والاسترداد (Payments & Refunds)
- **[NEEDS CONFIRMATION] بوابة الدفع المعتمدة:** تم بناء محول `IyzicoPaymentProvider` لبوابة الدفع التركية **iyzico** (Hosted Checkout Form) بحيث لا تمر أي بيانات بطاقات ائتمانية (PAN/CVV) عبر خوادمنا مطلقاً، مع توفير `FakePaymentProvider` للاختبارات المحلية الآلية. يرجى تأكيد ما إذا كانت الشركة ستعتمد **iyzico** أو **PayTR** في الحساب التجاري النهائي.
- **[NEEDS CONFIRMATION] مهلة انتهاء الطلبات غير المدفوعة (`payment_timeout_minutes`):** تم ضبط المهلة الافتراضية في `restaurant_settings` على **15 دقيقة**. إذا لم يصل إشعار دفع ناجح (Webhook) خلال 15 دقيقة، تقوم وظيفة الخلفية (`expireUnpaidCardOrders`) بإلغاء الطلب تلقائياً وإعادة رصيد الكوبون للعميل.
- **[NEEDS CONFIRMATION] الاسترداد التلقائي عند الإلغاء/الرفض:** عند قيام المطبخ برفض طلب مدفوع بالبطاقة (`rejected`) أو إلغائه قبل التحضير (`cancelled`)، يقوم النظام تلقائياً بإنشاء طلب استرداد كامل (`refunds`) عبر بوابة الدفع.

---

## 2. حدود الدفع عند الاستلام ومكافحة الاحتيال (COD Anti-Fraud Limits)
- **[NEEDS CONFIRMATION] الحد الأقصى لمبلغ الدفع عند الاستلام (`cod_max_amount_kurus`):** تم ضبط السقف الافتراضي للطلبات النقدية/الفيزا عند الباب على **1,500.00 ₺ (`150000` قرش)**. الطلبات التي تتجاوز هذا المبلغ تتطلب الدفع الإلكتروني المسبق (`card_online`).
- **[NEEDS CONFIRMATION] عدد الطلبات المفتوحة بالدفع عند الاستلام (`cod_max_open_orders`):** يُسمح للعميل الواحد بطلب مفتوح واحد (**1**) كحد أقصى بطريقة الدفع عند الاستلام في نفس الوقت (أثناء حالات `new` أو `accepted` أو `on_the_way`) لمنع الطلبات الوهمية المتكررة.

---

## 3. التشغيل، الطابعة الحرارية، ومفتاح الإيقاف التلقائي (Operations, Thermal Printer & Kill-Switch)
- **[NEEDS CONFIRMATION] مهلة نبضات القلب (`heartbeat_grace_seconds`):** تم ضبط مهلة انقطاع الاتصال لوكيل الطباعة/تابلت المطبخ على **120 ثانية (دقيقتين)**. في حال تسجيل أجهزة في جدول `heartbeats` وانقطاع إشارتها لأكثر من 120 ثانية، تتحول قيمة `orderingAvailable` في `GET /api/v1/settings/public` إلى `false` لمنع تراكم طلبات مدفوعة لا يراها المطبخ.
- **[NEEDS CONFIRMATION] تنبيه تأخر قبول الطلب (`unaccepted_order_alert_minutes`):** إذا بقي الطلب في حالة `new` لمدة **5 دقائق** دون أن يضغط موظف المطبخ على "قبول" (`accepted`)، يرسل النظام تنبيهاً فورياً عبر قناة `SSE` (`/api/v1/realtime/staff`).
- **[NEEDS CONFIRMATION] ترميز طابعة المطبخ الحرارية:** تم ضبط مخرجات `ThermalTicketService` على أوامر **ESC/POS** بترميز الأحرف التركية **CP857 (`ESC t 18`)** وعرض ورق **80mm (48 عموداً)** المتوافق مع طابعة **SUNLUX RP8020**، وباللغة التركية فقط.

---

## 4. برنامج الولاء ودعوة الأصدقاء (Loyalty & Referrals)
- **[NEEDS CONFIRMATION] معدل اكتساب نقاط الولاء:** عند اكتمال توصيل الطلب (`delivered`)، يكتسب العميل **نقطة واحدة لكل 1 ليرة تركية (`100` قرش)** من صافي قيمة الطلب (`total_kurus`).
- **[NEEDS CONFIRMATION] مكافأة دعوة صديق (`referrals`):** عند إتمام الصديق المدعو لأول طلب مُسلّم (`delivered`)، يحصل الداعي (`referrer`) على **100 نقطة** ويحصل المدعو (`referred`) على **50 نقطة** في سجل `loyalty_ledger`.

---

## 5. البنية التحتية، Redis، وتدوير المفاتيح (Infrastructure, Redis & JWT Rotation)
- **[NEEDS CONFIRMATION] إلزامية Redis 7 في الإنتاج:** تم نقل جميع حالات الذاكرة المؤقتة (محدِّد المعدل `RedisRateLimiter`، كاش القائمة `RedisCacheAdapter`، بث أحداث المطبخ `RedisEventBus`، قائمة سحب رموز الطابعة `RedisRevokedTokenStore`، ومجدول المهام `BullMQ`) إلى **Redis 7** بحيث يدعم الخادم التشغيل الأفقي متعدد النسخ دون فقدان الحالة عند إعادة التشغيل.
- **[NEEDS CONFIRMATION] سياسة تدوير مفاتيح JWT (`kid` rotation):** تم اعتماد `jose` بخوارزمية `HS256` مع ترويسة `kid` وقبول مفتاح حالي (`JWT_*_SECRET` / `JWT_KEY_ID`) ومفتاح سابق اختياري (`JWT_*_PREVIOUS_SECRET` / `JWT_PREVIOUS_KEY_ID`) لتدوير الأسرار بدون قطع جلسات المستخدمين الفعّالة.
- **[NEEDS CONFIRMATION] تفعيل بيانات التجربة في `007_seed.sql`:** يحتوي ملف `007_seed.sql` على بيانات تجريبية/مؤقتة (PLACEHOLDER) ويرفض التنفيذ في بيئة `NODE_ENV=production` عبر فحص `app.node_env`. يلزم تزويد كلمات مرور وبيانات حسابات التشغيل الحقيقية قبل الإطلاق.
- **[NEEDS CONFIRMATION] تقاطع الصلاحيات عند حذف العناوين:** نظراً لتطبيق سياسة RLS `pol_addresses_customer_select` (`deleted_at IS NULL`) على `public.addresses`، ينفّذ المسار `DELETE /api/v1/addresses/:id` حذفاً فعلياً محكوماً بسياسة `pol_addresses_customer_delete` (`user_id = app_user_id()`) مع احتفاظ جدول `orders` بلقطة `address_snapshot` التاريخية.
