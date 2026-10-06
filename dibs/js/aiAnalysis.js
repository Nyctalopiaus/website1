/**
 * AI Analysis: a long-form, per-listing write-up pasted in from an AI chat (Claude, ChatGPT...).
 *
 * Stored as Markdown text in user_metadata.ai_analysis and rendered here, so headings, lists,
 * bold/italic, tables, quotes and code keep their formatting. Private to the account that pasted
 * it: it is not part of any realtor view and is never sent to the MLS.
 *
 * Two paste routes are supported:
 *   - An AI chat's "Copy" button puts Markdown on the clipboard: pasted as-is.
 *   - Selecting text on the page and copying puts rendered HTML on the clipboard: converted to
 *     Markdown on paste (see htmlToMarkdown), because the plain-text half has no formatting.
 *
 * A third route is the "Generate with Gemini" button, which writes the analysis from the data
 * Dibs holds for the listing (see geminiAnalysis.js) and saves it to the same field.
 *
 * The renderer escapes everything before adding its own tags, so pasted text can never inject
 * markup; links are limited to http(s).
 */
import { CONFIG, state } from './state.js';
import { apiFetch, logClientEvent } from './api.js';
import { showToast } from './toast.js';
import { buildAiAnalysisBadge } from './properties.js';
import {
    generatePropertyAnalysis, getGeminiKeyState, getGeminiModel, setGeminiModel, unlockGeminiVault, saveGeminiVault,
    GEMINI_DEFAULT_MODEL, GEMINI_MIN_PIN_LENGTH
} from './geminiAnalysis.js';
import './aiSetup.js'; // user-menu "AI Setup" modal for the same key

const MAX_ANALYSIS_BYTES = 200000; // keep in step with handleUpdateUserData()
let editingMlsId = null;
let expanded = false;
let geminiPanel = null;      // null | 'unlock' | 'setup': the key form shown under the section
let generatingMlsId = null;  // listing Gemini is currently writing for

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ---- Markdown -> HTML ---------------------------------------------------------------------

function renderInline(text) {
    // Code spans and links are swapped for placeholders first so the emphasis rules below
    // can't mangle underscores/asterisks inside them.
    const stash = [];
    const keep = html => `\u0000${stash.push(html) - 1}\u0000`;

    let s = String(text).replace(/`([^`\n]+)`/g, (m, code) => keep(`<code>${esc(code)}</code>`));
    s = esc(s);
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) =>
        keep(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`));
    // Bare URLs. The text is already escaped, so a URL must stop at an escaped quote or angle
    // bracket (&quot; etc.), and trailing sentence punctuation stays outside the link.
    s = s.replace(/https?:\/\/(?:(?!&(?:quot|#39|lt|gt);)[^\s<])+/g, match => {
        const url = match.replace(/[.,;:!?)\]*]+$/, '');
        return keep(`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`) + match.slice(url.length);
    });

    s = s.replace(/\*\*([^\s*](?:[^\n]*?[^\s*])?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^\w])__([^\s_](?:[^\n]*?[^\s_])?)__(?=[^\w]|$)/g, '$1<strong>$2</strong>');
    s = s.replace(/(^|[^\w*])\*([^\s*](?:[^*\n]*[^\s*])?)\*(?![\w*])/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^\w])_([^\s_](?:[^_\n]*[^\s_])?)_(?=[^\w]|$)/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    s = s.replace(/\n/g, '<br>');

    // Labels inside stashed links may themselves hold placeholders (e.g. a code span).
    let guard = 0;
    while (/\u0000\d+\u0000/.test(s) && guard++ < 5) {
        s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => stash[Number(i)]);
    }
    return s;
}

const RE_HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RE_HR = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const RE_FENCE = /^ {0,3}(```|~~~)/;
const RE_LIST_ITEM = /^(\s*)([-*+•]|\d{1,9}[.)])\s+(.*)$/;
const RE_QUOTE = /^ {0,3}>\s?(.*)$/;
const RE_TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function indentWidth(ws) {
    return ws.replace(/\t/g, '    ').length;
}

function splitTableRow(line) {
    const cells = line.trim().replace(/\\\|/g, '\u0001').replace(/^\|/, '').replace(/\|$/, '').split('|');
    return cells.map(cell => cell.replace(/\u0001/g, '|').trim());
}

function isTableStart(lines, i) {
    return lines[i].includes('|') && i + 1 < lines.length && lines[i + 1].includes('-') && RE_TABLE_SEP.test(lines[i + 1])
        && splitTableRow(lines[i]).length === splitTableRow(lines[i + 1]).length;
}

function renderList(items) {
    let html = '';
    const stack = [];
    const open = item => {
        const tag = item.ordered ? 'ol' : 'ul';
        html += item.ordered && item.start !== 1 ? `<ol start="${item.start}">` : `<${tag}>`;
        stack.push({ indent: item.indent, tag });
    };
    items.forEach(item => {
        while (stack.length && item.indent < stack[stack.length - 1].indent) {
            html += `</li></${stack.pop().tag}>`;
        }
        const top = stack[stack.length - 1];
        if (!top || item.indent > top.indent) {
            open(item);
        } else {
            html += '</li>';
            if (top.tag !== (item.ordered ? 'ol' : 'ul')) {
                html += `</${stack.pop().tag}>`;
                open({ ...item, indent: top.indent });
            }
        }
        html += `<li>${renderInline(item.text)}`;
    });
    while (stack.length) html += `</li></${stack.pop().tag}>`;
    return html;
}

export function renderMarkdown(source) {
    const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;

    const startsBlock = idx => RE_HEADING.test(lines[idx]) || RE_HR.test(lines[idx]) || RE_FENCE.test(lines[idx])
        || RE_LIST_ITEM.test(lines[idx]) || RE_QUOTE.test(lines[idx]) || isTableStart(lines, idx);

    while (i < lines.length) {
        const line = lines[i];

        if (!line.trim()) { i++; continue; }

        const fence = line.match(RE_FENCE);
        if (fence) {
            const body = [];
            i++;
            while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
            i++;
            out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
            continue;
        }

        const heading = line.match(RE_HEADING);
        if (heading) {
            const level = heading[1].length;
            out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
            i++;
            continue;
        }

        if (RE_HR.test(line)) { out.push('<hr>'); i++; continue; }

        if (isTableStart(lines, i)) {
            const head = splitTableRow(lines[i]);
            const aligns = splitTableRow(lines[i + 1]).map(cell =>
                /^:-+:$/.test(cell) ? 'center' : (/-+:$/.test(cell) ? 'right' : ''));
            const cellAttr = idx => aligns[idx] ? ` style="text-align:${aligns[idx]};"` : '';
            i += 2;
            const rows = [];
            while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(splitTableRow(lines[i++]));
            out.push('<div class="ai-analysis-table-wrap"><table>'
                + `<thead><tr>${head.map((cell, idx) => `<th${cellAttr(idx)}>${renderInline(cell)}</th>`).join('')}</tr></thead>`
                + `<tbody>${rows.map(row => `<tr>${head.map((_, idx) => `<td${cellAttr(idx)}>${renderInline(row[idx] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>`
                + '</table></div>');
            continue;
        }

        if (RE_QUOTE.test(line)) {
            const body = [];
            while (i < lines.length && RE_QUOTE.test(lines[i])) body.push(lines[i++].match(RE_QUOTE)[1]);
            out.push(`<blockquote>${renderMarkdown(body.join('\n'))}</blockquote>`);
            continue;
        }

        if (RE_LIST_ITEM.test(line)) {
            const items = [];
            while (i < lines.length) {
                const itemMatch = lines[i].match(RE_LIST_ITEM);
                if (itemMatch && !RE_HR.test(lines[i])) {
                    const ordered = /\d/.test(itemMatch[2]);
                    items.push({ indent: indentWidth(itemMatch[1]), ordered, start: ordered ? parseInt(itemMatch[2], 10) : 1, text: itemMatch[3] });
                    i++;
                    continue;
                }
                if (!lines[i].trim()) {
                    // A blank line only stays inside the list if a list item or an indented
                    // continuation line follows it.
                    let next = i + 1;
                    while (next < lines.length && !lines[next].trim()) next++;
                    if (next < lines.length && (RE_LIST_ITEM.test(lines[next]) || /^\s{2,}\S/.test(lines[next]))) { i = next; continue; }
                    break;
                }
                if (/^\s{2,}\S/.test(lines[i]) && !RE_FENCE.test(lines[i].trim())) {
                    items[items.length - 1].text += '\n' + lines[i].trim();
                    i++;
                    continue;
                }
                break;
            }
            out.push(renderList(items));
            continue;
        }

        const para = [line.trim()];
        i++;
        while (i < lines.length && lines[i].trim() && !startsBlock(i)) para.push(lines[i++].trim());
        out.push(`<p>${renderInline(para.join('\n'))}</p>`);
    }
    return out.join('\n');
}

// ---- Pasted HTML -> Markdown --------------------------------------------------------------

const BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'table', 'pre', 'blockquote', 'hr', 'div', 'section', 'article', 'main', 'header', 'footer']);
const BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,ul,ol,table,pre,blockquote,hr,div';
const SKIP_TAGS = new Set(['script', 'style', 'button', 'svg', 'noscript', 'template', 'head', 'meta', 'link', 'title']);

function isBoldElement(el, tag) {
    const weight = (el.style && el.style.fontWeight) || '';
    if (tag === 'b' || tag === 'strong') return weight !== 'normal' && weight !== '400'; // Google Docs wraps everything in <b style="font-weight:normal">
    return weight === 'bold' || Number(weight) >= 600;
}

function wrapInline(text, marker) {
    const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
    return match[2] ? `${match[1]}${marker}${match[2]}${marker}${match[3]}` : text;
}

function inlineToMarkdown(nodes) {
    let s = '';
    nodes.forEach(node => {
        if (node.nodeType === 3) { s += node.nodeValue.replace(/\s+/g, ' '); return; }
        if (node.nodeType !== 1) return;
        const tag = node.tagName.toLowerCase();
        if (SKIP_TAGS.has(tag)) return;
        if (tag === 'br') { s += '\n'; return; }
        if (tag === 'code') { s += '`' + node.textContent.replace(/`/g, "'") + '`'; return; }
        const inner = inlineToMarkdown([...node.childNodes]);
        if (tag === 'a') {
            const href = node.getAttribute('href') || '';
            s += /^https?:\/\//i.test(href) && inner.trim() ? `[${inner.trim()}](${href})` : inner;
        } else if (isBoldElement(node, tag)) {
            s += wrapInline(inner, '**');
        } else if (tag === 'em' || tag === 'i' || (node.style && node.style.fontStyle === 'italic')) {
            s += wrapInline(inner, '*');
        } else if (tag === 'del' || tag === 's' || tag === 'strike') {
            s += wrapInline(inner, '~~');
        } else {
            s += inner;
        }
    });
    return s;
}

function listToMarkdown(listEl, depth) {
    const ordered = listEl.tagName.toLowerCase() === 'ol';
    const start = parseInt(listEl.getAttribute('start') || '1', 10) || 1;
    const pad = '    '.repeat(depth);
    const lines = [];
    [...listEl.children].filter(el => el.tagName.toLowerCase() === 'li').forEach((li, idx) => {
        const parts = [];
        let run = [];
        const nested = [];
        const flush = () => {
            const text = inlineToMarkdown(run).replace(/[ \t]*\n[ \t]*/g, '\n').trim();
            if (text) parts.push(text);
            run = [];
        };
        [...li.childNodes].forEach(child => {
            const tag = child.nodeType === 1 ? child.tagName.toLowerCase() : '';
            if (tag === 'ul' || tag === 'ol') { flush(); nested.push(child); }
            else if (tag === 'p' || tag === 'div') { flush(); run = [...child.childNodes]; flush(); }
            else run.push(child);
        });
        flush();
        const text = parts.join('\n').replace(/\n/g, `\n${pad}    `);
        lines.push(`${pad}${ordered ? `${start + idx}.` : '-'} ${text}`);
        nested.forEach(sub => lines.push(listToMarkdown(sub, depth + 1)));
    });
    return lines.join('\n');
}

function tableToMarkdown(tableEl) {
    const rows = [...tableEl.querySelectorAll('tr')].map(tr =>
        [...tr.children].filter(cell => /^(td|th)$/i.test(cell.tagName)).map(cell =>
            inlineToMarkdown([...cell.childNodes]).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim()));
    const filled = rows.filter(row => row.length);
    if (!filled.length) return '';
    const width = Math.max(...filled.map(row => row.length));
    const line = row => `| ${Array.from({ length: width }, (_, idx) => row[idx] ?? '').join(' | ')} |`;
    return [line(filled[0]), `| ${Array(width).fill('---').join(' | ')} |`, ...filled.slice(1).map(line)].join('\n');
}

function blocksToMarkdown(parent) {
    const blocks = [];
    let run = [];
    const flush = () => {
        const text = inlineToMarkdown(run).replace(/[ \t]*\n[ \t]*/g, '\n').trim();
        if (text) blocks.push(text);
        run = [];
    };
    [...parent.childNodes].forEach(node => {
        const tag = node.nodeType === 1 ? node.tagName.toLowerCase() : '';
        if (!tag || !BLOCK_TAGS.has(tag)) {
            if (SKIP_TAGS.has(tag)) return;
            // An inline wrapper around block content (Google Docs wraps a whole paste in <b>).
            if (tag && node.querySelector(BLOCK_SELECTOR)) { flush(); blocks.push(blocksToMarkdown(node)); return; }
            run.push(node);
            return;
        }
        flush();
        if (/^h[1-6]$/.test(tag)) {
            const text = inlineToMarkdown([...node.childNodes]).replace(/\s+/g, ' ').trim().replace(/^\*\*(.*)\*\*$/, '$1');
            if (text) blocks.push(`${'#'.repeat(Number(tag[1]))} ${text}`);
        } else if (tag === 'ul' || tag === 'ol') {
            blocks.push(listToMarkdown(node, 0));
        } else if (tag === 'table') {
            blocks.push(tableToMarkdown(node));
        } else if (tag === 'pre') {
            blocks.push('```\n' + node.textContent.replace(/\n$/, '') + '\n```');
        } else if (tag === 'blockquote') {
            blocks.push(blocksToMarkdown(node).split('\n').map(l => `> ${l}`).join('\n'));
        } else if (tag === 'hr') {
            blocks.push('---');
        } else if (tag !== 'p' && node.querySelector(BLOCK_SELECTOR)) {
            blocks.push(blocksToMarkdown(node));
        } else {
            run = [...node.childNodes];
            flush();
        }
    });
    flush();
    return blocks.filter(Boolean).join('\n\n');
}

export function htmlToMarkdown(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return blocksToMarkdown(doc.body).replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function looksLikeMarkdown(text) {
    return /^ {0,3}#{1,6}\s+\S/m.test(text) || /\*\*[^*\n]+\*\*/.test(text) || /^\s*\|?\s*:?-{3,}:?\s*\|/m.test(text);
}

// Selecting rendered text and copying leaves the formatting only in the clipboard's HTML half.
document.addEventListener('paste', event => {
    const input = event.target;
    if (!input || input.id !== 'ai-analysis-input' || !event.clipboardData) return;
    const html = event.clipboardData.getData('text/html');
    const plain = event.clipboardData.getData('text/plain') || '';
    if (!html || looksLikeMarkdown(plain)) return;
    if (!/<(h[1-6]|ul|ol|li|table|strong|b|em|i|pre|blockquote)\b/i.test(html)) return;
    let markdown = '';
    try { markdown = htmlToMarkdown(html); } catch (e) { return; }
    if (!markdown) return;
    event.preventDefault();
    input.setRangeText(markdown, input.selectionStart, input.selectionEnd, 'end');
});

// ---- Detail-modal section -----------------------------------------------------------------

function findProperty(mlsId) {
    return (state.allProperties || []).find(item => String(item.mls_id) === String(mlsId));
}

function geminiPanelHtml(id) {
    const shared = 'Encrypted with your PIN and kept only in this browser. certforge uses the same saved key, so you set it once.';
    if (geminiPanel === 'unlock') {
        return `<div class="ai-analysis-key-panel">
                <label class="ai-analysis-key-field">Vault PIN
                    <input type="password" id="gemini-pin-input" class="input-text" autocomplete="off" placeholder="PIN for your saved Gemini key" onkeydown="if(event.key==='Enter'){event.preventDefault();submitGeminiKeyPanel('${id}');}">
                </label>
                <div class="ai-analysis-actions">
                    <button type="button" class="btn btn-primary" onclick="submitGeminiKeyPanel('${id}')"><i data-lucide="lock-open"></i> Unlock & Generate</button>
                    <button type="button" class="btn btn-secondary" onclick="closeGeminiKeyPanel('${id}')">Cancel</button>
                    <button type="button" class="btn btn-secondary" onclick="openGeminiKeyPanel('${id}', 'setup')">Use a different key</button>
                </div>
                <div class="comps-note">Your Gemini key is saved in this browser, locked with the PIN you chose. It stays unlocked until you close this tab.</div>
            </div>`;
    }
    return `<div class="ai-analysis-key-panel">
            <label class="ai-analysis-key-field">Gemini API key
                <input type="password" id="gemini-key-input" class="input-text" autocomplete="off" placeholder="Paste your key from Google AI Studio">
            </label>
            <label class="ai-analysis-key-field">Vault PIN (${GEMINI_MIN_PIN_LENGTH}+ characters)
                <input type="password" id="gemini-pin-input" class="input-text" autocomplete="new-password">
            </label>
            <label class="ai-analysis-key-field">Confirm PIN
                <input type="password" id="gemini-pin-confirm-input" class="input-text" autocomplete="new-password">
            </label>
            <label class="ai-analysis-key-field">Model
                <input type="text" id="gemini-model-input" class="input-text" autocomplete="off" value="${esc(getGeminiModel())}" placeholder="${esc(GEMINI_DEFAULT_MODEL)}">
            </label>
            <div class="ai-analysis-actions">
                <button type="button" class="btn btn-primary" onclick="submitGeminiKeyPanel('${id}')"><i data-lucide="key-round"></i> Save & Generate</button>
                <button type="button" class="btn btn-secondary" onclick="closeGeminiKeyPanel('${id}')">Cancel</button>
            </div>
            <div class="comps-note">${shared}${getGeminiKeyState() === 'none' ? '' : ' Saving here replaces the key that is stored now.'}</div>
        </div>`;
}

function sectionInnerHtml(p) {
    const id = esc(String(p.mls_id));
    const text = String(p.ai_analysis || '');
    const title = `<div class="modal-section-title"><i data-lucide="bot"></i> AI Analysis</div>`;
    const privacy = 'Private to you: not shown to your realtor and never sent to the MLS.';

    if (String(editingMlsId) === String(p.mls_id)) {
        return `${title}
            <textarea id="ai-analysis-input" class="input-text ai-analysis-input" spellcheck="false" placeholder="Paste the analysis here. Headings, lists, bold text and tables are kept.">${esc(text)}</textarea>
            <div class="ai-analysis-actions">
                <button type="button" class="btn btn-primary" onclick="saveAiAnalysis('${id}')"><i data-lucide="save"></i> Save Analysis</button>
                <button type="button" class="btn btn-secondary" onclick="cancelAiAnalysisEdit('${id}')">Cancel</button>
                <span class="comps-note" style="margin:0;">${privacy}</span>
            </div>`;
    }

    const generating = String(generatingMlsId) === String(p.mls_id);
    const hasText = !!text.trim();
    const generateBtn = generating
        ? `<button type="button" class="btn btn-secondary" disabled><i data-lucide="loader"></i> Gemini is writing...</button>`
        : `<button type="button" class="btn ${hasText ? 'btn-secondary' : 'btn-primary'}" onclick="generateAiAnalysis('${id}')"><i data-lucide="sparkles"></i> ${hasText ? 'Regenerate with Gemini' : 'Generate with Gemini'}</button>`;
    const generatingNote = generating
        ? `<div class="comps-note">Gemini is reading this listing's Dibs data and searching the web. This usually takes under a minute; you can keep browsing and it will be saved here when it finishes.</div>`
        : '';
    const panel = geminiPanel && !generating ? geminiPanelHtml(id) : '';

    if (!hasText) {
        return `${title}
            <div class="ai-analysis-actions">
                ${generateBtn}
                <button type="button" class="btn btn-secondary" onclick="editAiAnalysis('${id}')" ${generating ? 'disabled' : ''}><i data-lucide="clipboard-paste"></i> Paste an Analysis</button>
            </div>
            ${generatingNote}${panel}
            <div class="comps-note">Gemini writes this from what Dibs knows about the home (price history, comps and price score, HOA, age, your notes, nearby listings) plus a web search. Or paste a write-up from any AI; its formatting is kept. ${privacy}</div>`;
    }

    return `${title}
        <div class="ai-analysis-body${expanded ? ' is-expanded' : ''}" id="ai-analysis-body">${renderMarkdown(text)}</div>
        <div class="ai-analysis-actions">
            <button type="button" class="btn btn-secondary" onclick="editAiAnalysis('${id}')" ${generating ? 'disabled' : ''}><i data-lucide="pencil"></i> Edit</button>
            <button type="button" class="btn btn-secondary" onclick="toggleAiAnalysisExpand('${id}')"><i data-lucide="${expanded ? 'minimize-2' : 'maximize-2'}"></i> ${expanded ? 'Collapse' : 'Show All'}</button>
            ${generateBtn}
        </div>
        ${generatingNote}${panel}`;
}

/** Section markup for showPropertyDetails(); opening a listing always starts in view mode. */
export function buildAiAnalysisSectionHtml(p) {
    editingMlsId = null;
    expanded = false;
    geminiPanel = null;
    return `<div id="detail-ai-analysis" data-mls="${esc(String(p.mls_id))}">${sectionInnerHtml(p)}</div>`;
}

/** Adds or removes the "AI analysis" pill on this listing's card behind the modal, without a full re-render. */
function syncCardAiBadge(p) {
    document.querySelectorAll('.property-card .card-scores').forEach(scores => {
        const card = scores.closest('.property-card');
        if (!card || card.dataset.mls !== String(p.mls_id)) return;
        scores.querySelectorAll('.ai-analysis-badge').forEach(el => el.remove());
        scores.insertAdjacentHTML('afterbegin', buildAiAnalysisBadge(p));
    });
    if (window.lucide) window.lucide.createIcons();
}

function refreshSection(p) {
    const section = document.getElementById('detail-ai-analysis');
    if (!section || section.dataset.mls !== String(p.mls_id)) return;
    section.innerHTML = sectionInnerHtml(p);
    if (window.lucide) window.lucide.createIcons();
}

/**
 * The text sitting in an open editor for this listing, or null when the editor is closed.
 * saveModalNotes() uses it so "Save Rating & Notes" doesn't silently drop an unsaved paste.
 */
export function getOpenAiAnalysisDraft(mlsId) {
    if (String(editingMlsId) !== String(mlsId)) return null;
    const input = document.getElementById('ai-analysis-input');
    return input ? input.value : null;
}

export function isAiAnalysisTooLong(text) {
    return new Blob([String(text || '')]).size > MAX_ANALYSIS_BYTES;
}

window.editAiAnalysis = function(mlsId) {
    const p = findProperty(mlsId);
    if (!p) return;
    editingMlsId = p.mls_id;
    refreshSection(p);
    const input = document.getElementById('ai-analysis-input');
    if (input) input.focus();
};

window.cancelAiAnalysisEdit = function(mlsId) {
    const p = findProperty(mlsId);
    if (!p) return;
    const input = document.getElementById('ai-analysis-input');
    if (input && input.value !== String(p.ai_analysis || '') && !confirm('Discard your unsaved changes to this analysis?')) return;
    editingMlsId = null;
    refreshSection(p);
};

window.toggleAiAnalysisExpand = function(mlsId) {
    const p = findProperty(mlsId);
    if (!p) return;
    expanded = !expanded;
    refreshSection(p);
};

window.saveAiAnalysis = function(mlsId) {
    const p = findProperty(mlsId);
    const input = document.getElementById('ai-analysis-input');
    if (!p || !input) return;
    const text = input.value.trim();
    if (isAiAnalysisTooLong(text)) {
        showToast('That analysis is too long to save (200 KB max).', 'error');
        return;
    }
    apiFetch(CONFIG.API_URL + '?action=update_user_data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mls_id: p.mls_id, ai_analysis: text })
    }).then(data => {
        if (!data || data.success === false || data.error) throw new Error((data && data.error) || 'Unable to save analysis');
        p.ai_analysis = text;
        syncCardAiBadge(p);
        editingMlsId = null;
        refreshSection(p);
        showToast(text ? 'AI analysis saved' : 'AI analysis cleared', 'success');
    }).catch(error => showToast(error.message || 'Unable to save analysis', 'error'));
};

// ---- Generate with Gemini -----------------------------------------------------------------

window.openGeminiKeyPanel = function(mlsId, mode) {
    const p = findProperty(mlsId);
    if (!p) return;
    geminiPanel = mode === 'setup' ? 'setup' : 'unlock';
    refreshSection(p);
    const first = document.getElementById(geminiPanel === 'setup' ? 'gemini-key-input' : 'gemini-pin-input');
    if (first) first.focus();
};

window.closeGeminiKeyPanel = function(mlsId) {
    const p = findProperty(mlsId);
    geminiPanel = null;
    if (p) refreshSection(p);
};

window.submitGeminiKeyPanel = async function(mlsId) {
    const pin = (document.getElementById('gemini-pin-input') || {}).value || '';
    try {
        if (geminiPanel === 'setup') {
            const apiKey = ((document.getElementById('gemini-key-input') || {}).value || '').trim();
            const confirmPin = (document.getElementById('gemini-pin-confirm-input') || {}).value || '';
            if (!apiKey) throw new Error('Paste your Gemini API key.');
            if (pin.length < GEMINI_MIN_PIN_LENGTH) throw new Error(`Choose a PIN of at least ${GEMINI_MIN_PIN_LENGTH} characters.`);
            if (pin !== confirmPin) throw new Error('The two PINs do not match.');
            setGeminiModel((document.getElementById('gemini-model-input') || {}).value);
            await saveGeminiVault(pin, apiKey);
        } else {
            if (!pin) throw new Error('Enter your vault PIN.');
            await unlockGeminiVault(pin);
        }
    } catch (error) {
        showToast(error.message || 'Could not set up the Gemini key', 'error');
        return;
    }
    geminiPanel = null;
    window.generateAiAnalysis(mlsId, true);
};

window.generateAiAnalysis = async function(mlsId, skipConfirm = false) {
    const p = findProperty(mlsId);
    if (!p) return;
    if (generatingMlsId !== null) {
        showToast('Gemini is still writing another analysis. Try again when it finishes.', 'error');
        return;
    }

    const keyState = getGeminiKeyState();
    if (keyState !== 'ready') {
        window.openGeminiKeyPanel(mlsId, keyState === 'locked' ? 'unlock' : 'setup');
        return;
    }
    if (!skipConfirm && String(p.ai_analysis || '').trim() && !confirm('Replace the current analysis with a new one from Gemini?')) return;

    generatingMlsId = p.mls_id;
    geminiPanel = null;
    refreshSection(p);
    const startedAt = Date.now();
    try {
        const markdown = (await generatePropertyAnalysis(p)).trim();
        if (isAiAnalysisTooLong(markdown)) throw new Error('Gemini wrote more than can be saved (200 KB). Try again.');
        const data = await apiFetch(CONFIG.API_URL + '?action=update_user_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mls_id: p.mls_id, ai_analysis: markdown })
        });
        if (!data || data.success === false || data.error) throw new Error((data && data.error) || 'The analysis was written but could not be saved.');
        p.ai_analysis = markdown;
        syncCardAiBadge(p);
        showToast('AI analysis saved', 'success');
    } catch (error) {
        showToast(error.message || 'Gemini could not write the analysis', 'error');
        // The toast is gone in a few seconds; keep a copy in the event log, tagged with the listing.
        logClientEvent('error', 'AI analysis failed: ' + (error.message || 'Gemini could not write the analysis'), {
            seconds: Math.round((Date.now() - startedAt) / 1000),
            model: getGeminiModel(),
            http_status: error.status ?? null
        }, p.mls_id);
    } finally {
        generatingMlsId = null;
        refreshSection(p);
    }
};
