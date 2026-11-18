import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir, open, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LONG_TESTS } from './tests-courts.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const longTestFiles = new Map(LONG_TESTS.map((filename) => {
  const name = filename === 'equilibrage-factions.mjs' ? 'equilibrage' : filename.slice(0, -4);
  return [name, filename];
}));
const jobs = [
  ...['ia-sans-blocage', 'equilibrage', 'ai', 'impitoyable'].map((name) => ({
    name,
    args: [`tests/${longTestFiles.get(name)}`],
  })),
  ...[1, 2, 3, 4].map((seed) => ({
    name: `duel-${seed}`,
    args: ['scripts/monstres-duels.mjs', String(seed)],
  })),
];

async function runJob({ args }, logPath) {
  const log = await open(logPath, 'w');
  try {
    let spawnError;
    const code = await new Promise((resolveCode) => {
      const child = spawn(process.execPath, args, {
        cwd: projectRoot,
        stdio: ['ignore', log.fd, log.fd],
      });
      child.on('error', (error) => {
        spawnError = error;
      });
      child.on('close', (exitCode) => {
        resolveCode(exitCode ?? 1);
      });
    });
    if (spawnError) {
      await log.writeFile(`Error: ${spawnError.message}\n`);
    }
    return code;
  } finally {
    await log.close();
  }
}

export async function runJobs(selectedJobs, { parallel, outputDir }) {
  await mkdir(outputDir, { recursive: true });
  const summaryPath = join(outputDir, 'resume.txt');
  await writeFile(summaryPath, '');

  let nextIndex = 0;
  let failed = false;
  let summaryWrites = Promise.resolve();
  async function worker() {
    while (nextIndex < selectedJobs.length) {
      const job = selectedJobs[nextIndex++];
      const startedAt = performance.now();
      const code = await runJob(job, join(outputDir, `${job.name}.log`));
      const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
      if (code !== 0) {
        failed = true;
      }
      summaryWrites = summaryWrites.then(() => appendFile(summaryPath, `${job.name} ${code} ${seconds}\n`));
      await summaryWrites;
    }
  }

  await Promise.all(Array.from({ length: Math.min(parallel, selectedJobs.length) }, () => worker()));
  for (const { name } of selectedJobs) {
    const input = createReadStream(join(outputDir, `${name}.log`));
    const lines = createInterface({ input, crlfDelay: Infinity });
    const excerpt = [];
    try {
      for await (const line of lines) {
        if (/^Seed |PASS|FAIL|Error|winner/.test(line)) {
          excerpt.push(line);
          if (excerpt.length === 40) {
            break;
          }
        }
      }
    } finally {
      input.destroy();
    }
    await appendFile(summaryPath, `\n${[`== ${name} ==`, ...excerpt].join('\n')}\n`);
  }
  return failed ? 1 : 0;
}

async function main() {
  const options = process.argv.slice(2);
  let parallel = 2;
  let listOnly = false;
  let outputDir;
  let only;
  for (let index = 0; index < options.length; index++) {
    const option = options[index];
    if (option === '--list') {
      listOnly = true;
    } else if (option === '--jobs') {
      const value = options[++index];
      parallel = Number(value);
      if (!/^\d+$/.test(value ?? '') || !Number.isSafeInteger(parallel) || parallel < 1) {
        throw new Error('--jobs attend un entier strictement positif.');
      }
    } else if (option === '--sortie') {
      outputDir = options[++index];
      if (!outputDir || outputDir.startsWith('--')) {
        throw new Error('--sortie attend un dossier.');
      }
    } else if (option === '--seulement') {
      const value = options[++index];
      if (!value || value.startsWith('--')) {
        throw new Error('--seulement attend des noms de jobs séparés par des virgules.');
      }
      only = new Set(value.split(','));
      for (const name of only) {
        if (!jobs.some((job) => job.name === name)) {
          throw new Error(`Job inconnu pour --seulement : ${JSON.stringify(name)}`);
        }
      }
    } else {
      throw new Error(`Option inconnue : ${option}`);
    }
  }

  if (listOnly) {
    for (const { name, args } of jobs) {
      console.log(`${name} node ${args.join(' ')}`);
    }
    return;
  }
  if (!outputDir) {
    throw new Error('--sortie <dossier> est obligatoire hors --list.');
  }
  const selectedJobs = only ? jobs.filter(({ name }) => only.has(name)) : jobs;
  process.exitCode = await runJobs(selectedJobs, { parallel, outputDir });
  console.log(resolve(outputDir, 'resume.txt'));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
