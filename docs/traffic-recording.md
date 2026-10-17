# เครื่องมือ Record & Replay ที่ลองกับ testover

English: [traffic-recording.en.md](traffic-recording.en.md)

เอกสารนี้สรุปผลการลอง 3 เครื่องมือบน API ของโปรเจกต์นี้ (13 endpoint, spec อยู่ที่ [contracts/openapi.yaml](../contracts/openapi.yaml)) ว่าแต่ละตัวเหมาะกับงานแบบไหน ไม่ได้ลองทุกตัวที่ถูกพูดถึง (ดูหัวข้อสุดท้าย)

## สรุปสั้นๆ

| เครื่องมือ | ทำอะไรให้ | ผลที่ได้จริง | ควรใช้ต่อไหม |
|---|---|---|---|
| **Prism** (proxy mode) | ตรวจทุก request/response ของ API จริงกับ spec | ผ่านทั้ง 9 เคสของ `api.spec.ts` ไม่มี response ใดผิด spec และพิสูจน์แล้วว่าจับ drift ได้ | **ใช้** ตรวจว่า spec กับโค้ดยังตรงกัน |
| **`routeFromHAR`** ของ Playwright | บันทึกการคุยกับ API ครั้งหนึ่ง แล้ว replay ให้หน้าเว็บโดยไม่ต้องมี backend | บันทึกได้ replay ได้ และ request ที่ไม่ได้บันทึกถูกตัดทิ้งให้เห็นชัด | **ใช้** กับ flow แบบอ่านอย่างเดียว |
| **Mockoon** | สร้าง mock server จาก spec | นำเข้าได้ 13 route แต่ค่าที่สร้างให้เป็นค่าว่าง และจำสถานะไม่ได้ | ใช้ตอนพัฒนา front end ได้ ยังไม่ใส่ในชุดเทส |

## 1. Prism: ตรวจว่า API จริงตรงกับ spec

```bash
npm run contract:prism
```

สคริปต์ [scripts/prism-check.mjs](../scripts/prism-check.mjs) เปิดแอปบนพอร์ตว่าง วาง Prism หน้าแอป (proxy mode) รัน `tests/contracts/api.spec.ts` ผ่าน Prism แล้วล้มถ้า Prism เห็น **response** ที่ผิด spec ครั้งแรกต้องมีอินเทอร์เน็ต (npx โหลด Prism)

- ผล: 9 เคสผ่าน และ "ไม่มี response ใดผิด spec"
- ทดสอบว่ามันกัดจริง: ผมทำสำเนา spec ที่ลบ `done` ออกจาก Task แล้ว Prism ฟ้องทันทีว่า `Response body must NOT have additional properties; found 'done'` (spec กับโค้ดไม่ตรงกัน)
- สิ่งที่ต้องรู้: Prism ตรวจ **request** ด้วย เคสที่ส่งข้อมูลผิดโดยตั้งใจ (เพื่อดู error) จึงมี "request violation" เป็นปกติ สคริปต์เลยดูเฉพาะ response ถ้าเปิด `--errors` Prism จะตอบ error เองแทนเซิร์ฟเวอร์ ทำให้เคสทดสอบ error ล้มทั้งที่ไม่มีอะไรผิด
- ข้อจำกัด: ตรวจได้เท่าที่เทสเรียก ถ้า endpoint ไหนไม่มีเคสเรียก Prism ก็ไม่เห็น

## 2. HAR: เล่นซ้ำการคุยกับ API ให้หน้าเว็บ

```bash
npm run test:har      # replay (ไม่ต้องมี API)
npm run har:record    # บันทึกใหม่จาก server จริง
```

สเปก [tests/har/replay.spec.ts](../tests/har/replay.spec.ts) ใช้ `page.routeFromHAR` กับ `**/api/**` ไฟล์ที่บันทึกอยู่ที่ `tests/har/fixtures/demo-journey.har` (4 request: login, ดูโปรไฟล์, ดูงาน, ดูโปรไฟล์อีกรอบ)

- ตอน replay เบราว์เซอร์ไม่แตะ `/api` เลย แต่หน้างานยังขึ้นครบ จึงใช้เทส front end แยกจาก back end ได้
- ตั้ง `notFound: 'abort'` ไว้ เมื่อหน้าเว็บเรียกอะไรที่ไม่ได้บันทึก (เช่นเพิ่มงาน) จะล้มให้เห็นทันที เคสที่สองในไฟล์พิสูจน์เรื่องนี้ ใช้เป็นสัญญาณเตือนว่า front end เริ่มคุยกับ API ต่างไปจากเดิม
- ข้อจำกัด: HAR เก็บแค่ "วันนั้น server ตอบอะไร" ลำดับที่สถานะเปลี่ยน (เพิ่มงานแล้วดูรายการ) เล่นซ้ำให้ถูกไม่ได้ จึงเหมาะกับ flow แบบอ่านอย่างเดียว และไม่ได้ทดสอบ back end เลย
- ข้อมูลใน HAR เป็นข้อมูลสมมติ (บัญชี demo, token ที่หมดอายุไปแล้ว) ถ้าบันทึกจากระบบจริงต้องล้าง token/รหัสผ่านก่อน commit

## 3. Mockoon: mock server จาก spec

```bash
npx @mockoon/cli import --input contracts/openapi.yaml --output mocks/mockoon.json
npx @mockoon/cli start --data mocks/mockoon.json --port 3001
```

- นำเข้า 13 route ได้ครบ พร้อม response ตามสถานะที่ spec ระบุ (ไฟล์ [mocks/mockoon.json](../mocks/mockoon.json))
- ค่าในตัวอย่างที่ถูกสร้างให้เป็นค่าว่าง เช่น `"username": ""` ซึ่งผิด schema ของเราเอง (`username` ต้อง 3-20 ตัว) ต้องแก้ตัวอย่างเองถึงจะใช้ได้จริง
- mock ไม่มีสถานะ login ผิดก็ได้ 201 ดูงานก็ได้งานสุ่ม จึงทดสอบ flow จริงไม่ได้ เหมาะกับให้ front end ทำงานต่อได้ตอน back end ยังไม่เสร็จ
- ผมจึงยังไม่ต่อเข้า CI

## ที่ยังไม่ได้ลอง และเหตุผล

- **Speedscale / Akita** ออกแบบให้ติดเป็น sidecar ดักทราฟฟิกของ staging ที่มีหลายบริการ โปรเจกต์นี้มี server เดียวและไม่มี staging จึงยังไม่คุ้ม ทั้งคู่ต้องมีบัญชีหรือโครงสร้างพื้นฐานของผู้ให้บริการ และ Akita ถูกรวมเข้า Postman แล้ว ควรเช็กสถานะล่าสุดก่อนตัดสินใจ

## ความรู้สึกหลังลอง

ข้อความต้นทางที่บอกว่า "ดัก traffic แล้วได้ regression test อัตโนมัติ" จริงเพียงบางส่วน: HAR ให้ผลที่เล่นซ้ำได้แต่ไม่ได้ทดสอบ back end และ mock ที่สร้างอัตโนมัติยังต้องคนปรับ ส่วนที่ได้ประโยชน์ที่สุดกลับเป็น Prism เพราะมี spec ที่เขียนเป็นข้อตกลงไว้ก่อน ไม่ใช่ traffic ที่บันทึกมา
