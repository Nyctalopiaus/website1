// PBQ Lab (Performance-Based Questions) engine: Wizard, Table, and Drag-and-Drop Diagram layouts

import { STORAGE_KEYS, escapeHtml } from './config.js';
import { saveJson } from './storage.js';
import {
  pbqs,
  filteredPbqs,
  setFilteredPbqs,
  currentPbqIndex,
  setCurrentPbqIndex,
  currentPbqUserAnswers,
  setCurrentPbqUserAnswers,
  currentPbqTokenPlacement,
  setCurrentPbqTokenPlacement,
  pbqAttemptState,
  getDomainTitle
} from './state.js';

const pbqDomainSelect = document.getElementById('pbq-domain-select');
const pbqLayoutTagEl = document.getElementById('pbq-layout-tag');
const pbqEmptyStateEl = document.getElementById('pbq-empty-state');
const pbqContentEl = document.getElementById('pbq-content');
const pbqTitleEl = document.getElementById('pbq-title');
const pbqDomainTagEl = document.getElementById('pbq-domain-tag');
const pbqVerifyBadgeEl = document.getElementById('pbq-verify-badge');
const pbqScenarioContextEl = document.getElementById('pbq-scenario-context');
const pbqFieldsContainerEl = document.getElementById('pbq-fields-container');
const btnPbqCheck = document.getElementById('btn-pbq-check');
const btnPbqRetry = document.getElementById('btn-pbq-retry');
const pbqScoreBadgeEl = document.getElementById('pbq-score-badge');
const pbqRationaleBoxEl = document.getElementById('pbq-rationale-box');
const pbqRationaleStatusEl = document.getElementById('pbq-rationale-status');
const pbqRationaleTextEl = document.getElementById('pbq-rationale-text');
const pbqCounterEl = document.getElementById('pbq-counter');
const btnPrevPbq = document.getElementById('btn-prev-pbq');
const btnNextPbq = document.getElementById('btn-next-pbq');

export function getFilteredPbqs() {
  const domainFilter = pbqDomainSelect ? pbqDomainSelect.value : 'all';
  if (domainFilter === 'all') return pbqs;
  return pbqs.filter(p => String(p.domain) === String(domainFilter));
}

export function collectAllPbqFields(pbq) {
  const all = [];
  (pbq.fields || []).forEach(f => all.push(f));
  (pbq.groups || []).forEach(g => (g.fields || []).forEach(f => all.push(f)));
  (pbq.rows || []).forEach(r => (r.fields || []).forEach(f => all.push(f)));
  (pbq.zones || []).forEach(z => (z.fields || []).forEach(f => all.push(f)));
  return all;
}

export function getPbqSavedAttempt(pbq) {
  return pbqAttemptState[pbq.pbq_id] || null;
}

export function renderPbqFieldRow(field, disabled, savedAnswers, results) {
  const row = document.createElement('div');
  row.className = 'pbq-field-row';
  row.dataset.fieldId = field.field_id;

  const prompt = document.createElement('div');
  prompt.className = 'pbq-field-prompt';
  prompt.textContent = field.prompt;
  row.appendChild(prompt);

  const control = document.createElement('div');
  control.className = 'pbq-field-control';

  const savedValue = savedAnswers ? savedAnswers[field.field_id] : currentPbqUserAnswers[field.field_id];

  if (field.type === 'select') {
    const select = document.createElement('select');
    select.className = 'hud-select';
    select.disabled = !!disabled;
    const blankOpt = document.createElement('option');
    blankOpt.value = '';
    blankOpt.textContent = '-- choose --';
    select.appendChild(blankOpt);
    (field.options || []).forEach(opt => {
      const optEl = document.createElement('option');
      optEl.value = opt;
      optEl.textContent = opt;
      select.appendChild(optEl);
    });
    select.value = savedValue || '';
    select.addEventListener('change', () => {
      currentPbqUserAnswers[field.field_id] = select.value;
    });
    control.appendChild(select);
  } else if (field.type === 'multiselect') {
    const group = document.createElement('div');
    group.className = 'pbq-check-group';
    const savedArr = Array.isArray(savedValue) ? savedValue : [];
    (field.options || []).forEach(opt => {
      const pill = document.createElement('label');
      pill.className = `pbq-check-pill${disabled ? ' disabled' : ''}`;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = opt;
      cb.disabled = !!disabled;
      cb.checked = savedArr.includes(opt);
      cb.addEventListener('change', () => {
        const current = Array.isArray(currentPbqUserAnswers[field.field_id])
          ? currentPbqUserAnswers[field.field_id]
          : [];
        if (cb.checked) {
          currentPbqUserAnswers[field.field_id] = [...current, opt];
        } else {
          currentPbqUserAnswers[field.field_id] = current.filter(v => v !== opt);
        }
      });
      pill.appendChild(cb);
      pill.appendChild(document.createTextNode(opt));
      group.appendChild(pill);
    });
    control.appendChild(group);
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'pbq-text-input';
    input.disabled = !!disabled;
    input.value = savedValue || '';
    input.placeholder = 'Type your answer...';
    input.addEventListener('input', () => {
      currentPbqUserAnswers[field.field_id] = input.value;
    });
    control.appendChild(input);
  }

  row.appendChild(control);

  if (field.note) {
    const note = document.createElement('div');
    note.className = 'pbq-field-note';
    note.textContent = field.note;
    row.appendChild(note);
  }

  if (results && results[field.field_id]) {
    const r = results[field.field_id];
    row.classList.add(r.correct ? 'pbq-correct' : 'pbq-incorrect');
    const resultLine = document.createElement('div');
    resultLine.className = `pbq-field-result ${r.correct ? 'pbq-correct-text' : 'pbq-incorrect-text'}`;
    resultLine.textContent = r.correct
      ? '✓ Correct'
      : `✗ Correct answer: ${Array.isArray(field.correct) ? field.correct.join(', ') : field.correct}`;
    row.appendChild(resultLine);
  }

  return row;
}

export function renderPbqFieldList(fields, disabled, savedAnswers, results) {
  const list = document.createElement('div');
  list.className = 'pbq-field-list';
  fields.forEach(f => list.appendChild(renderPbqFieldRow(f, disabled, savedAnswers, results)));
  return list;
}

export function renderPbqWizard(pbq, disabled, savedAnswers, results, containerEl = pbqFieldsContainerEl) {
  containerEl.innerHTML = '';
  (pbq.groups || []).forEach(group => {
    const groupEl = document.createElement('div');
    groupEl.className = 'pbq-group';
    const label = document.createElement('div');
    label.className = 'pbq-group-label';
    label.textContent = group.group_label;
    groupEl.appendChild(label);
    groupEl.appendChild(renderPbqFieldList(group.fields || [], disabled, savedAnswers, results));
    containerEl.appendChild(groupEl);
  });
  if (pbq.fields && pbq.fields.length) {
    containerEl.appendChild(renderPbqFieldList(pbq.fields, disabled, savedAnswers, results));
  }
}

export function renderPbqTable(pbq, disabled, savedAnswers, results, containerEl = pbqFieldsContainerEl) {
  containerEl.innerHTML = '';
  const matrix = document.createElement('div');
  matrix.className = 'control-matrix';
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  (pbq.rows || []).forEach(row => {
    const tr = document.createElement('tr');
    const labelTd = document.createElement('td');
    labelTd.innerHTML = `<strong>${escapeHtml(row.label)}</strong><br><span style="color: var(--text-dark); font-size: 0.82rem;">${escapeHtml(row.detail || '')}</span>`;
    const fieldTd = document.createElement('td');
    const fieldsWrap = document.createElement('div');
    fieldsWrap.className = 'pbq-table-row-fields';
    (row.fields || []).forEach(f => fieldsWrap.appendChild(renderPbqFieldRow(f, disabled, savedAnswers, results)));
    fieldTd.appendChild(fieldsWrap);
    tr.appendChild(labelTd);
    tr.appendChild(fieldTd);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  matrix.appendChild(table);
  containerEl.appendChild(matrix);

  if (pbq.fields && pbq.fields.length) {
    containerEl.appendChild(renderPbqFieldList(pbq.fields, disabled, savedAnswers, results));
  }
}

export function renderPbqDiagram(pbq, disabled, savedAnswers, results, containerEl = pbqFieldsContainerEl) {
  containerEl.innerHTML = '';
  const savedPlacement = savedAnswers ? (savedAnswers.__tokenPlacement || {}) : currentPbqTokenPlacement;

  const palette = document.createElement('div');
  palette.className = 'pbq-token-palette';
  (pbq.drag_tokens || []).forEach(token => {
    const placedZone = savedPlacement[token.token_id];
    const chip = document.createElement('div');
    chip.className = `pbq-token${placedZone ? ' pbq-token-placed' : ''}`;
    chip.textContent = token.label;
    chip.draggable = !disabled;
    chip.dataset.tokenId = token.token_id;
    if (!disabled) {
      chip.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', token.token_id);
      });
    }
    palette.appendChild(chip);
  });
  containerEl.appendChild(palette);

  const grid = document.createElement('div');
  grid.className = 'pbq-zones-grid';
  (pbq.zones || []).forEach(zone => {
    const zoneEl = document.createElement('div');
    zoneEl.className = 'pbq-zone';
    zoneEl.dataset.zoneId = zone.zone_id;

    const label = document.createElement('div');
    label.className = 'pbq-zone-label';
    label.textContent = zone.label;
    zoneEl.appendChild(label);

    const tokensWrap = document.createElement('div');
    tokensWrap.className = 'pbq-zone-tokens';
    (pbq.drag_tokens || []).filter(t => savedPlacement[t.token_id] === zone.zone_id).forEach(t => {
      const chip = document.createElement('span');
      chip.className = 'pbq-zone-token-chip';
      if (results && results[`token:${t.token_id}`]) {
        chip.classList.add(results[`token:${t.token_id}`].correct ? 'pbq-correct' : 'pbq-incorrect');
      }
      chip.textContent = t.label;
      if (!disabled) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = '×';
        removeBtn.title = 'Remove from this zone';
        removeBtn.addEventListener('click', () => {
          delete currentPbqTokenPlacement[t.token_id];
          renderPbqDiagram(pbq, disabled, null, null, containerEl);
        });
        chip.appendChild(removeBtn);
      }
      tokensWrap.appendChild(chip);
    });
    zoneEl.appendChild(tokensWrap);

    if (!disabled) {
      zoneEl.addEventListener('dragover', e => {
        e.preventDefault();
        zoneEl.classList.add('pbq-zone-dragover');
      });
      zoneEl.addEventListener('dragleave', () => zoneEl.classList.remove('pbq-zone-dragover'));
      zoneEl.addEventListener('drop', e => {
        e.preventDefault();
        zoneEl.classList.remove('pbq-zone-dragover');
        const tokenId = e.dataTransfer.getData('text/plain');
        if (tokenId) {
          currentPbqTokenPlacement[tokenId] = zone.zone_id;
          renderPbqDiagram(pbq, disabled, null, null, containerEl);
        }
      });
    }

    zoneEl.appendChild(renderPbqFieldList(zone.fields || [], disabled, savedAnswers, results));
    grid.appendChild(zoneEl);
  });
  containerEl.appendChild(grid);
}

export function renderPbqLayout(pbq, disabled, savedAnswers, results, containerEl = pbqFieldsContainerEl) {
  if (pbq.layout === 'table') {
    renderPbqTable(pbq, disabled, savedAnswers, results, containerEl);
  } else if (pbq.layout === 'diagram') {
    renderPbqDiagram(pbq, disabled, savedAnswers, results, containerEl);
  } else {
    renderPbqWizard(pbq, disabled, savedAnswers, results, containerEl);
  }
}

export function isPbqFieldCorrect(field, userValue) {
  if (field.type === 'multiselect') {
    const correctSet = new Set((field.correct || []).map(v => v.toLowerCase()));
    const userSet = new Set((Array.isArray(userValue) ? userValue : []).map(v => v.toLowerCase()));
    if (correctSet.size !== userSet.size) return false;
    for (const v of correctSet) if (!userSet.has(v)) return false;
    return true;
  }
  const correctVal = Array.isArray(field.correct) ? field.correct[0] : field.correct;
  return String(userValue || '').trim().toLowerCase() === String(correctVal || '').trim().toLowerCase();
}

export function gradePbq(pbq, userAnswers, tokenPlacement) {
  const results = {};
  let correctCount = 0;
  let totalCount = 0;

  collectAllPbqFields(pbq).forEach(field => {
    const userValue = userAnswers[field.field_id];
    const correct = isPbqFieldCorrect(field, userValue);
    results[field.field_id] = { correct, userValue };
    totalCount++;
    if (correct) correctCount++;
  });

  (pbq.drag_tokens || []).forEach(token => {
    const placedZone = tokenPlacement ? tokenPlacement[token.token_id] : undefined;
    const correct = placedZone === token.correct_zone;
    results[`token:${token.token_id}`] = { correct, userValue: placedZone };
    totalCount++;
    if (correct) correctCount++;
  });

  const scorePct = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  return { results, correctCount, totalCount, scorePct };
}

export function applyPbqScoreBadge(el, scorePct) {
  if (!el) return;
  el.hidden = false;
  el.textContent = `${scorePct}%`;
  el.classList.remove('pbq-score-good', 'pbq-score-mid', 'pbq-score-low');
  el.classList.add(scorePct >= 80 ? 'pbq-score-good' : scorePct >= 50 ? 'pbq-score-mid' : 'pbq-score-low');
}

export function checkCurrentPbqAnswers() {
  const pbq = filteredPbqs[currentPbqIndex];
  if (!pbq) return;

  const graded = gradePbq(pbq, currentPbqUserAnswers, currentPbqTokenPlacement);
  pbqAttemptState[pbq.pbq_id] = {
    userAnswers: { ...currentPbqUserAnswers, __tokenPlacement: { ...currentPbqTokenPlacement } },
    results: graded.results,
    correctCount: graded.correctCount,
    totalCount: graded.totalCount,
    scorePct: graded.scorePct,
    checkedAt: new Date().toISOString()
  };
  saveJson(STORAGE_KEYS.pbqAttempts, pbqAttemptState);
  renderCurrentPbq();
}

export function retryCurrentPbq() {
  const pbq = filteredPbqs[currentPbqIndex];
  if (!pbq) return;
  delete pbqAttemptState[pbq.pbq_id];
  saveJson(STORAGE_KEYS.pbqAttempts, pbqAttemptState);
  setCurrentPbqUserAnswers({});
  setCurrentPbqTokenPlacement({});
  renderCurrentPbq();
}

export function renderCurrentPbq() {
  if (!pbqContentEl) return;

  if (filteredPbqs.length === 0) {
    pbqContentEl.hidden = true;
    if (pbqEmptyStateEl) {
      pbqEmptyStateEl.hidden = false;
      pbqEmptyStateEl.textContent = pbqs.length === 0
        ? 'No PBQ Lab scenarios for this exam yet -- check back as new content lands.'
        : 'No PBQ Lab scenarios in this domain. Try a different filter.';
    }
    if (pbqCounterEl) pbqCounterEl.textContent = '0 / 0';
    if (btnPrevPbq) btnPrevPbq.disabled = true;
    if (btnNextPbq) btnNextPbq.disabled = true;
    if (pbqLayoutTagEl) pbqLayoutTagEl.hidden = true;
    return;
  }

  pbqContentEl.hidden = false;
  if (pbqEmptyStateEl) pbqEmptyStateEl.hidden = true;

  const pbq = filteredPbqs[currentPbqIndex];
  const savedAttempt = getPbqSavedAttempt(pbq);
  const isChecked = !!savedAttempt;

  setCurrentPbqUserAnswers(isChecked ? { ...savedAttempt.userAnswers } : {});
  setCurrentPbqTokenPlacement(isChecked ? { ...(savedAttempt.userAnswers.__tokenPlacement || {}) } : {});

  if (pbqTitleEl) pbqTitleEl.textContent = pbq.title;
  if (pbqDomainTagEl) pbqDomainTagEl.textContent = `Domain ${pbq.domain}: ${getDomainTitle(pbq.domain)} — Section ${pbq.section_number}: ${pbq.section_title}`;
  if (pbqScenarioContextEl) pbqScenarioContextEl.textContent = pbq.scenario_context;
  if (pbqCounterEl) pbqCounterEl.textContent = `${currentPbqIndex + 1} / ${filteredPbqs.length}`;

  if (pbqLayoutTagEl) {
    pbqLayoutTagEl.hidden = false;
    pbqLayoutTagEl.textContent = (pbq.layout || 'wizard').toUpperCase();
  }

  const needsVerification = pbq.verification_status === 'needs_verification' ||
    collectAllPbqFields(pbq).some(f => f.needs_verification);
  if (pbqVerifyBadgeEl) pbqVerifyBadgeEl.hidden = !needsVerification;

  renderPbqLayout(pbq, isChecked, isChecked ? currentPbqUserAnswers : null, isChecked ? savedAttempt.results : null);

  if (btnPbqCheck) btnPbqCheck.hidden = isChecked;
  if (btnPbqRetry) btnPbqRetry.hidden = !isChecked;

  if (isChecked) {
    applyPbqScoreBadge(pbqScoreBadgeEl, savedAttempt.scorePct);
    if (pbqRationaleBoxEl) {
      pbqRationaleBoxEl.style.display = 'block';
      pbqRationaleBoxEl.className = `quiz-explanation-box ${savedAttempt.scorePct >= 80 ? 'correct' : 'incorrect'}`;
    }
    if (pbqRationaleStatusEl) pbqRationaleStatusEl.textContent = `SCORE: ${savedAttempt.correctCount} / ${savedAttempt.totalCount} FIELDS CORRECT`;
    if (pbqRationaleTextEl) pbqRationaleTextEl.textContent = pbq.rationale;
  } else {
    if (pbqScoreBadgeEl) pbqScoreBadgeEl.hidden = true;
    if (pbqRationaleBoxEl) pbqRationaleBoxEl.style.display = 'none';
  }

  if (btnPrevPbq) btnPrevPbq.disabled = currentPbqIndex === 0;
  if (btnNextPbq) btnNextPbq.disabled = currentPbqIndex === filteredPbqs.length - 1;
}

export function initPbqLab() {
  const pbqTabBtn = document.querySelector('.tab-btn[data-target="tab-pbqlab"]');
  if (!pbqs || pbqs.length === 0) {
    if (pbqTabBtn) pbqTabBtn.hidden = true;
    return;
  }
  if (pbqTabBtn) pbqTabBtn.hidden = false;

  setFilteredPbqs(getFilteredPbqs());
  setCurrentPbqIndex(0);

  if (pbqDomainSelect) {
    pbqDomainSelect.addEventListener('change', () => {
      setFilteredPbqs(getFilteredPbqs());
      setCurrentPbqIndex(0);
      renderCurrentPbq();
    });
  }
  if (btnPrevPbq) {
    btnPrevPbq.addEventListener('click', () => {
      if (currentPbqIndex > 0) {
        setCurrentPbqIndex(currentPbqIndex - 1);
        renderCurrentPbq();
      }
    });
  }
  if (btnNextPbq) {
    btnNextPbq.addEventListener('click', () => {
      if (currentPbqIndex < filteredPbqs.length - 1) {
        setCurrentPbqIndex(currentPbqIndex + 1);
        renderCurrentPbq();
      }
    });
  }
  if (btnPbqCheck) {
    btnPbqCheck.addEventListener('click', checkCurrentPbqAnswers);
  }
  if (btnPbqRetry) {
    btnPbqRetry.addEventListener('click', retryCurrentPbq);
  }

  renderCurrentPbq();
}
