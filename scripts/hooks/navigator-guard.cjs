#!/usr/bin/env node
// Claude Code PreToolUse hook: keeps sessions from deleting Career Navigator data or
// removing the D1 guard (scripts/d1-navigator-guard.sql). Exit code 2 blocks the
// tool call and shows the message to Claude. See CLAUDE.md, "Career Navigator guardrail".
let raw = '';
process.stdin.on('data', d => (raw += d)).on('end', () => {
  let cmd = '';
  try {
    const input = JSON.parse(raw).tool_input || {};
    cmd = String(input.command || '');
  } catch {
    process.exit(0);
  }
  const c = cmd.replace(/\s+/g, ' ');
  const rules = [
    [/\bdrop\s+(trigger|table)\s+(if\s+exists\s+)?["`]?nav(igator)?_/i, 'drops a Career Navigator guard trigger or table'],
    [/navigator_guard_override/i, 'touches navigator_guard_override (only the owner adds overrides, by hand)'],
    [/\bdelete\s+from\s+["`]?navigator_/i, 'deletes Career Navigator data'],
    [/\b(update|alter)\s+(table\s+)?["`]?navigator_accounts/i, 'changes the Career Navigator registry'],
    [/d1\s+time-travel\s+restore/i, 'rolls back the shared D1 database (affects Career Navigator)'],
  ];
  for (const [re, why] of rules) {
    if (re.test(c)) {
      process.stderr.write(
        `Blocked by the Career Navigator guardrail: this command ${why}. ` +
          'Main AACP work must not touch Career Navigator accounts or data. ' +
          'Stop and ask the user; they can run it themselves if it is intended.\n'
      );
      process.exit(2);
    }
  }
  process.exit(0);
});
