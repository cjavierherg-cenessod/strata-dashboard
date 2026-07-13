const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const allowedOwners = new Map([
  ['validate_growth_member', new Set([
    'supabase_schema.sql',
    'supabase_growth_nucleus_coordinator_hierarchy_fix.sql',
    'supabase_growth_massive_nuclei_terminal_guard.sql',
  ])],
  ['register_growth_member_by_invite', new Set([
    'supabase_schema.sql',
    'supabase_growth_nucleus_coordinator_hierarchy_fix.sql',
  ])],
  ['create_growth_dashboard_session', new Set([
    'supabase_growth_massive_nuclei_dashboard_metrics.sql',
  ])],
  ['get_growth_dashboard_descendants', new Set([
    'supabase_growth_massive_nuclei_dashboard_metrics.sql',
  ])],
  ['get_growth_level_access_by_dashboard', new Set([
    'supabase_growth_level_access_lifecycle.sql',
  ])],
  ['ensure_growth_level_access', new Set([
    'supabase_growth_level_access_lifecycle.sql',
  ])],
  ['rotate_growth_level_access', new Set([
    'supabase_growth_level_access_lifecycle.sql',
  ])],
  ['set_growth_level_access_active', new Set([
    'supabase_growth_level_access_lifecycle.sql',
  ])],
]);

const forbiddenFunctions = new Set([
  'get_growth_level_access_by_dashboard_public',
]);

const sessionRequired = new Set([
  'get_growth_dashboard_descendants',
  'get_growth_level_access_by_dashboard',
]);

const ignoredDirs = new Set([
  '.git',
  '.vercel',
  'android',
  'dist',
  'node_modules',
  'outputs',
  'tmp',
]);

function toRel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      if (toRel(path.join(dir, entry.name)).startsWith('supabase/archived_disabled_sql')) continue;
      walk(path.join(dir, entry.name), files);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.sql')) {
      files.push(path.join(dir, entry.name));
    }
  }

  return files;
}

function extractDefinitions(sql) {
  const matches = [];
  const re = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.([a-zA-Z0-9_]+)\s*\(/gi;
  let match;

  while ((match = re.exec(sql)) !== null) {
    const name = match[1];
    const argsStart = re.lastIndex;
    let depth = 1;
    let index = argsStart;

    while (index < sql.length && depth > 0) {
      const char = sql[index];
      if (char === '(') depth += 1;
      if (char === ')') depth -= 1;
      index += 1;
    }

    const args = sql.slice(argsStart, index - 1);
    matches.push({
      name,
      args,
      argNames: Array.from(args.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:TEXT|UUID|BOOLEAN|JSONB|INTEGER|INT|DATE|TIMESTAMP)\b/gi), (arg) => arg[1].toLowerCase()),
      signature: `public.${name}(${args.replace(/\s+/g, ' ').trim()})`,
    });
  }

  return matches;
}

const errors = [];
const seen = new Map();

for (const file of walk(root)) {
  const rel = toRel(file);
  const sql = fs.readFileSync(file, 'utf8');

  for (const definition of extractDefinitions(sql)) {
    const { name, signature, argNames } = definition;
    const allowed = allowedOwners.get(name);

    if (forbiddenFunctions.has(name)) {
      errors.push(`${rel}: forbidden public function still exists: ${signature}`);
      continue;
    }

    if (!allowed) continue;

    if (!allowed.has(rel)) {
      errors.push(`${rel}: ${name} must live only in ${Array.from(allowed).join(', ')}`);
    }

    const key = `${name}:${rel}`;
    seen.set(key, (seen.get(key) || 0) + 1);

    if (sessionRequired.has(name) && !argNames.includes('p_session_token')) {
      errors.push(`${rel}: ${name} must require p_session_token; found ${signature}`);
    }
  }
}

for (const [key, count] of seen.entries()) {
  if (count > 1) {
    errors.push(`${key.replace(':', ' in ')} is defined ${count} times in the same file`);
  }
}

if (errors.length > 0) {
  console.error('Growth SQL critical function check failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Growth SQL critical function ownership check passed.');
