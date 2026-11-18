import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./ai.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(source, /\b[Gg]ame\s+\$\{\s*game\s*\}/, 'Les messages de tests/ai.mjs doivent numéroter les parties à partir de 1.');
