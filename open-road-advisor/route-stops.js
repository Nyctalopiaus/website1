export function initRouteStops({ routeStopsList, btnAddStop, btnSwapRoute, log }) {
  let draggedElement = null;

  function removeRow(row) {
    if (routeStopsList.children.length > 2) {
      routeStopsList.removeChild(row);
      log('[SYS] Route stop removed.');
    } else {
      alert('Route must have at least two stops.');
    }
  }

  function addDragAndDropEvents(row) {
    const handle = row.querySelector('.drag-handle');
    if (handle) {
      handle.addEventListener('mousedown', () => row.setAttribute('draggable', 'true'));
      handle.addEventListener('mouseup', () => row.removeAttribute('draggable'));
      handle.addEventListener('mouseleave', () => row.removeAttribute('draggable'));
    }

    row.addEventListener('dragstart', e => {
      draggedElement = row;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      draggedElement = null;
    });

    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    row.addEventListener('dragenter', e => {
      e.preventDefault();
    });

    row.addEventListener('drop', e => {
      e.preventDefault();
      if (draggedElement && draggedElement !== row) {
        const allRows = Array.from(routeStopsList.children);
        const draggedIndex = allRows.indexOf(draggedElement);
        const targetIndex = allRows.indexOf(row);

        if (draggedIndex < targetIndex) {
          routeStopsList.insertBefore(draggedElement, row.nextSibling);
        } else {
          routeStopsList.insertBefore(draggedElement, row);
        }
      }
    });
  }

  function bindRemoveButton(row) {
    const removeBtn = row.querySelector('.btn-remove-stop');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => removeRow(row));
    }
  }

  Array.from(routeStopsList.children).forEach(row => {
    addDragAndDropEvents(row);
    bindRemoveButton(row);
  });

  btnAddStop.addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'stop-input-row';
    row.style = 'display: flex; gap: 0.5rem; align-items: center; width: 100%;';

    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle';
    dragHandle.style = 'cursor: move; padding: 0.25rem; font-size: 0.9rem;';
    dragHandle.textContent = '☰';

    const stopInput = document.createElement('input');
    stopInput.type = 'text';
    stopInput.setAttribute('list', 'cities-list');
    stopInput.placeholder = 'Enter address...';
    stopInput.className = 'terminal-input route-stop-input';
    stopInput.style = 'flex: 1;';

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'btn-remove-stop';
    removeButton.style = 'background: transparent; border: 1px solid var(--border-color); color: var(--accent-red); padding: 0.65rem 0.85rem; border-radius: 6px; cursor: pointer; transition: all 0.2s ease;';
    removeButton.textContent = '✕';

    row.appendChild(dragHandle);
    row.appendChild(stopInput);
    row.appendChild(removeButton);

    routeStopsList.appendChild(row);
    addDragAndDropEvents(row);
    bindRemoveButton(row);
    log('[SYS] Dynamic route stop appended. Drag ☰ to reorder.');
  });

  if (btnSwapRoute) {
    btnSwapRoute.addEventListener('click', () => {
      const inputs = routeStopsList.querySelectorAll('.route-stop-input');
      if (inputs.length === 2) {
        const val0 = inputs[0].value;
        inputs[0].value = inputs[1].value;
        inputs[1].value = val0;
        log('[SYS] Swapped Origin and Destination stops.');
      } else {
        alert('Swap is only available for routes with exactly two stops (Origin and Destination).');
      }
    });
  }
}
