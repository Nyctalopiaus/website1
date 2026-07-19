import { getScaledSocialSecurityBenefit } from './simulation.js';

function clearElement(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function drawGridLines(svg, padding, yMax, yScale, stepY, width, height) {
  for (let y = 0; y <= yMax; y += stepY) {
    const yCoord = yScale(y);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', padding.left);
    line.setAttribute('y1', yCoord);
    line.setAttribute('x2', width - padding.right);
    line.setAttribute('y2', yCoord);
    line.setAttribute('class', y === 0 ? 'grid-line-bold' : 'grid-line');
    svg.appendChild(line);

    const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    labelText.setAttribute('x', padding.left - 10);
    labelText.setAttribute('y', yCoord + 3);
    labelText.setAttribute('text-anchor', 'end');
    labelText.setAttribute('class', 'chart-axis-label');

    let displayValue = '';
    if (y >= 1000000) displayValue = '$' + (y / 1000000).toFixed(1) + 'M';
    else if (y >= 1000) displayValue = '$' + (y / 1000).toFixed(0) + 'K';
    else displayValue = '$' + y;

    labelText.textContent = displayValue;
    svg.appendChild(labelText);
  }
}

function drawStrokePath(svg, points, className) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M ' + points.join(' L '));
  path.setAttribute('class', className);
  svg.appendChild(path);
}

function setAccumTooltip(tooltip, item, formatCurrency) {
  clearElement(tooltip);

  const title = document.createElement('div');
  title.className = 'tooltip-title';
  title.textContent = `Age ${item.age} (${item.year})`;
  tooltip.appendChild(title);

  const rows = [
    { dot: 'traditional-bg', label: 'Traditional:', value: formatCurrency(item.pretax) },
    { dot: 'roth-bg', label: 'Roth:', value: formatCurrency(item.roth) },
    { dot: 'taxable-bg', label: 'Taxable:', value: formatCurrency(item.taxable) }
  ];

  rows.forEach(r => {
    const row = document.createElement('div');
    row.className = 'tooltip-row';

    const left = document.createElement('span');
    const dot = document.createElement('span');
    dot.className = 'tooltip-dot ' + r.dot;
    left.appendChild(dot);
    left.appendChild(document.createTextNode(r.label));

    const right = document.createElement('strong');
    right.textContent = r.value;

    row.appendChild(left);
    row.appendChild(right);
    tooltip.appendChild(row);
  });

  const totalRow = document.createElement('div');
  totalRow.className = 'tooltip-row';
  totalRow.style.borderTop = '1px dashed var(--border-color)';
  totalRow.style.marginTop = '0.25rem';
  totalRow.style.paddingTop = '0.25rem';

  const totalLabel = document.createElement('span');
  totalLabel.textContent = 'Total:';
  const totalVal = document.createElement('strong');
  totalVal.textContent = formatCurrency(item.total);
  totalRow.appendChild(totalLabel);
  totalRow.appendChild(totalVal);
  tooltip.appendChild(totalRow);
}

function setBurnTooltip(tooltip, item, formatCurrency) {
  clearElement(tooltip);

  const title = document.createElement('div');
  title.className = 'tooltip-title';
  title.textContent = `Age ${item.age} (${item.year})`;
  tooltip.appendChild(title);

  const row1 = document.createElement('div');
  row1.className = 'tooltip-row';
  const row1Label = document.createElement('span');
  row1Label.textContent = 'Portfolio Value:';
  const row1Val = document.createElement('strong');
  row1Val.textContent = formatCurrency(item.total);
  row1.appendChild(row1Label);
  row1.appendChild(row1Val);

  const row2 = document.createElement('div');
  row2.className = 'tooltip-row';
  const row2Label = document.createElement('span');
  row2Label.textContent = 'Annual Withdrawal:';
  const row2Val = document.createElement('strong');
  row2Val.style.color = 'var(--color-warning)';
  row2Val.textContent = formatCurrency(item.withdrawal);
  row2.appendChild(row2Label);
  row2.appendChild(row2Val);

  tooltip.appendChild(row1);
  tooltip.appendChild(row2);
}

export function renderAccumChart(data, dom, formatCurrency) {
  const { accumSvg, accumTooltip } = dom;
  clearElement(accumSvg);

  const padding = { top: 20, right: 30, bottom: 30, left: 60 };
  const width = accumSvg.parentElement.clientWidth || 600;
  const height = 240;
  accumSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const minAge = data[0].age;
  const maxAge = data[data.length - 1].age;

  let maxVal = 0;
  data.forEach(d => {
    if (d.total > maxVal) maxVal = d.total;
  });
  maxVal = maxVal * 1.15 || 100000;

  const xScale = age => padding.left + ((age - minAge) / (maxAge - minAge)) * (width - padding.left - padding.right);
  const yScale = val => height - padding.bottom - ((val / maxVal) * (height - padding.top - padding.bottom));

  const stepY = Math.ceil(maxVal / 4 / 25000) * 25000 || 25000;
  const roundedYMax = stepY * 4;

  drawGridLines(accumSvg, padding, roundedYMax, yScale, stepY, width, height);

  const stepAge = Math.ceil((maxAge - minAge) / 5);
  for (let age = minAge; age <= maxAge; age += stepAge) {
    const xCoord = xScale(age);
    const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    labelText.setAttribute('x', xCoord);
    labelText.setAttribute('y', height - 10);
    labelText.setAttribute('text-anchor', 'middle');
    labelText.setAttribute('class', 'chart-axis-label');
    labelText.textContent = `Age ${age}`;
    accumSvg.appendChild(labelText);
  }

  const taxablePoints = [];
  const rothPoints = [];
  const traditionalPoints = [];

  data.forEach(d => {
    const x = xScale(d.age);
    taxablePoints.push(`${x},${yScale(d.taxable)}`);
    rothPoints.push(`${x},${yScale(d.taxable + d.roth)}`);
    traditionalPoints.push(`${x},${yScale(d.total)}`);
  });

  const startX = xScale(minAge);
  const endX = xScale(maxAge);
  const zeroY = yScale(0);

  const pathTaxable = `M ${startX},${zeroY} L ${taxablePoints.join(' L ')} L ${endX},${zeroY} Z`;
  const pathRoth = `M ${startX},${zeroY} L ${rothPoints.join(' L ')} L ${endX},${zeroY} Z`;
  const pathTraditional = `M ${startX},${zeroY} L ${traditionalPoints.join(' L ')} L ${endX},${zeroY} Z`;

  const pTraditional = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pTraditional.setAttribute('d', pathTraditional);
  pTraditional.setAttribute('class', 'traditional-fill');
  pTraditional.setAttribute('opacity', '0.25');
  accumSvg.appendChild(pTraditional);

  const pRoth = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pRoth.setAttribute('d', pathRoth);
  pRoth.setAttribute('class', 'roth-fill');
  pRoth.setAttribute('opacity', '0.45');
  accumSvg.appendChild(pRoth);

  const pTaxable = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pTaxable.setAttribute('d', pathTaxable);
  pTaxable.setAttribute('class', 'taxable-fill');
  pTaxable.setAttribute('opacity', '0.65');
  accumSvg.appendChild(pTaxable);

  drawStrokePath(accumSvg, traditionalPoints, 'chart-line-traditional');
  drawStrokePath(accumSvg, rothPoints, 'chart-line-roth');
  drawStrokePath(accumSvg, taxablePoints, 'chart-line-taxable');

  const hoverBar = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  hoverBar.setAttribute('y1', padding.top);
  hoverBar.setAttribute('y2', height - padding.bottom);
  hoverBar.setAttribute('class', 'hover-bar');
  hoverBar.style.display = 'none';
  accumSvg.appendChild(hoverBar);

  const hoverCircles = [];
  for (let i = 0; i < 3; i++) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '5');
    circle.setAttribute('class', 'hover-circle');
    circle.style.display = 'none';
    accumSvg.appendChild(circle);
    hoverCircles.push(circle);
  }

  accumSvg.onmousemove = e => {
    const rect = accumSvg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const ageFrac = minAge + ((mouseX - padding.left) / (width - padding.left - padding.right)) * (maxAge - minAge);
    const targetAge = Math.round(Math.max(minAge, Math.min(maxAge, ageFrac)));

    const targetDataIndex = data.findIndex(d => d.age === targetAge);
    if (targetDataIndex === -1) return;

    const item = data[targetDataIndex];
    const xPos = xScale(item.age);

    hoverBar.setAttribute('x1', xPos);
    hoverBar.setAttribute('x2', xPos);
    hoverBar.style.display = 'block';

    const yTax = yScale(item.taxable);
    const yRothVal = yScale(item.taxable + item.roth);
    const yTotal = yScale(item.total);

    hoverCircles[0].setAttribute('cx', xPos);
    hoverCircles[0].setAttribute('cy', yTax);
    hoverCircles[0].style.display = 'block';
    hoverCircles[0].style.fill = 'var(--color-taxable)';

    hoverCircles[1].setAttribute('cx', xPos);
    hoverCircles[1].setAttribute('cy', yRothVal);
    hoverCircles[1].style.display = 'block';
    hoverCircles[1].style.fill = 'var(--color-roth)';

    hoverCircles[2].setAttribute('cx', xPos);
    hoverCircles[2].setAttribute('cy', yTotal);
    hoverCircles[2].style.display = 'block';
    hoverCircles[2].style.fill = 'var(--color-traditional)';

    accumTooltip.style.display = 'flex';
    const tooltipWidth = 160;
    accumTooltip.style.left = (xPos + tooltipWidth > width) ? `${xPos - tooltipWidth - 20}px` : `${xPos + 15}px`;
    accumTooltip.style.top = `${yTotal - 110}px`;
    setAccumTooltip(accumTooltip, item, formatCurrency);
  };

  accumSvg.onmouseleave = () => {
    hoverBar.style.display = 'none';
    hoverCircles.forEach(c => {
      c.style.display = 'none';
    });
    accumTooltip.style.display = 'none';
  };
}

export function renderBurnChart(data, dom, formatCurrency, context) {
  const { burnSvg, burnTooltip } = dom;
  clearElement(burnSvg);

  const padding = { top: 20, right: 30, bottom: 30, left: 60 };
  const width = burnSvg.parentElement.clientWidth || 600;
  const height = 240;
  burnSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const minAge = data[0].age;
  const maxAge = data[data.length - 1].age;

  let maxVal = 0;
  data.forEach(d => {
    if (d.total > maxVal) maxVal = d.total;
  });
  maxVal = maxVal * 1.15 || 100000;

  const xScale = age => padding.left + ((age - minAge) / (maxAge - minAge)) * (width - padding.left - padding.right);
  const yScale = val => height - padding.bottom - ((val / maxVal) * (height - padding.top - padding.bottom));

  const stepY = Math.ceil(maxVal / 4 / 25000) * 25000 || 25000;
  const roundedYMax = stepY * 4;

  drawGridLines(burnSvg, padding, roundedYMax, yScale, stepY, width, height);

  const stepAge = Math.ceil((maxAge - minAge) / 5);
  for (let age = minAge; age <= maxAge; age += stepAge) {
    const xCoord = xScale(age);
    const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    labelText.setAttribute('x', xCoord);
    labelText.setAttribute('y', height - 10);
    labelText.setAttribute('text-anchor', 'middle');
    labelText.setAttribute('class', 'chart-axis-label');
    labelText.textContent = `Age ${age}`;
    burnSvg.appendChild(labelText);
  }

  const points = data.map(d => `${xScale(d.age)},${yScale(d.total)}`);
  const startX = xScale(minAge);
  const endX = xScale(maxAge);
  const zeroY = yScale(0);

  const pathArea = `M ${startX},${zeroY} L ${points.join(' L ')} L ${endX},${zeroY} Z`;
  const pArea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pArea.setAttribute('d', pathArea);
  pArea.setAttribute('fill', 'var(--color-primary-dim)');
  pArea.setAttribute('opacity', '0.6');
  burnSvg.appendChild(pArea);

  drawStrokePath(burnSvg, points, 'chart-line-traditional');

  const hoverBar = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  hoverBar.setAttribute('y1', padding.top);
  hoverBar.setAttribute('y2', height - padding.bottom);
  hoverBar.setAttribute('class', 'hover-bar');
  hoverBar.style.display = 'none';
  burnSvg.appendChild(hoverBar);

  const hoverCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  hoverCircle.setAttribute('r', '5');
  hoverCircle.setAttribute('class', 'hover-circle');
  hoverCircle.style.display = 'none';
  hoverCircle.style.fill = 'var(--color-primary)';
  burnSvg.appendChild(hoverCircle);

  burnSvg.onmousemove = e => {
    const rect = burnSvg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    const ageFrac = minAge + ((mouseX - padding.left) / (width - padding.left - padding.right)) * (maxAge - minAge);
    const targetAge = Math.round(Math.max(minAge, Math.min(maxAge, ageFrac)));
    const targetDataIndex = data.findIndex(d => d.age === targetAge);
    if (targetDataIndex === -1) return;

    const item = data[targetDataIndex];
    const xPos = xScale(item.age);
    const yPos = yScale(item.total);

    hoverBar.setAttribute('x1', xPos);
    hoverBar.setAttribute('x2', xPos);
    hoverBar.style.display = 'block';

    hoverCircle.setAttribute('cx', xPos);
    hoverCircle.setAttribute('cy', yPos);
    hoverCircle.style.display = 'block';

    const socialSecurityAnnual = getScaledSocialSecurityBenefit(context.socialSecurityMonthly, item.age) * 12;
    const netToday = Math.max(0, context.desiredIncome - socialSecurityAnnual);
    const discountFactor = Math.pow(1 + context.inflation / 100, item.age - context.currentAge);
    const netFuture = netToday * discountFactor;
    void netFuture;

    burnTooltip.style.display = 'flex';
    const tooltipWidth = 160;
    burnTooltip.style.left = (xPos + tooltipWidth > width) ? `${xPos - tooltipWidth - 20}px` : `${xPos + 15}px`;
    burnTooltip.style.top = `${yPos - 90}px`;
    setBurnTooltip(burnTooltip, item, formatCurrency);
  };

  burnSvg.onmouseleave = () => {
    hoverBar.style.display = 'none';
    hoverCircle.style.display = 'none';
    burnTooltip.style.display = 'none';
  };
}
