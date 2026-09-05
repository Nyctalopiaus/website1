export function initRouteStops({ routeStopsList, btnAddStop, btnSwapRoute, log }) {
  let draggedElement = null;

  // Native HTML5 drag-and-drop (below) has no touch equivalent, so reordering
  // silently doesn't work on phones/tablets without these. They're additive --
  // desktop drag-and-drop still works unchanged.
  function updateMoveButtonStates() {
    const rows = Array.from(routeStopsList.children);
    rows.forEach((row, idx) => {
      const upBtn = row.querySelector('.btn-move-up');
      const downBtn = row.querySelector('.btn-move-down');
      if (upBtn) upBtn.disabled = idx === 0;
      if (downBtn) downBtn.disabled = idx === rows.length - 1;
    });
  }

  function bindMoveButtons(row) {
    const upBtn = row.querySelector('.btn-move-up');
    const downBtn = row.querySelector('.btn-move-down');
    if (upBtn) {
      upBtn.addEventListener('click', () => {
        const prev = row.previousElementSibling;
        if (prev) {
          routeStopsList.insertBefore(row, prev);
          updateMoveButtonStates();
        }
      });
    }
    if (downBtn) {
      downBtn.addEventListener('click', () => {
        const next = row.nextElementSibling;
        if (next) {
          routeStopsList.insertBefore(next, row);
          updateMoveButtonStates();
        }
      });
    }
  }

  function removeRow(row) {
    if (routeStopsList.children.length > 2) {
      routeStopsList.removeChild(row);
      log('[SYS] Route stop removed.');
      updateMoveButtonStates();
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
        updateMoveButtonStates();
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
    bindMoveButtons(row);
  });
  updateMoveButtonStates();

  btnAddStop.addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'stop-input-row';

    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle';
    dragHandle.textContent = '☰';

    const moveButtons = document.createElement('div');
    moveButtons.className = 'stop-move-buttons';

    const upButton = document.createElement('button');
    upButton.type = 'button';
    upButton.className = 'btn-move-stop btn-move-up';
    upButton.title = 'Move stop up';
    upButton.textContent = '▲';

    const downButton = document.createElement('button');
    downButton.type = 'button';
    downButton.className = 'btn-move-stop btn-move-down';
    downButton.title = 'Move stop down';
    downButton.textContent = '▼';

    moveButtons.appendChild(upButton);
    moveButtons.appendChild(downButton);

    const stopInput = document.createElement('input');
    stopInput.type = 'text';
    stopInput.setAttribute('list', 'cities-list');
    stopInput.placeholder = 'Enter address...';
    stopInput.className = 'terminal-input route-stop-input';

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'btn-remove-stop';
    removeButton.textContent = '✕';

    row.appendChild(dragHandle);
    row.appendChild(moveButtons);
    row.appendChild(stopInput);
    row.appendChild(removeButton);

    routeStopsList.appendChild(row);
    addDragAndDropEvents(row);
    bindRemoveButton(row);
    bindMoveButtons(row);
    updateMoveButtonStates();
    log('[SYS] Dynamic route stop appended. Drag ☰ or use ▲▼ to reorder.');
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
