/**
 * Haven — Mindful Monthly Budgeting for Beginners
 * Module: Constants, Categories Taxonomy & Sanitization Helpers
 */

(function () {
  'use strict';

  window.Haven = window.Haven || {};

  // Master Category Taxonomy
  const CATEGORIES = [
    // Housing
    { id: 'housing_rent', name: 'Rent / Mortgage', group: 'Housing', tier: 'needs', icon: 'home' },
    { id: 'housing_insurance', name: "Home / Renter's Insurance", group: 'Housing', tier: 'needs', icon: 'shield' },
    { id: 'housing_hoa', name: 'Property Tax / HOA Fees', group: 'Housing', tier: 'needs', icon: 'building' },
    { id: 'housing_maint', name: 'Home Repairs & Upkeep', group: 'Housing', tier: 'needs', icon: 'wrench' },

    // Utilities
    { id: 'util_power', name: 'Electricity & Gas Heating', group: 'Utilities', tier: 'needs', icon: 'zap' },
    { id: 'util_water', name: 'Water, Sewer & Trash', group: 'Utilities', tier: 'needs', icon: 'droplet' },
    { id: 'util_internet', name: 'High-Speed Internet / Wifi', group: 'Utilities', tier: 'needs', icon: 'wifi' },
    { id: 'util_phone', name: 'Mobile Phone Plan', group: 'Utilities', tier: 'needs', icon: 'smartphone' },

    // Food & Groceries
    { id: 'food_groceries', name: 'Supermarket Groceries & Food', group: 'Food & Groceries', tier: 'needs', icon: 'shopping-cart' },
    { id: 'food_supplies', name: 'Household Essentials & Paper Goods', group: 'Food & Groceries', tier: 'needs', icon: 'box' },
    { id: 'food_dining', name: 'Restaurants & Takeout', group: 'Food & Groceries', tier: 'wants', icon: 'utensils' },
    { id: 'food_coffee', name: 'Coffee Shops, Drinks & Snacks', group: 'Food & Groceries', tier: 'wants', icon: 'coffee' },

    // Transportation
    { id: 'trans_payment', name: 'Car Payment / Auto Lease', group: 'Transportation', tier: 'needs', icon: 'car' },
    { id: 'trans_insurance', name: 'Auto Insurance', group: 'Transportation', tier: 'needs', icon: 'shield' },
    { id: 'trans_gas', name: 'Gasoline & EV Charging', group: 'Transportation', tier: 'needs', icon: 'fuel' },
    { id: 'trans_transit', name: 'Public Transit / Bus / Metro Pass', group: 'Transportation', tier: 'needs', icon: 'train' },
    { id: 'trans_maint', name: 'Car Maintenance, Oil & Tires', group: 'Transportation', tier: 'needs', icon: 'tool' },
    { id: 'trans_rideshare', name: 'Uber / Lyft / Taxis', group: 'Transportation', tier: 'wants', icon: 'navigation' },

    // Health & Wellness
    { id: 'health_insurance', name: 'Health & Dental Insurance Premiums', group: 'Health & Wellness', tier: 'needs', icon: 'heart' },
    { id: 'health_rx', name: 'Prescriptions & Medical Co-pays', group: 'Health & Wellness', tier: 'needs', icon: 'activity' },
    { id: 'health_fitness', name: 'Gym Membership & Fitness', group: 'Health & Wellness', tier: 'wants', icon: 'smile' },
    { id: 'health_care', name: 'Personal Care, Haircuts & Toiletries', group: 'Health & Wellness', tier: 'wants', icon: 'sparkles' },

    // Debt & Loan Repayment
    { id: 'debt_student', name: 'Student Loan Minimum', group: 'Debt & Loans', tier: 'needs', icon: 'book-open' },
    { id: 'debt_cc', name: 'Credit Card Minimum Payment', group: 'Debt & Loans', tier: 'needs', icon: 'credit-card' },
    { id: 'debt_personal', name: 'Personal Loan / Medical Debt', group: 'Debt & Loans', tier: 'needs', icon: 'file-text' },
    { id: 'debt_accelerated', name: 'Accelerated Debt Payoff (Extra)', group: 'Debt & Loans', tier: 'savings', icon: 'trending-up' },

    // Lifestyle & Entertainment
    { id: 'life_streaming', name: 'Streaming Services (Netflix, Spotify)', group: 'Lifestyle & Fun', tier: 'wants', icon: 'tv' },
    { id: 'life_events', name: 'Concerts, Movies & Outings', group: 'Lifestyle & Fun', tier: 'wants', icon: 'film' },
    { id: 'life_hobbies', name: 'Hobbies, Crafts & Video Games', group: 'Lifestyle & Fun', tier: 'wants', icon: 'gamepad' },
    { id: 'life_shopping', name: 'Clothing, Shoes & Retail Shopping', group: 'Lifestyle & Fun', tier: 'wants', icon: 'tag' },
    { id: 'life_travel', name: 'Vacation & Travel Savings', group: 'Lifestyle & Fun', tier: 'wants', icon: 'compass' },

    // Savings & Future
    { id: 'save_emergency', name: 'Emergency Rainy-Day Fund', group: 'Savings & Future', tier: 'savings', icon: 'umbrella' },
    { id: 'save_retirement', name: 'Retirement (Roth IRA / 401k)', group: 'Savings & Future', tier: 'savings', icon: 'award' },
    { id: 'save_invest', name: 'High-Yield Savings / Investments', group: 'Savings & Future', tier: 'savings', icon: 'pie-chart' },
    { id: 'save_goal', name: 'Future Big Purchase / Down Payment', group: 'Savings & Future', tier: 'savings', icon: 'target' },

    // Misc
    { id: 'misc_buffer', name: 'Monthly Miscellaneous Buffer', group: 'Miscellaneous', tier: 'needs', icon: 'help-circle' },
    { id: 'misc_gifts', name: 'Gifts & Charitable Donations', group: 'Miscellaneous', tier: 'wants', icon: 'gift' }
  ];

  // Curated Custom Category Icons
  const CUSTOM_ICONS = [
    'paw-print', 'baby', 'heart', 'book-open', 'briefcase',
    'sparkles', 'gamepad-2', 'palette', 'music', 'camera',
    'plane', 'gift', 'shopping-bag', 'wrench', 'coffee',
    'target', 'shield', 'home', 'car', 'tag'
  ];

  // Supported World Currencies
  const CURRENCIES = {
    USD: { code: 'USD', symbol: '$', name: 'USD ($)' },
    EUR: { code: 'EUR', symbol: '€', name: 'EUR (€)' },
    GBP: { code: 'GBP', symbol: '£', name: 'GBP (£)' },
    CAD: { code: 'CAD', symbol: 'C$', name: 'CAD (C$)' },
    AUD: { code: 'AUD', symbol: 'A$', name: 'AUD (A$)' },
    JPY: { code: 'JPY', symbol: '¥', name: 'JPY (¥)' },
    INR: { code: 'INR', symbol: '₹', name: 'INR (₹)' }
  };

  let activeCurrencyCode = localStorage.getItem('haven_currency') || 'USD';

  function getActiveCurrency() {
    return CURRENCIES[activeCurrencyCode] || CURRENCIES.USD;
  }

  function setActiveCurrency(code) {
    if (CURRENCIES[code]) {
      activeCurrencyCode = code;
      localStorage.setItem('haven_currency', code);
    }
  }

  // Quick-Add Common Essentials Palette
  const COMMON_PRESETS = [
    { name: 'Supermarket Groceries', categoryId: 'food_groceries', tier: 'needs', amount: 350, icon: 'shopping-cart' },
    { name: 'High-Speed Wifi', categoryId: 'util_internet', tier: 'needs', amount: 65, icon: 'wifi' },
    { name: 'Electric & Gas Heating', categoryId: 'util_power', tier: 'needs', amount: 95, icon: 'zap' },
    { name: 'Mobile Phone Plan', categoryId: 'util_phone', tier: 'needs', amount: 75, icon: 'smartphone' },
    { name: 'Auto Insurance', categoryId: 'trans_insurance', tier: 'needs', amount: 130, icon: 'shield' },
    { name: 'Gasoline / Fuel', categoryId: 'trans_gas', tier: 'needs', amount: 150, icon: 'fuel' },
    { name: 'Streaming Services', categoryId: 'life_streaming', tier: 'wants', amount: 25, icon: 'tv' },
    { name: 'Dining Out & Treats', categoryId: 'food_dining', tier: 'wants', amount: 120, icon: 'utensils' },
    { name: 'Emergency Rainy Buffer', categoryId: 'save_emergency', tier: 'savings', amount: 100, icon: 'umbrella' }
  ];

  // Whitelist of all allowed icons to prevent arbitrary attribute or script injection
  const ALLOWED_ICONS = new Set([
    ...CUSTOM_ICONS,
    'check-circle', 'check-circle-2', 'check', 'alert-circle', 'alert-triangle',
    'info', 'trash', 'trash-2', 'sparkles', 'eye', 'moon', 'palette',
    'download', 'refresh-cw', 'lock', 'shield-check', 'wallet', 'list',
    'pie-chart', 'bar-chart-2', 'arrow-left', 'arrow-right', 'printer', 'copy',
    'file-text', 'plus', 'plus-circle', 'x', 'folder-plus', 'activity',
    'droplet', 'zap', 'wifi', 'smartphone', 'shopping-cart', 'box', 'utensils',
    'car', 'train', 'fuel', 'tool', 'navigation', 'tv', 'film', 'compass',
    'umbrella', 'award', 'help-circle', 'sliders', 'calendar', 'clock', 'coins'
  ]);

  // Sanitize Icon Name against strict whitelist
  function sanitizeIcon(iconName) {
    const clean = String(iconName || '').trim().toLowerCase();
    return ALLOWED_ICONS.has(clean) ? clean : 'tag';
  }

  // Helper Escape HTML with comprehensive quote, tick, and forward-slash escaping
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"'`\/]/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;', '/': '&#47;'
    }[c]));
  }

  // Format Currency with dynamic active currency symbol
  function formatMoney(amount, currencyCode = null) {
    const num = Number(amount) || 0;
    const curr = currencyCode ? (CURRENCIES[currencyCode] || getActiveCurrency()) : getActiveCurrency();
    const isNegative = num < 0;
    const absVal = Math.abs(Math.round(num));
    return (isNegative ? '-' : '') + curr.symbol + absVal.toLocaleString('en-US');
  }

  // Beginner Sample Budget Preset
  const SAMPLE_BUDGET = {
    grossMonthly: 4600,
    withholdingPct: 22,
    netMonthly: 3588,
    payFrequency: 'bi-weekly',
    items: [
      { id: 'item_1', name: 'Apartment Rent', categoryId: 'housing_rent', tier: 'needs', amount: 1250 },
      { id: 'item_2', name: 'Electric & Heating', categoryId: 'util_power', tier: 'needs', amount: 95 },
      { id: 'item_3', name: 'Internet / Wifi', categoryId: 'util_internet', tier: 'needs', amount: 65 },
      { id: 'item_4', name: 'Cell Phone Plan', categoryId: 'util_phone', tier: 'needs', amount: 75 },
      { id: 'item_5', name: 'Supermarket Groceries', categoryId: 'food_groceries', tier: 'needs', amount: 380 },
      { id: 'item_6', name: 'Car Payment', categoryId: 'trans_payment', tier: 'needs', amount: 280 },
      { id: 'item_7', name: 'Car Insurance & Fuel', categoryId: 'trans_gas', tier: 'needs', amount: 180 },
      { id: 'item_8', name: 'Prescriptions & Co-pays', categoryId: 'health_rx', tier: 'needs', amount: 40 },
      { id: 'item_9', name: 'Student Loan Minimum', categoryId: 'debt_student', tier: 'needs', amount: 150 },
      { id: 'item_10', name: 'Weekend Dining Out', categoryId: 'food_dining', tier: 'wants', amount: 190 },
      { id: 'item_11', name: 'Streaming (Netflix & Spotify)', categoryId: 'life_streaming', tier: 'wants', amount: 38 },
      { id: 'item_12', name: 'Social Outings & Events', categoryId: 'life_events', tier: 'wants', amount: 120 },
      { id: 'item_13', name: 'Clothing & Grooming', categoryId: 'life_shopping', tier: 'wants', amount: 75 },
      { id: 'item_14', name: 'Emergency Rainy-Day Fund', categoryId: 'save_emergency', tier: 'savings', amount: 350 },
      { id: 'item_15', name: 'Roth IRA Retirement', categoryId: 'save_retirement', tier: 'savings', amount: 200 },
      { id: 'item_16', name: 'Unexpected Buffer', categoryId: 'misc_buffer', tier: 'needs', amount: 100 }
    ]
  };

  // Expose Constants
  Haven.CATEGORIES = CATEGORIES;
  Haven.CUSTOM_ICONS = CUSTOM_ICONS;
  Haven.ALLOWED_ICONS = ALLOWED_ICONS;
  Haven.SAMPLE_BUDGET = SAMPLE_BUDGET;
  Haven.CURRENCIES = CURRENCIES;
  Haven.COMMON_PRESETS = COMMON_PRESETS;
  Haven.getActiveCurrency = getActiveCurrency;
  Haven.setActiveCurrency = setActiveCurrency;
  Haven.sanitizeIcon = sanitizeIcon;
  Haven.escapeHtml = escapeHtml;
  Haven.formatMoney = formatMoney;
})();
