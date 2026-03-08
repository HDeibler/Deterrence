import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve('src');
const files = [];
collect(root, files);

for (const file of files) {
  const source = fs.readFileSync(file);
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
    input: source,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function collect(directory, output) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collect(entryPath, output);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      output.push(entryPath);
    }
  }
}
