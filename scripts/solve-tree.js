#!/usr/bin/env node
// solve-tree.js — incremental solve tree state manager.
//
// Modes:
//   init <session> <cwd> [start_line]  — initialise a fresh tree state file
//   tool <session> <cwd>               — advance state, never validate (PostToolUse)
//   stop <session> <cwd>               — advance state + validate, processes last_assistant_message if present (PreToolUse / Stop)

const fs   = require('fs');
const path = require('path');

const [,, mode, session, cwd, startLineArg] = process.argv;
if (!mode || !session || !cwd) {
  process.stderr.write(`Usage: solve-tree.js <init|tool|stop> <session_id> <cwd> [start_line]\n`);
  process.exit(1);
}

const treeFile = path.join(cwd, '.claude', `solve_tree_${session}.json`);

const TAG_RE = /<(\/?)(problem|solution|investigate|research|resolved|selected|blocked|compare)(\s[^>]*)?\s*\/?>/g;
const ID_RE  = /\bid=["']?([\d.]+)["']?/;

// ── State helpers ──────────────────────────────────────────────────────────────

function load() {
  return JSON.parse(fs.readFileSync(treeFile, 'utf8'));
}

function save(state) {
  state.updated_at = Date.now() / 1000;
  fs.mkdirSync(path.join(cwd, '.claude'), { recursive: true });
  fs.writeFileSync(treeFile, JSON.stringify(state, null, 2));
}

function solutionNode(id, parentProblem = null) {
  return { type: 'solution', id, parent_problem: parentProblem,
           text: '', status: 'pending', tool_count: 0,
           investigate_text: '', resolved_text: '' };
}

function problemNode(id, parentSolution = null) {
  return { type: 'problem', id, parent_solution: parentSolution,
           text: '', status: 'pending', research_text: '', blocked_text: null };
}

// ── Tree renderer ──────────────────────────────────────────────────────────────

function isSolutionSettled(sol, nodes) {
  if (sol.status === 'resolved' || sol.status === 'failed') return true;
  return Object.values(nodes).some(n =>
    n.type === 'problem' && n.parent_solution === sol.id && n.status === 'blocked'
  );
}

function renderTree(state) {
  const solutions = Object.values(state.nodes)
    .filter(n => n.type === 'solution')
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  if (!solutions.length) return '  (no solutions declared yet)';

  return solutions.map(n => {
    const depth  = (n.id.match(/\./g) || []).length;
    const indent = '  '.repeat(depth + 1);
    return `${indent}${n.id} [${n.status}]`;
  }).join('\n');
}

function incompleteMessage(state, error) {
  const open = Object.values(state.nodes)
    .filter(n => n.type === 'solution' && !isSolutionSettled(n, state.nodes))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    .map(n => `${n.id} (${n.status})`)
    .join(', ');

  const parts = [];
  if (error) parts.push(error);
  parts.push(`Open solutions: ${open || 'none declared'}.`);
  parts.push(`\nCurrent tree:\n${renderTree(state)}`);
  parts.push(`\nDeclare, investigate, and resolve or block all remaining solutions.`);
  return parts.join('\n');
}

// ── init ───────────────────────────────────────────────────────────────────────

if (mode === 'init') {
  const state = {
    session_id:           session,
    cwd,
    status:               'solving',
    container:            null,
    root_problem:         '',
    root_research:        '',
    nodes:                {},
    selected_id:          null,
    compare_text:         null,
    blocked_text:         null,
    last_processed_line:  parseInt(startLineArg) || 0,
    pending_message:      null,
    updated_at:           Date.now() / 1000,
  };
  save(state);
  process.exit(0);
}

// ── tool / stop (shared processing) ──────────────────────────────────────────

let rawPayload = '';
process.stdin.on('data', d => rawPayload += d);
process.stdin.on('end', () => {
  let payload;
  try { payload = JSON.parse(rawPayload); }
  catch { process.stderr.write('Invalid JSON on stdin\n'); process.exit(1); }

  const transcriptPath = payload.transcript_path || '';

  if (!fs.existsSync(treeFile)) {
    process.stderr.write('Tree state file not found.\n');
    process.exit(1);
  }

  const persisted = load();

  const state = {
    session_id:          persisted.session_id,
    cwd:                 persisted.cwd,
    status:              persisted.status,
    container:           persisted.container,
    root_problem:        persisted.root_problem,
    root_research:       persisted.root_research || '',
    nodes:               persisted.nodes,
    selected_id:         persisted.selected_id,
    compare_text:        persisted.compare_text,
    blocked_text:        persisted.blocked_text,
    last_processed_line: persisted.last_processed_line,
    pending_message:     persisted.pending_message || null,
    updated_at:          persisted.updated_at,
  };
  const nodes  = state.nodes;
  const errors = [];
  let container = state.container || null;

  function err(msg) { errors.push(msg); }

  // ── Tag parser ───────────────────────────────────────────────────────────────

  function processText(text) {
    TAG_RE.lastIndex = 0;
    let pos = 0;
    let m;

    while ((m = TAG_RE.exec(text)) !== null) {
      const slash       = m[1];
      const name        = m[2];
      const attrs       = m[3] || '';
      const idMatch     = ID_RE.exec(attrs);
      const tid         = idMatch ? idMatch[1] : null;
      const selfClosing = name === 'selected' || m[0].trimEnd().endsWith('/>');

      if (container) {
        const { type: ctype, id: cid } = container;
        if (slash && name === ctype) {
          // Closing tag — capture content
          const content = ((container.accumulated_text || '') + text.slice(pos, m.index)).trim();

          if (ctype === 'problem') {
            if (cid == null)        state.root_problem = content;
            else if (nodes[cid])    nodes[cid].text    = content;
          } else if (ctype === 'solution' && cid && nodes[cid]) {
            nodes[cid].text = content;
          } else if (ctype === 'investigate' && cid && nodes[cid]) {
            nodes[cid].investigate_text = content;
            nodes[cid].status = 'investigated';
          } else if (ctype === 'research') {
            if (cid && nodes[cid]) {
              nodes[cid].research_text = content;
              nodes[cid].status = 'researched';
            } else if (cid == null) {
              state.root_research = content;
            }
          } else if (ctype === 'resolved' && cid && nodes[cid]) {
            nodes[cid].resolved_text = content;
            nodes[cid].status = 'resolved';
          } else if (ctype === 'blocked') {
            if (cid && nodes[cid]) {
              nodes[cid].blocked_text = content;
              nodes[cid].status = 'blocked';
              // Propagate failure to parent solution
              const parentSol = nodes[cid].parent_solution;
              if (parentSol && nodes[parentSol]) nodes[parentSol].status = 'failed';
            } else {
              state.blocked_text = content;
              state.status = 'blocked';
            }
          } else if (ctype === 'compare') {
            state.compare_text = content;
          }

          container = null;
          state.container = null;
          pos = m.index + m[0].length;
        }
        // Any other tag inside a container — it's just content, skip
        continue;
      }

      // ── Root level ───────────────────────────────────────────────────────────

      if (slash) continue; // stray closing tag

      if (selfClosing) {
        if (name === 'selected' && tid) {
          state.selected_id = tid;
        }
        continue;
      }

      // Opening container tags
      if (name === 'problem') {
        if (tid) {
          const parentSol = tid.includes('.') ? tid.slice(0, tid.lastIndexOf('.')) : null;
          if (parentSol && !nodes[parentSol]) { err(`Sub-problem ${tid} declared under unknown solution ${parentSol} — dropped.`); continue; }
          nodes[tid] = problemNode(tid, parentSol);
        }
        container = { type: 'problem', id: tid };

      } else if (name === 'solution') {
        if (!tid) continue;
        if (!nodes[tid]) {
          const parentProb = tid.includes('.') ? tid.slice(0, tid.lastIndexOf('.')) : null;
          nodes[tid] = solutionNode(tid, parentProb);
        }
        container = { type: 'solution', id: tid };

      } else if (name === 'investigate') {
        if (!tid) continue;
        const node = nodes[tid];
        if (!node || node.type !== 'solution') { err(`<investigate id="${tid}"> has no matching <solution> — dropped.`); continue; }
        if (node.status !== 'pending')         continue; // already investigated/resolved/failed, skip silently
        node.status = 'investigating';
        container = { type: 'investigate', id: tid };

      } else if (name === 'research') {
        if (tid) {
          const node = nodes[tid];
          if (!node || node.type !== 'problem') { err(`<research id="${tid}"> has no matching <problem> — dropped.`); continue; }
          node.status = 'researching';
          container = { type: 'research', id: tid };
        } else {
          container = { type: 'research', id: null };
        }

      } else if (name === 'resolved') {
        if (!tid) continue;
        const node = nodes[tid];
        if (!node || node.type !== 'solution') { err(`<resolved id="${tid}"> has no matching <solution> — dropped.`); continue; }
        if (node.status === 'resolved' || node.status === 'failed') continue; // already settled, skip silently
        if (node.status !== 'investigated')    { err(`Solution ${tid} resolved without being investigated — dropped.`); continue; }
        container = { type: 'resolved', id: tid };

      } else if (name === 'blocked') {
        if (tid) {
          const node = nodes[tid];
          if (!node || node.type !== 'problem') { err(`<blocked id="${tid}"> has no matching <problem> — dropped.`); continue; }
          container = { type: 'blocked', id: tid };
        } else {
          container = { type: 'blocked', id: null };
        }

      } else if (name === 'compare') {
        container = { type: 'compare', id: null };

      } else {
        continue;
      }

      state.container = container;
      pos = m.index + m[0].length;
    }

    // Accumulate remaining text into open container (may close next turn)
    if (container) {
      container.accumulated_text = (container.accumulated_text || '') + text.slice(pos);
      state.container = container;
    }
  }

  // ── Read transcript ──────────────────────────────────────────────────────────

  const startLine = state.last_processed_line || 0;

  if (transcriptPath && fs.existsSync(transcriptPath)) {
    const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
    for (let i = startLine; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      let entry;
      try { entry = JSON.parse(lines[i]); } catch { continue; }
      if (entry.type !== 'assistant') continue;
      const blocks = entry.message?.content || [];
      const entryText = blocks.filter(b => b.type === 'text').map(b => b.text).join('');
      if (state.pending_message !== null && entryText === state.pending_message) {
        state.pending_message = null;
        continue;
      }
      state.pending_message = null;
      for (const block of blocks) {
        if (block?.type === 'text') {
          processText(block.text);
        } else if (block?.type === 'tool_use' && container?.type === 'investigate') {
          const node = nodes[container.id];
          if (node) node.tool_count = (node.tool_count || 0) + 1;
        }
      }
    }
    state.last_processed_line = lines.length;
  }

  // stop mode only: the final message is never in the transcript when the Stop hook fires.
  // Process it from the payload and store it so the next run can skip it.
  if (mode === 'stop' && payload.last_assistant_message) {
    processText(payload.last_assistant_message);
    state.pending_message = payload.last_assistant_message;
  }

  // ── Validate ─────────────────────────────────────────────────────────────────

  // Open container: only an error at stop time (mid-turn investigate is expected in tool mode).
  if (container && mode === 'stop') {
    const idStr = container.id != null ? ` id="${container.id}"` : '';
    err(`You left <${container.type}${idStr}> open without a closing </${container.type}>. Close it before writing <resolved>, sub-problems, or other blocks.`);
  }

  // ── Completeness check ────────────────────────────────────────────────────────

  if (!errors.length && state.status === 'solving') {
    const solutions   = Object.values(nodes).filter(n => n.type === 'solution');
    const allDone     = solutions.length > 0 && solutions.every(n => isSolutionSettled(n, nodes));
    const topResolved = solutions.filter(n => n.status === 'resolved' && !n.id.includes('.'));
    const anyResolved = solutions.some(n => n.status === 'resolved');

    if (allDone && anyResolved) {
      if (!(topResolved.length > 1 && !state.selected_id)) {
        state.status = 'resolved';
      }
    }
  }

  // ── Save and report ───────────────────────────────────────────────────────────

  save(state);

  if (errors.length) {
    process.stdout.write(incompleteMessage(state, errors[0]) + '\n');
    process.exit(1);
  }

  if (state.status === 'solving' && mode === 'stop') {
    process.stdout.write(incompleteMessage(state, null) + '\n');
    process.exit(1);
  }

  if (state.status === 'resolved') {
    process.stdout.write('RESOLVED\n');
  }

  process.exit(0);
});
