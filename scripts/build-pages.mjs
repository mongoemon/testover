// Assembles the static site that Cloudflare Pages publishes (build output: dist/).
// Same URLs as app/server.mjs: / (the app), /docs/*, /README.md.
// Online, /docs goes to the /status/ hub (docs + latest reports, published by cloudflare-pages.yml);
// locally the server sends /docs to the overview page.
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const out = root('dist');

await rm(out, { recursive: true, force: true });
await mkdir(out);
const appUrl = process.env.APP_URL?.trim();
const appLink = (label) => (appUrl ? `<p><a class="go" href="${encodeURI(appUrl)}">${label}</a></p>` : '');
await writeFile(`${out}/index.html`, `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>testover</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.6 system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 16px; }
  h1 { margin-bottom: .25rem; }
  a.go { display: inline-block; padding: .5rem 1rem; border: 1px solid currentColor; border-radius: .4rem; text-decoration: none; }
  code { padding: .1rem .3rem; border-radius: .25rem; background: color-mix(in srgb, currentColor 12%, transparent); }
</style>
</head>
<body>
<h1>testover</h1>
<section lang="th">
  <p>Task Board คือแอปตัวอย่างสำหรับฝึกทดสอบ ตอนนี้มี backend (<code>/api</code>) จึงรันบนโฮสต์ static แบบนี้ไม่ได้ ให้รันในเครื่องด้วย <code>npm install</code> แล้ว <code>npm start</code> (เปิด <code>http://localhost:3000</code>, login ด้วย <code>demo</code> / <code>demo1234</code>)</p>
  ${appLink('เปิดแอป')}
  <p><a href="/docs/overview.html">อ่านเอกสาร</a> · <a href="/status/">เอกสารและรายงานเทสล่าสุด</a> · <a href="https://github.com/mongoemon/testover">GitHub</a></p>
</section>
<section lang="en">
  <p>Task Board is a sample app for practising tests. It now has a backend (<code>/api</code>), so it cannot run on static hosting like this page. Run it locally with <code>npm install</code> then <code>npm start</code> (open <code>http://localhost:3000</code>, sign in as <code>demo</code> / <code>demo1234</code>).</p>
  ${appLink('Open the app')}
  <p><a href="/docs/overview.en.html">Read the docs</a> · <a href="/status/">Docs and latest test reports</a> · <a href="https://github.com/mongoemon/testover">GitHub</a></p>
</section>
</body>
</html>
`);
await cp(root('README.md'), `${out}/README.md`);
await cp(root('docs'), `${out}/docs`, { recursive: true });
await writeFile(`${out}/_redirects`, '/docs /status/ 301\n/docs/ /status/ 301\n');

process.stdout.write(`Built ${out}\n`);
