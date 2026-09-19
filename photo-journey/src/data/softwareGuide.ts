import { SoftwareName } from '../types';

export interface SoftwareToolGuide {
  software: SoftwareName;
  description: string;
  toneCurvePath: string;
  maskingMethod: string;
  colorGradingMethod: string;
  sharpeningMethod: string;
  keyShortcuts: { action: string; key: string }[];
  proTip: string;
}

export const SOFTWARE_GUIDES: Record<string, SoftwareToolGuide> = {
  'Lightroom Classic': {
    software: 'Lightroom Classic',
    description: 'Industry-standard catalog-based non-destructive RAW processor.',
    toneCurvePath: 'Develop Module -> Tone Curve Panel (Click point curve icon to add points).',
    maskingMethod: 'Develop Module -> Press "K" or click Masking icon -> Select Brush, Linear Gradient, or Radial Gradient.',
    colorGradingMethod: 'Develop Module -> Color Grading Panel (Midtones, Shadows, Highlights color wheels).',
    sharpeningMethod: 'Develop Module -> Detail Panel -> Sharpening + Masking (Hold Alt/Option while dragging Masking slider).',
    keyShortcuts: [
      { action: 'Develop Module', key: 'D' },
      { action: 'Crop Tool', key: 'R' },
      { action: 'Masking Panel', key: 'Shift + W / K' },
      { action: 'Before / After View', key: '\' or \'Y\'' },
    ],
    proTip: 'Hold Alt/Option while dragging the Sharpening "Masking" slider to view a black & white outline showing exactly where sharpening will apply.'
  },
  'Lightroom CC': {
    software: 'Lightroom CC',
    description: 'Cloud-first intuitive version of Adobe Lightroom for desktop & mobile.',
    toneCurvePath: 'Edit Sidebar -> Light Panel -> Click the Curve diagram icon.',
    maskingMethod: 'Right Toolbar -> Select Masking -> Create New Mask (Subject, Sky, Brush, Gradient).',
    colorGradingMethod: 'Edit Sidebar -> Color Panel -> Color Grading (Wheels for Shadows, Midtones, Highlights).',
    sharpeningMethod: 'Edit Sidebar -> Detail Panel -> Sharpening slider & Masking control.',
    keyShortcuts: [
      { action: 'Edit Mode', key: 'E' },
      { action: 'Crop Mode', key: 'C' },
      { action: 'Masking', key: 'M' },
      { action: 'Original Toggle', key: 'O' }
    ],
    proTip: 'Use AI Subject or Sky selection inside Masking to quickly isolate subject exposure adjustments without manual masking.'
  },
  'Adobe Photoshop': {
    software: 'Adobe Photoshop',
    description: 'Pixel-level raster graphic editor & manipulation suite.',
    toneCurvePath: 'Layer -> New Adjustment Layer -> Curves (or Cmd/Ctrl + M). Also accessible in Camera Raw Filter (Cmd/Ctrl + Shift + A).',
    maskingMethod: 'Add Layer Mask icon at bottom of Layers panel -> Paint black to hide, white to reveal.',
    colorGradingMethod: 'Camera Raw Filter -> Color Grading, or Selective Color adjustment layers.',
    sharpeningMethod: 'Filter -> Sharpen -> Unsharp Mask or Smart Sharpen.',
    keyShortcuts: [
      { action: 'Camera Raw Filter', key: 'Cmd/Ctrl + Shift + A' },
      { action: 'New Curves Layer', key: 'Cmd/Ctrl + M' },
      { action: 'Brush Tool', key: 'B' },
      { action: 'Toggle Foreground/Background Color', key: 'X' }
    ],
    proTip: 'Always convert your image layer into a "Smart Object" before applying Camera Raw Filter so all edits remain non-destructive.'
  },
  'Capture One': {
    software: 'Capture One',
    description: 'Professional tethering and high-end color grading RAW processor.',
    toneCurvePath: 'Exposure Tool Tab -> Curve tool (Luma, RGB, Red, Green, Blue channels).',
    maskingMethod: 'Layers Tool Tab -> New Adjustment Layer -> Draw mask with Brush (B) or Radial/Linear Gradient.',
    colorGradingMethod: 'Color Tool Tab -> Color Balance tool (3-way Shadow/Midtone/Highlight wheel or 1-way).',
    sharpeningMethod: 'Refinement Tool Tab -> Sharpening tool with Threshold and Halo Suppression.',
    keyShortcuts: [
      { action: 'Brush Tool', key: 'B' },
      { action: 'Erase Mask', key: 'E' },
      { action: 'Toggle Mask Display', key: 'M' },
      { action: 'Exposure Tool', key: 'Cmd/Ctrl + 3' }
    ],
    proTip: 'Use the "Luma Curve" mode instead of standard RGB curve to alter contrast without unintended color saturation shifts.'
  },
  'Darktable': {
    software: 'Darktable',
    description: 'Powerful open-source non-destructive RAW workflow app.',
    toneCurvePath: 'Darkroom Mode -> Color Invariance / Filmic RGB / Tone Equalizer module.',
    maskingMethod: 'Any module -> Masking option at bottom -> Drawn Mask (path/ellipse/brush) or Parametric Mask.',
    colorGradingMethod: 'Color Balance RGB module (4-way perceptual color grading).',
    sharpeningMethod: 'Diffuse or Sharpen module, or Contrast Equalizer.',
    keyShortcuts: [
      { action: 'Switch to Darkroom', key: 'D' },
      { action: 'Full Screen Preview', key: 'W' },
      { action: 'Toggle Module Groups', key: 'Tab' }
    ],
    proTip: 'Use the "Filmic RGB" module for tone mapping high dynamic range shots cleanly to avoid blown-out highlights.'
  },
  'RawTherapee': {
    software: 'RawTherapee',
    description: 'Feature-packed open-source cross-platform RAW image editor.',
    toneCurvePath: 'Exposure Tab -> Tone Curves (Curve 1 & Curve 2 with Linear, Custom, or Perceptual modes).',
    maskingMethod: 'Local Adjustments Tab -> Add Spot -> Masking parameters.',
    colorGradingMethod: 'Color Tab -> L*a*b* Adjustment or Color Toning panel.',
    sharpeningMethod: 'Detail Tab -> Sharpening (Deconvolution or Contrast By Detail Levels).',
    keyShortcuts: [
      { action: 'Zoom 100%', key: 'Z' },
      { action: 'Toggle Before/After', key: 'Shift + B' }
    ],
    proTip: 'In the Detail tab, try "RL Deconvolution" sharpening instead of Unsharp Mask for cleaner micro-contrast recovery.'
  },
  'GIMP': {
    software: 'GIMP',
    description: 'Free open-source image manipulation program.',
    toneCurvePath: 'Colors Menu -> Curves...',
    maskingMethod: 'Right click Layer -> Add Layer Mask (White, Black, or Selection).',
    colorGradingMethod: 'Colors Menu -> Color Balance / Shadows-Highlights.',
    sharpeningMethod: 'Filters Menu -> Enhance -> Sharpen (Unsharp Mask).',
    keyShortcuts: [
      { action: 'Curves Tool', key: 'Alt + C' },
      { action: 'Paintbrush', key: 'P' },
      { action: 'Bucket Fill', key: 'Shift + B' }
    ],
    proTip: 'Use non-destructive layer masks when sharpening to restrict the filter to subject details only.'
  },
  'Affinity Photo': {
    software: 'Affinity Photo',
    description: 'Modern professional photo editing and raster workspace.',
    toneCurvePath: 'Develop Persona or Photo Persona -> Adjustments Panel -> Curves.',
    maskingMethod: 'Layer Menu -> New Mask Layer -> Paint black/white with Paint Brush.',
    colorGradingMethod: 'Adjustments Panel -> HSL or Split Toning or Selective Color.',
    sharpeningMethod: 'Filters Menu -> Sharpen -> High Pass Filter (set layer blend mode to Soft Light).',
    keyShortcuts: [
      { action: 'Develop Persona', key: 'Top Left Persona Icon' },
      { action: 'Brush Tool', key: 'B' },
      { action: 'Original Toggle', key: '\\' }
    ],
    proTip: 'A High Pass filter set to Soft Light blend mode provides cleaner edge sharpening than standard Unsharp Mask.'
  },
  'Apple Photos / iOS': {
    software: 'Apple Photos / iOS',
    description: 'Built-in photo organization and quick editing tools for macOS and iOS.',
    toneCurvePath: 'Edit Mode -> Curves Tool (macOS) or Light -> Brilliant/Exposure (iOS).',
    maskingMethod: 'Standard iOS Photos app does not support manual spatial masks; use Portrait Lighting or third-party extensions.',
    colorGradingMethod: 'Edit Mode -> Color panel (Cast, Saturation, Vibrance) or Filters.',
    sharpeningMethod: 'Edit Mode -> Details -> Definition & Sharpening sliders.',
    keyShortcuts: [
      { action: 'Edit Mode', key: 'Return / Enter' },
      { action: 'Compare Original', key: 'Hold M or Click Compare' }
    ],
    proTip: 'Use the "Definition" slider instead of raw Sharpening to increase local contrast without adding harsh noise.'
  },
  'Other / Generic RAW Editor': {
    software: 'Other / Generic RAW Editor',
    description: 'Generic RAW editor workspace.',
    toneCurvePath: 'Look for Tone Curve or Histogram Curve controls.',
    maskingMethod: 'Use brush, radial, or linear gradient selection masks.',
    colorGradingMethod: 'Use HSL/Color Mixer and Split Toning controls.',
    sharpeningMethod: 'Apply detail sharpening with high masking/threshold settings.',
    keyShortcuts: [
      { action: 'Toggle Preview', key: '\\' }
    ],
    proTip: 'Work from top to bottom: start with white balance & exposure, then contrast curves, then color grading, and finish with sharpening.'
  }
};
