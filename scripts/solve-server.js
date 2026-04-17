#!/usr/bin/env node
// solve-server.js — persistent multi-session solve tree visualization.
// Usage: node solve-server.js <data-dir> [port]

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const DATA_DIR = process.argv[2] || path.join(os.homedir(), '.claude');
const PORT     = parseInt(process.argv[3]) || 7337;
const REGISTRY = path.join(DATA_DIR, 'solve_sessions.json');

// ── State ──────────────────────────────────────────────────────────────────────

const listeners = new Set();

function loadRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); }
  catch { return []; }
}

function treeFile(s) {
  return path.join(s.project_path, '.claude', `solve_tree_${s.solve_id}.json`);
}

function loadState(s) {
  try { return JSON.parse(fs.readFileSync(treeFile(s), 'utf8')); }
  catch { return null; }
}

function buildPayload() {
  const sessions = loadRegistry();
  const items = sessions.map(s => ({
    solve_id:     s.solve_id,
    project_name: s.project_name,
    started_at:   s.started_at,
    state:        loadState(s),
  }));
  items.sort((a, b) => {
    const ta = a.state?.updated_at ?? a.started_at;
    const tb = b.state?.updated_at ?? b.started_at;
    return tb - ta;
  });
  return items;
}

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of listeners) {
    try { res.write(msg); }
    catch { listeners.delete(res); }
  }
}

// ── Watcher ────────────────────────────────────────────────────────────────────

let regMtime    = 0;
const fileMtimes = {};

function checkChanges() {
  let changed = false;

  try {
    const m = fs.statSync(REGISTRY).mtimeMs;
    if (m !== regMtime) { regMtime = m; changed = true; }
  } catch {}

  for (const s of loadRegistry()) {
    const tf = treeFile(s);
    try {
      const m = fs.statSync(tf).mtimeMs;
      if (fileMtimes[s.solve_id] !== m) {
        fileMtimes[s.solve_id] = m;
        changed = true;
      }
    } catch {}
  }

  if (changed) broadcast(buildPayload());
}

setInterval(checkChanges, 200);

// ── HTML ───────────────────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Solve</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg:      #0c0c10;
  --surface: #13131a;
  --border:  #1e1e2e;
  --text:    #cdd6f4;
  --sub:     #6c7086;
  --overlay: #313244;
  --blue:    #89b4fa;
  --green:   #a6e3a1;
  --red:     #f38ba8;
  --yellow:  #f9e2af;
  --purple:  #cba6f7;
  --sky:     #89dceb;
}
body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Berkeley Mono','Fira Code','JetBrains Mono',ui-monospace,monospace;
  font-size: 13px;
  line-height: 1.6;
  min-height: 100vh;
}

/* ── Layout ── */
.shell { display: flex; flex-direction: column; height: 100vh; }

header {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 24px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  flex-shrink: 0;
  height: 44px;
  overflow-x: auto;
}
header .logo {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--sub);
  margin-right: 20px;
  white-space: nowrap;
  flex-shrink: 0;
}
.sessions { display: flex; gap: 2px; align-items: center; }
.session-tab {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
  user-select: none;
}
.session-tab:hover  { background: var(--overlay); }
.session-tab.active { background: var(--border); }
.session-tab .dot {
  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
  transition: background 0.3s;
}
.dot.solving  { background: var(--blue); animation: pulse 1.4s ease-in-out infinite; }
.dot.resolved { background: var(--green); }
.dot.blocked  { background: var(--red); }
.dot.unknown  { background: var(--sub); }
.session-tab .name { font-size: 12px; color: var(--text); }
.session-tab .sid  { font-size: 10px; color: var(--sub); }
.session-tab .del  {
  font-size: 11px; color: var(--sub); margin-left: 2px;
  padding: 0 2px; border-radius: 3px; line-height: 1;
}
.session-tab .del:hover { color: var(--red); background: color-mix(in srgb,var(--red) 15%,transparent); }

@keyframes pulse {
  0%,100% { opacity:1; transform:scale(1); }
  50%      { opacity:0.4; transform:scale(0.7); }
}

.main {
  flex: 1;
  overflow-y: auto;
  padding: 28px 28px 48px;
}

.tree { display: flex; flex-direction: column; gap: 8px; }

/* ── Problem ── */
.problem-block {
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--sky);
  border-radius: 6px;
  background: var(--surface);
  margin-bottom: 4px;
  animation: fadein 0.2s ease-out;
}
.problem-block .lbl {
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--sky); margin-bottom: 4px;
}
.problem-block .txt { color: var(--text); white-space: pre-wrap; }

/* ── Solution card ── */
.sol-card {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  overflow: hidden;
  animation: fadein 0.2s ease-out;
  transition: border-color 0.3s, opacity 0.3s;
}
@keyframes fadein {
  from { opacity:0; transform:translateY(-5px); }
  to   { opacity:1; transform:translateY(0); }
}
.sol-card.pending      { border-left: 3px solid var(--overlay); opacity: 0.65; }
.sol-card.investigating{ border-left: 3px solid var(--blue); }
.sol-card.investigated { border-left: 3px solid color-mix(in srgb,var(--blue) 45%,transparent); }
.sol-card.resolved     { border-left: 3px solid var(--green); }
.sol-card.failed       { border-left: 3px solid var(--red); opacity: 0.45; }
.sol-card.selected-sol { box-shadow: 0 0 0 1px color-mix(in srgb,var(--purple) 35%,transparent); border-color: color-mix(in srgb,var(--purple) 50%,transparent); }

.sol-hdr {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
}
.sol-id   { font-size: 10px; color: var(--sub); min-width: 20px; }
.sol-txt  { flex: 1; }
.sol-card.failed .sol-txt { text-decoration: line-through; color: var(--sub); }

.sol-status {
  font-size: 10px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
}
.sol-status.pending      { color: var(--sub); }
.sol-status.investigating{ color: var(--blue); }
.sol-status.investigated { color: color-mix(in srgb,var(--blue) 55%,transparent); }
.sol-status.resolved     { color: var(--green); }
.sol-status.failed       { color: var(--red); }

.blink { display:inline-block; width:5px; height:5px; border-radius:50%;
         background:var(--blue); margin-right:5px; vertical-align:middle;
         animation: pulse 1.2s ease-in-out infinite; }

.tool-pip {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10px; padding: 2px 7px; border-radius: 10px;
  color: var(--sub); background: var(--overlay);
}
.tool-pip.active { color: var(--blue); background: color-mix(in srgb,var(--blue) 12%,transparent); }

.sel-badge {
  font-size: 10px; color: var(--purple);
  background: color-mix(in srgb,var(--purple) 12%,transparent);
  border: 1px solid color-mix(in srgb,var(--purple) 30%,transparent);
  padding: 2px 7px; border-radius: 10px;
}

.sol-detail {
  border-top: 1px solid var(--border);
  padding: 10px 14px 10px 34px;
  display: flex; flex-direction: column; gap: 8px;
}
.detail-sec { display: flex; flex-direction: column; gap: 3px; }
.detail-lbl {
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--sub);
}
.detail-txt {
  font-size: 12px; white-space: pre-wrap;
  color: color-mix(in srgb,var(--text) 75%,transparent);
}

/* ── Sub-problems ── */
.sub-group {
  margin-left: 20px; margin-top: 4px;
  padding-left: 14px;
  border-left: 1px dashed var(--border);
  display: flex; flex-direction: column; gap: 8px;
}
.sub-lbl {
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--sky); opacity: 0.6; padding: 2px 0;
}

/* ── Blocked ── */
.blocked-block {
  padding: 12px 16px;
  border: 1px solid color-mix(in srgb,var(--red) 30%,transparent);
  border-left: 3px solid var(--red); border-radius: 6px;
  background: color-mix(in srgb,var(--red) 5%,transparent);
  animation: fadein 0.2s ease-out;
}
.blocked-block .lbl {
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--red); margin-bottom: 4px;
}


.empty { color: var(--sub); font-style: italic; padding: 32px 0; }
.shutdown-btn {
  margin-left: auto;
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--sub);
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
  transition: color 0.15s;
}
.shutdown-btn:hover { color: var(--red); }
</style>
</head>
<body>
<div class="shell">
  <header>
    <span class="logo">⬡ Solve</span>
    <div class="sessions" id="sessions"></div>
    <button class="shutdown-btn" id="shutdownBtn" title="Shut down server">⏻</button>
  </header>
  <div class="main">
    <div class="tree" id="tree"><p class="empty">Waiting for a solve session…</p></div>
  </div>
</div>
<script>
let allSessions  = [];
let currentId    = null;
let knownIds     = new Set();

const sessionsEl = document.getElementById('sessions');
const treeEl     = document.getElementById('tree');

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls)                e.className   = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function statusLabel(s) {
  return { pending:'pending', investigating:'investigating…',
           investigated:'investigated', resolved:'resolved', failed:'failed' }[s] || s;
}

function renderTabs(sessions) {
  sessionsEl.innerHTML = '';
  sessions.forEach(s => {
    const status = s.state?.status || 'unknown';
    const tab = el('div', \`session-tab\${s.solve_id === currentId ? ' active' : ''}\`);
    tab.dataset.id = s.solve_id;
    const dot  = el('span', \`dot \${status}\`);
    const name = el('span', 'name', s.project_name);
    const sid  = el('span', 'sid', s.solve_id.slice(0,6));
    const del = el('span', 'del', '×');
    del.title = 'Delete session';
    del.onclick = e => { e.stopPropagation(); deleteSession(s.solve_id); };
    tab.append(dot, name, sid, del);
    tab.onclick = () => switchTo(s.solve_id);
    sessionsEl.append(tab);
  });
}

function switchTo(id) {
  currentId = id;
  renderTabs(allSessions);
  const s = allSessions.find(x => x.solve_id === id);
  renderTree(s?.state || null);
}

function renderProblem(labelText, text, nodeId) {
  const b = el('div', 'problem-block');
  b.id = 'prob-' + (nodeId || 'root');
  b.append(el('div', 'lbl', labelText), el('div', 'txt', text || '…'));
  return b;
}

function renderSolution(node, selectedId, nodes) {
  const isSel  = selectedId === node.id;
  const card   = el('div', \`sol-card \${node.status}\${isSel ? ' selected-sol' : ''}\`);
  card.id      = 'sol-' + node.id;

  const hdr = el('div', 'sol-hdr');
  hdr.append(el('span', 'sol-id', node.id));
  hdr.append(el('span', 'sol-txt', node.text || '…'));

  if (node.tool_count > 0 || node.status === 'investigating') {
    const tc = el('span', \`tool-pip\${node.tool_count > 0 ? ' active' : ''}\`,
                  node.tool_count + ' tool' + (node.tool_count !== 1 ? 's' : ''));
    hdr.append(tc);
  }
  if (isSel) hdr.append(el('span', 'sel-badge', '★ selected'));

  const st = el('span', \`sol-status \${node.status}\`);
  if (node.status === 'investigating') st.prepend(el('span', 'blink'));
  st.append(document.createTextNode(statusLabel(node.status)));
  hdr.append(st);
  card.append(hdr);

  if (node.investigate_text || node.resolved_text) {
    const det = el('div', 'sol-detail');
    if (node.investigate_text) {
      const s = el('div', 'detail-sec');
      s.append(el('div', 'detail-lbl', 'investigation'), el('div', 'detail-txt', node.investigate_text));
      det.append(s);
    }
    if (node.resolved_text) {
      const s = el('div', 'detail-sec');
      s.append(el('div', 'detail-lbl', 'resolution'), el('div', 'detail-txt', node.resolved_text));
      det.append(s);
    }
    card.append(det);
  }

  // Sub-problems
  const subprobs = Object.values(nodes)
    .filter(n => n.type === 'problem' && n.parent_solution === node.id)
    .sort((a,b) => a.id.localeCompare(b.id, undefined, {numeric:true}));
  for (const prob of subprobs) {
    const grp = el('div', 'sub-group');
    grp.append(el('div', 'sub-lbl', 'sub-problem ' + prob.id));
    if (prob.text) grp.append(renderProblem('problem ' + prob.id, prob.text, prob.id));
    if (prob.research_text) {
      const rs = el('div', 'detail-sec');
      rs.style.cssText = 'padding: 6px 0;';
      rs.append(el('div', 'detail-lbl', 'research'), el('div', 'detail-txt', prob.research_text));
      grp.append(rs);
    }
    if (prob.blocked_text) {
      const bl = el('div', 'blocked-block');
      bl.style.cssText = 'margin-top: 4px;';
      bl.append(el('div', 'lbl', 'blocked'), el('div', 'txt', prob.blocked_text));
      grp.append(bl);
    } else {
      const subsols = Object.values(nodes)
        .filter(n => n.type === 'solution' && n.parent_problem === prob.id)
        .sort((a,b) => a.id.localeCompare(b.id, undefined, {numeric:true}));
      subsols.forEach(s => grp.append(renderSolution(s, selectedId, nodes)));
    }
    card.append(grp);
  }
  return card;
}

function renderTree(state) {
  const frag = document.createDocumentFragment();
  if (!state) { treeEl.replaceChildren(el('p','empty','No state yet…')); return; }

  const nodes = state.nodes || {};
  if (state.root_problem) frag.append(renderProblem('problem', state.root_problem, null));

  Object.values(nodes)
    .filter(n => n.type === 'solution' && !n.parent_problem)
    .sort((a,b) => a.id.localeCompare(b.id, undefined, {numeric:true}))
    .forEach(sol => frag.append(renderSolution(sol, state.selected_id, nodes)));

  if (state.blocked_text) {
    const b = el('div','blocked-block');
    b.append(el('div','lbl','blocked'), el('div','txt', state.blocked_text));
    frag.append(b);
  }
  if (!frag.childNodes.length) frag.append(el('p','empty','Tree is empty…'));

  treeEl.replaceChildren(frag);
}

function update(sessions) {
  allSessions = sessions;
  const newIds = sessions.map(s => s.solve_id);

  // Auto-switch to a newly appearing session
  const fresh = newIds.find(id => !knownIds.has(id));
  if (fresh) currentId = fresh;
  newIds.forEach(id => knownIds.add(id));

  // If current session gone, fall back to first
  if (!currentId || !newIds.includes(currentId)) currentId = newIds[0] || null;

  renderTabs(sessions);
  const active = sessions.find(s => s.solve_id === currentId);
  renderTree(active?.state || null);
}

function deleteSession(id) {
  fetch(\`/session/\${id}\`, { method: 'DELETE' }).catch(() => {});
}

document.getElementById('shutdownBtn').addEventListener('click', () => {
  location.href = '/shutdown';
});

// Initial load
fetch('/state').then(r=>r.json()).then(update).catch(()=>{});

// SSE
const es = new EventSource('/events');
es.onmessage = e => { try { update(JSON.parse(e.data)); } catch(_) {} };
es.onerror   = () => setTimeout(() => location.reload(), 3000);
</script>
</body>
</html>`;

// ── HTTP server ────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/') {
    const body = Buffer.from(HTML);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length });
    res.end(body);

  } else if (url === '/state') {
    const body = Buffer.from(JSON.stringify(buildPayload()));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': body.length });
    res.end(body);

  } else if (url === '/events') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
      'Connection':    'keep-alive',
    });
    res.write(': connected\n\n');

    listeners.add(res);

    // Send current state immediately
    res.write(`data: ${JSON.stringify(buildPayload())}\n\n`);

    // Keepalive
    const ka = setInterval(() => {
      try { res.write(': keepalive\n\n'); }
      catch { clearInterval(ka); listeners.delete(res); }
    }, 15000);

    req.on('close', () => { clearInterval(ka); listeners.delete(res); });

  } else if (req.method === 'DELETE' && url.startsWith('/session/')) {
    const id = url.slice('/session/'.length);
    try {
      const sessions = loadRegistry();
      const target = sessions.find(s => s.solve_id === id);
      const remaining = sessions.filter(s => s.solve_id !== id);
      fs.writeFileSync(REGISTRY, JSON.stringify(remaining, null, 2));
      if (target) { try { fs.unlinkSync(treeFile(target)); } catch {} }
      broadcast(buildPayload());
      res.writeHead(200);
    } catch { res.writeHead(500); }
    res.end();

  } else if (url === '/shutdown') {
    const body = Buffer.from('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Solve</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0c0c10;color:#6c7086;font-family:monospace;font-size:14px;">Server stopped. You can close this tab.</body></html>');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length });
    res.end(body);
    setTimeout(() => process.exit(0), 100);

  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, 'localhost', () => {
  process.stdout.write(`http://localhost:${PORT}\n`);
});
