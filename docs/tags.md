# คู่มือ Tag ของชุดเทส

Tag คือป้ายที่แปะไว้กับเคสเทส เพื่อให้ **เลือกรันเฉพาะกลุ่ม** ได้ แทนที่จะรันทั้งชุด (127 เคส)ทุกครั้ง
เช่น อยากเช็กเร็วๆ ก่อน deploy ก็รันแค่ `@smoke` (5 เคส, ~2 วินาที) หรือแก้เรื่อง login ก็รันแค่ `@auth`

## สารบัญ
1. [Tag แบ่งเป็น 2 ชั้น](#1-tag-แบ่งเป็น-2-ชั้น)
2. [ตารางสรุปทุก tag](#2-ตารางสรุปทุก-tag)
3. [แต่ละ tag ทำอะไร ใช้เมื่อไหร่](#3-แต่ละ-tag-ทำอะไร-ใช้เมื่อไหร่)
4. [สถานการณ์ → คำสั่ง](#4-สถานการณ์--คำสั่ง)
5. [รวม tag: หรือ / และ / ยกเว้น](#5-รวม-tag-หรือ--และ--ยกเว้น)
6. [วิธีเพิ่ม tag ให้เคสใหม่](#6-วิธีเพิ่ม-tag-ให้เคสใหม่)
7. [ข้อควรระวัง](#7-ข้อควรระวัง)
8. [Priority: `@p0` `@p1` `@p2`](#8-priority-p0-p1-p2)

## 1. Tag แบ่งเป็น 2 ชั้น

| ชั้น | ตอบคำถาม | tag | ใส่ที่ไหน |
|---|---|---|---|
| **พื้นที่** (area) | เคสนี้เทส *ส่วนไหน* ของแอป | `@auth` `@tasks` `@profile` `@journey` | ที่ `describe` ทุกเคสข้างในได้ไปเอง |
| **ลักษณะเคส** (kind) | เคสนี้เทส *เรื่องอะไร* | `@smoke` `@validation` `@security` `@persistence` `@resilience` `@destructive` `@a11y` `@responsive` | ที่เคสนั้นโดยตรง (ใส่ได้หลายตัว) |

ทุกเคสมี tag พื้นที่อย่างน้อย 1 ตัวเสมอ ส่วน tag ลักษณะเคสมีเฉพาะเคสที่เข้าข่าย
เคสหนึ่งมีได้หลาย tag เช่น "รหัสผ่านผิดต้องขึ้น error แบบกลางๆ" มีทั้ง `@validation` และ `@security`

## 2. ตารางสรุปทุก tag

| Tag | จำนวนเคส | ใช้ทำอะไร (สั้นๆ) | คำสั่ง |
|---|---:|---|---|
| `@smoke` | 5 | เช็กเส้นทางหลักว่ายังไม่พังแบบร้ายแรง | `npm run test:smoke` |
| `@validation` | 39 | กรอกข้อมูลผิด/ว่าง ต้องมี error ที่ถูกต้อง | `npx playwright test --grep @validation` |
| `@security` | 12 | สิทธิ์เข้าถึง ข้อมูลไม่ปนกัน ไม่ render HTML จากผู้ใช้ | `npm run test:security` |
| `@persistence` | 11 | ข้อมูล/สถานะอยู่ต่อหลัง reload | `npx playwright test --grep @persistence` |
| `@resilience` | 13 | ข้อมูลที่เก็บไว้เสีย/ผิดรูป แล้วแอปยังไม่ล่ม | `npx playwright test --grep @resilience` |
| `@destructive` | 2 | เคสที่ลบข้อมูลจริง (ลบบัญชี) | ข้ามด้วย `npm run test:safe` |
| `@a11y` | 16 | ตรวจ accessibility ด้วย axe ทุกหน้า/สถานะ + คีย์บอร์ด + title | `npx playwright test --grep @a11y` |
| `@responsive` | 1 | หน้าจอมือถือ | `npx playwright test --grep @responsive` |
| `@characterization` | 46 | บันทึกพฤติกรรม *ปัจจุบัน* ที่ขอบเขตของข้อมูล | `npx playwright test --grep @characterization` |
| `@golden` | 8 | Golden Master: เทียบ state ทั้งก้อน (localStorage + ข้อมูลฝั่ง server) และ response/traffic กับ snapshot (เป็นส่วนหนึ่งของ `@characterization`) | `npx playwright test --grep @golden` |
| `@contract` | 15 | localStorage (token + theme) และ JSON ที่ API ส่งต้องตรง schema |
| `@har` | 2 | replay HAR ที่บันทึกไว้ให้หน้าเว็บโดยไม่ต้องมี API (ดู [traffic-recording.md](traffic-recording.md)) | `npm run test:har` |
| `@api` | 9 | JSON ที่ API ส่ง (สำเร็จและ error) ตรง schema กลาง และผู้ใช้แยกข้อมูลกัน (เป็นส่วนหนึ่งของ `@contract`) | `npx playwright test --grep @api` | `npx playwright test --grep @contract` |
| `@auth` | 36 | สมัคร, login/logout, route guard, session | `npx playwright test --grep @auth` |
| `@tasks` | 31 | task board ทั้งหมด | `npx playwright test --grep @tasks` |
| `@profile` | 12 | หน้าโปรไฟล์ทั้งหมด | `npx playwright test --grep @profile` |
| `@journey` | 6 | เส้นทางต่อเนื่องหลายหน้า | `npx playwright test --grep @journey` |
| `@p0` | 17 | ระดับ 0: ถ้าพังคือใช้งานหลักไม่ได้หรือสิทธิ์เข้าถึงรั่ว (ดูหัวข้อ 8) | `npm run test:p0` |
| `@p1` | 103 | ระดับ 1: พฤติกรรมของฟีเจอร์ (รันรวมกับ `@p0` ใน PR) | `npm run test:p1` (คือ `@p0` + `@p1`) |
| `@p2` | 36 | ระดับ 2: ความละเอียด, a11y, visual, เส้นทางที่ไม่กระทบการใช้งานหลัก | `npx playwright test --grep @p2` |

> จำนวนในคอลัมน์นี้นับรวมทุกไฟล์ใน `tests/` ซึ่งรวมโฟลเดอร์ `characterization/` และ `contracts/` ที่เพิ่มเข้ามาภายหลัง
> (ไม่ได้เขียนในรอบเดียวกับชุดหลัก ดูหัวข้อ 3 ท้ายสุด)

## 3. แต่ละ tag ทำอะไร ใช้เมื่อไหร่

### `@smoke` — ชุดเร็ว "ยังใช้งานได้ไหม"
- **ทำอะไร:** 5 เคสที่แทนเส้นทางสำคัญที่สุด: สมัครสมาชิก, login, เพิ่มงาน, เปลี่ยนรหัสผ่าน, รูทีนประจำวันแบบสั้น
- **ใช้เมื่อ:** เช็กเร็วหลัง push/deploy, ก่อน commit ใหญ่, หรืออยากรู้ว่า "พังแบบร้ายแรงไหม" ภายในไม่กี่วินาที
- **ไม่ควรใช้แทน:** การรันเต็ม เพราะไม่ครอบคลุมกรณีขอบ
- **คำสั่ง:** `npm run test:smoke`

### `@validation` — ตรวจการกรอกข้อมูล
- **ทำอะไร:** กรอกค่าที่ไม่ถูกต้อง (ว่าง, สั้นไป, ยาวเกิน, ซ้ำ, ไม่ตรงกัน) แล้วเช็กว่าขึ้น error ตรงตามข้อความและไม่บันทึกข้อมูล
- **ใช้เมื่อ:** แก้ฟอร์ม กฎตรวจข้อมูล หรือข้อความ error
- **คำสั่ง:** `npx playwright test --grep @validation`
- **เจาะเฉพาะฟอร์มหนึ่ง:** `npx playwright test --grep "(?=.*@tasks)(?=.*@validation)"`

### `@security` — สิทธิ์ ความเป็นส่วนตัว และการป้องกันพื้นฐาน
- **ทำอะไร:** ตรวจว่า
  - คนที่ยังไม่ login เข้าหน้าภายในไม่ได้ (redirect)
  - login ผิดแล้วข้อความเหมือนกันทุกกรณี (ไม่บอกว่า "ไม่มี user นี้" หรือ "รหัสผิด")
  - ผู้ใช้ 2 คนบนเบราว์เซอร์เดียวกันไม่เห็นข้อมูลกัน
  - ข้อความที่ผู้ใช้พิมพ์ (เช่น `<b>`) ถูกแสดงเป็นข้อความ ไม่กลายเป็น HTML
  - รหัสผ่านเก่าใช้ไม่ได้หลังเปลี่ยน
- **ใช้เมื่อ:** แก้ระบบ login, route, การเก็บ/แสดงข้อมูลผู้ใช้ และก่อน release ที่แตะส่วนเหล่านี้
- **คำสั่ง:** `npm run test:security`
- **หมายเหตุ:** เป็นการเช็กพฤติกรรมของแอป ไม่ใช่การทดสอบเจาะระบบ

### `@persistence` — ข้อมูลอยู่ต่อ
- **ทำอะไร:** ทำอะไรบางอย่าง แล้ว reload หน้า ดูว่าข้อมูลยังอยู่ (session, รายการงาน, สถานะติ๊ก, ชื่อที่แสดง, dark mode)
- **ใช้เมื่อ:** แก้ส่วนที่เก็บ/โหลดข้อมูล (localStorage, session) หรือเปลี่ยนรูปแบบข้อมูลที่เก็บ
- **คำสั่ง:** `npx playwright test --grep @persistence`

### `@resilience` — ทนข้อมูลเสีย
- **ทำอะไร:** ใส่ข้อมูลเสียเข้า storage ตรงๆ (JSON พัง, รายการผิดรูป, session ของ user ที่ไม่มีอยู่) แล้วเช็กว่าแอปไม่ล่มและยังใช้งานต่อได้
- **ใช้เมื่อ:** แก้โค้ดที่อ่านข้อมูลเก่า, เปลี่ยนรูปแบบข้อมูล (migration), หรือหลังแก้บั๊กที่ข้อมูลเสียทำแอปล่ม
- **คำสั่ง:** `npx playwright test --grep @resilience`

### `@destructive` — เคสที่ลบข้อมูล
- **ทำอะไร:** ลบบัญชีและงานทั้งหมดของผู้ใช้ (2 เคส)
- **ใช้เมื่อ:** *ไม่ใช้เพื่อเลือกรัน* แต่ใช้เพื่อ **ข้าม**: ถ้าวันหนึ่งชี้เทสไปที่ staging ที่มีข้อมูลร่วมกัน หรือสภาพแวดล้อมที่ลบแล้วเรียกคืนยาก ให้ข้ามเคสกลุ่มนี้
- **คำสั่ง:** `npm run test:safe` (รันทุกเคสยกเว้น `@destructive`)
- **หมายเหตุ:** ตอนนี้แอปเก็บข้อมูลในเบราว์เซอร์ของเทสเอง การลบจึงไม่กระทบใคร แต่ tag นี้ไว้เป็นนิสัยที่ดีเมื่อมี backend จริง

### `@a11y` — การเข้าถึง (accessibility) ด้วย axe
- **ทำอะไร:**
  - **ไฟล์ `tests/a11y.spec.ts` (14 เคส)** ใช้ [axe-core](https://github.com/dequelabs/axe-core) ผ่าน `@axe-core/playwright` สแกนหน้าเว็บตามเกณฑ์ **WCAG 2.0/2.1 ระดับ A และ AA**
    (เช่น ชื่อของปุ่ม/ช่องกรอก, คอนทราสต์ของสี, โครงสร้างลิสต์, ARIA ถูกต้อง)
  - สแกนทั้งหน้าที่ยังไม่ login (login, register, 404) และหลัง login (task board, โปรไฟล์) **ในหลายสถานะ**:
    มี error แสดงอยู่, กำลังแก้ชื่องาน, งานครบทุกสถานะ/priority, ผลกรองไม่เจอ, ข้อความสำเร็จ, และ **โหมดมืด**
  - เคสสุดท้าย "scanner detects a known violation" ใส่ `<img>` ที่ไม่มี alt ลงหน้าแล้วต้องเจอ `image-alt` เพื่อกัน axe ตั้งค่าผิดจนรายงานผ่านเงียบๆ
  - นอกจากนั้นมีอีก 2 เคสเดิม: ส่งฟอร์มด้วยปุ่ม Enter และ title ของแต่ละหน้า
- **ใช้เมื่อ:** แก้ UI, โครงหน้า, สี/ธีม, ลำดับ focus, เพิ่มหน้าใหม่
- **คำสั่ง:** `npx playwright test --grep @a11y` (หรือเฉพาะ axe: `npx playwright test a11y.spec.ts`)
- **อ่านผลที่พัง:** ข้อความขึ้นรูปแบบ `rule-id [ความรุนแรง]: คำอธิบาย -> selector ของจุดที่ผิด` เช่น
  `listitem [serious]: <li> elements must be contained in a <ul> or <ol> -> li:nth-child(1)`
  ค้นชื่อ rule ได้ที่ <https://dequeuniversity.com/rules/axe/>
- **เคยจับบั๊กจริง:** กล่อง error ของหน้าสมัครสมาชิกใช้ `<ul role="alert">` ทำให้ role ทับความหมายของลิสต์ (แก้โดยห่อ `<ul>` ไว้ใน `<div role="alert">`)
- **เพิ่มหน้า/สถานะใหม่:** เติมเคสใน `tests/a11y.spec.ts` โดยพาหน้าไปสถานะที่ต้องการ แล้วเรียก `await expectAccessible(page)`
- **ข้อจำกัด:** เครื่องมืออัตโนมัติจับปัญหา accessibility ได้เพียงส่วนหนึ่ง ไม่แทนการทดสอบด้วยคีย์บอร์ด/โปรแกรมอ่านหน้าจอจริง
  และตั้งใจใช้เฉพาะ rule ระดับ WCAG A/AA (ไม่บังคับ best-practice เช่น landmark หรือลำดับหัวข้อ)

### `@responsive` — หน้าจอเล็ก
- **ทำอะไร:** ตั้งจอ 375×667 (มือถือ) แล้วเช็กว่าหน้าไม่เลื่อนแนวนอน
- **ใช้เมื่อ:** แก้ CSS/เลย์เอาต์
- **คำสั่ง:** `npx playwright test --grep @responsive`

### `@characterization` — บันทึกพฤติกรรมปัจจุบัน
- **ทำอะไร:** เคสใน `tests/characterization/` "บันทึกสิ่งที่แอปทำอยู่ตอนนี้" ที่ขอบเขตของ input (ความยาว, อักขระ, ค่าว่าง) และตอนบูตจาก storage ที่ผิดปกติ
  รวมถึงส่วนที่แปลกด้วย ตามหัวไฟล์: *records reality, not intent* ถ้าเคสพัง ให้ตัดสินใจก่อนว่าพฤติกรรมที่เปลี่ยนนั้น "ตั้งใจ" หรือไม่ แล้วค่อยแก้ค่าที่คาดหวัง
- **ใช้เมื่อ:** จะ refactor หรือแก้ตรรกะ แล้วอยากรู้ว่าพฤติกรรมเดิมเปลี่ยนตรงไหนบ้างโดยไม่ตั้งใจ
- **คำสั่ง:** `npx playwright test --grep @characterization` (ข้ามชุดนี้: `--grep-invert @characterization`)
- **หมายเหตุ:** ไฟล์ชุดนี้ติด tag ท้ายชื่อ `describe` (เช่น `... @characterization @validation`) ไม่ได้ใช้ `{ tag: ... }` แต่ `--grep` จับได้เหมือนกัน
  และหลายเคสมี `@validation` / `@resilience` ร่วมด้วย จึงรวมอยู่ในจำนวนของ tag เหล่านั้น

### `@contract` — สัญญาของข้อมูลที่เก็บ
- **ทำอะไร:** เคสใน `tests/contracts/storage.spec.ts` ขับ UI จริงแล้วตรวจว่าทุกอย่างที่แอปเขียนลง localStorage (เหลือแค่ token กับ theme) ตรงกับ schema กลางใน `contracts/schemas.mjs` และเคสใน `tests/contracts/api.spec.ts` ตรวจ JSON ที่ API ส่งกับ schema เดียวกัน (spec คือ `contracts/openapi.yaml`)
  (ผู้ใช้, session, งาน, ธีม) รวมถึงความสัมพันธ์ข้ามคีย์
- **ใช้เมื่อ:** แก้รูปแบบข้อมูลที่เก็บ หรือเพิ่มฟิลด์ใหม่
- **คำสั่ง:** `npx playwright test --grep @contract`

> สองหัวข้อนี้อธิบายตามหัวไฟล์และ tag ที่ติดอยู่ ไฟล์เหล่านี้ไม่ได้เขียนในรอบเดียวกับชุดหลัก

### `@auth` `@tasks` `@profile` `@journey` — เลือกตามส่วนที่แก้
| Tag | ไฟล์ | ครอบคลุม | แก้ส่วนนี้ → รัน |
|---|---|---|---|
| `@auth` | `login.spec.ts` | สมัคร, login/logout, route guard, session, 404, title | `--grep @auth` |
| `@tasks` | `tasks.spec.ts` | เพิ่ม/แก้/ลบ/ติ๊ก, ค้นหา, กรอง, Clear completed | `--grep @tasks` |
| `@profile` | `profile.spec.ts` | ชื่อที่แสดง, รหัสผ่าน, dark mode, ลบบัญชี | `--grep @profile` |
| `@journey` | `journey.spec.ts` | เส้นทางเต็มหลายหน้า, สองผู้ใช้, มือถือ, ข้อมูลเสีย | `--grep @journey` |

`@journey` ช้าสุดและพังง่ายสุด เพราะผ่านหลายหน้า แนะนำรันก่อน release หรือเมื่อแก้ของที่คาบเกี่ยวหลายส่วน

## 4. สถานการณ์ → คำสั่ง

| สถานการณ์ | รันอะไร | คำสั่ง |
|---|---|---|
| เพิ่งแก้โค้ดนิดเดียว อยากเช็กเร็ว | ชุดเร็ว | `npm run test:smoke` |
| แก้หน้า login / สมัครสมาชิก | พื้นที่ auth | `npx playwright test --grep @auth` |
| แก้ task board | พื้นที่ tasks | `npx playwright test --grep @tasks` |
| แก้หน้าโปรไฟล์ | พื้นที่ profile | `npx playwright test --grep @profile` |
| แก้กฎตรวจข้อมูล/ข้อความ error | validation | `npx playwright test --grep @validation` |
| แก้ระบบสิทธิ์ / route / การแสดงข้อมูลผู้ใช้ | security | `npm run test:security` |
| แก้การบันทึก/โหลดข้อมูล | persistence + resilience | `npx playwright test --grep "@persistence\|@resilience"` |
| แก้ CSS/เลย์เอาต์ | responsive + a11y | `npx playwright test --grep "@responsive\|@a11y"` |
| ก่อน release | ทุกเคส | `npm test` |
| ชี้เทสไปสภาพแวดล้อมที่ลบข้อมูลไม่ได้ | ทุกเคสยกเว้นลบ | `npm run test:safe` |
| ต้องการรันซ้ำเฉพาะที่เพิ่งพัง | เคสที่ fail ในรอบล่าสุด (ถ้ารอบก่อนไม่มีเคสพัง จะขึ้น `No tests found`) | `npx playwright test --last-failed` |
| เช็กว่าเคสเสถียรไหม (กลัว flaky) | รันซ้ำหลายรอบ | `npx playwright test --grep @smoke --repeat-each=5` |
| อยากดูว่า tag นี้มีเคสอะไรบ้าง โดยไม่รัน | แสดงรายการ | `npx playwright test --list --grep @security` |
| อยากเห็นเบราว์เซอร์ตอนรัน | เปิดหน้าต่างจริง | `npx playwright test --grep @smoke --headed` |

> บน PowerShell ใส่ข้อความ `--grep` ในเครื่องหมายคำพูดคู่เสมอ และตัว `\|` ในตารางข้างบนเขียนแบบ markdown
> ตอนพิมพ์จริงให้ใช้ `|` ตัวเดียว เช่น `--grep "@persistence|@resilience"`

## 5. รวม tag: หรือ / และ / ยกเว้น

`--grep` รับ **regex** ที่ไปจับกับชื่อเคสพร้อม tag ของมัน

| ต้องการ | วิธีเขียน | ตัวอย่างจริง | ได้กี่เคส |
|---|---|---|---:|
| **หรือ** (มีตัวใดตัวหนึ่ง) | คั่นด้วย `\|` | `--grep "@auth\|@profile"` | 48 |
| **หรือ** (smoke + security) | คั่นด้วย `\|` | `--grep "@smoke\|@security"` | 16 |
| **และ** (ต้องมีทั้งสอง) | `(?=.*A)(?=.*B)` | `--grep "(?=.*@auth)(?=.*@validation)"` | 13 |
| **และ** (smoke ที่เป็น security ด้วย) | `(?=.*A)(?=.*B)` | `--grep "(?=.*@smoke)(?=.*@security)"` | 1 |
| **ยกเว้น** | `--grep-invert` | `--grep-invert @destructive` | 125 |
| **มี A แต่ไม่เอา B** | ใช้ทั้งคู่ | `--grep @validation --grep-invert @auth` | 26 |
| **ยกเว้นหลายตัว** | `--grep-invert` + `\|` | `--grep-invert "@destructive\|@resilience"` | 112 |

(ตัวเลขข้างบนตรวจจากคำสั่ง `--list` ของจริงแล้ว: ทั้งชุดมี 127 เคส)

เคล็ดลับ: ใช้ `--list` นำหน้าเพื่อดูว่า "คำสั่งนี้จะรันอะไรบ้าง" ก่อนรันจริง

```bash
npx playwright test --list --grep "(?=.*@auth)(?=.*@validation)"
```

## 6. วิธีเพิ่ม tag ให้เคสใหม่

ใช้ tag แบบ native ของ Playwright ผ่านอาร์กิวเมนต์ที่สอง (ไม่ต้องเขียน tag ปนในชื่อเคส)

```ts
// 1) tag พื้นที่: ใส่ที่ describe ทุกเคสข้างในได้ไปเอง
test.describe('Task board', { tag: '@tasks' }, () => {

  // 2) tag ลักษณะเคส: ใส่ที่เคส
  test('rejects a blank title', { tag: '@validation' }, async () => { /* ... */ });

  // 3) หลาย tag: ใช้ array
  test('wrong password shows a generic error', { tag: ['@validation', '@security'] }, async () => { /* ... */ });
});
```

หลักตัดสินใจ:
1. เคสอยู่ในไฟล์/`describe` ที่มี tag พื้นที่แล้วหรือยัง ถ้าไฟล์ใหม่ให้เพิ่ม tag พื้นที่ใหม่ที่ `describe`
2. เคสนี้ "กรอกผิดแล้วต้องมี error" → `@validation`
3. เคสนี้เกี่ยวกับสิทธิ์/ข้อมูลคนละคน/ป้องกัน HTML → `@security`
4. เคสนี้ reload แล้วเช็กข้อมูลอยู่ → `@persistence`
5. เคสนี้ลบข้อมูลที่กู้คืนไม่ได้ → `@destructive`
6. จะให้เป็น `@smoke` ได้ก็ต่อเมื่อเป็นเส้นทางหลักที่ "ถ้าพังแปลว่าแอปใช้ไม่ได้" และรันเร็ว เก็บไว้ไม่เกินหลักสิบเคส ไม่งั้นไม่เร็วอีกต่อไป

ตั้งชื่อ tag: ขึ้นต้นด้วย `@`, ตัวพิมพ์เล็ก, คำเดียว (เช่น `@billing`) และเพิ่มลงตารางในเอกสารนี้ด้วย

## 7. ข้อควรระวัง

- **มี workflow 2 ตัว แยกตาม tag:**
  - `.github/workflows/smoke.yml` รัน unit + `npx playwright test --grep "@smoke|@characterization"` ทุกครั้งที่ push เข้า `main` และทุก pull request — เร็ว ไม่ส่ง webhook และอัปโหลด `smoke-report` / `allure-report` ทุกรอบ
  - `.github/workflows/weekend-e2e.yml` รัน **ทุกเคส** (`npx playwright test` ไม่ใส่ filter) ทุกเสาร์-อาทิตย์ แล้วแจ้งผล
  ถ้าอยากเพิ่มงานตามกลุ่ม (เช่น `@a11y` ทุก PR ที่แก้ UI) ให้คัดลอก `smoke.yml` แล้วเปลี่ยนคำสั่งเป็น `npx playwright test --grep @a11y`
- **`--grep` จับแบบ regex กับชื่อทั้งหมด:** ชื่อ tag ที่เป็นส่วนหนึ่งของอีกตัว (เช่น `@auth` กับ `@authz`) จะจับปนกัน ให้ตั้งชื่อ tag ให้ไม่เป็นคำนำหน้าของกันและกัน
- **จำนวนในตารางต้องอัปเดตเอง** เมื่อเพิ่ม/ลบเคส ตรวจจำนวนล่าสุดด้วย `npx playwright test --list --grep @ชื่อ`
- **ถ้าใส่ `--reporter=...` ที่บรรทัดคำสั่ง** จะไม่มีไฟล์ `test-results/results.json` และสคริปต์แจ้งผลจะรายงานว่า FAIL ทั้งที่เทสผ่าน (ดู README)

## 8. Priority: `@p0` `@p1` `@p2`

Tag ในหัวข้อ 1–7 บอกว่าเคสนั้น *เทสเรื่องอะไร* ส่วน priority บอกว่า *ถ้าเคสนี้พัง เสียหายแค่ไหน* ใช้เลือกว่า "ช่วงเวลาไหนต้องรันเคสนี้"
(แผนว่าช่วงไหนรันอะไร: [pipeline-plan.md](pipeline-plan.md))

**กฎ: ทุกเคสต้องมี priority ตัวเดียวพอดี** `npm run check:tags` ตรวจให้ และ CI (job `unit`) ล้มถ้าเคสไหนไม่มีหรือมีสองตัว

| ระดับ | ความหมาย | ตัวอย่างในโปรเจกต์นี้ | รันเมื่อไหร่ |
|---|---|---|---|
| `@p0` | พังแล้วใช้งานหลักไม่ได้ หรือสิทธิ์เข้าถึง/ข้อมูลรั่ว | สมัคร, login, logout แล้วเข้าบอร์ดไม่ได้, redirect เมื่อไม่ได้ login, เพิ่ม/ติ๊ก/ลบงาน, ข้อความผู้ใช้ไม่กลายเป็น HTML, ผู้ใช้สองคนไม่เห็นข้อมูลกัน | ก่อน push และทุก PR |
| `@p1` | พฤติกรรมของฟีเจอร์ที่ผู้ใช้พึ่งพา | validation ของฟอร์ม, ค้นหา/กรอง, โปรไฟล์, contract ของ API/storage, characterization, golden master | ทุก PR (รวมกับ `@p0`) และหลัง merge |
| `@p2` | ความละเอียดที่พังแล้วไม่หยุดการใช้งาน | a11y (axe), visual snapshot, HAR replay, ข้อความเอกพจน์/พหูพจน์, back/forward | หลัง merge, สุดสัปดาห์, ก่อน release |

**วิธีตัดสินใจ:** ถามว่า "ถ้าเคสนี้พังแล้วปล่อยขึ้นไป ผู้ใช้เจอปัญหาแบบไหน" ใช้งานหลักไม่ได้หรือข้อมูลรั่ว → `@p0`,
ฟีเจอร์ผิดแต่ยังใช้อย่างอื่นได้ → `@p1`, แค่ดูไม่สวย/ไม่ละเอียด → `@p2` ถ้าลังเลระหว่างสองระดับ ให้เลือกระดับที่ต่ำกว่า
เพราะ `@p0` ที่บวมจะทำให้ชั้นเร็วช้าลง (ทบทวนเมื่อ `@p0` เกิน 20% ของทั้งหมด)

**เขียนยังไง:** ใช้ tag แบบ native ใส่ที่เคสโดยตรง หรือที่ `describe` ถ้าทุกเคสข้างในระดับเดียวกัน
```ts
test.describe('Accessibility', { tag: ['@a11y', '@p2'] }, () => { /* ... */ });
test('signs in with valid credentials', { tag: ['@smoke', '@p0'] }, async ({ page }) => { /* ... */ });
```
ห้ามใส่ priority ที่ `describe` แล้วใส่อีกตัวที่เคสข้างใน เพราะ tag รวมกัน เคสจะมีสองตัวและ `check:tags` จะล้ม
ไม่ต้องเปลี่ยนชื่อเคส เพื่อไม่ให้กระทบชื่อ snapshot และประวัติรายงาน

**ชั้นเป็นแบบสะสม** ชั้นที่รันใน PR คือ `@p0` รวม `@p1` ไม่ใช่ `@p1` อย่างเดียว:
`npm run test:p0` (เร็วสุด), `npm run test:p1` (`@p0` + `@p1`), ทุกชั้น = `npm test`

หมายเหตุ: เคส "task priority" ในแอป (Low/Medium/High) เป็นคนละเรื่องกับ tag `@p0`–`@p2` นี้
