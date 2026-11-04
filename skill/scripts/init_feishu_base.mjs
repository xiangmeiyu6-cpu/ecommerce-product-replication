import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const templateRoot = path.resolve(here, "../assets/feishu-base-template-v2");
const manifest = readJson(path.join(templateRoot, "template-manifest.json"));
const lock = readJson(path.join(templateRoot, "template-lock.json"));
const argv = process.argv.slice(2);
const command = argv[0] ?? "ensure";
const identity = option("--as") ?? "user";
const suppliedBaseToken = option("--base-token");
const requestedName = option("--name") ?? manifest.template_name;
const dryRun = argv.includes("--dry-run");

function option(name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function templateFingerprint() {
  const entries = lock.files.map((entry) => ({
    path: entry.path,
    sha256: crypto.createHash("sha256").update(canonical(readJson(path.join(templateRoot, entry.path)))).digest("hex"),
  }));
  return crypto.createHash("sha256").update(entries.map((entry) => `${entry.path}:${entry.sha256}`).join("\n")).digest("hex");
}

function fail(message, details) {
  console.error(JSON.stringify({ ok: false, template: manifest.template_name, version: manifest.template_version, error: message, details }, null, 2));
  process.exit(1);
}

let creationCheckpoint;

function cli(args, { allowEmptyTitle = false, retryNotFound = false } = {}) {
  let executable = "lark-cli";
  let executableArgs = args;
  if (process.platform === "win32") {
    const located = spawnSync("where.exe", ["lark-cli.cmd"], { encoding: "utf8" });
    const launcher = located.stdout?.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (!launcher) fail("lark-cli.cmd was not found; install and authorize Feishu CLI first");
    const entrypoint = path.join(path.dirname(launcher), "node_modules", "@larksuite", "cli", "scripts", "run.js");
    if (!fs.existsSync(entrypoint)) fail("Feishu CLI entrypoint was not found", entrypoint);
    executable = process.execPath;
    executableArgs = [entrypoint, ...args];
  }
  for (let attempt = 0; ; attempt++) {
    const result = spawnSync(executable, executableArgs, { encoding: "utf8", shell: false, maxBuffer: 20 * 1024 * 1024 });
    const stdout = result.stdout?.trim();
    let parsed;
    for (const output of [stdout, result.stderr?.trim()]) {
      try { if (output) { parsed = JSON.parse(output); break; } } catch {}
    }
    if (result.status === 0 && parsed?.ok !== false) return parsed ?? { ok: true, raw: stdout };
    // The CLI reports an empty search as validation/invalid_argument, not an empty array.
    if (allowEmptyTitle && args[1] === "+title-resolve" && parsed?.error?.type === "validation" && parsed?.error?.subtype === "invalid_argument" && parsed?.error?.message === "No Base matched this title or keyword.") return { ok: true, data: { bases: [] } };
    if (retryNotFound && attempt < 3 && /not_found/.test(parsed?.error?.message ?? "")) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, [2000, 5000, 10000][attempt]);
      continue;
    }
    fail(`lark-cli failed: ${args.slice(0, 2).join(" ")}`, { response: parsed ?? result.stderr?.trim() ?? stdout, ...(creationCheckpoint ? { creation_checkpoint: creationCheckpoint, instruction: "Resume this Base using the recorded IDs; do not repeat base-create." } : {}) });
  }
}

function walk(value, visit) {
  if (!value || typeof value !== "object") return;
  visit(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach((item) => walk(item, visit));
    else walk(child, visit);
  }
}

function findToken(value) {
  let token;
  walk(value, (node) => {
    if (!token && typeof node.base_token === "string") token = node.base_token;
    if (!token && typeof node.app_token === "string") token = node.app_token;
  });
  return token;
}

function objectList(value) {
  const found = [];
  walk(value, (node) => {
    const name = node.name ?? node.table_name ?? node.view_name ?? node.field_name;
    const id = node.table_id ?? node.view_id ?? node.field_id ?? node.block_id ?? node.id;
    if (typeof name === "string" && typeof id === "string") found.push(node);
  });
  return [...new Map(found.map((item) => [`${item.table_id ?? item.view_id ?? item.field_id ?? item.block_id ?? item.id}:${item.name ?? item.table_name ?? item.view_name ?? item.field_name}`, item])).values()];
}

function itemName(item) {
  return item.name ?? item.table_name ?? item.view_name ?? item.field_name;
}

function itemId(item) {
  return item.table_id ?? item.view_id ?? item.field_id ?? item.block_id ?? item.id ?? itemName(item);
}

function validateBase(baseToken) {
  const tableResponse = cli(["base", "+table-list", "--base-token", baseToken, "--as", identity, "--format", "json"]);
  const liveTables = tableResponse.data?.tables ?? [];
  const expectedNames = manifest.tables.map((table) => table.name);
  const liveByName = new Map(liveTables.map((item) => [item.name, item]));
  const missingTables = expectedNames.filter((name) => !liveByName.has(name));
  const actualCoreOrder = liveTables.map((t) => t.name).filter((n) => expectedNames.includes(n));
  const tableOrderIssue = JSON.stringify(actualCoreOrder) === JSON.stringify(expectedNames) ? null : { expected: expectedNames, actual: actualCoreOrder };
  const fieldIssues = [];
  const viewIssues = [];
  for (const table of manifest.tables) {
    const live = liveByName.get(table.name);
    if (!live) continue;
    const tableId = live.id ?? live.table_id;
    const fieldResponse = cli(["base", "+field-list", "--base-token", baseToken, "--table-id", tableId, "--as", identity, "--format", "json"]);
    const liveFields = fieldResponse.data?.fields ?? [];
    const expected = readJson(path.join(templateRoot, table.schema));
    const fieldsByName = new Map(liveFields.map((f) => [f.name, f]));
    const namesMatch = liveFields.length === expected.length && expected.every((f) => fieldsByName.has(f.name));
    if (!namesMatch) fieldIssues.push({ table: table.name, check: "field_names", expected: expected.map((f) => f.name), actual: liveFields.map((f) => f.name) });
    for (const f of expected) {
      const actual = fieldsByName.get(f.name);
      if (!actual) continue;
      if (actual.type !== f.type) fieldIssues.push({ table: table.name, field: f.name, check: "type", expected: f.type, actual: actual.type });
      if (f.type === "select") {
        if ((actual.multiple ?? false) !== (f.multiple ?? false)) fieldIssues.push({ table: table.name, field: f.name, check: "multiple" });
        if (JSON.stringify((actual.options ?? []).map((o) => o.name)) !== JSON.stringify((f.options ?? []).map((o) => o.name))) fieldIssues.push({ table: table.name, field: f.name, check: "options", expected: f.options, actual: actual.options });
      }
      for (const [key, value] of Object.entries(f.style ?? {})) {
        if (actual.style?.[key] !== value) fieldIssues.push({ table: table.name, field: f.name, check: `style.${key}`, expected: value, actual: actual.style?.[key] });
      }
    }
    const viewResponse = cli(["base", "+view-list", "--base-token", baseToken, "--table-id", tableId, "--as", identity, "--format", "json"]);
    const views = viewResponse.data?.views ?? [];
    for (const view of manifest.views.filter((v) => v.table === table.name)) if (!views.some((v) => v.name === view.name)) viewIssues.push({ table: table.name, missing_view: view.name });
    // Field-list order is not a display-order contract. Read the complete default grid instead.
    const defaultView = views.find((v) => v.name === "表格" && v.type === "grid");
    if (!defaultView) fieldIssues.push({ table: table.name, check: "field_display_order", error: "No unambiguous default grid; order requires verification" });
    else {
      const orderResponse = cli(["base", "+view-get-visible-fields", "--base-token", baseToken, "--table-id", tableId, "--view-id", defaultView.id ?? defaultView.view_id, "--as", identity, "--format", "json"]);
      const order = orderResponse.data?.visible_fields;
      if (JSON.stringify(order) !== JSON.stringify(expected.map((f) => f.name))) fieldIssues.push({ table: table.name, check: "field_display_order", expected: expected.map((f) => f.name), actual: order });
    }
  }
  return { validation_scope: "core_table_order_field_schema_default_grid_order_saved_view_presence", unverified_checks: ["saved_view_filters_layout_sort", "batch_records", "attachments", "collaborator_access"], compatible: missingTables.length === 0 && !tableOrderIssue && fieldIssues.length === 0 && viewIssues.length === 0, missing_tables: missingTables, table_order_issue: tableOrderIssue, field_issues: fieldIssues, view_issues: viewIssues };
}

function createBase(name) {
  const first = manifest.tables[0];
  const firstFields = JSON.stringify(readJson(path.join(templateRoot, first.schema)));
  const createArgs = ["base", "+base-create", "--name", name, "--table-name", first.name, "--fields", firstFields, "--time-zone", "Asia/Shanghai", "--as", identity, "--format", "json"];
  if (dryRun) {
    const preview = cli([...createArgs, "--dry-run"]);
    console.log(JSON.stringify({ ok: true, dry_run: true, template: manifest.template_name, version: manifest.template_version, first_request: preview, remaining_tables: manifest.tables.slice(1).map((table) => table.name), views: manifest.views.map((view) => view.name) }, null, 2));
    process.exit(0);
  }

  const created = cli(createArgs);
  const baseToken = findToken(created);
  if (!baseToken) fail("Base was created but no base token was returned", created);

  creationCheckpoint = path.resolve(`feishu-base-init-${baseToken}.json`);
  const checkpoint = { base_token: baseToken, name, tables: [], views: [], last_completed_step: "base-created" };
  const saveCheckpoint = () => fs.writeFileSync(creationCheckpoint, JSON.stringify(checkpoint, null, 2));
  saveCheckpoint();
  console.error(JSON.stringify({ created_base_token: baseToken, creation_checkpoint: creationCheckpoint }));

  for (const table of manifest.tables.slice(1)) {
    const fields = JSON.stringify(readJson(path.join(templateRoot, table.schema)));
    cli(["base", "+table-create", "--base-token", baseToken, "--name", table.name, "--fields", fields, "--as", identity, "--format", "json"]);
    checkpoint.last_completed_step = `table-created:${table.name}`;
    saveCheckpoint();
  }

  const tableResponse = cli(["base", "+table-list", "--base-token", baseToken, "--as", identity, "--format", "json"], { retryNotFound: true });
  checkpoint.tables = tableResponse.data?.tables ?? [];
  saveCheckpoint();
  for (const view of manifest.views) {
    const tableId = checkpoint.tables.find((t) => itemName(t) === view.table)?.id;
    if (!tableId) fail("Created table ID missing", { table: view.table, base_token: baseToken, creation_checkpoint: creationCheckpoint });
    const config = JSON.stringify(readJson(path.join(templateRoot, view.config)));
    const filter = JSON.stringify(readJson(path.join(templateRoot, view.filter)));
    const layout = readJson(path.join(templateRoot, view.layout));
    const response = cli(["base", "+view-create", "--base-token", baseToken, "--table-id", tableId, "--json", config, "--as", identity, "--format", "json"]);
    const matches = objectList(response).filter((v) => itemName(v) === view.name);
    if (matches.length !== 1) fail("View created without an unambiguous returned ID", { response, base_token: baseToken, creation_checkpoint: creationCheckpoint });
    const viewId = itemId(matches[0]);
    checkpoint.views.push({ table: view.table, table_id: tableId, name: view.name, view_id: viewId });
    checkpoint.last_completed_step = `view-created:${view.name}`;
    saveCheckpoint();
    for (const [action, payload] of [["+view-set-filter", filter], ["+view-set-visible-fields", JSON.stringify({ visible_fields: layout.visible_fields })], ["+view-set-sort", JSON.stringify({ sort_config: layout.sort_config ?? [] })]]) {
      cli(["base", action, "--base-token", baseToken, "--table-id", tableId, "--view-id", viewId, "--json", payload, "--as", identity, "--format", "json"], { retryNotFound: true });
      checkpoint.last_completed_step = `${action}:${view.name}`;
      saveCheckpoint();
    }
  }

  const validation = validateBase(baseToken);
  if (!validation.compatible) fail("Created Base did not pass fixed-template validation", { base_token: baseToken, validation });
  checkpoint.last_completed_step = "validated";
  saveCheckpoint();
  return { base_token: baseToken, creation_checkpoint: creationCheckpoint, validation };
}

if (templateFingerprint() !== lock.aggregate_sha256) fail("Bundled template fingerprint mismatch; reinstall or repair the skill");
if (!["plan", "create", "ensure", "validate"].includes(command)) fail(`Unknown command: ${command}`);

if (command === "plan") {
  console.log(JSON.stringify({ ok: true, template: manifest.template_name, version: manifest.template_version, fingerprint: lock.aggregate_sha256, tables: manifest.tables.map((table) => ({ name: table.name, fields: readJson(path.join(templateRoot, table.schema)).map((field) => field.name) })), views: manifest.views.map((view) => ({ table: view.table, name: view.name, ...readJson(path.join(templateRoot, view.layout)) })) }, null, 2));
  process.exit(0);
}

if (command === "validate") {
  if (!suppliedBaseToken) fail("validate requires --base-token <BASE_TOKEN>");
  const validation = validateBase(suppliedBaseToken);
  console.log(JSON.stringify({ ok: validation.compatible, compatible: validation.compatible, template: manifest.template_name, version: manifest.template_version, fingerprint: lock.aggregate_sha256, base_token: suppliedBaseToken, ...validation }, null, 2));
  process.exit(validation.compatible ? 0 : 2);
}

if (command === "create") {
  const result = createBase(requestedName);
  console.log(JSON.stringify({ ok: true, created: true, template: manifest.template_name, version: manifest.template_version, fingerprint: lock.aggregate_sha256, ...result }, null, 2));
  process.exit(0);
}

if (suppliedBaseToken) {
  const validation = validateBase(suppliedBaseToken);
  if (!validation.compatible) fail("Supplied Base is incompatible with the fixed template; do not write into it", validation);
  console.log(JSON.stringify({ ok: true, created: false, reused: true, template: manifest.template_name, version: manifest.template_version, fingerprint: lock.aggregate_sha256, base_token: suppliedBaseToken, validation }, null, 2));
  process.exit(0);
}

const resolved = cli(["base", "+title-resolve", "--title", requestedName, "--as", identity, "--format", "json"], { allowEmptyTitle: true });
const candidates = [];
walk(resolved, (node) => {
  const token = typeof node.base_token === "string" ? node.base_token : typeof node.app_token === "string" ? node.app_token : undefined;
  const name = node.name ?? node.title;
  if (token && (!name || name === requestedName)) candidates.push({ token, name });
});
const uniqueCandidates = [...new Map(candidates.map((item) => [item.token, item])).values()];
if (uniqueCandidates.length > 1) fail("Multiple Base candidates match; supply --base-token for the intended library before any writes", { candidate_count: uniqueCandidates.length, candidates: uniqueCandidates });
for (const candidate of uniqueCandidates) {
  const validation = validateBase(candidate.token);
  if (validation.compatible) {
    console.log(JSON.stringify({ ok: true, created: false, reused: true, template: manifest.template_name, version: manifest.template_version, fingerprint: lock.aggregate_sha256, base_token: candidate.token, validation }, null, 2));
    process.exit(0);
  }
}

const createName = uniqueCandidates.length ? `${requestedName}（固定模板3.0）` : requestedName;
const result = createBase(createName);
console.log(JSON.stringify({ ok: true, created: true, template: manifest.template_name, version: manifest.template_version, fingerprint: lock.aggregate_sha256, ...result }, null, 2));
