import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const SKILL_NAME = 'ecommerce-product-replication';
export const REPOSITORY = 'xiangmeiyu6-cpu/ecommerce-product-replication';
export const DEFAULT_CHANNEL = `https://raw.githubusercontent.com/${REPOSITORY}/main/channels/stable.json`;
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
export const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}` : JSON.stringify(value);
export function ensure(condition, message) { if (!condition) throw new Error(message); }
export function versionParts(version) {
  ensure(typeof version === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version), `Invalid stable version: ${version}`);
  const parts=version.split('.').map(Number);ensure(parts.every(Number.isSafeInteger),'Version component is too large');return parts;
}
export function compareVersions(a, b) {
  const x = versionParts(a), y = versionParts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return Math.sign(x[i] - y[i]);
  return 0;
}
export function safePath(value) {
  ensure(typeof value === 'string' && value.length < 220 && value.split('/').every(s => /^[A-Za-z0-9_.-]+$/.test(s) && !['.', '..'].includes(s) && !s.endsWith('.') && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(s)), `Unsafe portable path: ${value}`);
  ensure(!value.startsWith('/') && !value.includes('\\'), `Unsafe path: ${value}`);
  return value;
}
export async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
export async function exists(file) { try { await fs.lstat(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
export async function atomicJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(temporary, file);
}
export async function walkFiles(root, prefix = '') {
  const result = [];
  for (const item of (await fs.readdir(path.join(root, prefix), { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name, 'en'))) {
    const relative = prefix ? `${prefix}/${item.name}` : item.name;
    ensure(!item.isSymbolicLink(), `Release source may not contain symlinks: ${relative}`);
    if (item.isDirectory()) result.push(...await walkFiles(root, relative));
    else { ensure(item.isFile(), `Unexpected file: ${relative}`); result.push(safePath(relative)); }
  }
  return result;
}
export function validateBundle(bundle) {
  ensure(bundle?.format === 'epr-release/v1', 'Unsupported release format');
  versionParts(bundle.version);
  ensure(Number.isInteger(bundle.min_node_major) && bundle.min_node_major >= 22, 'Invalid runtime requirement');
  ensure(Number(process.versions.node.split('.')[0]) >= bundle.min_node_major, 'This release needs a newer Node runtime');
  ensure(Array.isArray(bundle.files) && bundle.files.length > 0 && bundle.files.length <= 500, 'Invalid file list');
  ensure(Array.isArray(bundle.capabilities), 'Missing capability declaration');
  versionParts(bundle.template_version); versionParts(bundle.quality_version);
  const seen = new Set(); let total = 0;
  for (const file of bundle.files) {
    safePath(file.path);
    ensure(/^(skill|lib|tools|contracts)\//.test(file.path) || ['package.json', 'README.md'].includes(file.path), `Unexpected package path: ${file.path}`);
    const key = file.path.toLowerCase(); ensure(!seen.has(key), `Case-insensitive duplicate: ${file.path}`); seen.add(key);
    ensure(typeof file.content_base64 === 'string' && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content_base64), `Invalid base64: ${file.path}`);
    const bytes = Buffer.from(file.content_base64, 'base64'); total += bytes.length;
    ensure(bytes.length === file.size && bytes.length < 2_000_000 && sha256(bytes) === file.sha256, `Content checksum mismatch: ${file.path}`);
  }
  ensure(total < 8_000_000, 'Release exceeds size limit');
  const inventory = bundle.files.map(({path: name,size,sha256: digest}) => ({path:name,size,sha256:digest}));
  ensure(sha256(canonical(inventory)) === bundle.inventory_sha256, 'Inventory checksum mismatch');
  for (const name of ['skill/SKILL.md','tools/epr.mjs','lib/manager.mjs','lib/release.mjs','contracts/quality.json']) ensure(seen.has(name.toLowerCase()), `Required file missing: ${name}`);
  const entry = name => JSON.parse(Buffer.from(bundle.files.find(f => f.path === name).content_base64, 'base64').toString('utf8'));
  const manifest = entry('skill/assets/feishu-base-template-v2/template-manifest.json');
  ensure(manifest.template_version === bundle.template_version, 'Template version mismatch');
  const lock = entry('skill/assets/feishu-base-template-v2/template-lock.json');
  const inventoryForTemplate = lock.files.map(file => {
    const source = entry(`skill/assets/feishu-base-template-v2/${safePath(file.path)}`);
    const digest = sha256(canonical(source)); ensure(digest === file.sha256, `Template checksum mismatch: ${file.path}`);
    return `${file.path}:${digest}`;
  });
  ensure(sha256(inventoryForTemplate.join('\n')) === lock.aggregate_sha256, 'Template aggregate mismatch');
  ensure(entry('contracts/quality.json').version === bundle.quality_version, 'Quality contract mismatch');
  return bundle;
}
export async function verifyInstalled(directory) {
  const bundle = validateBundle(await readJson(path.join(directory, 'release.json')));
  for (const file of bundle.files) {
    const absolute = path.join(directory, ...file.path.split('/'));
    const stat = await fs.lstat(absolute); ensure(stat.isFile() && !stat.isSymbolicLink(), `Installed file replaced: ${file.path}`);
    ensure(sha256(await fs.readFile(absolute)) === file.sha256, `Installed file changed: ${file.path}`);
  }
  return bundle;
}
export async function unpack(bundle, directory) {
  validateBundle(bundle);
  await fs.mkdir(directory, { recursive: false });
  for (const file of bundle.files) {
    const destination = path.join(directory, ...file.path.split('/'));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, Buffer.from(file.content_base64, 'base64'), { flag: 'wx' });
  }
  await atomicJson(path.join(directory, 'release.json'), bundle);
  await verifyInstalled(directory);
}
export async function fetchBytes(url, maximum = 12_000_000) {
  const parsed = new URL(url);
  ensure(parsed.protocol === 'https:' && !parsed.username && !parsed.password, 'Updates require HTTPS without embedded credentials');
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000), redirect: 'error', headers: { 'User-Agent': 'epr-updater/1', 'Cache-Control': 'no-cache' } });
  ensure(response.ok, `Download failed (${response.status})`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; ensure(size <= maximum, 'Download exceeds limit'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
export async function loadChannel(source) {
  if (source.kind === 'local') {
    const descriptor = await readJson(source.channel_file);
    ensure(descriptor.format==='epr-channel/v1','Unsupported channel format');
    safePath(descriptor.artifact);
    const bytes = await fs.readFile(path.join(path.dirname(source.channel_file), ...descriptor.artifact.split('/')));
    ensure(sha256(bytes) === descriptor.sha256, 'Artifact download checksum mismatch');
    const bundle = validateBundle(JSON.parse(bytes)); ensure(bundle.version === descriptor.version, 'Channel/release version mismatch');
    return { descriptor, bundle };
  }
  ensure(source.kind === 'https', 'Unknown update source');
  const channelUrl = new URL(source.url);
  ensure(!channelUrl.search&&!channelUrl.hash,'Channel URL must not include credentials or query parameters');
  ensure(channelUrl.hostname === 'raw.githubusercontent.com' && /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/channels\/(stable|testing)\.json$/.test(channelUrl.pathname), 'Unsupported public GitHub channel URL');
  const descriptor = JSON.parse((await fetchBytes(source.url, 64_000)).toString('utf8'));
  ensure(descriptor.format==='epr-channel/v1','Unsupported channel format');
  safePath(descriptor.artifact);
  const root = channelUrl.href.slice(0, channelUrl.href.lastIndexOf('/channels/') + 1);
  const bytes = await fetchBytes(new URL(descriptor.artifact, root).href);
  ensure(sha256(bytes) === descriptor.sha256, 'Artifact download checksum mismatch');
  const bundle = validateBundle(JSON.parse(bytes)); ensure(bundle.version === descriptor.version, 'Channel/release version mismatch');
  return { descriptor, bundle };
}
