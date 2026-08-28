

MohammadOS-PWA 🛡️
A privacy-first, offline-capable Progressive Web App (PWA) designed as a Personal Operating System for habit tracking, time management, and analytical self-reflection.

Live DemoLicense: MITBuilt with React

📖 Overview
MohammadOS is a domain-driven, offline-first application built to function as a personal dashboard. It operates entirely in the browser without requiring a backend for core functionalities, storing data locally using IndexedDB. The architecture is designed to be scalable, maintainable, and highly responsive on mobile devices.

✨ Key Features
Offline-First Architecture: Full CRUD capabilities without an internet connection using Dexie.js (IndexedDB).
Domain-Driven Design (DDD): Clean separation of concerns (domain/, repositories/, service/, pages/).
Advanced Analytics: Custom-built SVG charts and an EMA (Exponential Moving Average) based habit strength calculator.
PWA Compliance: Installable on mobile/desktop, supports push notifications, and handles dynamic routing.
Automated Backups: Gzip-compressed local backups and import/export capabilities.
🛠️ Tech Stack
Framework: React 19 + Vite
State & Database: Dexie.js (IndexedDB)
Styling: Tailwind CSS
PWA: vite-plugin-pwa
AI Integration: Local rule-based engine + Proxy-gated external AI (AvalAI)
🚀 Getting Started
Prerequisites
Node.js (v18+)
npm or yarn
Installation
Clone the repository:
git clone https://github.com/mohammadghiyasvand1093-del/MohammadOS-PWA.git
Navigate to the project directory:
bash

cd MohammadOS-PWA
Install dependencies:
bash

npm install
Start the development server:
bash

npm run dev
Build for Production
bash

npm run build
📂 Architecture
The project follows a strict Domain-Driven structure to ensure business logic is decoupled from UI:

src/domain/: Core business logic, calculations (e.g., logCalculator.js), and validation rules.
src/repositories/: Data access layer interacting with Dexie.
src/service/: Application services orchestrating domain logic for the UI.
src/pages/: React components mapped to routes.
src/hooks/: Custom React hooks for UI and lifecycle management.
📄 License
This project is licensed under the MIT License - see the LICENSE file for details.

text


---

### 📝 اقدامات بعدی شما (برای تکمیل E0)
ناظر دوم این سه فایل را تأیید کرد. اکنون نوبت شماست که فایل‌های فیزیکی را در سیستم خود جابجا کنید:

1. **E0.1 (Flatten):** محتوای درون پوشه `MohammadOS-PWA/` را به ریشه پروژه بیاورید.
2. **E0.2 (Separate Private):** پوشه `MohammadOS/` (فایل‌های شخصی) را به یک ریپوی خصوصی دیگر منتقل کنید.
3. **E0.8 (Favicon):** فایل `favicon.svg` را بسازید یا ارجاعات آن در `index.html` و `vite.config.js` را پاک کنید.
4. **E0.9 (Clean):** `App.css` خالی را پاک کنید.
5. **E0.10 (Git Push):** تغییرات را کامیت و پوش کنید.

پس از انجام این کارها، دستور `npm run lint && npm run build` را بگیرید و خروجی آن را به من بدهید تا فاز E0 را به صورت رسمی تأیید کنم و وارد فاز M1 (رفع مشکل امنیتی API و بهبود موبایل) شویم. 🔒


