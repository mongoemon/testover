# testover — QA อัตโนมัติ เสาร์-อาทิตย์ พร้อมแจ้งผล

ชุดเทส Playwright ขนาดเล็กสำหรับเว็บ Task Board ที่สร้างเองในโปรเจกต์นี้
รันอัตโนมัติบน GitHub Actions ทุกเสาร์และอาทิตย์ แล้วส่งผล ✅ PASS / ❌ FAIL เข้า Discord หรือ Slack

> คนใหม่เริ่มที่นี่: [docs/overview.html](docs/overview.html) ภาพรวมโปรเจกต์ใน 6 ขั้น · New here? [English version](docs/overview.en.html)
> อยากได้แบบอ่านง่ายมีเช็กลิสต์และตัวช่วยแปลงเวลา cron: เปิด [docs/guide.html](docs/guide.html) ในเบราว์เซอร์

### เปิดอ่านเอกสาร

| ที่ไหน | เว็บ Task Board | เอกสาร |
|---|---|---|
| ออนไลน์ (Cloudflare Pages) | https://testover.pages.dev | https://testover.pages.dev/docs/overview.html |
| ในเครื่อง (`npm start`) | http://localhost:3000 | http://localhost:3000/docs/overview.html |

- ในเว็บกดได้ 2 ที่: ลิงก์ **Read the docs** ใต้ฟอร์ม Sign in หรือเมนู **Docs** ที่แถบด้านบน (หลัง login)
- `/docs` จะพาไปหน้า overview ให้เอง จากหน้านั้นมีลิงก์ไป guide, โครงสร้างการเทส, tags.md และ README ครบ
- ไฟล์ที่เปิดได้: `/docs/<ชื่อไฟล์>.html`, `/docs/<ชื่อไฟล์>.md` และ `/README.md` (ไฟล์ .md จะแสดงเป็นข้อความดิบ)
- เพิ่มเอกสารใหม่: วางไฟล์ `.html` หรือ `.md` ไว้ใน `docs/` (ชื่อไฟล์ใช้ตัวพิมพ์เล็ก ตัวเลข `-` `.` เท่านั้น) แล้วเพิ่มลิงก์จาก `docs/overview.html`
- Deploy: push เข้า `main` แล้ว Cloudflare Pages build ให้เอง (build command `npm run build:pages` → โฟลเดอร์ `dist/`) ส่วน branch อื่นจะได้ preview URL แยก

## สารบัญ
1. [โครงสร้างโปรเจกต์](#1-โครงสร้างโปรเจกต์)
2. [รันในเครื่อง](#2-รันในเครื่อง)
3. [เคสที่เทส](#3-เคสที่เทส)
4. [Guideline: ตั้งค่า Webhook](#4-guideline-ตั้งค่า-webhook)
5. [Guideline: ขึ้น GitHub และตั้ง Secret](#5-guideline-ขึ้น-github-และตั้ง-secret)
6. [Guideline: ตั้งเวลารัน (cron)](#6-guideline-ตั้งเวลารัน-cron)
7. [ตัวอย่างข้อความที่ได้รับ](#7-ตัวอย่างข้อความที่ได้รับ)
8. [แก้ปัญหาที่พบบ่อย](#8-แก้ปัญหาที่พบบ่อย)

## 1. โครงสร้างโปรเจกต์

```
app/
  index.html        เว็บที่ใช้เทส (สมัคร/login, task board, โปรไฟล์) เก็บข้อมูลใน localStorage
  server.mjs        เซิร์ฟเวอร์ static เล็กๆ (ไม่ต้องติดตั้งอะไรเพิ่ม) เสิร์ฟทั้งเว็บและ docs/
tests/
  support/pages.ts  Page Object (AuthPage, TasksPage, ProfilePage) + ข้อมูลผู้ใช้ทดสอบ
  login.spec.ts     สมัครสมาชิก, login/logout, route guard, session, 404, title
  tasks.spec.ts     เพิ่ม/แก้/ลบ/ติ๊กเสร็จ, ค้นหา, กรอง, clear completed, ข้อมูลคงอยู่หลัง reload
  profile.spec.ts   เปลี่ยนชื่อ, เปลี่ยนรหัสผ่าน, dark mode, ลบบัญชี
  journey.spec.ts   user journey ต่อเนื่อง, ผู้ใช้ 2 คนข้อมูลแยกกัน, จอมือถือ, ข้อมูลใน storage เสีย
  a11y.spec.ts      ตรวจ accessibility ด้วย axe (WCAG 2.1 A/AA) ทุกหน้าและทุกสถานะสำคัญ
  characterization/ บันทึกพฤติกรรมปัจจุบันที่ขอบเขตของข้อมูล (เพิ่มเข้ามาภายหลัง)
  contracts/        ตรวจว่าข้อมูลใน localStorage ตรง schema (เพิ่มเข้ามาภายหลัง)
scripts/
  notify.mjs        อ่านผลเทสแล้วส่งเข้า webhook
  build-pages.mjs   รวมเว็บ + docs/ + README.md ไว้ใน dist/ ให้ Cloudflare Pages
.github/workflows/
  smoke.yml         ชุดเร็ว (unit + @smoke + @characterization) ทุกครั้งที่ push เข้า main และทุก pull request
  weekend-e2e.yml   รันทุกเคสเสาร์-อาทิตย์ตามเวลาที่ตั้ง แล้วแจ้งผลเข้า webhook
playwright.config.ts
```

## 2. รันในเครื่อง

### ตั้งค่าเครื่องใหม่ (ครั้งแรก)

ต้องมี:
- **Node.js 22 ขึ้นไป** (`node -v`) รุ่น 20 ใช้ไม่ได้ เพราะ `npm run test:unit` ใช้ glob ของ `node --test` ที่มีตั้งแต่ Node 21
- **Git**
- **Java 8 ขึ้นไป**: เฉพาะถ้าจะใช้คำสั่ง `allure:*` ส่วนเทสปกติไม่ต้องมี

```bash
git clone https://github.com/mongoemon/testover.git
cd testover
npm ci                            # ติดตั้งตาม package-lock.json เป๊ะ ไม่แก้ไฟล์ lock
npx playwright install chromium   # Linux ใช้ --with-deps chromium เพื่อลง library ของระบบด้วย
```

เช็กว่าเครื่องพร้อม:

```bash
npm run test:unit   # ต้องเห็น pass 50, fail 0
npm test            # ต้องเห็น 127 passed (เปิดเว็บให้เองอัตโนมัติ)
npm start           # เปิด http://localhost:3000/docs/overview.html อ่านเอกสารได้
```

- ใช้ `npm ci` แทน `npm install` เพื่อให้ได้ dependency รุ่นเดียวกับเครื่องอื่นและ CI ถ้าใช้ `npm install` แล้ว `package-lock.json` เปลี่ยน อย่า commit ไฟล์นั้นถ้าไม่ได้ตั้งใจอัปเดต dependency
- ไม่ต้องตั้ง `.env` หรือ secret อะไรในเครื่อง `WEBHOOK_URL` ใช้แค่บน GitHub Actions (หัวข้อ 5) ถ้าอยากลองส่งจริงจากเครื่องให้ใส่ตอนรัน: `WEBHOOK_URL=<url> npm run notify`
- ไม่ต้องลง Wrangler หรือตั้งค่า Cloudflare ในเครื่อง การ deploy ทำผ่าน push เข้า `main` (ดู [เปิดอ่านเอกสาร](#เปิดอ่านเอกสาร))

### คำสั่งที่ใช้บ่อย

```bash
npm test                          # รันทุกเคส (เปิดเว็บให้เองอัตโนมัติ)
npm run report                    # เปิดรายงาน HTML
npm run test:headed               # รันแบบเห็นเบราว์เซอร์
npm start                         # เปิดเว็บเองที่ http://localhost:3000 (เอกสารอยู่ที่ /docs)
npm run build:pages               # สร้าง dist/ แบบเดียวกับที่ขึ้น Cloudflare Pages
```

ทดลองสคริปต์แจ้งผลโดยไม่ส่งจริง (ไม่ตั้ง `WEBHOOK_URL` จะแค่พิมพ์ข้อความออกจอ):

```bash
npm run notify
```

เทสกับเว็บอื่นแทนเว็บในโปรเจกต์: ตั้ง `BASE_URL` (ตอนนั้นจะไม่เปิดเซิร์ฟเวอร์ให้)
แต่เคสต้องปรับให้ตรงกับเว็บนั้นด้วย

## 3. เคสที่เทส

รวม **127 เคส** เป็น regression ที่เดินตาม user journey ของแอป Task Board
(84 เคสในไฟล์หลัก 5 ไฟล์ข้างล่าง + 43 เคสใน `characterization/` และ `contracts/`)

| ไฟล์ | ครอบคลุม |
|---|---|
| `login.spec.ts` | สมัครสมาชิก (validation ทุกข้อ, ชื่อซ้ำ, ไม่สนตัวพิมพ์เล็ก/ใหญ่) · login ผิด/ว่าง · logout · ผู้ที่ยังไม่ login ถูกส่งกลับหน้า login · session หลัง reload · หน้า 404 · title ของแต่ละหน้า · ปุ่ม back/forward |
| `tasks.spec.ts` | เพิ่มงาน (priority, trim, Enter, ชื่อว่าง, ยาวเกิน 80, อักขระพิเศษไม่กลายเป็น HTML) · ติ๊กเสร็จ/เปิดใหม่ · แก้ชื่อ/ยกเลิก · ลบ · ค้นหา · กรอง All/Active/Completed · Clear completed · ข้อมูลคงอยู่หลัง reload |
| `profile.spec.ts` | เปลี่ยนชื่อที่แสดง · เปลี่ยนรหัสผ่าน (ผิด/สั้น/ไม่ตรง/สำเร็จ) · dark mode จำค่า · ลบบัญชี (ยกเลิก/ยืนยัน) |
| `journey.spec.ts` | เส้นทางเต็ม: สมัคร → วางแผนงาน → ทำงาน → logout/login ข้อมูลยังอยู่ → แก้โปรไฟล์ → เปลี่ยนรหัสผ่าน → ลบบัญชี · ผู้ใช้ 2 คนข้อมูลไม่ปนกัน · จอมือถือไม่ล้น · ข้อมูลใน storage เสีย |
| `a11y.spec.ts` | axe สแกนหน้า login/register/404/task board/โปรไฟล์ ทั้งตอนปกติ มี error กำลังแก้ไข และโหมดมืด + เคสยืนยันว่า axe จับปัญหาได้จริง |

### Workflow บน GitHub Actions

| ไฟล์ | เมื่อไหร่ | รันอะไร | แจ้ง webhook |
|---|---|---|---|
| `smoke.yml` | push เข้า `main`, ทุก pull request, กดรันเอง | unit + `@smoke` + `@characterization` (50 เคส Playwright รอบเดียว ~ไม่กี่นาที) | ไม่ส่ง (ดูผลที่แท็บ Actions / ช่อง checks ของ PR) |
| `weekend-e2e.yml` | เสาร์-อาทิตย์ 09:00 เวลาไทย, กดรันเอง | **ทั้ง 127 เคส** | ส่งทุกครั้ง ผ่านหรือพัง |

`smoke.yml` ยกเลิกรอบเก่าให้อัตโนมัติถ้ามี push ใหม่เข้ามาที่ branch เดียวกัน (`concurrency`)
และอัปโหลดรายงานทุกรอบ (artifact `smoke-report` = Playwright HTML, `allure-report` = Allure) พร้อมตารางสรุปผลในหน้า run และ annotation บน PR ถ้าอยากให้ PR ต้องผ่านก่อน merge ให้ตั้ง branch protection → Require status checks → เลือก `smoke`

### Accessibility ด้วย axe

`tests/a11y.spec.ts` ใช้ [`@axe-core/playwright`](https://github.com/dequelabs/axe-core-npm) ตรวจตามเกณฑ์ WCAG 2.0/2.1 ระดับ A และ AA
ตัวอย่างข้อความตอนพัง: `listitem [serious]: <li> elements must be contained in a <ul> or <ol> -> li:nth-child(1)`
(rule · ความรุนแรง · คำอธิบาย · selector ของจุดที่ผิด)

```bash
npx playwright test a11y.spec.ts      # เฉพาะ axe
npx playwright test --grep @a11y      # axe + เคสคีย์บอร์ด/title
```

axe ช่วยจับปัญหาได้ส่วนหนึ่ง ไม่แทนการลองใช้คีย์บอร์ดและโปรแกรมอ่านหน้าจอจริง
รายละเอียด วิธีเพิ่มหน้า/สถานะใหม่ และข้อจำกัด: [docs/tags.md](docs/tags.md) หัวข้อ `@a11y`

### Tag ของเคส

ทุกเคสมี tag อย่างน้อย 1 ตัวคือ **tag พื้นที่** (ตามไฟล์) และบางเคสมี **tag ลักษณะเคส** เพิ่ม
ใช้ tag แบบ native ของ Playwright `test('ชื่อ', { tag: '@smoke' }, ...)` ตัวพื้นที่ใส่ที่ระดับ `describe`

| Tag | ความหมาย | จำนวน |
|---|---|---|
| `@auth` `@tasks` `@profile` `@journey` | พื้นที่ของแอป | 36 / 31 / 12 / 6 |
| `@smoke` | ชุดเร็ว เช็กเส้นทางหลัก | 5 |
| `@validation` | กรอกข้อมูลผิด/ว่าง แล้วต้องมี error | 39 |
| `@security` | ข้อความ error ไม่บอกใบ้, route guard, ข้อมูลแยกต่อผู้ใช้, ไม่ render HTML | 12 |
| `@persistence` | ข้อมูล/สถานะอยู่ต่อหลัง reload | 11 |
| `@resilience` | ข้อมูลใน storage เสียหรือผิดรูป | 13 |
| `@destructive` | ลบบัญชี | 2 |
| `@a11y` | axe (WCAG 2.1 A/AA), คีย์บอร์ด, title ของหน้า | 16 |
| `@responsive` | จอมือถือ | 1 |
| `@characterization` | บันทึกพฤติกรรมปัจจุบันที่ขอบเขตของข้อมูล | 42 |
| `@golden` | Golden Master: localStorage ทั้งก้อนเทียบ snapshot (อยู่ใน `@characterization`) | 5 |
| `@contract` | ข้อมูลใน localStorage ตรง schema | 6 |

เคสหนึ่งมีได้หลาย tag (เช่น รหัสผ่านผิดเป็นทั้ง `@validation` และ `@security`)
จึงตัวเลขรวมในตารางเกิน 127

```bash
npm run test:smoke                                 # ชุดเร็ว 5 เคส
npx playwright test --grep @security               # ตาม tag เดียว
npx playwright test --grep "@auth|@profile"        # หลาย tag แบบ "หรือ"
npx playwright test --grep @validation --grep-invert @auth   # มีตัวหนึ่ง แต่ไม่เอาอีกตัว
npx playwright test --grep-invert @destructive     # ข้ามเคสที่ลบข้อมูล
npx playwright test --list                         # ดูรายการเคสทั้งหมด
```

เพิ่มเคสใหม่: ใส่ tag พื้นที่ผ่าน `describe` ที่มีอยู่ และเติม tag ลักษณะเคสถ้าเข้าข่าย

อธิบายทุก tag, กรณีที่ควรใช้ตัวไหน และคำสั่งทั้งหมด: [docs/tags.md](docs/tags.md)

ผู้ใช้ทดสอบ: `demo` / `demo1234` (มีให้ในแอปตั้งแต่เริ่ม) และ `alice` / `s3cretpass` (สมัครใหม่ในเทส) เป็นข้อมูลสมมติ
แต่ละเคสเริ่มด้วย browser context ใหม่ จึงไม่มีข้อมูลค้างข้ามเคส

> แอปนี้เก็บรหัสผ่านเป็นข้อความธรรมดาใน localStorage โดยตั้งใจ เพื่อให้เทสได้โดยไม่ต้องมี backend ห้ามนำแบบนี้ไปใช้กับงานจริง

## 4. Guideline: ตั้งค่า Webhook

Webhook คือ URL ที่รับข้อความแล้วโพสต์เข้าช่องแชตให้ สคริปต์ `notify.mjs` ส่ง JSON ที่มีทั้ง
`content` (Discord) และ `text` (Slack) จึงใช้ได้ทั้งสองแบบโดยไม่ต้องแก้โค้ด

### Discord (ง่ายที่สุด)
1. เปิดเซิร์ฟเวอร์ที่คุณมีสิทธิ์จัดการ แล้วคลิกขวาที่ช่องที่ต้องการ → **Edit Channel**
2. ไปที่ **Integrations → Webhooks → New Webhook**
3. ตั้งชื่อ (เช่น `QA Bot`) เลือกช่อง แล้วกด **Copy Webhook URL**
4. URL หน้าตาประมาณ `https://discord.com/api/webhooks/<id>/<token>`

### Slack
1. ไปที่ <https://api.slack.com/apps> → **Create New App → From scratch**
2. เมนู **Incoming Webhooks** → เปิดสวิตช์ **Activate Incoming Webhooks**
3. กด **Add New Webhook to Workspace** เลือกช่อง แล้ว Copy URL
4. URL หน้าตาประมาณ `https://hooks.slack.com/services/T.../B.../...`

### LINE
LINE Notify ปิดบริการแล้ว ถ้าจะใช้ LINE ต้องใช้ LINE Messaging API
ซึ่งรูปแบบไม่เหมือน webhook ข้างบน และต้องแก้ `notify.mjs` เพิ่ม (ยังไม่ได้ทำในโปรเจกต์นี้)

### ทดสอบ webhook ก่อนใช้จริง
```bash
# bash
WEBHOOK_URL="<วาง URL ที่นี่>" npm run notify
```
```powershell
# PowerShell
$env:WEBHOOK_URL = "<วาง URL ที่นี่>"; npm run notify
```
ต้องเห็น `Notification sent.` และมีข้อความเข้าช่อง (ต้องรัน `npm test` ก่อน เพื่อให้มีไฟล์ผลเทส)

### ข้อควรระวังเรื่องความปลอดภัย
- **Webhook URL คือรหัสลับ** ใครได้ไปก็โพสต์เข้าช่องคุณได้ ห้ามใส่ในโค้ด ห้าม commit
- เก็บใน GitHub Secrets เท่านั้น (ดูหัวข้อ 5)
- ถ้าหลุด ให้ลบ webhook เดิมแล้วสร้างใหม่ทันที (Discord: ลบที่หน้า Webhooks / Slack: Revoke)

## 5. Guideline: ขึ้น GitHub และตั้ง Secret

1. สร้าง repo ใหม่บน GitHub (แนะนำ private)
2. ในโฟลเดอร์โปรเจกต์:
   ```bash
   git init
   git add .
   git commit -m "feat: add weekend QA suite"
   git branch -M main
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
   ไฟล์ `.gitignore` กัน `node_modules`, รายงาน และ `.env` ไว้แล้ว
3. ไปที่ repo → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `WEBHOOK_URL`
   - Secret: วาง URL จากหัวข้อ 4
4. ไปที่แท็บ **Actions → Weekend E2E → Run workflow** เพื่อทดสอบรันด้วยมือหนึ่งครั้ง
   ผลควรเข้าช่องแชตภายในไม่กี่นาที และดูรายงานได้ที่ Artifacts ของ run นั้น

## 6. Guideline: ตั้งเวลารัน (cron)

เวลาตั้งที่ [.github/workflows/weekend-e2e.yml](.github/workflows/weekend-e2e.yml):

```yaml
on:
  schedule:
    - cron: '0 2 * * 6,0'
  workflow_dispatch:
```

**cron ของ GitHub ใช้เวลา UTC เสมอ** (ไทย = UTC+7 ต้องลบ 7 ชั่วโมง)

รูปแบบ: `นาที ชั่วโมง วันที่ เดือน วันในสัปดาห์` (วันในสัปดาห์: 0 = อาทิตย์, 6 = เสาร์)

| ต้องการ (เวลาไทย) | cron (UTC) |
|---|---|
| เสาร์+อาทิตย์ 09:00 (ค่าปัจจุบัน) | `0 2 * * 6,0` |
| เสาร์+อาทิตย์ 06:00 | `0 23 * * 5,6` |
| เสาร์เดียว 20:00 | `0 13 * * 6` |
| ทุกวัน 08:30 | `30 1 * * *` |
| เสาร์และอาทิตย์ ทุก 6 ชั่วโมง | `0 */6 * * 6,0` |

**ข้อสังเกตเรื่องวัน:** ถ้าเวลาไทยเลยเที่ยงคืนไปแล้ว วันใน cron จะถอยไปหนึ่งวัน
เช่น เสาร์ 06:00 ไทย = ศุกร์ 23:00 UTC จึงต้องใช้ `5` ไม่ใช่ `6` (ดูแถวที่สองในตาราง)
ส่วนแถวสุดท้าย (ทุก 6 ชั่วโมง) นับตามวัน UTC ชั่วโมงที่ตกใกล้เที่ยงคืนไทยอาจเลื่อนไปคนละวันกับที่คาด

ตรวจ cron ได้ที่ <https://crontab.guru> (แสดงเป็น UTC เช่นกัน)

### สิ่งที่ต้องรู้เกี่ยวกับ schedule ของ GitHub
- งานอาจ **เริ่มช้า** ได้หลายนาที (บางครั้งนานกว่านั้นช่วงที่ระบบหนาแน่น) ถือเป็นเรื่องปกติ
- ถ้า repo **ไม่มีกิจกรรมเลย 60 วัน** GitHub จะหยุด schedule อัตโนมัติ ต้องกด Enable ใหม่ที่แท็บ Actions
- schedule ทำงานเฉพาะ **default branch** (ปกติคือ `main`)
- ตั้ง `timeout-minutes: 20` ไว้แล้ว กัน job ค้างข้ามสุดสัปดาห์

### ทดสอบว่า schedule ทำงานจริง
1. เปลี่ยน cron เป็นอีกไม่กี่นาทีข้างหน้า เช่น `*/10 * * * *`
2. push แล้วรอ (อาจช้าสักพัก)
3. เห็นข้อความเข้าแล้ว **เปลี่ยนกลับเป็น `0 2 * * 6,0` ทันที** ไม่งั้นจะรันทุก 10 นาที

### กันกรณีที่ workflow ไม่รันเลย (heartbeat)
ถ้า schedule ถูกปิด หรือ GitHub ล่ม จะไม่มีข้อความเข้าเลยและเราไม่รู้ตัว
แนะนำใช้ <https://healthchecks.io> (ฟรี): สร้าง check ที่คาดว่าจะถูก ping ทุกสัปดาห์
แล้วเพิ่ม step `curl` ping ท้าย workflow เมื่อรันผ่าน ถ้าไม่มี ping ตามกำหนดจะแจ้งเตือนให้เอง
(ยังไม่ได้เพิ่มใน workflow ปัจจุบัน)

## 7. ตัวอย่างข้อความที่ได้รับ

```
✅ PASS — weekend QA run
passed: 127 | failed: 0 | flaky: 0 | skipped: 0
https://github.com/<user>/<repo>/actions/runs/123456789
```

```
❌ FAIL — weekend QA run
passed: 126 | failed: 1 | flaky: 0 | skipped: 0
• Task board › completing, editing, deleting › deletes only the targeted task
https://github.com/<user>/<repo>/actions/runs/123456789
```

- `flaky` = เทสที่ fail ก่อนแต่ผ่านตอน retry (ควรตามแก้ ถ้าขึ้นบ่อย)
- เปิดลิงก์ → ส่วน Artifacts → ดาวน์โหลด `playwright-report` เพื่อดู screenshot, video และ trace ของเคสที่พัง

## 8. แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| ไม่มีข้อความเข้า แต่ workflow รันแล้ว | ยังไม่ตั้ง secret `WEBHOOK_URL` (log จะเขียนว่า `skipping send`) หรือตั้งชื่อผิด |
| `Webhook responded 404` | webhook ถูกลบหรือ URL ผิด สร้างใหม่แล้วอัปเดต secret |
| `Webhook responded 429` | ส่งถี่เกินไป (rate limit) ลดความถี่ของ cron |
| Workflow ไม่รันตามเวลาเลย | ยังไม่ได้ push ไป default branch / schedule ถูกปิดหลังไม่มีกิจกรรม 60 วัน / ลองดูแท็บ Actions ว่าถูก disable หรือไม่ |
| รันผิดวัน | ลืมแปลง UTC ดูหมายเหตุเรื่องวันในหัวข้อ 6 |
| เทสพังเฉพาะบน CI | ดู trace ใน artifact `playwright-report` (`npx playwright show-trace <ไฟล์>`) |
| พอร์ต 3000 ชน (รันในเครื่อง) | ตั้ง `PORT` เช่น `PORT=3100 npm test` |
