const Database = require('/Users/yude/Documents/workshop/any-jumper-desktop/node_modules/.pnpm/better-sqlite3@12.10.0/node_modules/better-sqlite3');
const db = new Database('/Users/yude/Library/Application Support/any-jumper-desktop/agent.sqlite3');

function nowMillis() { return Date.now(); }

function upsertMcp(name, transport, commandJson, url, envJson) {
  const id = 'mcp-' + name;
  const now = nowMillis();
  const enabled = 1;
  db.prepare(
    'INSERT INTO mcp_servers (id, name, transport, command_json, url, env_json, enabled, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ? , ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, transport=excluded.transport, command_json=excluded.command_json, url=excluded.url, env_json=excluded.env_json, enabled=excluded.enabled, updated_at=excluded.updated_at'
  ).run(id, name, transport, commandJson, url, envJson, enabled, 'idle', now, now);
  console.log('OK: ' + name);
}

// 1. fetch - from autoclaw
upsertMcp(
  'fetch',
  'stdio',
  JSON.stringify(['npx', '-y', '@modelcontextprotocol/server-fetch']),
  null,
  null
);

// 2. filesystem - from autoclaw
upsertMcp(
  'filesystem',
  'stdio',
  JSON.stringify(['npx', '-y', '@modelcontextprotocol/server-filesystem', '/Users/yude/Desktop']),
  null,
  null
);

// 3. pencil - from kiro
upsertMcp(
  'pencil',
  'stdio',
  JSON.stringify(['/Applications/Pencil.app/Contents/Resources/app.asar.unpacked/out/mcp-server-darwin-arm64', '--app', 'desktop']),
  null,
  null
);

// 4. autoglm-browser-agent - from autoclaw
upsertMcp(
  'autoglm-browser-agent',
  'stdio',
  JSON.stringify([
    '/Users/yude/.openclaw-autoclaw/skills/autoglm-browser-agent/dist/mcp_server',
    '--start_url', 'https://www.bing.com',
    '--window_width', '1456',
    '--window_height', '819',
    '--resize_width', '1456',
    '--resize_height', '819',
    '--max_steps', '100',
    '--log_dir', '/Users/yude/.openclaw-autoclaw/skills/autoglm-browser-agent/mcp_output',
    '--if_subagent'
  ]),
  null,
  null
);

console.log('\n=== Final MCP Servers in DB ===');
const rows = db.prepare('SELECT name, transport, enabled FROM mcp_servers ORDER BY name').all();
rows.forEach(r => console.log('  ' + r.name + ' | ' + r.transport + ' | enabled=' + r.enabled));
db.close();
console.log('Done.');
