/**
 * Haven — Modular Architecture Notice
 * 
 * The application logic has been decomposed into modular, single-responsibility files inside the /js/ directory:
 * - js/constants.js     : Master category taxonomy, icons whitelist & formatters
 * - js/storage.js       : Client-side localStorage persistence & validated backup import/export
 * - js/calculations.js  : Gross/Net math, tipped income calculations & 50/30/20 framework logic
 * - js/categories.js    : Custom categories modal, icon picker & safe cascading deletion
 * - js/tour.js          : 2-minute starter walkthrough modal stepper & live sync
 * - js/charts.js        : Chart.js Donut & Bar charts, legend handling & personalized insights
 * - js/app.js           : Spending table renderer, filter tabs, theme toggle & startup controller
 * 
 * All scripts are loaded via index.html under the window.Haven namespace.
 */
