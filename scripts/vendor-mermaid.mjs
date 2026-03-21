import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const source = resolve('node_modules/mermaid/dist/mermaid.esm.min.mjs');
const target = resolve('vendor/mermaid.esm.min.mjs');

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);

console.log(`Copied Mermaid bundle to ${target}`);
