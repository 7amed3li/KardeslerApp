# هيكلية النظام والتصميم العام للمشروع
# System Architecture & Monorepo Design

يوضح هذا المستند الهيكلية الشاملة لنظام طلب الطعام الخاص بمطعم **Kardeşler Cihangir**، مصمماً بنمط الـ Monorepo لربط تطبيق الهاتف، لوحة تحكم الإدارة، الخادم، الطابعة الحرارية في المطبخ، وقاعدة البيانات.

---

## 1. المخطط العام للنظام (System Architecture Flowchart)

```mermaid
flowchart TD
    subgraph Clients["واجهات المستخدم (Client Tier)"]
        Mobile["📱 تطبيق الموبايل (iOS / Android)<br/>Expo React Native"]
        AdminWeb["💻 لوحة إدارة المطعم (Admin Panel)<br/>React + Vite + Web Audio"]
        PrintAgent["🖨️ وكيل الطباعة الحرارية (Print Agent)<br/>Node.js Microservice"]
    end

    subgraph BackendTier["طبقة الخادم والمنطق البرمجي (Backend Tier)"]
        API["⚡ خادم التطبيق (Fastify API Engine)<br/>TypeScript + Zod Validation"]
        PricingEng["💰 محرك التسعير وحساب القروش (Pricing Engine)<br/>Server-authoritative Integer Kuruş"]
        StateMachine["🔄 آلة حالات الطلبات (Order State Machine)<br/>New ➔ Accepted ➔ On The Way ➔ Delivered"]
        SSEHub["📡 موزع البث الحي (Realtime SSE Hub)<br/>Server-Sent Events for Admin"]
    end

    subgraph DataTier["طبقة البيانات والتخزين (Data & Storage Tier)"]
        Postgres[("🐘 قاعدة بيانات PostgreSQL 16 + PostGIS<br/>Row-Level Security & Spatial Geometry")]
        RedisCache[("⚡ ذاكرة التخزين السريع (Redis 7 / Memory)<br/>Rate Limits & Pub/Sub")]
    end

    subgraph KitchenHardware["عتاد المطبخ (Kitchen Hardware)"]
        Printer["🧾 طابعة المطبخ الحرارية (80mm Thermal)<br/>SUNLUX RP8020 (CP857 Turkish)"]
    end

    %% Flow connections
    Mobile -->|"REST API / JSON<br/>(تصفح، سلة، طلبات)"| API
    AdminWeb <-->|"Realtime SSE Stream<br/>(تنبيه صوتي بالطلبات الجديدة)"| SSEHub
    AdminWeb -->|"REST API<br/>(قبول/رفض الطلبات، إدارة القائمة)"| API

    API --> PricingEng
    API --> StateMachine
    API <--> RedisCache
    API <-->|"Least Privilege (app_api)<br/>RLS Customer Isolation"| Postgres

    API -->|"وظائف طباعة جديدة (Print Queue)"| PrintAgent
    PrintAgent -->|"Raw ESC/POS TCP (Port 9100)<br/>داخل الشبكة المحلية LAN"| Printer
```

---

## 2. دورة حياة الطلب وحالاته (Order Lifecycle State Machine)

```mermaid
stateDiagram-v2
    [*] --> new : إنشاء الطلب (Created by Customer)
    
    new --> accepted : قبول الطلب من المطبخ (Accepted by Staff)
    new --> rejected : رفض الطلب مع السبب (Rejected by Staff)
    new --> cancelled : إلغاء الطلب (Cancelled)
    
    accepted --> on_the_way : خروج السائق للتوصيل (On the Way)
    accepted --> cancelled : إلغاء اضطراري (Cancelled)
    
    on_the_way --> delivered : تم التسليم بنجاح (Delivered)
    on_the_way --> cancelled : إلغاء أثناء التوصيل (Cancelled)
    
    delivered --> [*] : حالة نهائية (Terminal State)
    rejected --> [*] : حالة نهائية (Terminal State)
    cancelled --> [*] : حالة نهائية (Terminal State)
```

---

## 3. تسلسل عملية الطلب والطباعة الفورية (Order Placement & Kitchen Ticket Sequence)

```mermaid
sequenceDiagram
    autonumber
    actor C as العميل (Customer App)
    participant B as الخادم (Backend API)
    participant DB as قاعدة البيانات (PostgreSQL)
    actor S as موظف المطعم (Staff Admin Web)
    participant PA as وكيل الطباعة (Print Agent)
    participant P as الطابعة الحرارية (Thermal Printer)

    C->>B: إرسال عناصر السلة والكوبون (POST /api/v1/cart/price)
    B->>DB: فحص نطاق التوصيل الجغرافي (find_delivery_zone PostGIS)
    B->>B: حساب الأسعار بالقروش والتحقق من الحد الأدنى
    B-->>C: تفاصيل التسعير المعتمدة من السيرفر
    
    C->>B: تأكيد الطلب مع مفتاح فريد (idempotency_key)
    B->>DB: إدراج الطلب كـ immutable snapshot
    B-->>S: بث فوري للطلب عبر SSE (تشغيل صوت إنذار مستمر)
    
    S->>B: الضغط على زر قبول الطلب (PATCH /status -> accepted)
    B->>DB: تحديث الحالة وإدراج مهمة طباعة (print_jobs)
    B-->>PA: إرسال أمر الطباعة عبر الاتصال الخارجي (Outbound Push)
    PA->>P: إرسال بيانات ESC/POS بترميز CP857 عبر منفذ 9100
    P-->>PA: خروج البون الورقي في المطبخ
    PA->>B: تأكيد نجاح الطباعة (ACK printed)
```

---

## 4. مكونات حزمة المشروع (Monorepo Modules Overview)

| المسار (Directory) | المكون (Component) | الوصف التقني والوظيفة |
| :--- | :--- | :--- |
| **`database/`** | قاعدة البيانات (PostgreSQL + PostGIS) | المصدر المرجعي الأول للبيانات (Source of Truth)، يحتوي على 7 ملفات ترحيل تضمن الأمان وعزل البيانات بالـ RLS. |
| **`packages/shared/`** | الحزمة المشتركة (Shared Package) | مخططات Zod المشتركة، حسابات القروش، الثوابت، اللغات المدعومة (`tr`, `en`, `ar`). |
| **`backend/`** | الخادم البرمجي (Backend API) | مبني بـ Fastify و Drizzle ORM ومحرك التسعير الصارم (Server-authoritative Pricing). |
| **`admin/`** | لوحة تحكم الإدارة (Admin Web) | واجهة React سريعة مع تنبيهات صوتية عالية لا تتوقف حتى يقبل الموظف الطلب. |
| **`mobile/`** | تطبيق الموبايل (Mobile App) | تطبيق Expo React Native يدعم التركية والإنجليزية والعربية (مع محاذاة RTL). |
| **`print-agent/`** | وكيل الطباعة (Print Agent) | خدمة تعمل محلياً وترسل البونات بترميز CP857 لطابعة SUNLUX عبر الشبكة الداخلية. |
| **`docs/`** | التوثيق الفني (Documentation) | توثيق كامل للهيكلية، الأمان، استراتيجية التشغيل، والافتراضات مع الترجمة العربية. |
