import { getCurrencySymbol } from './road-utils.js';

function updateHudFuelCostSymbol(currencyToggle, hudFuelCost) {
  if (!hudFuelCost) return;

  const symbol = getCurrencySymbol(currencyToggle.value);
  const current = (hudFuelCost.textContent || '').trim();

  if (!current) {
    hudFuelCost.textContent = symbol + '--';
    return;
  }

  // Replace leading currency marker while preserving numeric value or placeholder.
  hudFuelCost.textContent = current.replace(/^[\$€£]/, symbol);
}

export function initUnitCurrencyControls({ unitToggle, currencyToggle, labels, inputs, hudFuelCost }) {
  let currentSystem = unitToggle.value || 'imperial';

  const { labelSpeed, labelCapacity, labelMpg, labelRest } = labels;
  const { inputSpeed, inputCapacity, inputMpg, inputRest } = inputs;

  function applySystemLabels(newSystem) {
    if (newSystem === 'metric') {
      labelSpeed.textContent = 'Average Speed (km/h)';
      labelCapacity.textContent = 'Fuel Capacity (Liters)';
      labelMpg.textContent = 'Estimated km/L';
      labelRest.textContent = 'Rest Interval (km)';
    } else {
      labelSpeed.textContent = 'Average Speed (MPH)';
      labelCapacity.textContent = 'Fuel Capacity (Gallons)';
      labelMpg.textContent = 'Estimated MPG';
      labelRest.textContent = 'Rest Interval (Miles)';
    }

    // Fuel Grade is unit-agnostic (Regular/Premium/Diesel don't change with
    // imperial/metric), so there's no label to update here anymore — pricing
    // itself always comes back in USD $/gal from fuel-price-proxy.php and is
    // just displayed with whatever currency symbol is selected below, same
    // simplified (non-FX-converting) approach the rest of this app already uses.
    updateHudFuelCostSymbol(currencyToggle, hudFuelCost);
  }

  function convertUnits(newSystem) {
    const curValSpeed = parseFloat(inputSpeed.value) || 0;
    const curValCapacity = parseFloat(inputCapacity.value) || 0;
    const curValMpg = parseFloat(inputMpg.value) || 0;
    const curValRest = parseFloat(inputRest.value) || 0;

    if (newSystem === 'metric') {
      inputSpeed.min = '15'; inputSpeed.max = '200';
      inputSpeed.value = Math.round(curValSpeed * 1.60934);

      inputCapacity.min = '4'; inputCapacity.max = '400';
      inputCapacity.value = (curValCapacity * 3.78541).toFixed(1);

      inputMpg.min = '2'; inputMpg.max = '65';
      inputMpg.value = (curValMpg * 0.425144).toFixed(1);

      inputRest.value = Math.round(curValRest * 1.60934);
    } else {
      inputSpeed.min = '10'; inputSpeed.max = '120';
      inputSpeed.value = Math.round(curValSpeed / 1.60934);

      inputCapacity.min = '1'; inputCapacity.max = '100';
      inputCapacity.value = (curValCapacity / 3.78541).toFixed(1);

      inputMpg.min = '5'; inputMpg.max = '150';
      inputMpg.value = (curValMpg / 0.425144).toFixed(1);

      inputRest.value = Math.round(curValRest / 1.60934);
    }
  }

  unitToggle.addEventListener('change', () => {
    const newSystem = unitToggle.value;
    if (newSystem === currentSystem) return;

    convertUnits(newSystem);
    applySystemLabels(newSystem);
    currentSystem = newSystem;
  });

  currencyToggle.addEventListener('change', () => {
    updateHudFuelCostSymbol(currencyToggle, hudFuelCost);
  });

  applySystemLabels(currentSystem);
}
