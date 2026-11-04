import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../assets/feishu-base-template-v2");
const manifestPath = path.join(root, "template-manifest.json");
const lockPath = path.join(root, "template-lock.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(files) {
  const entries = files.map((relativePath) => {
    const value = readJson(path.join(root, relativePath));
    return { path: relativePath.replaceAll("\\", "/"), sha256: crypto.createHash("sha256").update(canonical(value)).digest("hex") };
  });
  const aggregate = crypto.createHash("sha256").update(entries.map((entry) => `${entry.path}:${entry.sha256}`).join("\n")).digest("hex");
  return { algorithm: "sha256-canonical-json", files: entries, aggregate_sha256: aggregate };
}

const manifest = readJson(manifestPath);
const requiredTables = ["商品总览", "分析批次", "深度拆解", "证据台账", "SKU与促销", "页面与素材", "用户反馈"];
const tableNames = manifest.tables.map((table) => table.name);

if (manifest.template_version !== "3.0.0" || manifest.fixed_template !== true) throw new Error("Template must be fixed version 3.0.0");
if (JSON.stringify(tableNames) !== JSON.stringify(requiredTables)) throw new Error(`Table order mismatch: ${tableNames.join(", ")}`);

const trackedFiles = ["template-manifest.json"];
const schemas = new Map();
for (const table of manifest.tables) {
  const fields = readJson(path.join(root, table.schema));
  if (!Array.isArray(fields) || fields.length === 0) throw new Error(`Empty schema: ${table.schema}`);
  const names = fields.map((field) => field.name);
  if (new Set(names).size !== names.length) throw new Error(`Duplicate field in ${table.schema}`);
  schemas.set(table.name, names);
  trackedFiles.push(table.schema);
}

for (const view of manifest.views) {
  const config = readJson(path.join(root, view.config));
  const filter = readJson(path.join(root, view.filter));
  const layout = readJson(path.join(root, view.layout));
  const fieldNames = schemas.get(view.table);
  if (config.name !== view.name) throw new Error(`View name mismatch: ${view.name}`);
  if (!filter.logic || !Array.isArray(filter.conditions)) throw new Error(`Invalid filter: ${view.filter}`);
  if (!Array.isArray(layout.visible_fields) || layout.visible_fields.length === 0) throw new Error(`Invalid visible fields: ${view.layout}`);
  for (const name of layout.visible_fields) if (!fieldNames.includes(name)) throw new Error(`Unknown visible field ${name} in ${view.layout}`);
  for (const item of layout.sort_config ?? []) if (!fieldNames.includes(item.field)) throw new Error(`Unknown sort field ${item.field} in ${view.layout}`);
  trackedFiles.push(view.config, view.filter, view.layout);
}

const requiredFields = {
  "evidence-ledger.json": ["证据附件", "页面顺序"],
  "sku-promotion.json": ["划线价", "页面售价", "活动到手价", "价格与优惠条件", "价格获取时间", "SKU证据附件"],
  "user-feedback.json": ["排序与采样方式", "运营机会", "反馈证据附件"],
  "page-creative.json": ["内容归属", "来源图片", "生成成品"],
};
for (const [file, expected] of Object.entries(requiredFields)) {
  const names = readJson(path.join(root, file)).map((field) => field.name);
  for (const name of expected) if (!names.includes(name)) throw new Error(`Missing field ${name} in ${file}`);
}

const currentLock = fingerprint([...new Set(trackedFiles)]);
if (process.argv.includes("--write-lock")) {
  fs.writeFileSync(lockPath, `${JSON.stringify({ template_id: manifest.template_id, template_version: manifest.template_version, ...currentLock }, null, 2)}\n`);
}
if (!fs.existsSync(lockPath)) throw new Error("Missing template-lock.json; run validator with --write-lock while packaging");
const savedLock = readJson(lockPath);
if (savedLock.aggregate_sha256 !== currentLock.aggregate_sha256) throw new Error("Template fingerprint mismatch; refresh the lock before packaging");

console.log(JSON.stringify({ ok: true, template: manifest.template_name, version: manifest.template_version, fixed_template: manifest.fixed_template, fingerprint: currentLock.aggregate_sha256, tables: manifest.tables.length, views: manifest.views.length }, null, 2));
