// Splits a SQL file into statements, keeping $$-quoted bodies and strings
// intact and dropping comments and BEGIN/COMMIT (the caller wraps its own
// transaction). Same rules as scripts/split-migration.mjs.
export function splitSql(sql) {
  const out = [];
  let current = "";
  let index = 0;
  let dollar = null;
  let quote = false;
  while (index < sql.length) {
    const char = sql[index];
    if (!dollar && !quote && char === "-" && sql[index + 1] === "-") {
      const end = sql.indexOf("\n", index);
      index = end < 0 ? sql.length : end;
      continue;
    }
    if (!quote) {
      const tag = sql.slice(index).match(/^\$[A-Za-z_]*\$/);
      if (tag) {
        if (!dollar) dollar = tag[0];
        else if (dollar === tag[0]) dollar = null;
        current += tag[0];
        index += tag[0].length;
        continue;
      }
    }
    if (!dollar && char === "'") quote = !quote;
    if (!dollar && !quote && char === ";") {
      out.push(current.trim());
      current = "";
      index += 1;
      continue;
    }
    current += char;
    index += 1;
  }
  if (current.trim()) out.push(current.trim());
  return out.filter((statement) => statement && !/^(BEGIN|COMMIT)$/i.test(statement));
}
