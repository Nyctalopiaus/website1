// Trap Spotter distractors drill console

import { distractors, currentTrapIndex, setCurrentTrapIndex, filteredTraps, setFilteredTraps } from './state.js';

const trapCardEl = document.getElementById('trap-card');
const trapDomainTag = document.getElementById('trap-domain-tag');
const trapStatementEl = document.getElementById('trap-statement');
const trapWhyFailsEl = document.getElementById('trap-why-fails');
const trapCorrectPrincipleEl = document.getElementById('trap-correct-principle');
const trapCounterEl = document.getElementById('trap-counter');
const trapDomainSelect = document.getElementById('trap-domain-select');
const btnPrevTrap = document.getElementById('btn-prev-trap');
const btnNextTrap = document.getElementById('btn-next-trap');

export function filterTraps({ trapAiExplainHandle } = {}) {
  const domainVal = trapDomainSelect ? trapDomainSelect.value : 'all';
  if (domainVal === 'all') {
    setFilteredTraps(distractors);
  } else {
    const dNum = parseInt(domainVal);
    setFilteredTraps(distractors.filter(d => d.domain === dNum));
  }
  setCurrentTrapIndex(0);
  renderTrapCard({ trapAiExplainHandle });
}

export function renderTrapCard({ trapAiExplainHandle } = {}) {
  if (!trapCardEl) return;
  trapCardEl.classList.remove('flipped');
  trapCardEl.querySelectorAll('.card-face').forEach(face => {
    face.scrollTop = 0;
  });
  trapCardEl.scrollTop = 0;
  trapAiExplainHandle?.reset();
  trapAiExplainHandle?.showCachedIfAny();

  if (filteredTraps.length === 0) {
    if (trapDomainTag) trapDomainTag.textContent = 'NONE';
    if (trapStatementEl) trapStatementEl.textContent = 'No trap statements found for this domain.';
    if (trapWhyFailsEl) trapWhyFailsEl.textContent = '';
    if (trapCorrectPrincipleEl) trapCorrectPrincipleEl.textContent = '';
    if (trapCounterEl) trapCounterEl.textContent = '0 / 0';
    if (btnPrevTrap) btnPrevTrap.disabled = true;
    if (btnNextTrap) btnNextTrap.disabled = true;
    return;
  }

  const trap = filteredTraps[currentTrapIndex];
  if (trapDomainTag) trapDomainTag.textContent = `Domain ${trap.domain}${trap.knowledge_statement ? ' · ' + trap.knowledge_statement : ''}`;
  if (trapStatementEl) trapStatementEl.textContent = trap.trap_statement;
  if (trapWhyFailsEl) trapWhyFailsEl.textContent = trap.why_it_fails;
  if (trapCorrectPrincipleEl) trapCorrectPrincipleEl.textContent = trap.correct_principle;
  if (trapCounterEl) trapCounterEl.textContent = `${currentTrapIndex + 1} / ${filteredTraps.length}`;

  if (btnPrevTrap) btnPrevTrap.disabled = currentTrapIndex === 0;
  if (btnNextTrap) btnNextTrap.disabled = currentTrapIndex === filteredTraps.length - 1;
}

export function initTrapSpotter({ trapAiExplainHandle } = {}) {
  if (!trapCardEl) return;

  filterTraps({ trapAiExplainHandle });

  trapCardEl.addEventListener('click', () => {
    trapCardEl.classList.toggle('flipped');
  });

  if (trapDomainSelect) {
    trapDomainSelect.addEventListener('change', () => filterTraps({ trapAiExplainHandle }));
  }

  if (btnPrevTrap) {
    btnPrevTrap.addEventListener('click', () => {
      if (currentTrapIndex > 0) {
        setCurrentTrapIndex(currentTrapIndex - 1);
        renderTrapCard({ trapAiExplainHandle });
      }
    });
  }

  if (btnNextTrap) {
    btnNextTrap.addEventListener('click', () => {
      if (currentTrapIndex < filteredTraps.length - 1) {
        setCurrentTrapIndex(currentTrapIndex + 1);
        renderTrapCard({ trapAiExplainHandle });
      }
    });
  }
}
