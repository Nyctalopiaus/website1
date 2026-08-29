/**
 * DoorScout Inspiration Notes & Door Pin Manager
 * Allows dropping map pins for front door ideas, tagging styles, typing notes, and storing photos.
 */

class InspirationNotesManager {
  constructor(mapInstance, onNotesUpdatedCallback) {
    this.map = mapInstance;
    this.onNotesUpdated = onNotesUpdatedCallback;
    this.notes = [];
    this.markersGroup = L.layerGroup().addTo(this.map);

    this.styleIcons = {
      craftsman: '🚪 Craftsman',
      modern: '✨ Modern',
      midcentury: '🌿 Mid-Century',
      double: '👑 Double Door',
      colonial: '🏛️ Colonial',
      custom: '💡 General Idea'
    };
  }

  loadNotes(notesArray) {
    this.notes = Array.isArray(notesArray) ? notesArray : [];
    this.renderMarkers();
  }

  addNote(lat, lng, noteData) {
    const newNote = {
      id: 'pin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      lat: lat,
      lng: lng,
      title: noteData.title || 'Front Door Note',
      styleTag: noteData.styleTag || 'custom',
      description: noteData.description || '',
      photoUrl: noteData.photoUrl || '',
      createdAt: new Date().toISOString()
    };

    this.notes.push(newNote);
    this.renderMarkers();
    if (typeof this.onNotesUpdated === 'function') {
      this.onNotesUpdated(this.notes);
    }
    return newNote;
  }

  removeNote(id) {
    this.notes = this.notes.filter(n => n.id !== id);
    this.renderMarkers();
    if (typeof this.onNotesUpdated === 'function') {
      this.onNotesUpdated(this.notes);
    }
  }

  renderMarkers() {
    this.markersGroup.clearLayers();

    this.notes.forEach(note => {
      const styleClass = `door-pin-${note.styleTag || 'custom'}`;
      const customIcon = L.divIcon({
        className: `door-pin-marker ${styleClass} w-8 h-8 font-bold`,
        html: `<span>🚪</span>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([note.lat, note.lng], { icon: customIcon });

      const popupContent = `
        <div class="p-2 min-w-[200px] text-slate-900">
          <div class="flex items-center justify-between border-b pb-1 mb-1">
            <span class="font-bold text-sm text-slate-800">${escapeHtml(note.title)}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 font-semibold uppercase">${escapeHtml(note.styleTag)}</span>
          </div>
          ${note.description ? `<p class="text-xs text-slate-600 mb-2">${escapeHtml(note.description)}</p>` : ''}
          ${note.photoUrl ? `<img src="${escapeHtml(note.photoUrl)}" class="w-full h-24 object-cover rounded mb-2 border border-slate-200" />` : ''}
          <div class="flex justify-end pt-1">
            <button onclick="window.app.deleteDoorPin('${note.id}')" class="text-[10px] text-rose-600 font-bold hover:underline">🗑️ Delete Pin</button>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
      this.markersGroup.addLayer(marker);
    });
  }
}

window.InspirationNotesManager = InspirationNotesManager;
