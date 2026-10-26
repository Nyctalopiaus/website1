/**
 * Haven — Mindful Monthly Budgeting for Beginners
 * Module: Charts & Visual Insights
 */

(function () {
  'use strict';

  window.Haven = window.Haven || {};

  let donutChart = null;
  let frameworkChart = null;

  const donutEmptyOverlay = document.getElementById('donut-empty-overlay');
  const frameworkEmptyOverlay = document.getElementById('framework-empty-overlay');
  const insightsListEl = document.getElementById('insights-list');

  // Update Visual Charts via Chart.js
  function updateCharts(summary) {
    if (!summary) return;

    // Toggle empty overlays
    if (donutEmptyOverlay) {
      donutEmptyOverlay.style.display = (summary.totalExpenses === 0) ? 'flex' : 'none';
    }
    if (frameworkEmptyOverlay) {
      frameworkEmptyOverlay.style.display = (summary.net === 0 && summary.totalExpenses === 0) ? 'flex' : 'none';
    }

    if (!window.Chart) return;

    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'cozy-dark';
    const textColor = isDarkMode ? '#a3b0c0' : '#4b5563';

    // 1. Donut Chart: Spending by Category Group
    const donutCtx = document.getElementById('chart-donut-categories');
    if (donutCtx) {
      const labels = Object.keys(summary.groupTotals);
      const data = Object.values(summary.groupTotals);

      const colorPalette = [
        '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
        '#ec4899', '#06b6d4', '#84cc16', '#64748b', '#e11d48'
      ];

      if (donutChart) {
        donutChart.options.plugins.legend.position = window.innerWidth < 680 ? 'bottom' : 'right';
        donutChart.data.labels = labels.length ? labels : ['No Spending Yet'];
        donutChart.data.datasets[0].data = data.length ? data : [1];
        donutChart.data.datasets[0].backgroundColor = data.length ? colorPalette.slice(0, labels.length) : ['#e2e8f0'];
        donutChart.update();
      } else {
        donutChart = new Chart(donutCtx, {
          type: 'doughnut',
          data: {
            labels: labels.length ? labels : ['No Spending Yet'],
            datasets: [{
              data: data.length ? data : [1],
              backgroundColor: data.length ? colorPalette.slice(0, labels.length) : ['#e2e8f0'],
              borderWidth: 2,
              borderColor: isDarkMode ? '#202731' : '#ffffff'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: window.innerWidth < 680 ? 'bottom' : 'right',
                labels: {
                  boxWidth: 12,
                  font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 },
                  color: textColor
                }
              },
              tooltip: {
                callbacks: {
                  label: function (ctx) {
                    const val = ctx.raw || 0;
                    return ` ${ctx.label}: ${Haven.formatMoney(val)}`;
                  }
                }
              }
            },
            cutout: '68%'
          }
        });
      }
    }

    // 2. Bar Chart: 50/30/20 Comparison (Actual vs Target)
    const frameworkCtx = document.getElementById('chart-bar-framework');
    if (frameworkCtx) {
      const net = summary.net || 1;
      const actualPercentages = [
        Math.round((summary.needsTotal / net) * 100),
        Math.round((summary.wantsTotal / net) * 100),
        Math.round((summary.savingsTotal / net) * 100)
      ];

      if (frameworkChart) {
        frameworkChart.data.datasets[0].data = actualPercentages;
        frameworkChart.update();
      } else {
        frameworkChart = new Chart(frameworkCtx, {
          type: 'bar',
          data: {
            labels: ['Needs (Essentials)', 'Wants (Lifestyle)', 'Savings & Future'],
            datasets: [
              {
                label: 'Your Current Budget (%)',
                data: actualPercentages,
                backgroundColor: ['#3b82f6', '#f59e0b', '#10b981'],
                borderRadius: 6
              },
              {
                label: '50/30/20 Guideline Target (%)',
                data: [50, 30, 20],
                backgroundColor: 'rgba(156, 163, 175, 0.35)',
                borderRadius: 6
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                max: Math.max(70, ...actualPercentages) + 10,
                ticks: {
                  callback: v => v + '%',
                  color: textColor,
                  font: { family: "'Plus Jakarta Sans', sans-serif", size: 10 }
                },
                grid: { color: 'rgba(156, 163, 175, 0.15)' }
              },
              x: {
                ticks: {
                  color: textColor,
                  font: { family: "'Plus Jakarta Sans', sans-serif", size: 11, weight: '600' }
                },
                grid: { display: false }
              }
            },
            plugins: {
              legend: {
                position: 'top',
                labels: {
                  boxWidth: 12,
                  color: textColor,
                  font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 }
                }
              }
            }
          }
        });
      }
    }
  }

  // Render Beginner Friendly Insights
  function renderInsights(summary) {
    if (!insightsListEl || !summary) return;
    insightsListEl.innerHTML = '';
    const insights = [];

    // Empty state welcoming insights
    if (summary.net === 0 && summary.totalExpenses === 0) {
      insights.push({
        type: 'tip',
        icon: '🌱',
        title: 'Ready for your monthly numbers',
        text: 'Begin by typing your estimated gross monthly income in step 1 above, then add your regular expenses to generate your personal financial roadmap.'
      });
      insights.push({
        type: 'positive',
        icon: '💡',
        title: 'Need inspiration on how it works?',
        text: 'Click the "View Sample" button at the top to inspect a completed, realistic beginner budget with 50/30/20 breakdowns.'
      });
    }

    // Housing Ratio Check
    const housingTotal = summary.groupTotals['Housing'] || 0;
    if (summary.net > 0 && housingTotal > 0) {
      const housingPct = Math.round((housingTotal / summary.net) * 100);
      if (housingPct <= 30) {
        insights.push({
          type: 'positive',
          icon: '✅',
          title: `Housing is a healthy ${housingPct}% of your income`,
          text: `Financial planners suggest keeping housing under 30% of take-home pay. You are in a great safety zone (${Haven.formatMoney(housingTotal)}/mo).`
        });
      } else {
        insights.push({
          type: 'caution',
          icon: '💡',
          title: `Housing takes ${housingPct}% of take-home pay`,
          text: `Your housing costs (${Haven.formatMoney(housingTotal)}/mo) are slightly over the standard 30% rule. Balancing other categories can help keep peace of mind.`
        });
      }
    }

    // Cushion Check
    if (summary.cushion > 200) {
      insights.push({
        type: 'positive',
        icon: '🌱',
        title: `Safe monthly cushion: +${Haven.formatMoney(summary.cushion)}`,
        text: 'You have unassigned money left over! Setting up an automatic transfer of even half this amount into an emergency high-yield savings account creates lasting confidence.'
      });
    } else if (summary.cushion < 0) {
      insights.push({
        type: 'caution',
        icon: '⚠️',
        title: `Expenses exceed monthly income by ${Haven.formatMoney(Math.abs(summary.cushion))}`,
        text: "Don't stress! Everyone's first budget needs adjustments. Look at your 'Lifestyle (Wants)' rows like dining out or streaming to trim a few dollars until balance is reached."
      });
    }

    // Savings Check
    if (summary.savingsTotal === 0) {
      insights.push({
        type: 'tip',
        icon: '🛡️',
        title: 'Start an Emergency Buffer with just $25 - $50',
        text: 'Beginners often feel they need thousands saved right away. Starting with a tiny automatic $50/mo deposit builds the habit and protects you from minor car or medical surprises.'
      });
    } else if (summary.savingsPct >= 15) {
      insights.push({
        type: 'positive',
        icon: '🌟',
        title: `Superb saving rate (${Math.round(summary.savingsPct)}%)`,
        text: `You are putting away ${Haven.formatMoney(summary.savingsTotal)} every month. This sets you up for rapid emergency fund growth and long-term peace of mind.`
      });
    }

    insights.forEach(item => {
      const el = document.createElement('div');
      el.className = `insight-item ${item.type}`;
      el.innerHTML = `
        <div class="insight-icon">${item.icon}</div>
        <div class="insight-content">
          <div class="insight-title">${Haven.escapeHtml(item.title)}</div>
          <div class="insight-text">${Haven.escapeHtml(item.text)}</div>
        </div>
      `;
      insightsListEl.appendChild(el);
    });
  }

  // Destroy Charts on Theme Switch
  function destroyCharts() {
    if (donutChart) {
      donutChart.destroy();
      donutChart = null;
    }
    if (frameworkChart) {
      frameworkChart.destroy();
      frameworkChart = null;
    }
  }

  // Handle Resize for Donut Legend
  function handleChartResize() {
    if (donutChart) {
      const newPos = window.innerWidth < 680 ? 'bottom' : 'right';
      if (donutChart.options.plugins.legend.position !== newPos) {
        donutChart.options.plugins.legend.position = newPos;
        donutChart.update();
      }
    }
  }

  // Expose Charts Module
  Haven.updateCharts = updateCharts;
  Haven.renderInsights = renderInsights;
  Haven.destroyCharts = destroyCharts;
  Haven.handleChartResize = handleChartResize;
})();
