export function renderLedger(accum, burn, retirementAge, tbody, formatCurrency) {
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

  const fullLedger = [...accum.slice(0, -1), ...burn];

  fullLedger.forEach(row => {
    const tr = document.createElement('tr');
    if (row.age === retirementAge) tr.classList.add('retirement-row');

    const cells = [
      String(row.age),
      String(row.year),
      formatCurrency(row.pretax),
      formatCurrency(row.roth),
      formatCurrency(row.taxable),
      formatCurrency(row.total)
    ];

    cells.forEach((value, idx) => {
      const td = document.createElement('td');
      td.textContent = value;
      if (idx === 5) td.style.fontWeight = '600';
      tr.appendChild(td);
    });

    const withdrawalTd = document.createElement('td');
    if (row.withdrawal > 0) {
      withdrawalTd.textContent = formatCurrency(row.withdrawal);
      withdrawalTd.style.color = 'var(--color-warning)';
      withdrawalTd.style.fontWeight = '600';
    } else {
      withdrawalTd.textContent = '—';
    }
    tr.appendChild(withdrawalTd);

    tbody.appendChild(tr);
  });
}
