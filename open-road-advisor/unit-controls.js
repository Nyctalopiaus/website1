import { getCurrencySymbol } from './road-utils.js';

function updateFuelPriceLabel(unitToggle, currencyToggle, labelPrice) {
  const symbol = getCurrencySymbol(currencyToggle.value);
  if (unitToggle.value === 'metric') {
    labelPrice.textContent = `Fuel Price (${symbol}/L)`;
  } else {
    labelPrice.textContent = `Fuel Price (${symbol}/Gal)`;
  }
}

export function initUnitCurrencyControls({ unitToggle, currencyToggle, labels, inputs }) {
  let currentSystem = unitToggle.value || 'imperial';

  const { labelSpeed, labelCapacity, labelMpg, labelPrice, labelRest } = labels;
  const { inputSpeed, inputCapacity, inputMpg, inputPrice, inputRest } = inputs;

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

    updateFuelPriceLabel(unitToggle, currencyToggle, labelPrice);
  }

  function convertUnits(newSystem) {
    const curValSpeed = parseFloat(inputSpeed.value) || 0;
    const curValCapacity = parseFloat(inputCapacity.value) || 0;
    const curValMpg = parseFloat(inputMpg.value) || 0;
    const curValPrice = parseFloat(inputPrice.value) || 0;
    const curValRest = parseFloat(inputRest.value) || 0;

    if (newSystem === 'metric') {
      inputSpeed.min = '15'; inputSpeed.max = '200';
      inputSpeed.value = Math.round(curValSpeed * 1.60934);

      inputCapacity.min = '4'; inputCapacity.max = '400';
      inputCapacity.value = (curValCapacity * 3.78541).toFixed(1);

      inputMpg.min = '2'; inputMpg.max = '65';
      inputMpg.value = (curValMpg * 0.425144).toFixed(1);

      inputPrice.min = '0.15'; inputPrice.max = '5.50';
      inputPrice.value = (curValPrice / 3.78541).toFixed(2);

      inputRest.value = Math.round(curValRest * 1.60934);
    } else {
      inputSpeed.min = '10'; inputSpeed.max = '120';
      inputSpeed.value = Math.round(curValSpeed / 1.60934);

      inputCapacity.min = '1'; inputCapacity.max = '100';
      inputCapacity.value = (curValCapacity / 3.78541).toFixed(1);

      inputMpg.min = '5'; inputMpg.max = '150';
      inputMpg.value = (curValMpg / 0.425144).toFixed(1);

      inputPrice.min = '0.50'; inputPrice.max = '20.00';
      inputPrice.value = (curValPrice * 3.78541).toFixed(2);

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
    updateFuelPriceLabel(unitToggle, currencyToggle, labelPrice);
  });

  applySystemLabels(currentSystem);
}
