import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const templateRoot = path.resolve(here, "../assets/feishu-base-template-v2");
const manifest = JSON.parse(fs.readFileSync(path.join(templateRoot, "template-manifest.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(templateRoot, "template-lock.json"), "utf8"));
export function initialize(argv = process.argv.slice(2), dependencies = {}) {
  const run = dependencies.spawnSync ?? spawnSync;
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
    const error = new Error(message);
    error.details = details;
    throw error;
  }

  let creationCheckpoint;

  function cli(args, { retryNotFound = false } = {}) {
    let executable = "lark-cli";
    let executableArgs = args;
    if (process.platform === "win32") {
      const located = run("where.exe", ["lark-cli.cmd"], { encoding: "utf8" });
      const launcher = located.stdout?.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
      if (!launcher) fail("lark-cli.cmd was not found; install and authorize Feishu CLI first");
      const entrypoint = path.join(path.dirname(launcher), "node_modules", "@larksuite", "cli", "scripts", "run.js");
      if (!fs.existsSync(entrypoint)) fail("Feishu CLI entrypoint was not found", entrypoint);
      executable = process.execPath;
      executableArgs = [entrypoint, ...args];
    }
    for (let attempt = 0; ; attempt++) {
      const result = run(executable, executableArgs, { encoding: "utf8", shell: false, timeout: 60000, maxBuffer: 20 * 1024 * 1024 });
      const stdout = result.stdout?.trim();
      let parsed;
      for (const output of [stdout, result.stderr?.trim()]) {
        try { if (output) { parsed = JSON.parse(output); break; } } catch {}
      }
      if (result.status === 0 && parsed && parsed.ok !== false) return parsed;
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

  // Never resolve a default destination through a title search: shared libraries are visible too.
  const releaseRoot = path.resolve(here, "../..");
  const configFile = path.resolve(option("--config") ?? (fs.existsSync(path.join(releaseRoot, "release.json"))
    ? path.resolve(releaseRoot, "../../config.local.json") : path.join(os.homedir(), ".codex/epr/config.local.json")));
  function saveJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp-${crypto.randomUUID()}`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(temporary, file);
  }
  function currentAccount() {
    const response = cli(["whoami", "--as", identity]);
    const who = response.data ?? response;
    const openId = identity === "user" ? who.onBehalfOf?.openId : who.appId;
    if (who.identity !== identity || who.available !== true || !openId || !who.appId || !who.profile || !who.brand)
      fail("Authorize the current Feishu identity before initializing its own library", { identity, available: who.available, token_status: who.tokenStatus });
    return { identity, app_id: who.appId, profile: who.profile, brand: who.brand, principal_id: openId };
  }
  function result(baseToken, validation, extra = {}) {
    return { ok: true, template: manifest.template_name, version: manifest.template_version,
      fingerprint: lock.aggregate_sha256, base_token: baseToken, validation, ...extra };
  }
  function completeBase(binding, saveBinding) {
    const baseToken = binding.base_token;
    creationCheckpoint = binding.creation_checkpoint;
    const checkpoint = readJson(creationCheckpoint);
    if (canonical(checkpoint.account) !== canonical(binding.account) || checkpoint.base_token !== baseToken)
      fail("Creation checkpoint belongs to a different account or Base");
    const saveCheckpoint = () => saveJson(creationCheckpoint, checkpoint);
    const listTables = () => cli(["base", "+table-list", "--base-token", baseToken, "--as", identity, "--format", "json"], { retryNotFound: true }).data?.tables ?? [];
    let tables = listTables();
    for (const table of manifest.tables) {
      const matches = tables.filter(t => itemName(t) === table.name);
      if (matches.length > 1) fail("Duplicate core table names; inspect this Base before resuming", { table: table.name, base_token: baseToken });
      if (matches.length) {
        if (checkpoint.pending === `table:${table.name}`) { delete checkpoint.pending; saveCheckpoint(); }
        continue;
      }
      if (checkpoint.pending) fail("Previous create response is unresolved; inspect the checkpoint before retrying", checkpoint);
      checkpoint.pending = `table:${table.name}`; saveCheckpoint();
      cli(["base", "+table-create", "--base-token", baseToken, "--name", table.name, "--fields", JSON.stringify(readJson(path.join(templateRoot, table.schema))), "--as", identity, "--format", "json"]);
      delete checkpoint.pending; checkpoint.last_completed_step = `table-created:${table.name}`; saveCheckpoint();
    }
    tables = listTables(); checkpoint.tables = tables; saveCheckpoint();
    for (const view of manifest.views) {
      const table = tables.find(t => itemName(t) === view.table);
      const tableId = table?.id ?? table?.table_id;
      if (!tableId) fail("Created table ID missing", { table: view.table, base_token: baseToken, creation_checkpoint: creationCheckpoint });
      const views = cli(["base", "+view-list", "--base-token", baseToken, "--table-id", tableId, "--as", identity, "--format", "json"], { retryNotFound: true }).data?.views ?? [];
      let matches = views.filter(v => itemName(v) === view.name);
      if (matches.length > 1) fail("Duplicate saved views; inspect this Base before resuming", { view: view.name, base_token: baseToken });
      if (!matches.length) {
        if (checkpoint.pending) fail("Previous create response is unresolved; inspect the checkpoint before retrying", checkpoint);
        checkpoint.pending = `view:${view.table}:${view.name}`; saveCheckpoint();
        const response = cli(["base", "+view-create", "--base-token", baseToken, "--table-id", tableId, "--json", JSON.stringify(readJson(path.join(templateRoot, view.config))), "--as", identity, "--format", "json"]);
        matches = objectList(response).filter(v => itemName(v) === view.name);
        if (matches.length !== 1) fail("View created without an unambiguous returned ID", { base_token: baseToken, creation_checkpoint: creationCheckpoint });
      }
      if (checkpoint.pending === `view:${view.table}:${view.name}`) { delete checkpoint.pending; saveCheckpoint(); }
      const viewId = itemId(matches[0]);
      const layout = readJson(path.join(templateRoot, view.layout));
      for (const [action, payload] of [["+view-set-filter", readJson(path.join(templateRoot, view.filter))], ["+view-set-visible-fields", { visible_fields: layout.visible_fields }], ["+view-set-sort", { sort_config: layout.sort_config ?? [] }]]) {
        cli(["base", action, "--base-token", baseToken, "--table-id", tableId, "--view-id", viewId, "--json", JSON.stringify(payload), "--as", identity, "--format", "json"], { retryNotFound: true });
        checkpoint.last_completed_step = `${action}:${view.name}`; saveCheckpoint();
      }
    }
    const validation = validateBase(baseToken);
    if (!validation.compatible) fail("Created Base did not pass fixed-template validation", { base_token: baseToken, validation });
    checkpoint.last_completed_step = "validated"; saveCheckpoint();
    binding.status = "ready"; saveBinding(binding);
    return result(baseToken, validation, { created: true, resumed: true, creation_checkpoint: creationCheckpoint });
  }

  if (templateFingerprint() !== lock.aggregate_sha256) fail("Bundled template fingerprint mismatch; reinstall or repair the skill");
  if (!["plan", "create", "ensure", "validate"].includes(command)) fail(`Unknown command: ${command}`);

  const validOptions = new Set(["--as", "--base-token", "--name", "--config"]);
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--dry-run") continue;
    if (!validOptions.has(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith("--")) fail(`Unknown or incomplete option: ${argv[i]}`);
    i++;
  }
  if (!["user", "bot"].includes(identity)) fail("--as must be user or bot");
  if (command === "plan") return { ok: true, template: manifest.template_name, version: manifest.template_version, fingerprint: lock.aggregate_sha256,
    destination_policy: "current-account-binding-or-create", tables: manifest.tables.map(table => ({ name: table.name, fields: readJson(path.join(templateRoot, table.schema)).map(f => f.name) })),
    views: manifest.views.map(view => ({ table: view.table, name: view.name, ...readJson(path.join(templateRoot, view.layout)) })) };
  const account = currentAccount();
  if (command === "validate") {
    if (!suppliedBaseToken) fail("validate requires --base-token <BASE_TOKEN>");
    const validation = validateBase(suppliedBaseToken);
    return { ...result(suppliedBaseToken, validation), ok: validation.compatible, compatible: validation.compatible };
  }
  if (command === "create" && suppliedBaseToken) fail("create does not accept --base-token; use ensure to select an existing library");
  const key = crypto.createHash("sha256").update(canonical(account)).digest("hex");
  if (dryRun) return { ok: true, dry_run: true, account, config_file: configFile, destination_policy: "current-account-binding-or-create", tables: manifest.tables.map(t => t.name), writes: false };
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  const guard = `${configFile}.feishu-init-lock`;
  try { fs.mkdirSync(guard); } catch (error) {
    if (error.code === "EEXIST") fail("Another Feishu initializer is active; inspect its lock before retrying", { lock: guard });
    throw error;
  }
  try {
    const local = fs.existsSync(configFile) ? readJson(configFile) : {};
    if (local.feishu_bindings !== undefined && (!local.feishu_bindings || typeof local.feishu_bindings !== "object" || Array.isArray(local.feishu_bindings))) fail("Invalid local Feishu bindings configuration");
    local.feishu_bindings ??= {};
    const saveBinding = value => { local.feishu_bindings[key] = value; saveJson(configFile, local); };
    let binding = local.feishu_bindings[key];
    if (binding && canonical(binding.account) !== canonical(account)) fail("Local binding identity does not match the current account");
    // Legacy base_token has no provenance. Keep it intact, but never use it implicitly.
    if (suppliedBaseToken) {
      if (binding && binding.status !== "ready") fail("Finish the pending initialization before changing this account's library", binding);
      const validation = validateBase(suppliedBaseToken);
      if (!validation.compatible) fail("Supplied Base is incompatible with the fixed template; do not write into it", validation);
      saveBinding({ account, base_token: suppliedBaseToken, source: "explicit", status: "ready", bound_at: new Date().toISOString() });
      return result(suppliedBaseToken, validation, { created: false, reused: true, binding_source: "explicit", config_file: configFile });
    }
    if (binding) {
      if (!binding.base_token) fail("Previous Base creation is unresolved; inspect it before creating another library", binding);
      if (binding.status === "initializing") return { ...completeBase(binding, saveBinding), config_file: configFile };
      if (binding.status !== "ready") fail("Unknown binding status; inspect local configuration", binding);
      const validation = validateBase(binding.base_token);
      if (!validation.compatible) fail("Bound Base is incompatible; preserve it and repair the reported differences", validation);
      return result(binding.base_token, validation, { created: false, reused: true, binding_source: binding.source, config_file: configFile });
    }
    binding = { account, status: "creating", base_token: null, source: "created", started_at: new Date().toISOString() };
    saveBinding(binding); // Persist before POST: an ambiguous failure must never trigger another base-create.
    const first = manifest.tables[0];
    const created = cli(["base", "+base-create", "--name", requestedName, "--table-name", first.name, "--fields", JSON.stringify(readJson(path.join(templateRoot, first.schema))), "--time-zone", "Asia/Shanghai", "--as", identity, "--format", "json"]);
    const baseToken = findToken(created);
    if (!baseToken) fail("Base was created but no base token was returned; inspect before retrying");
    binding.base_token = baseToken;
    binding.creation_checkpoint = path.join(path.dirname(configFile), "feishu-init", `${key}.json`);
    saveBinding(binding);
    saveJson(binding.creation_checkpoint, { account, base_token: baseToken, name: requestedName, tables: [], views: [], last_completed_step: "base-created" });
    binding.status = "initializing"; saveBinding(binding);
    return { ...completeBase(binding, saveBinding), resumed: false, config_file: configFile, legacy_unbound_target_ignored: Boolean(local.base_token) };
  } finally { fs.rmdirSync(guard); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const output = initialize();
    console.log(JSON.stringify(output, null, 2));
    if (output.ok === false) process.exitCode = 2;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, template: manifest.template_name, version: manifest.template_version, error: error.message, details: error.details }, null, 2));
    process.exitCode = 1;
  }
}
