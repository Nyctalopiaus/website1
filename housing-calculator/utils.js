/**
 * Utility functions for the Housing Calculator
 * Includes helpers for formatting, validation, and common operations
 */

/**
 * Debounces a function so it only executes after N milliseconds of inactivity
 * @param {Function} fn - Function to debounce
 * @param {number} delayMs - Delay in milliseconds
 * @returns {Function} Debounced version of the function
 */
export function debounce(fn, delayMs) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delayMs);
  };
}

/**
 * Formats a number as USD currency
 * @param {number} value - The number to format
 * @returns {string} Formatted currency string (e.g., "$1,234.56")
 */
export function formatCurrency(value) {
  return '$' + value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Formats time saved as a human-readable string
 * @param {number} months - Number of months saved
 * @returns {string} Formatted time string (e.g., "2 years, 3 months")
 */
export function formatTimeSaved(months) {
  if (months <= 0) return '';
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  
  const parts = [];
  if (years > 0) {
    parts.push(`${years} year${years > 1 ? 's' : ''}`);
  }
  if (remainingMonths > 0) {
    parts.push(`${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`);
  }
  
  return parts.join(', ');
}

/**
 * Validates calculator inputs for reasonable values
 * @param {Object} inputs - Object containing all input values
 * @returns {Object} Validation result: { isValid: boolean, errors: string[] }
 */
export function validateInputs(inputs) {
  const errors = [];
  
  if (!inputs.homePrice || inputs.homePrice < 10000) {
    errors.push('Home price must be at least $10,000');
  }
  
  if (inputs.downPayment > inputs.homePrice) {
    errors.push('Down payment cannot exceed home price');
  }
  
  if (inputs.grossIncome <= 0) {
    errors.push('Gross income must be greater than zero');
  }
  
  if (inputs.interest30 < 0 || inputs.interest30 > 20) {
    errors.push('30-year interest rate must be between 0% and 20%');
  }
  
  if (inputs.interest15 < 0 || inputs.interest15 > 20) {
    errors.push('15-year interest rate must be between 0% and 20%');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Safely retrieves a DOM element by ID
 * @param {string} id - Element ID
 * @returns {HTMLElement|null} The element or null if not found
 */
export function getElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`Element with id "${id}" not found`);
  }
  return element;
}

/**
 * Safely sets text content of a DOM element
 * @param {string} id - Element ID
 * @param {string} text - Text content
 */
export function setElementText(id, text) {
  const element = getElement(id);
  if (element) {
    element.textContent = text;
  }
}

/**
 * Clamps a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Safely parses a float with a default fallback
 * @param {any} value - Value to parse
 * @param {number} defaultValue - Default if parsing fails
 * @returns {number} Parsed float or default
 */
export function parseFloatSafe(value, defaultValue = 0) {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Safely parses an integer with a default fallback
 * @param {any} value - Value to parse
 * @param {number} defaultValue - Default if parsing fails
 * @returns {number} Parsed integer or default
 */
export function parseIntSafe(value, defaultValue = 0) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Merges two objects, with the second object overriding the first
 * @param {Object} defaults - Default values
 * @param {Object} overrides - Values to override
 * @returns {Object} Merged object
 */
export function mergeDefaults(defaults, overrides) {
  return { ...defaults, ...overrides };
}

/**
 * Calculates what month a loan amortization reaches a specific balance
 * @param {number[]} balances - Array of balances by year
 * @param {number} targetBalance - Target balance to find
 * @returns {number|null} Fractional year when balance is reached, or null if never
 */
export function linearInterpolateYear(balances, targetBalance) {
  for (let i = 1; i < balances.length; i++) {
    if (balances[i - 1] > targetBalance && balances[i] <= targetBalance) {
      const span = balances[i - 1] - balances[i];
      const t = span > 0 ? (balances[i - 1] - targetBalance) / span : 0;
      return (i - 1) + t;
    }
  }
  return null;
}

/**
 * Checks if a value looks like a URL
 * @param {string} value - String to check
 * @returns {boolean} True if value looks like a URL
 */
export function looksLikeUrl(value) {
  return (
    value.includes('.') ||
    value.includes('/') ||
    value.includes('http://') ||
    value.includes('https://')
  );
}

/**
 * Safely encodes a URL parameter
 * @param {string} url - URL to encode
 * @returns {string} URL-encoded parameter
 */
export function encodeUrlParam(url) {
  return encodeURIComponent(url.trim());
}
