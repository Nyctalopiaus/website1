/**
 * Haven — Mindful Monthly Budgeting for Beginners
 * Module: Custom Categories Management & Controller
 */

(function () {
  'use strict';

  window.Haven = window.Haven || {};

  let pendingRowItemId = null;

  // Retrieve combined master and user custom categories
  function getAllCategories() {
    const custom = (Haven.state && Array.isArray(Haven.state.customCategories)) ? Haven.state.customCategories : [];
    return [...Haven.CATEGORIES, ...custom];
  }

  // DOM Elements for Custom Categories
  const customCatModal = document.getElementById('custom-category-modal');
  const closeCatModalBtn = document.getElementById('btn-close-cat-modal');
  const closeCatModalFootBtn = document.getElementById('btn-close-cat-modal-foot');
  const customCatForm = document.getElementById('custom-cat-form');
  const customCatNameInput = document.getElementById('custom-cat-name-input');
  const customCatGroupSelect = document.getElementById('custom-cat-group-select');
  const customCatIconPicker = document.getElementById('custom-cat-icon-picker');
  const customCatSelectedIcon = document.getElementById('custom-cat-selected-icon');
  const customCatIconHint = document.getElementById('custom-cat-icon-hint');
  const customCatList = document.getElementById('custom-cat-list');
  const customCatCountBadge = document.getElementById('custom-cat-count-badge');
  const btnManageCategories = document.getElementById('btn-manage-categories');

  // Open Custom Category Modal
  function openCustomCategoryModal(rowItemId = null) {
    pendingRowItemId = rowItemId;
    renderCustomCategoryList();
    initIconPicker();
    if (customCatNameInput) {
      customCatNameInput.value = '';
      setTimeout(() => customCatNameInput.focus(), 80);
    }
    if (customCatModal) customCatModal.classList.add('active');
  }

  // Close Custom Category Modal
  function closeCustomCategoryModal() {
    pendingRowItemId = null;
    if (customCatModal) customCatModal.classList.remove('active');
  }

  // Populate Visual Icon Picker Strip
  function initIconPicker() {
    if (!customCatIconPicker) return;
    customCatIconPicker.innerHTML = '';
    const currentSelected = customCatSelectedIcon ? customCatSelectedIcon.value : 'paw-print';

    Haven.CUSTOM_ICONS.forEach(iconName => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `cat-icon-btn ${iconName === currentSelected ? 'selected' : ''}`;
      btn.dataset.icon = iconName;
      btn.title = iconName;
      btn.innerHTML = `<i data-lucide="${iconName}"></i>`;

      btn.addEventListener('click', () => {
        customCatIconPicker.querySelectorAll('.cat-icon-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        if (customCatSelectedIcon) customCatSelectedIcon.value = iconName;
        if (customCatIconHint) customCatIconHint.textContent = `Selected: ${iconName}`;
      });

      customCatIconPicker.appendChild(btn);
    });

    if (window.lucide) lucide.createIcons({ root: customCatIconPicker });
  }

  // Render List of Existing Custom Categories
  function renderCustomCategoryList() {
    if (!customCatList) return;
    const customs = Haven.state.customCategories || [];

    if (customCatCountBadge) {
      customCatCountBadge.textContent = `${customs.length} custom`;
    }

    if (customs.length === 0) {
      customCatList.innerHTML = `
        <div class="custom-cat-empty-msg">
          <i data-lucide="tag" style="width: 22px; height: 22px; color: var(--text-faint); margin-bottom: 0.35rem;"></i>
          <div>No custom categories created yet.</div>
          <div style="font-size: 0.78rem; color: var(--text-faint); margin-top: 0.2rem;">Fill out the form above to add your first personalized category!</div>
        </div>
      `;
      if (window.lucide) lucide.createIcons({ root: customCatList });
      return;
    }

    customCatList.innerHTML = '';
    customs.forEach(cat => {
      const row = document.createElement('div');
      row.className = 'custom-cat-item-row';
      const tierClass = cat.tier === 'needs' ? 'tier-needs' : (cat.tier === 'wants' ? 'tier-wants' : 'tier-savings');
      const tierLabel = cat.tier === 'needs' ? 'Needs' : (cat.tier === 'wants' ? 'Wants' : 'Savings');

      row.innerHTML = `
        <div class="custom-cat-info">
          <div class="custom-cat-icon-box">
            <i data-lucide="${Haven.sanitizeIcon(cat.icon)}"></i>
          </div>
          <div class="custom-cat-names">
            <span class="custom-cat-name-txt">${Haven.escapeHtml(cat.name)}</span>
            <span class="custom-cat-group-txt">${Haven.escapeHtml(cat.group)}</span>
          </div>
        </div>
        <div class="custom-cat-actions">
          <span class="tier-pill ${tierClass}" style="font-size: 0.72rem; padding: 0.2rem 0.55rem;">${tierLabel}</span>
          <button type="button" class="btn btn-icon-only btn-danger-ghost btn-delete-custom-cat" title="Delete custom category" aria-label="Delete">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      `;

      const delBtn = row.querySelector('.btn-delete-custom-cat');
      delBtn.addEventListener('click', () => deleteCustomCategory(cat.id));

      customCatList.appendChild(row);
    });

    if (window.lucide) lucide.createIcons({ root: customCatList });
  }

  // Create Custom Category
  function createCustomCategory(name, tier, group, icon) {
    const trimmed = String(name || '').trim().slice(0, 45);
    if (!trimmed) {
      if (Haven.showToast) Haven.showToast('Please enter a category name.', 'alert-circle');
      return;
    }

    const cleanTier = ['needs', 'wants', 'savings'].includes(tier) ? tier : 'needs';
    const cleanGroup = String(group || 'Personal & Family').trim().slice(0, 40);
    const cleanIcon = Haven.sanitizeIcon ? Haven.sanitizeIcon(icon) : 'tag';

    // Duplicate check
    const all = getAllCategories();
    if (all.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
      if (Haven.showToast) Haven.showToast(`Category "${trimmed}" already exists!`, 'alert-circle');
      return;
    }

    const newCat = {
      id: 'cat_custom_' + Date.now(),
      name: trimmed,
      group: cleanGroup,
      tier: cleanTier,
      icon: cleanIcon,
      isCustom: true
    };

    if (!Array.isArray(Haven.state.customCategories)) {
      Haven.state.customCategories = [];
    }
    Haven.state.customCategories.push(newCat);

    // If triggered from a specific row, immediately assign it
    if (pendingRowItemId) {
      const targetItem = Haven.state.items.find(i => i.id === pendingRowItemId);
      if (targetItem) {
        targetItem.categoryId = newCat.id;
        targetItem.tier = newCat.tier;
        if (!targetItem.name || targetItem.name.trim() === '') {
          targetItem.name = newCat.name;
        }
      }
      pendingRowItemId = null;
    }

    Haven.saveState();
    if (Haven.renderAll) Haven.renderAll();
    renderCustomCategoryList();
    if (Haven.showToast) Haven.showToast(`Created category "${newCat.name}"!`, 'check-circle-2');

    if (customCatNameInput) customCatNameInput.value = '';
  }

  // Delete Custom Category with Safe Cascading Reassignment
  function deleteCustomCategory(catId) {
    const cat = (Haven.state.customCategories || []).find(c => c.id === catId);
    if (!cat) return;

    const countInUse = (Haven.state.items || []).filter(i => i.categoryId === catId).length;
    let confirmMsg = `Delete the custom category "${cat.name}"?`;
    if (countInUse > 0) {
      confirmMsg += `\n\n${countInUse} spending item(s) are currently assigned to this category. They will be safely reassigned to "Monthly Miscellaneous Buffer".`;
    }

    if (confirm(confirmMsg)) {
      Haven.state.items.forEach(item => {
        if (item.categoryId === catId) {
          item.categoryId = 'misc_buffer';
          item.tier = 'needs';
        }
      });

      Haven.state.customCategories = Haven.state.customCategories.filter(c => c.id !== catId);
      Haven.saveState();
      if (Haven.renderAll) Haven.renderAll();
      renderCustomCategoryList();
      if (Haven.showToast) Haven.showToast(`Deleted category "${cat.name}".`, 'trash-2');
    }
  }

  // Setup Event Handlers for Categories Modal
  function bindCategoryEvents() {
    if (btnManageCategories) btnManageCategories.addEventListener('click', () => openCustomCategoryModal());
    if (closeCatModalBtn) closeCatModalBtn.addEventListener('click', closeCustomCategoryModal);
    if (closeCatModalFootBtn) closeCatModalFootBtn.addEventListener('click', closeCustomCategoryModal);

    if (customCatModal) {
      customCatModal.addEventListener('click', (e) => {
        if (e.target === customCatModal) closeCustomCategoryModal();
      });
    }

    if (customCatForm) {
      customCatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = customCatNameInput ? customCatNameInput.value : '';
        const tierInput = customCatForm.querySelector('input[name="custom-cat-tier"]:checked');
        const tier = tierInput ? tierInput.value : 'needs';
        const group = customCatGroupSelect ? customCatGroupSelect.value : 'Personal & Family';
        const icon = customCatSelectedIcon ? customCatSelectedIcon.value : 'paw-print';

        createCustomCategory(name, tier, group, icon);
      });
    }
  }

  // Expose Categories Module
  Haven.getAllCategories = getAllCategories;
  Haven.openCustomCategoryModal = openCustomCategoryModal;
  Haven.closeCustomCategoryModal = closeCustomCategoryModal;
  Haven.initIconPicker = initIconPicker;
  Haven.renderCustomCategoryList = renderCustomCategoryList;
  Haven.createCustomCategory = createCustomCategory;
  Haven.deleteCustomCategory = deleteCustomCategory;
  Haven.bindCategoryEvents = bindCategoryEvents;
})();
