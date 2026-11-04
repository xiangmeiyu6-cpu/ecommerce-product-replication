import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {main} from '../../tools/epr.mjs';
const releaseRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(!fs.existsSync(path.join(releaseRoot,'release.json'))) {
  console.error('This is a source checkout. Install the managed release with node tools/epr.mjs install first.');process.exitCode=1;
} else await main([...process.argv.slice(2),'--root',path.resolve(releaseRoot,'../..')]);
