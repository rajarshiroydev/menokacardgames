// Splits a migration into a JSON array of statements for the Neon MCP run_sql_transaction tool,
// dropping BEGIN/COMMIT (the tool wraps its own transaction). Usage: node scripts/split-migration.mjs migrations/0001_x.sql
import { readFileSync } from "node:fs";
const sql = readFileSync(process.argv[2], "utf8");
const out = []; let cur = ""; let i = 0; let dollar = null; let quote = false;
while (i < sql.length) {
  const c = sql[i];
  if (!dollar && !quote && c === "-" && sql[i + 1] === "-") { const e = sql.indexOf("\n", i); i = e < 0 ? sql.length : e; continue; }
  if (!quote) { const m = sql.slice(i).match(/^\$[A-Za-z_]*\$/); if (m) { if (!dollar) dollar = m[0]; else if (dollar === m[0]) dollar = null; cur += m[0]; i += m[0].length; continue; } }
  if (!dollar && c === "'") quote = !quote;
  if (!dollar && !quote && c === ";") { out.push(cur.trim()); cur = ""; i++; continue; }
  cur += c; i++;
}
if (cur.trim()) out.push(cur.trim());
const stmts = out.filter((s) => s && !/^(BEGIN|COMMIT)$/i.test(s));
console.log(JSON.stringify(stmts));
console.error(`${stmts.length} statements`);
