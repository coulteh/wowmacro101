// Renders the syntax-highlight layer that sits behind the textarea.
//
// One <div> per source line keeps the overlay in lockstep with the gutter, and
// because tokens never span a newline the line split is always safe.

import type { MacroAst } from '../parser/types';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function highlightHtml(ast: MacroAst): string {
  return ast.lines
    .map((line) => {
      let html = '';
      let pos = line.start;
      for (const token of line.tokens) {
        if (token.start < pos) continue; // defensive: never emit overlapping spans
        if (token.start > pos) html += escapeHtml(ast.source.slice(pos, token.start));
        const classes = [`t-${token.type}`];
        if (token.severity) classes.push(`sev-${token.severity}`);
        const node = token.nodeId ? ` data-node="${token.nodeId}"` : '';
        html += `<span class="${classes.join(' ')}"${node}>`
          + `${escapeHtml(ast.source.slice(token.start, token.end))}</span>`;
        pos = token.end;
      }
      if (pos < line.end) html += escapeHtml(ast.source.slice(pos, line.end));
      return `<div class="hl-line">${html}</div>`;
    })
    .join('');
}

/** The innermost node containing an offset — used to sync the caret to the explanation. */
export function nodeAtOffset(ast: MacroAst, offset: number): string | null {
  for (const line of ast.lines) {
    if (offset < line.start || offset > line.end) continue;
    for (const clause of line.clauses) {
      for (const group of clause.groups) {
        for (const cond of group.conditions) {
          if (offset >= cond.start && offset <= cond.end) return cond.id;
        }
      }
      if (offset >= clause.start && offset <= clause.end) return clause.id;
    }
    return line.id;
  }
  return null;
}
