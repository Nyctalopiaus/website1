import { ExifData } from '../types';

/**
 * Extracts basic EXIF metadata from an image File using client-side binary scanning.
 */
export async function extractExifFromFile(file: File): Promise<ExifData> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (!buffer) {
        resolve({});
        return;
      }

      try {
        const view = new DataView(buffer);
        // Check for JPEG SOI marker 0xFFD8
        if (view.getUint16(0, false) !== 0xFFD8) {
          resolve({});
          return;
        }

        let length = view.byteLength;
        let offset = 2;

        while (offset < length) {
          if (view.getUint8(offset) !== 0xFF) break;
          const marker = view.getUint8(offset + 1);

          // APP1 Marker (0xFFE1) contains EXIF data
          if (marker === 0xE1) {
            const exifData = parseApp1Exif(view, offset + 4);
            resolve(exifData);
            return;
          } else {
            offset += 2 + view.getUint16(offset + 2, false);
          }
        }
      } catch (err) {
        console.warn('EXIF parsing notice:', err);
      }

      resolve({});
    };

    reader.onerror = () => resolve({});
    reader.readAsArrayBuffer(file.slice(0, 128 * 1024)); // Read first 128KB where EXIF resides
  });
}

function parseApp1Exif(view: DataView, offset: number): ExifData {
  const exif: ExifData = {};
  try {
    // Check for "Exif\0\0" header
    const header = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );

    if (header !== 'Exif') return exif;

    const tiffOffset = offset + 6;
    const littleEndian = view.getUint16(tiffOffset, false) === 0x4949; // 'II'

    const firstIFD = view.getUint32(tiffOffset + 4, littleEndian);
    if (firstIFD < 8) return exif;

    const ifd0Entries = view.getUint16(tiffOffset + firstIFD, littleEndian);
    let curOffset = tiffOffset + firstIFD + 2;

    for (let i = 0; i < ifd0Entries; i++) {
      const tag = view.getUint16(curOffset, littleEndian);

      if (tag === 0x010F) { // Make
        exif.cameraMake = readStringTag(view, curOffset, tiffOffset, littleEndian);
      } else if (tag === 0x0110) { // Model
        exif.cameraModel = readStringTag(view, curOffset, tiffOffset, littleEndian);
      }

      curOffset += 12;
    }
  } catch (e) {
    // Graceful fallback
  }

  return exif;
}

function readStringTag(view: DataView, entryOffset: number, tiffOffset: number, littleEndian: boolean): string {
  try {
    const count = view.getUint32(entryOffset + 4, littleEndian);
    const valueOffset = count > 4 ? tiffOffset + view.getUint32(entryOffset + 8, littleEndian) : entryOffset + 8;
    let str = '';
    for (let i = 0; i < count; i++) {
      const charCode = view.getUint8(valueOffset + i);
      if (charCode === 0) break;
      str += String.fromCharCode(charCode);
    }
    return str.trim();
  } catch {
    return '';
  }
}
