import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

export const LONG_TESTS = Object.freeze([
  'ai.mjs',
  'impitoyable.mjs',
  'ia-sans-blocage.mjs',
  'equilibrage-factions.mjs',
]);

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

async function main() {
  const options = process.argv.slice(2);
  let jobs = 2;
  let listOnly = false;
  for (let index = 0; index < options.length; index++) {
    const option = options[index];
    if (option === '--list') {
      listOnly = true;
    } else if (option === '--jobs') {
      const value = options[++index];
      jobs = Number(value);
      if (!/^\d+$/.test(value ?? '') || !Number.isSafeInteger(jobs) || jobs < 1) {
        throw new Error('--jobs attend un entier strictement positif.');
      }
    } else {
      throw new Error(`Option inconnue : ${option}`);
    }
  }

  const entries = await readdir(new URL('../tests/', import.meta.url), { withFileTypes: true });
  const testNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs') && !LONG_TESTS.includes(entry.name))
    .map((entry) => entry.name)
    .sort();
  const testArguments = (name) => name === 'ai-carte-agrandie.mjs' ? [`tests/${name}`, '--short'] : [`tests/${name}`];
  if (listOnly) {
    for (const name of testNames) {
      console.log(testArguments(name).join(' '));
    }
    return;
  }

  let nextIndex = 0;
  let successCount = 0;
  const failedTests = [];
  async function worker() {
    while (nextIndex < testNames.length) {
      const name = testNames[nextIndex++];
      const startedAt = performance.now();
      const result = await new Promise((resolveResult) => {
        const child = spawn(process.execPath, testArguments(name), {
          cwd: projectRoot,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        child.stdout.on('data', (chunk) => {
          output += chunk;
        });
        child.stderr.on('data', (chunk) => {
          output += chunk;
        });
        child.on('error', (error) => {
          output += `${error.message}\n`;
        });
        child.on('close', (code) => {
          resolveResult({ success: code === 0, output });
        });
      });
      const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
      console.log(`${name} : ${result.success ? 'OK' : 'KO'} (${seconds} s)`);
      if (result.success) {
        successCount++;
      } else {
        failedTests.push(name);
        process.stderr.write(result.output);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(jobs, testNames.length) }, () => worker()));
  console.log(`${successCount} OK, ${failedTests.length} KO`);
  if (failedTests.length > 0) {
    console.log(`Tests KO : ${failedTests.sort().join(', ')}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
