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
await cp(root('app/index.html'), `${out}/index.html`);
await cp(root('README.md'), `${out}/README.md`);
await cp(root('docs'), `${out}/docs`, { recursive: true });
await writeFile(`${out}/_redirects`, '/docs /status/ 301\n/docs/ /status/ 301\n');

process.stdout.write(`Built ${out}\n`);
