import { Challenge } from '../types';

export const INITIAL_CHALLENGES: Challenge[] = [
  // ==========================================
  // TOPIC 1: CAMERA BASICS (15 Challenges)
  // ==========================================

  // --- BEGINNER ---
  {
    id: 'cb_b1',
    title: 'Shallow Depth of Field & Aperture Control',
    category: 'camera_basics',
    level: 'Beginner',
    summary: 'Learn how to set your camera aperture to its widest f-number (f/1.8 - f/2.8) to blur the background and make your subject stand out.',
    objectives: [
      'Switch your camera dial to Aperture Priority (A / Av) or Manual.',
      'Set your lens to its widest aperture setting (lowest f-number).',
      'Position your subject at least 5-10 feet away from the background to maximize bokeh softness.'
    ],
    cameraTip: 'Use your lowest f-number (e.g. f/1.8 or f/2.8) and stand close to your subject while keeping the background far away.',
    softwareFocus: 'Subject Masking & Bokeh Sharpening',
    suggestedTools: ['Select Subject Mask', 'Sharpening Masking Slider', 'Local Texture Boost'],
    steps: {
      shooting: [
        'Turn your camera top mode dial to Aperture Priority (A or Av).',
        'Rotate your command dial to select your lens’s lowest f-number (e.g. f/1.8, f/2.8, or f/3.5).',
        'Stand 3–6 feet from your subject, and ensure the background wall or trees are at least 15 feet behind them.',
        'Focus directly on the subject’s nearest eye or center point, then take the photo.'
      ],
      editing: [
        'Import your photo into your editing software.',
        'Add a "Select Subject" mask to isolate your main subject from the blurred background.',
        'Apply +15 Texture or Clarity to the subject mask, while leaving the background untouched for maximum bokeh separation.'
      ]
    }
  },
  {
    id: 'cb_b2',
    title: 'Freezing Fast Motion with High Shutter Speed',
    category: 'camera_basics',
    level: 'Beginner',
    summary: 'Capture crisp, frozen action (water splashes, running pets, sports) by controlling your shutter speed.',
    objectives: [
      'Set shutter speed to 1/1000s or faster on Shutter Priority (S / Tv) mode.',
      'Ensure ISO is set to Auto ISO or bumped up to compensate for fast shutter speed.',
      'Take burst shots to capture the peak instant of action.'
    ],
    cameraTip: 'Set shutter speed to 1/1000s minimum for fast subjects. On bright days, keep ISO low; in shade, allow Auto ISO to balance exposure.',
    softwareFocus: 'Noise Reduction & Edge Sharpening',
    suggestedTools: ['Luminance Noise Reduction', 'Detail Sharpening Slider', 'Crop Alignment'],
    steps: {
      shooting: [
        'Switch your camera dial to Shutter Priority (S or Tv).',
        'Set your shutter speed to 1/1000s or faster using your control dial.',
        'Enable High-Speed Continuous Burst Drive mode in your drive settings.',
        'Track the action in your viewfinder and hold down the shutter button to capture a burst of frames.'
      ],
      editing: [
        'Review your burst frames at 100% zoom to pick the sharpest frame capturing peak motion.',
        'If higher ISO introduced digital noise, increase Luminance Noise Reduction slightly (+20 to +30).',
        'Use the Crop Tool to tighten framing on the frozen subject.'
      ]
    }
  },
  {
    id: 'cb_b3',
    title: 'The Exposure Triangle in Action',
    category: 'camera_basics',
    level: 'Beginner',
    summary: 'Understand the triad of Aperture, Shutter Speed, and ISO by taking three exposures of the same subject under different ISO values.',
    objectives: [
      'Take photo #1 at ISO 100, f/4, 1/125s.',
      'Take photo #2 at ISO 1600, f/4, 1/2000s.',
      'Compare digital noise levels and contrast between both shots.'
    ],
    cameraTip: 'Native base ISO (100 or 80) yields maximum dynamic range and cleanest detail without digital grain.',
    softwareFocus: 'Luminance Noise Reduction & Contrast Tuning',
    suggestedTools: ['Noise Reduction Panel', 'Contrast Curve', 'Grain Reduction'],
    steps: {
      shooting: [
        'Set camera to Manual Mode (M) and mount on a stable surface or tripod.',
        'Shot 1: Set ISO to 100, Aperture to f/4, Shutter Speed to 1/125s.',
        'Shot 2: Increase ISO to 1600, keep Aperture at f/4, speed up Shutter to 1/2000s to match brightness.',
        'Review both images side-by-side on your camera screen at maximum zoom.'
      ],
      editing: [
        'Import both exposures into your editor and compare noise grain in dark shadow areas.',
        'Apply Luminance Noise Reduction to the ISO 1600 shot to clean up background noise.',
        'Adjust the Tone Curve to match contrast levels between both files.'
      ]
    }
  },
  {
    id: 'cb_b4',
    title: 'Manual Focus & Focus Peaking Accuracy',
    category: 'camera_basics',
    level: 'Beginner',
    summary: 'Switch off Autofocus and use manual focus peaking or focus magnification to achieve razor-sharp focus on fine details.',
    objectives: [
      'Toggle camera lens focus switch to MF (Manual Focus).',
      'Enable Focus Peaking in camera settings (set color to Red or Yellow).',
      'Rotate focus ring until peaking highlight covers the subject’s eyes or core detail.'
    ],
    cameraTip: 'Focus Peaking highlights high-contrast edges in your viewfinder so you know exact focal placement in manual focus.',
    softwareFocus: 'Selective Detail Sharpening',
    suggestedTools: ['Sharpening Masking', 'Clarity +15', '100% Zoom Inspection'],
    steps: {
      shooting: [
        'Flip the AF/MF switch on your lens or camera body to MF (Manual Focus).',
        'Open your camera menu and turn on Focus Peaking (select Red, Yellow, or High intensity).',
        'Look into the viewfinder/LCD and gently turn the lens focus ring until the colored peaking highlights wrap over your subject’s sharpest edge.',
        'Press shutter smoothly without moving your camera body forward or back.'
      ],
      editing: [
        'Zoom into 100% preview (or 1:1 view) to inspect focal accuracy on your subject.',
        'Adjust Detail Sharpening slider to crisp up fine edges without adding artifacts.',
        'Use Sharpening Masking (hold Alt/Option in Lightroom) to restrict sharpening only to high-contrast edges.'
      ]
    }
  },
  {
    id: 'cb_b5',
    title: 'Metering Modes: Evaluative vs Spot Metering',
    category: 'camera_basics',
    level: 'Beginner',
    summary: 'Learn when to use Matrix/Evaluative metering versus Spot metering for high-contrast subjects.',
    objectives: [
      'Switch camera metering mode to Spot Metering.',
      'Place the center focus point on a brightly lit subject in front of a dark background.',
      'Observe how spot metering prevents the subject from blowing out.'
    ],
    cameraTip: 'Spot metering measures exposure from a tiny 2-3% center spot, perfect for backlit performers or bright subjects in dark scenes.',
    softwareFocus: 'Highlight & Shadow Balancing',
    suggestedTools: ['Highlights Slider', 'Shadows Slider', 'Spot Removal'],
    steps: {
      shooting: [
        'Enter camera Exposure settings and change Metering Mode from Matrix/Evaluative to Spot Metering.',
        'Aim your center focus point directly on the brightest part of your subject.',
        'Check your light meter reading to ensure highlights are balanced before pressing the shutter.'
      ],
      editing: [
        'Open your RAW photo and inspect the Histogram to verify no highlights are clipped (pushed past the right edge).',
        'Pull down the Highlights slider (-30 to -50) to recover delicate highlight details.',
        'Lift Shadows slightly (+20) if shadow areas became too dark during spot metering.'
      ]
    }
  },

  // --- INTERMEDIATE ---
  {
    id: 'cb_i1',
    title: 'Smooth Water Motion with Long Exposures',
    category: 'camera_basics',
    level: 'Intermediate',
    summary: 'Use a tripod, low ISO, small aperture, and Neutral Density (ND) filter to create silky smooth waterfall or wave motion blur.',
    objectives: [
      'Mount camera securely on a sturdy tripod.',
      'Set ISO to 50-100, aperture to f/11 or f/16, and shutter speed to 1-4 seconds.',
      'Use a 2-second timer or cable release to eliminate shutter button vibration.'
    ],
    cameraTip: 'Use an ND filter (ND8 or ND64) in daylight to slow down your shutter speed without overexposing your image.',
    softwareFocus: 'Dehaze & Local Masking Contrast',
    suggestedTools: ['Dehaze Slider', 'Linear Gradient on Water', 'Vibrance Lift'],
    gearNeeded: 'Tripod + ND filter (6-10 stop)'
  },
  {
    id: 'cb_i2',
    title: 'Backlight Silhouette & Fill Light Balance',
    category: 'camera_basics',
    level: 'Intermediate',
    summary: 'Master shooting into the sun to capture dramatic silhouette profiles or balanced fill-light portraits.',
    objectives: [
      'Position subject directly between camera and sunset sun.',
      'Expose for the bright sky to create a crisp dark silhouette.',
      'Take a second shot using a reflector or fill flash to illuminate subject details.'
    ],
    cameraTip: 'Expose for the sky highlights so the sun doesn’t wash out the frame into pure white clip.',
    softwareFocus: 'Shadow Recovery & Sun Flare Grading',
    suggestedTools: ['Shadows +60', 'Radial Gradient warm tint', 'White Balance warmth'],
    gearNeeded: 'Reflector (or white poster board)'
  },
  {
    id: 'cb_i3',
    title: 'Continuous Tracking AF (AF-C / AI Servo)',
    category: 'camera_basics',
    level: 'Intermediate',
    summary: 'Master continuous tracking focus and eye-AF tracking to lock onto moving subjects across the frame.',
    objectives: [
      'Switch AF mode to AF-C (Sony/Nikon) or AI Servo (Canon).',
      'Enable Eye-AF or Subject Tracking in camera menu.',
      'Track a walking or running subject as they move toward the camera.'
    ],
    cameraTip: 'Keep your AF tracking point centered on the subject’s head or face while panning along their movement path.',
    softwareFocus: 'Action Crop & Speed Sharpness',
    suggestedTools: ['Crop & Straighten', 'Sharpening Detail', 'Noise Reduction']
  },
  {
    id: 'cb_i4',
    title: 'Hyperfocal Distance & Landscape Front-to-Back Sharpness',
    category: 'camera_basics',
    level: 'Intermediate',
    summary: 'Calculate and focus at the hyperfocal distance so both near foreground rocks and distant mountain peaks remain in sharp focus.',
    objectives: [
      'Set lens aperture to f/8 or f/11 (sweet spot for lens sharpness).',
      'Focus roughly 1/3 of the way into the scene (hyperfocal distance point).',
      'Verify 100% zoom sharpness in foreground and background.'
    ],
    cameraTip: 'Avoid stopping down to f/22 as optical diffraction softens the entire image. Focus 1/3 into the scene at f/8-f/11.',
    softwareFocus: 'Global Sharpening & Micro-Contrast',
    suggestedTools: ['Texture +15', 'Clarity +10', 'Masked Sharpening']
  },
  {
    id: 'cb_i5',
    title: 'Custom Kelvin White Balance Control',
    category: 'camera_basics',
    level: 'Intermediate',
    summary: 'Ditch Auto White Balance (AWB) and dial in exact color temperature values (Kelvin) for consistent atmospheric color in camera.',
    objectives: [
      'Switch WB mode to Kelvin (K) manual entry.',
      'Dial 5500K for direct sunlight, 6500K for shade, or 3200K for tungsten indoor lights.',
      'Observe how manual Kelvin prevents color shifts across a series of shots.'
    ],
    cameraTip: 'Dialing 6500K-7000K at golden hour accentuates rich amber and orange sunlight in-camera.',
    softwareFocus: 'White Balance Fine-Tuning',
    suggestedTools: ['Temp Slider', 'Tint Slider', 'Pipette White Balance']
  },

  // --- ADVANCED ---
  {
    id: 'cb_a1',
    title: 'High-Speed Sync (HSS) Outdoor Flash',
    category: 'camera_basics',
    level: 'Advanced',
    summary: 'Use High-Speed Sync flash to shoot at 1/2000s shutter speeds outdoors with wide f/1.4 apertures.',
    objectives: [
      'Enable HSS on your speedlight / flash unit and trigger.',
      'Set camera to 1/2000s at f/1.8 in bright ambient sunlight.',
      'Use off-camera flash at a 45-degree angle to overpower midday shadows on the subject.'
    ],
    cameraTip: 'HSS allows your flash to pulse at shutter speeds past the camera sync limit (1/250s), giving shallow depth of field in full sun.',
    softwareFocus: 'Flash & Ambient Light Harmonization',
    suggestedTools: ['Luminance Masking', 'Local Exposure Mask', 'Color Grading'],
    gearNeeded: 'Speedlight with HSS support + wireless trigger'
  },
  {
    id: 'cb_a2',
    title: 'Back-Button Focus & AF-ON Separation',
    category: 'camera_basics',
    level: 'Advanced',
    summary: 'Decouple autofocus from the shutter button using Back-Button Focus (AF-ON) to lock focus independently for action, portraits, and recomposed shots.',
    objectives: [
      'Reassign the AF-ON or a rear custom button to activate autofocus, and disable focus-on-shutter-press in your camera menu.',
      'Practice acquiring focus with your thumb, then recomposing the frame without refocusing.',
      'Use Back-Button Focus to track a moving subject, then release the button to "focus-lock" for a still composition.'
    ],
    cameraTip: 'Look for "AF-ON" or "Back Button Focus" under your camera\'s Custom Controls / AF menu — most mirrorless and DSLR bodies support reassigning this from the factory shutter-half-press default.',
    softwareFocus: 'Focus Point Verification & Crop Alignment',
    suggestedTools: ['100% Zoom Focus Check', 'Crop Tool Recompose', 'Sharpening Masking Slider']
  },
  {
    id: 'cb_a3',
    title: 'In-Camera Multi-Exposure Creative Composite',
    category: 'camera_basics',
    level: 'Advanced',
    summary: 'Utilize your camera’s in-camera multiple exposure mode (Additive, Average, or Bright) to layer textures over portraits.',
    objectives: [
      'Enable Multiple Exposure mode in camera drive menu.',
      'Take shot 1 of a silhouette portrait against light.',
      'Take shot 2 of tree foliage or geometric architecture to overlay in-camera.'
    ],
    cameraTip: 'Set exposure blend mode to "Average" or "Dark" for natural texture blending in multi-exposure mode.',
    softwareFocus: 'Layer Contrast & Texture Enhancement',
    suggestedTools: ['Tone Curve S-Curve', 'Blacks Point Lift', 'Clarity']
  },
  {
    id: 'cb_a4',
    title: 'Macro Focus Rail Stacking (10+ Frame Stacking)',
    category: 'camera_basics',
    level: 'Advanced',
    summary: 'Shoot a series of 10-20 macro photos shifting focus millimeter by millimeter to achieve complete front-to-back macro focus depth.',
    objectives: [
      'Set macro lens to 1:1 magnification on tripod.',
      'Take photo #1 focused on nearest front edge of macro subject.',
      'Turn focus ring in micro-increments taking 10-20 sequential shots to cover full depth.'
    ],
    cameraTip: 'Use a macro focus rail slider on your tripod for smooth 1mm incremental physical camera movements.',
    softwareFocus: 'Focus Stack Merging & Alignment',
    suggestedTools: ['Photoshop Auto-Align & Auto-Blend Layers', 'Sharpening Detail'],
    gearNeeded: 'Tripod + macro focus rail + macro lens'
  },
  {
    id: 'cb_a5',
    title: 'Action Pan-Tracking at 1/15s Slow Shutter Speed',
    category: 'camera_basics',
    level: 'Advanced',
    summary: 'Pan your camera smoothly along with a speeding car or cyclist at 1/15s to blur the background into motion streaks while keeping the subject sharp.',
    objectives: [
      'Set shutter speed to 1/15s or 1/30s.',
      'Smoothly pivot your upper body along the exact speed and path of the vehicle.',
      'Press shutter while maintaining fluid panning follow-through.'
    ],
    cameraTip: 'Keep your feet planted wide and rotate from your waist like a tripod head, continuing the motion after pressing shutter.',
    softwareFocus: 'Subject Motion Contrast & Speed Sharpness',
    suggestedTools: ['Radial Masking on Subject', 'Dehaze', 'Contrast']
  },


  // ==========================================
  // TOPIC 2: EXPOSURE & TONE (15 Challenges)
  // ==========================================

  // --- BEGINNER ---
  {
    id: 'et_b1',
    title: 'Dynamic Range & Highlight Recovery',
    category: 'exposure_tone',
    level: 'Beginner',
    summary: 'Learn how to photograph high dynamic range scenes (golden hour sky or bright window) and rescue clipped highlight details without muddying midtones.',
    objectives: [
      'Expose for the highlights when taking the shot to avoid blown whites.',
      'Pull back the Highlights slider in your editor (-50 to -80).',
      'Ensure whites remain clean while recovering sky detail.'
    ],
    cameraTip: 'Use your camera’s Histogram or "Zebras" setting to verify that highlights are not fully clipped against the right edge.',
    softwareFocus: 'Highlights & Shadows Sliders',
    suggestedTools: ['Highlights Slider (-40 to -80)', 'Shadows Slider (+20 to +50)', 'Whites Point Adjustment']
  },
  {
    id: 'et_b2',
    title: 'Shadow Detail Extraction & Noise Control',
    category: 'exposure_tone',
    level: 'Beginner',
    summary: 'Recover hidden detail in dark shadow areas while keeping digital sensor noise under control.',
    objectives: [
      'Lift the Shadows slider (+30 to +60) to reveal dark area details.',
      'Apply subtle Luminance Noise Reduction (+20) if shadow noise appears.',
      'Keep true blacks solid so the image retains depth.'
    ],
    cameraTip: 'Shoot in RAW format to preserve 12-bit or 14-bit shadow dynamic range data.',
    softwareFocus: 'Shadows Slider & Noise Reduction',
    suggestedTools: ['Shadows Slider', 'Luminance Noise Reduction', 'Blacks Slider']
  },
  {
    id: 'et_b3',
    title: 'Setting White & Black Clipping Point Thresholds',
    category: 'exposure_tone',
    level: 'Beginner',
    summary: 'Learn how to set absolute white and black points so your image utilizes the full tonal spectrum from pure black to pure white.',
    objectives: [
      'Hold Alt (Windows) or Option (Mac) while dragging the Whites slider until clipping specks just appear.',
      'Hold Alt/Option while dragging Blacks slider until shadow clipping specks just appear.',
      'Verify full histogram spread.'
    ],
    cameraTip: 'Avoid relying solely on midtone contrast; proper clipping thresholds make photos pop instantly.',
    softwareFocus: 'Whites & Blacks Sliders with Clipping Overlay',
    suggestedTools: ['Alt/Option Drag Whites', 'Alt/Option Drag Blacks', 'Histogram View']
  },
  {
    id: 'et_b4',
    title: 'Global Contrast vs Clarity & Dehaze',
    category: 'exposure_tone',
    level: 'Beginner',
    summary: 'Understand the difference between overall tonal contrast and midtone local texture tools like Clarity and Dehaze.',
    objectives: [
      'Apply +15 Global Contrast.',
      'Apply +15 Clarity and observe midtone edge micro-contrast.',
      'Apply +10 Dehaze to remove atmospheric atmospheric haze in distant foliage or skies.'
    ],
    cameraTip: 'Use Dehaze sparingly (+5 to +15); excessive Dehaze can introduce dark blue color shifts in skies.',
    softwareFocus: 'Contrast, Clarity, & Dehaze Sliders',
    suggestedTools: ['Global Contrast', 'Clarity Slider', 'Dehaze Slider']
  },
  {
    id: 'et_b5',
    title: 'Exposure Compensation Dial Tuning (+/- EV)',
    category: 'exposure_tone',
    level: 'Beginner',
    summary: 'Use exposure compensation to prevent snow/white scenes from looking gray and dark scenes from blowing out.',
    objectives: [
      'Dial +1.0 EV exposure compensation when shooting snow or bright beach sand.',
      'Dial -1.0 EV exposure compensation when shooting dark moody forest foliage or black clothing.',
      'Verify correct exposure histogram distribution.'
    ],
    cameraTip: 'Camera meters default to 18% middle gray; compensation (+ EV for bright white, - EV for dark) corrects auto-metering bias.',
    softwareFocus: 'Global Exposure Compensation Adjustment',
    suggestedTools: ['Exposure Slider (+/- EV)', 'Histogram Reading']
  },

  // --- INTERMEDIATE ---
  {
    id: 'et_i1',
    title: 'The Classic S-Curve Contrast Mastery',
    category: 'exposure_tone',
    level: 'Intermediate',
    summary: 'Master the point Tone Curve by creating an anchor point in midtones, lifting upper midtones, and dipping lower midtones into an S-shape.',
    objectives: [
      'Create 3 control points on the Point Tone Curve (Shadows, Midtones, Highlights).',
      'Gentle lift at the 75% highlight point and gentle dip at the 25% shadow point.',
      'Observe smoother contrast transition compared to global contrast slider.'
    ],
    cameraTip: 'Point Tone Curve control allows non-linear contrast adjustments that preserve subtle highlight skin tones.',
    softwareFocus: 'Point Tone Curve',
    suggestedTools: ['Point Tone Curve', 'Midtone Anchor Point', 'Luma Curve']
  },
  {
    id: 'et_i2',
    title: 'Linear Gradient Masking for Dramatic Skies',
    category: 'exposure_tone',
    level: 'Intermediate',
    summary: 'Apply a top-down linear gradient mask over the sky to darken exposure, boost contrast, and enhance cloud drama without affecting the landscape ground.',
    objectives: [
      'Drag a Linear Gradient mask from sky top down to the horizon.',
      'Lower Exposure (-0.5 to -1.0) and Highlights (-30) inside the mask.',
      'Feather the gradient edge smoothly along the horizon line.'
    ],
    cameraTip: 'Align horizon straight when capturing landscapes to ensure gradient masks apply smoothly.',
    softwareFocus: 'Linear Gradient Masking',
    suggestedTools: ['Linear Gradient Mask', 'Mask Exposure', 'Feathering Control']
  },
  {
    id: 'et_i3',
    title: 'Radial Masking for Subject Vignette & Spotlight',
    category: 'exposure_tone',
    level: 'Intermediate',
    summary: 'Use inverted radial gradient masks to draw viewer attention directly to your subject with subtle lighting vignettes.',
    objectives: [
      'Draw an ellipse radial mask centered on your main subject.',
      'Invert mask selection to target the background outer area.',
      'Gently lower outer exposure by -0.3 EV and feather generously (50-70%).'
    ],
    cameraTip: 'Subtle vignettes feel completely natural and guide the human eye straight to the subject.',
    softwareFocus: 'Radial Gradient Masking & Inversion',
    suggestedTools: ['Radial Mask', 'Invert Selection', 'Feather Slider (50-70%)']
  },
  {
    id: 'et_i4',
    title: 'High-Key Studio Portrait Tone Balancing',
    category: 'exposure_tone',
    level: 'Intermediate',
    summary: 'Create a bright, luminous high-key portrait with clean whites, smooth skin tones, and rich contrast in eyes and hair.',
    objectives: [
      'Push Whites (+30) and Exposure (+0.4 EV) to create bright background.',
      'Protect skin highlight clipping by lowering Highlights (-20).',
      'Keep pupil and lash contrast rich using precise Blacks adjustment.'
    ],
    cameraTip: 'Use a large softbox or ring light close to subject for high-key soft portrait lighting.',
    softwareFocus: 'High-Key Tone Balancing',
    suggestedTools: ['Whites Lift', 'Highlights Protect', 'Blacks Anchor Point'],
    gearNeeded: 'Softbox or ring light + white backdrop'
  },
  {
    id: 'et_i5',
    title: 'Low-Key Moody Shadow Compression',
    category: 'exposure_tone',
    level: 'Intermediate',
    summary: 'Craft a dark, atmospheric low-key portrait or still life where shadows envelop the frame and light selectively highlights key contours.',
    objectives: [
      'Drop global Exposure (-0.5 to -1.0 EV).',
      'Compress Blacks (-40) to collapse background details into darkness.',
      'Selectively boost subject highlight points using local brush masks.'
    ],
    cameraTip: 'Use side rim lighting or a grid modifier on a flash to illuminate only one side of your subject’s face.',
    softwareFocus: 'Shadow Compression & Spot Masking',
    suggestedTools: ['Blacks Compression', 'Brush Masking', 'Local Exposure Boost'],
    gearNeeded: 'Single light + grid or snoot (optional)'
  },

  // --- ADVANCED ---
  {
    id: 'et_a1',
    title: 'Luminance Range Masking for Precise Highlights',
    category: 'exposure_tone',
    level: 'Advanced',
    summary: 'Use targeted Luminance Range Masks to isolate and adjust specific luminance bands (e.g. 80-100% highlights) without affecting midtones.',
    objectives: [
      'Create a Range Mask -> Luminance Mask.',
      'Set luminance range slider to isolate 85%-100% highlight values.',
      'Warm white balance tint and lower exposure only inside those peak highlights.'
    ],
    cameraTip: 'Luminance range masks prevent bright cloud edges from blowing out while keeping landscape foliage untouched.',
    softwareFocus: 'Luminance Range Masking',
    suggestedTools: ['Luminance Range Mask', 'Luminance Spectrum Slider', 'Local Temp/Tint']
  },
  {
    id: 'et_a2',
    title: '3-Frame HDR RAW Exposure Bracketing & Blend',
    category: 'exposure_tone',
    level: 'Advanced',
    summary: 'Capture 3 bracketed RAW exposures (-2 EV, 0 EV, +2 EV) on a tripod and merge into a 32-bit floating point HDR photo.',
    objectives: [
      'Set camera AEB (Auto Exposure Bracketing) to 3 frames separated by 2 EV stops.',
      'Merge bracketed RAW files into a single HDR file in post-processing.',
      'Tone map the resulting 32-bit HDR file to preserve complete shadow and highlight detail.'
    ],
    cameraTip: 'Use a tripod and remote shutter release to ensure zero pixel movement between the 3 bracketed exposures.',
    softwareFocus: 'HDR Merge & 32-Bit Tone Mapping',
    suggestedTools: ['HDR Merge Engine', 'De-ghosting Option', '32-Bit Exposure Slider'],
    gearNeeded: 'Tripod + remote shutter or self-timer'
  },
  {
    id: 'et_a3',
    title: 'Faded Black Matte Tone Curve Adjustment',
    category: 'exposure_tone',
    level: 'Advanced',
    summary: 'Raise the bottom-left origin point of the RGB Tone Curve to convert true black values into matte dark charcoal tones.',
    objectives: [
      'Open Point Tone Curve and grab the bottom-left point (0,0).',
      'Drag point straight up to (0, 10-15) on the vertical grid.',
      'Add a second point at (10, 10) to lock down lower midtone shadow contrast.'
    ],
    cameraTip: 'Faded matte blacks emulate classic 35mm film print characteristics and matte paper textures.',
    softwareFocus: 'Point Tone Curve Origin Lift',
    suggestedTools: ['Bottom-Left Point Lift', 'Matte Shadow Curve', 'Split Toning']
  },
  {
    id: 'et_a4',
    title: 'Local Frequency Separation Tonal Smoothing',
    category: 'exposure_tone',
    level: 'Advanced',
    summary: 'Separate high-frequency details (skin texture/pores) from low-frequency tones (color/shadow gradients) for high-end beauty retouching.',
    objectives: [
      'Duplicate image into High Frequency (High Pass filter) and Low Frequency (Gaussian Blur) layers.',
      'Smooth color/exposure transitions on the Low Frequency layer without blurring high-frequency skin texture.',
      'Refine tone transitions smoothly.'
    ],
    cameraTip: 'Diffused soft light sources reduce harsh specular highlights on skin, making frequency separation cleaner.',
    softwareFocus: 'Frequency Separation Layer Editing',
    suggestedTools: ['Gaussian Blur (Low Freq)', 'High Pass Filter (High Freq)', 'Clone Stamp / Mixer Brush']
  },
  {
    id: 'et_a5',
    title: 'Micro-Contrast & Sharpening Threshold Tuning',
    category: 'exposure_tone',
    level: 'Advanced',
    summary: 'Fine-tune micro-contrast, sharpening radius, and edge masking to maximize perceived lens sharpness without introducing noise artifacts.',
    objectives: [
      'Set Sharpening Amount to +50 and Radius to 0.8px.',
      'Hold Alt/Option while dragging Masking slider to 60-80% to restrict sharpening strictly to high-contrast edges.',
      'Inspect at 200% zoom.'
    ],
    cameraTip: 'Never apply global un-masked sharpening across smooth backgrounds or skies, as it sharpens background sensor noise.',
    softwareFocus: 'Detail Sharpening & Edge Masking',
    suggestedTools: ['Sharpening Amount', 'Sharpening Radius', 'Alt/Option Masking Slider']
  },


  // ==========================================
  // TOPIC 3: COLOR GRADING (15 Challenges)
  // ==========================================

  // --- BEGINNER ---
  {
    id: 'cg_b1',
    title: 'Color Cast Correction with White Balance Eyedropper',
    category: 'color_grading',
    level: 'Beginner',
    summary: 'Identify and neutralize ugly color casts (e.g. greenish fluorescent light or tungsten yellow) using neutral target sampling.',
    objectives: [
      'Select White Balance Eyedropper / Pipette tool.',
      'Click on a neutral gray or white area in your image (e.g. white shirt, gray stone).',
      'Fine-tune Temp and Tint sliders until colors feel natural.'
    ],
    cameraTip: 'Include a 18% gray card in the corner of your test shot to make one-click white balance correction foolproof.',
    softwareFocus: 'WB Eyedropper & Temp/Tint Sliders',
    suggestedTools: ['WB Pipette Eyedropper', 'Temperature Slider', 'Tint Slider']
  },
  {
    id: 'cg_b2',
    title: 'Vibrance vs Saturation Balance',
    category: 'color_grading',
    level: 'Beginner',
    summary: 'Understand the difference between global Saturation and smart Vibrance to enhance colors without turning skin tones unnaturally orange.',
    objectives: [
      'Boost Vibrance (+25) to amplify muted colors selectively.',
      'Compare against Saturation (+25) and notice how Saturation over-saturates skin tones.',
      'Keep skin tones natural while boosting landscape colors.'
    ],
    cameraTip: 'Vibrance selectively targets less-saturated hues while protecting skin orange/red channels from clipping.',
    softwareFocus: 'Vibrance & Saturation Sliders',
    suggestedTools: ['Vibrance Slider (+20 to +35)', 'Global Saturation Slider', 'HSL Orange Saturation']
  },
  {
    id: 'cg_b3',
    title: 'Autumn Foliage Color Pop with HSL Mixer',
    category: 'color_grading',
    level: 'Beginner',
    summary: 'Use the HSL (Hue, Saturation, Luminance) panel to transform dull green foliage into vibrant autumn reds, oranges, and golds.',
    objectives: [
      'HSL Hue tab: Shift Yellow hue toward Orange (-20). Shift Green hue toward Yellow (-30).',
      'HSL Luminance tab: Lift Orange luminance (+15) to make leaves glow with sunlight.',
      'Refine foliage warmth.'
    ],
    cameraTip: 'Backlit leaves glow with translucent warmth when shot facing toward the sun at golden hour.',
    softwareFocus: 'HSL Color Mixer Panel',
    suggestedTools: ['HSL Hue Sliders', 'HSL Luminance Sliders', 'Targeted Adjustment Tool']
  },
  {
    id: 'cg_b4',
    title: 'Black & White Color Channel Mix Conversion',
    category: 'color_grading',
    level: 'Beginner',
    summary: 'Convert color photos into high-contrast B&W prints by customizing individual color channel mix sliders.',
    objectives: [
      'Switch image profile to Black & White B&W Mix.',
      'Boost Red and Yellow channel sliders to brighten skin tones and warm highlights.',
      'Pull down Blue channel slider to darken blue skies into dramatic black.'
    ],
    cameraTip: 'A polarising filter outdoors darkens blue skies in-camera, enhancing B&W contrast.',
    softwareFocus: 'B&W Color Channel Mixer',
    suggestedTools: ['B&W Channel Mixer', 'Red Channel Slider (+30)', 'Blue Channel Slider (-40)']
  },
  {
    id: 'cg_b5',
    title: 'Warm Sunset White Balance Tinting',
    category: 'color_grading',
    level: 'Beginner',
    summary: 'Enhance natural golden hour sunset hues by warming color temperature and adding magenta tint.',
    objectives: [
      'Push Temperature slider higher (+500K to +1000K warmer).',
      'Add slight Magenta Tint (+5 to +10) to accentuate purple/pink sunset clouds.',
      'Verify sun highlights remain clean.'
    ],
    cameraTip: 'Shooting White Balance preset set to "Shade" or "Cloudy" adds instant warmth in-camera.',
    softwareFocus: 'Temp & Tint Color Adjustment',
    suggestedTools: ['Temperature Warmth', 'Tint Magenta Adjust', 'Vibrance']
  },

  // --- INTERMEDIATE ---
  {
    id: 'cg_i1',
    title: 'Cinematic Teal & Orange Color Grade',
    category: 'color_grading',
    level: 'Intermediate',
    summary: 'Master complementary color theory by pushing shadow tones toward cool teal/cyan and highlight midtones toward warm amber/orange.',
    objectives: [
      'Color Grading Panel: Set Shadows wheel hue to 210° (Teal/Cyan) with 15-20% saturation.',
      'Set Highlights wheel hue to 40° (Orange/Amber) with 15-20% saturation.',
      'Adjust Balance slider toward shadows to control color split intensity.'
    ],
    cameraTip: 'Teal and orange color grading relies on complementary color harmony (opposite sides of color wheel).',
    softwareFocus: 'Color Grading 3-Way Wheels',
    suggestedTools: ['Shadows Color Wheel', 'Highlights Color Wheel', 'Grading Balance Slider']
  },
  {
    id: 'cg_i2',
    title: 'Portrait Skin Tone Protection & HSL Calibration',
    category: 'color_grading',
    level: 'Intermediate',
    summary: 'Isolate skin tones in the HSL panel to fix redness, jaundice yellow casts, and uneven skin color.',
    objectives: [
      'HSL Hue tab: Shift Red hue (+5 toward orange) to eliminate facial redness.',
      'Shift Yellow hue (-10 toward orange) to fix sallow yellow casts.',
      'HSL Luminance tab: Lift Orange luminance (+10) to make skin look radiant.'
    ],
    cameraTip: 'Avoid heavy overall color saturation adjustments when photographing portraits; use targeted HSL instead.',
    softwareFocus: 'HSL Orange & Red Channel Fine Tuning',
    suggestedTools: ['HSL Red Hue', 'HSL Yellow Hue', 'HSL Orange Luminance']
  },
  {
    id: 'cg_i3',
    title: 'Selective Color Desaturation & Color Isolation',
    category: 'color_grading',
    level: 'Intermediate',
    summary: 'Desaturate distracting background color channels (like harsh greens or bright neon signs) to focus attention on subject hues.',
    objectives: [
      'HSL Saturation tab: Lower Green saturation (-50 to -80) and Blue saturation (-40).',
      'Keep Red, Orange, and Yellow saturations intact.',
      'Observe how subject pops out against muted background tones.'
    ],
    cameraTip: 'Muted background colors create an editorial fashion aesthetic in urban and environmental portraiture.',
    softwareFocus: 'HSL Selective Desaturation',
    suggestedTools: ['HSL Saturation Sliders', 'Targeted Color Picker', 'Vibrance']
  },
  {
    id: 'cg_i4',
    title: 'RGB Individual Channel Tone Curves',
    category: 'color_grading',
    level: 'Intermediate',
    summary: 'Manipulate independent Red, Green, and Blue Tone Curves to create complex color tones in shadows and highlights.',
    objectives: [
      'Select Red Channel Curve: Push upper highlights up slightly to add red warmth.',
      'Select Blue Channel Curve: Lift shadow origin point slightly to add matte blue shadows.',
      'Select Green Channel Curve: Fine tune midtone green/magenta balance.'
    ],
    cameraTip: 'RGB Channel curves offer deeper color control than standard color grading wheels.',
    softwareFocus: 'RGB Channel Tone Curves',
    suggestedTools: ['Red Curve Channel', 'Blue Curve Channel', 'Green Curve Channel']
  },
  {
    id: 'cg_i5',
    title: 'Analog Film Stock Color Profile Grading',
    category: 'color_grading',
    level: 'Intermediate',
    summary: 'Recreate vintage analog film color characteristics: warm midtones, cyan-shifted shadows, and muted primary hues.',
    objectives: [
      'Shift Green hue toward Yellow, and Blue saturation down -25%.',
      'Apply subtle warm amber tint (+10) to midtones in Color Grading.',
      'Add fine organic film grain (Amount: 25, Size: 35, Roughness: 50).'
    ],
    cameraTip: 'Vintage film stock colors feature characteristic muted blues and warm highlight roll-off.',
    softwareFocus: 'Film Tone Grading & Grain Panel',
    suggestedTools: ['Color Grading Midtones', 'HSL Muted Blues', 'Grain Panel']
  },

  // --- ADVANCED ---
  {
    id: 'cg_a1',
    title: 'Color Range Masking for Targeted Hue Adjustments',
    category: 'color_grading',
    level: 'Advanced',
    summary: 'Use advanced Color Range Masking with eyedropper sampling to isolate and change specific color objects (e.g. changing a red dress to magenta).',
    objectives: [
      'Create Mask -> Color Range Mask.',
      'Click eyedropper on target color object and adjust Refine slider to tightly select hue range.',
      'Shift Hue, Saturation, and Exposure strictly inside the isolated color mask.'
    ],
    cameraTip: 'Color range masking enables commercial product color changes without manual pen-tool selection.',
    softwareFocus: 'Color Range Masking Engine',
    suggestedTools: ['Color Range Mask Tool', 'Refine Range Slider', 'Local Hue Shift']
  },
  {
    id: 'cg_a2',
    title: 'Camera Calibration Panel Primary Shift Calibration',
    category: 'color_grading',
    level: 'Advanced',
    summary: 'Utilize the Camera Calibration panel at the root RAW level to shift Red, Green, and Blue primary hues for high-end color rendition.',
    objectives: [
      'Camera Calibration Panel: Shift Red Primary Hue (+15) and Saturation (+10).',
      'Shift Blue Primary Hue (-20) to shift cyan/teal landscape hues.',
      'Observe overall color rendering shift across entire RAW debayering.'
    ],
    cameraTip: 'Camera Calibration shifts underlying RAW sensor color primaries before standard HSL adjustments occur.',
    softwareFocus: 'Camera Calibration Panel',
    suggestedTools: ['Red Primary Hue/Sat', 'Blue Primary Hue/Sat', 'Green Primary Hue/Sat']
  },
  {
    id: 'cg_a3',
    title: 'Cross-Processing Vintage Color Grade',
    category: 'color_grading',
    level: 'Advanced',
    summary: 'Recreate 1990s cross-processing (developing C-41 color print film in E-6 slide film chemicals) featuring high-contrast green shadows and pink highlights.',
    objectives: [
      'Color Grading: Push Shadows hue to 140° (Emerald Green) with 25% saturation.',
      'Push Highlights hue to 320° (Pink/Magenta) with 20% saturation.',
      'Increase Tone Curve contrast for punchy cross-processed saturation.'
    ],
    cameraTip: 'Cross-processing creates wild, unnatural color shifts favored in alternative music and fashion photography.',
    softwareFocus: 'Cross-Process Split Toning & Curves',
    suggestedTools: ['Green Shadows Color Wheel', 'Magenta Highlights Wheel', 'Tone Curve Contrast']
  },
  {
    id: 'cg_a4',
    title: '3D Look-Up Table (LUT) Profiling & Opacity Blend',
    category: 'color_grading',
    level: 'Advanced',
    summary: 'Import professional 3D .CUBE color LUTs and blend their intensity using profile opacity sliders.',
    objectives: [
      'Import a 3D LUT profile into Profile Browser.',
      'Apply 3D LUT to image and adjust Amount / Opacity slider (30-60%).',
      'Re-balance White Balance and Contrast after applying LUT.'
    ],
    cameraTip: 'Never apply 3D LUTs at 100% opacity; dialing back to 40-60% preserves natural lighting detail.',
    softwareFocus: 'Profile Browser & 3D LUT Opacity',
    suggestedTools: ['Profile Browser', 'LUT Amount Slider', 'Post-LUT WB Tuning']
  },
  {
    id: 'cg_a5',
    title: 'Editorial Dual-Tone Color Matching',
    category: 'color_grading',
    level: 'Advanced',
    summary: 'Match the exact color grade and tonal atmosphere of a reference magazine cover or film still across a series of photos.',
    objectives: [
      'Analyze reference image color palette (Shadow hue, Midtone hue, Highlight hue).',
      'Use RGB Tone Curves and HSL panel to replicate reference color ratios.',
      'Verify color consistency across 3 separate photos shot under different light.'
    ],
    cameraTip: 'Use a reference monitor split screen when color matching shots for commercial editorial campaigns.',
    softwareFocus: 'Reference View & Dual-Tone Color Matching',
    suggestedTools: ['Reference View Split Screen', 'RGB Channel Curves', 'Color Grading Balance']
  },


  // ==========================================
  // TOPIC 4: CREATIVE STYLE (15 Challenges)
  // ==========================================

  // --- BEGINNER ---
  {
    id: 'cs_b1',
    title: 'Rule of Thirds & Leading Lines Composition',
    category: 'creative_style',
    level: 'Beginner',
    summary: 'Compose photos aligning key subjects along rule-of-thirds grid intersections while using diagonal leading lines to guide the viewer’s eye.',
    objectives: [
      'Enable Rule of Thirds grid overlay in viewfinder or crop tool.',
      'Place subject at one of the 4 grid intersection points.',
      'Use a road, path, fence, or shoreline as a leading line entering from a bottom corner.'
    ],
    cameraTip: 'Leading lines starting from lower left or right corners naturally draw human eye scanning habits into the frame.',
    softwareFocus: 'Crop Overlay & Perspective Grid',
    suggestedTools: ['Rule of Thirds Crop Overlay', 'Angle Straighten Tool', 'Vignette']
  },
  {
    id: 'cs_b2',
    title: 'Framing Within a Frame Composition',
    category: 'creative_style',
    level: 'Beginner',
    summary: 'Use foreground elements (archways, windows, tree branches, doorways) to frame your main subject inside the photograph.',
    objectives: [
      'Position camera behind a natural foreground opening (window frame, archway, foliage).',
      'Focus sharply on subject visible through the frame.',
      'Ensure the surrounding frame adds depth and context.'
    ],
    cameraTip: 'Depth is created by having distinct Foreground, Midground, and Background layers in your shot.',
    softwareFocus: 'Foreground Masking & Vignetting',
    suggestedTools: ['Radial Mask', 'Foreground Shadow Compression', 'Sharpness']
  },
  {
    id: 'cs_b3',
    title: 'High-Contrast B&W Street Photography',
    category: 'creative_style',
    level: 'Beginner',
    summary: 'Capture candid urban street moments in bold, high-contrast monochrome with deep shadows and bright sun highlights.',
    objectives: [
      'Find harsh sunlight casting deep geometric building shadows on a sidewalk.',
      'Wait for a person to walk through the bright patch of light.',
      'Convert to high-contrast B&W in post-processing.'
    ],
    cameraTip: 'Set camera picture profile to Monochrome in RAW mode to pre-visualize light patches in your electronic viewfinder.',
    softwareFocus: 'High-Contrast B&W Conversion',
    suggestedTools: ['B&W Conversion', 'Contrast +30', 'Clarity +20', 'Blacks -20']
  },
  {
    id: 'cs_b4',
    title: 'Symmetrical Architecture & Geometry Alignment',
    category: 'creative_style',
    level: 'Beginner',
    summary: 'Align architectural structures in perfect 50/50 central symmetry using line straightening and perspective geometry controls.',
    objectives: [
      'Stand in exact center of building hallway, facade, or staircase.',
      'Level camera horizontally and vertically.',
      'Use Geometry / Upright tool in software to fix vertical perspective distortion.'
    ],
    cameraTip: 'Use built-in electronic level indicator in your viewfinder to prevent tilted horizons.',
    softwareFocus: 'Geometry & Perspective Upright Tool',
    suggestedTools: ['Guided Upright Geometry', 'Vertical Perspective Tool', 'Aspect Ratio Crop']
  },
  {
    id: 'cs_b5',
    title: 'Golden Hour Backlit Lens Flare Portrait',
    category: 'creative_style',
    level: 'Beginner',
    summary: 'Position the setting sun right at the edge of your subject’s head or lens element to capture warm golden flare light streaks.',
    objectives: [
      'Shoot 30 minutes before sunset with sun directly behind subject.',
      'Let sun partially clip edge of lens to create golden flare haze.',
      'Enhance warm glow in post-processing.'
    ],
    cameraTip: 'Remove lens hood when you intentionally want warm artistic lens flare in your image.',
    softwareFocus: 'Warm Light Leak Radial Masking',
    suggestedTools: ['Radial Gradient Sun Flare', 'Warm Temp Tint', 'Dehaze (-10)']
  },

  // --- INTERMEDIATE ---
  {
    id: 'cs_i1',
    title: 'Kodak Portra 400 Film Emulation & Grain',
    category: 'creative_style',
    level: 'Intermediate',
    summary: 'Recreate the iconic look of Kodak Portra 400: warm natural skin tones, pastel cyan skies, matte shadows, and fine film grain.',
    objectives: [
      'Lift Blacks origin point on Tone Curve to create matte shadow feel.',
      'Shift Yellows/Greens toward warm pastel in HSL panel.',
      'Add Film Grain (Amount 25, Size 30, Roughness 40).'
    ],
    cameraTip: 'Kodak Portra 400 is famous for forgiving highlight latitude and pleasing warm skin tone rendering.',
    softwareFocus: 'Portra Film Emulation & Grain Panel',
    suggestedTools: ['Matte Shadow Tone Curve', 'HSL Muted Colors', 'Grain Panel']
  },
  {
    id: 'cs_i2',
    title: 'Dark Moody Botanical & Still Life Art',
    category: 'creative_style',
    level: 'Intermediate',
    summary: 'Craft a moody, painterly Dutch-master style still life photograph featuring deep shadows, rich greens, and dramatic side lighting.',
    objectives: [
      'Light floral or botanical subject from side window with dark backdrop.',
      'Lower Exposure (-0.5 EV) and compress Blacks (-35).',
      'Boost Texture and Color Vibrance on botanical blooms.'
    ],
    cameraTip: 'Place a black posterboard behind your subject to absorb spill light and create pure dark backgrounds.',
    softwareFocus: 'Moody Dark Tone Curve & Vibrance',
    suggestedTools: ['Blacks Compression', 'Brush Spotlight Mask', 'Texture Lift']
  },
  {
    id: 'cs_i3',
    title: 'Commercial Product Lighting & Clean Edits',
    category: 'creative_style',
    level: 'Intermediate',
    summary: 'Photograph a commercial product (watch, perfume bottle, shoes) with clean reflections, crisp micro-details, and neutral white background.',
    objectives: [
      'Use 2 light sources with diffusers to create clean rim light highlights on product edges.',
      'Use Spot Removal tool to clean every speck of dust.',
      'Apply crisp edge sharpening and white balance accuracy.'
    ],
    cameraTip: 'Wipe down products with a microfiber cloth before shooting; dust specks double editing cleanup time.',
    softwareFocus: 'Spot Removal & Dust Cleanup',
    suggestedTools: ['Spot Removal / Healing Brush', 'Whites Adjustment', 'Sharpening Radius'],
    gearNeeded: 'Diffuser (or bedsheet/shower curtain)'
  },
  {
    id: 'cs_i4',
    title: 'Cinematic Urban Night Cityscape (Neon & Rain)',
    category: 'creative_style',
    level: 'Intermediate',
    summary: 'Photograph rain-slicked city streets at night capturing vibrant neon light reflections on wet pavement.',
    objectives: [
      'Shoot right after rain in downtown neon-lit district.',
      'Expose to keep neon signs from blowing out to white.',
      'Boost Magenta/Cyan HSL luminance to make street wet reflections glow.'
    ],
    cameraTip: 'Wet asphalt acts like a mirror, reflecting neon signs and car taillights into long vibrant streaks.',
    softwareFocus: 'Neon HSL Luminance & Contrast',
    suggestedTools: ['HSL Blue/Magenta Luminance', 'Dehaze +15', 'Clarity']
  },
  {
    id: 'cs_i5',
    title: 'Minimalist Negative Space Landscape',
    category: 'creative_style',
    level: 'Intermediate',
    summary: 'Compose landscape shots dominated by vast negative space (empty sky, calm water, snow fields) with a tiny solitary subject.',
    objectives: [
      'Position solitary subject (lonely tree, person, cabin) occupying less than 10% of frame.',
      'Fill remaining 90% of frame with smooth minimalist negative space.',
      'Ensure Horizon line is perfectly level.'
    ],
    cameraTip: 'Negative space creates feelings of solitude, quietness, and grand scale in fine-art prints.',
    softwareFocus: 'Minimalist Tonal Uniformity & Crop',
    suggestedTools: ['Horizon Straighten', 'Linear Gradient Sky Smoothing', 'Crop 16:9 or 1:1']
  },

  // --- ADVANCED ---
  {
    id: 'cs_a1',
    title: 'Surreal Fine-Art Double Exposure Composite',
    category: 'creative_style',
    level: 'Advanced',
    summary: 'Blend a high-contrast silhouette portrait with a dense forest or architectural texture using layer blend modes in post.',
    objectives: [
      'Base Layer: High-contrast profile silhouette portrait.',
      'Texture Layer: Dense forest canopy or geometric building skyscrapers.',
      'Set Texture layer blend mode to Screen or Lighten and mask edges smoothly.'
    ],
    cameraTip: 'Overexpose the background of your silhouette shot to pure white so the blend mode isolates the portrait subject cleanly.',
    softwareFocus: 'Layer Blend Modes & Masking',
    suggestedTools: ['Screen / Lighten Blend Modes', 'Layer Masking Brush', 'Opacity Tuning']
  },
  {
    id: 'cs_a2',
    title: 'Medium Format 120 Roll Film Look (Square 1:1 Aspect)',
    category: 'creative_style',
    level: 'Advanced',
    summary: 'Emulate 6x6 Hasselblad medium format roll film: square 1:1 aspect ratio, smooth tonal gradations, and subtle corner light falloff.',
    objectives: [
      'Crop image to 1:1 Square Aspect Ratio.',
      'Apply smooth S-Curve with lifted matte shadows.',
      'Apply custom Vignette (Amount -15, Midpoint 40, Feather 80) to simulate vintage medium format lens light falloff.'
    ],
    cameraTip: 'Pre-visualize composition in 1:1 square crop grid in camera; square framing requires central weight balance.',
    softwareFocus: 'Square Crop & Vintage Vignetting',
    suggestedTools: ['1:1 Square Crop', 'Custom Lens Vignetting', 'Soft Film Grain']
  },
  {
    id: 'cs_a3',
    title: 'Architectural Perspective Correction & Keylining',
    category: 'creative_style',
    level: 'Advanced',
    summary: 'Eliminate converging vertical lines in tall building architecture photos to make all structure walls 100% perpendicular.',
    objectives: [
      'Open Geometry / Transform Panel.',
      'Use Guided Upright lines to draw 2 vertical guides along building edges.',
      'Adjust Scale and Offsets to fill canvas frame without cropping key structures.'
    ],
    cameraTip: 'Keep camera completely level on tripod when shooting tall buildings to minimize keystoning vertical distortion.',
    softwareFocus: 'Guided Upright Geometry Correction',
    suggestedTools: ['Guided Upright Tools', 'Vertical / Horizontal Sliders', 'Constrain Crop'],
    gearNeeded: 'Tripod (tilt-shift lens optional)'
  },
  {
    id: 'cs_a4',
    title: 'Cinematic 2.39:1 Cinemascope Aspect & Color Pass',
    category: 'creative_style',
    level: 'Advanced',
    summary: 'Transform a photo into a widescreen movie still with 2.39:1 letterbox cropping, anamorphic flare highlights, and cinematic color grade.',
    objectives: [
      'Crop image to widescreen 2.39:1 Cinemascope aspect ratio.',
      'Color Grade shadows teal (215°) and highlights amber (35°).',
      'Add horizontal streak flare or anamorphic glow in post.'
    ],
    cameraTip: 'Compose action across wide horizontal orientation keeping key subjects within center letterbox band.',
    softwareFocus: 'Cinemascope Widescreen Crop & Color Grade',
    suggestedTools: ['2.39:1 Widescreen Crop', 'Color Grading Wheels', 'Linear Gradient Sky/Ground Bars']
  },
  {
    id: 'cs_a5',
    title: 'High-Fashion Editorial Beauty Skin Retouching',
    category: 'creative_style',
    level: 'Advanced',
    summary: 'Perform magazine-ready beauty retouching using Non-Destructive Dodge & Burn and Frequency Separation while retaining 100% natural skin pore texture.',
    objectives: [
      'Apply Dodge & Burn on 50% Gray Neutral layer to carve facial cheekbone light and shadow contours.',
      'Fix blotchy skin discoloration using Low Frequency blur layer.',
      'Preserve razor-sharp eye and lip detail.'
    ],
    cameraTip: 'Use a beauty dish or soft optical modifier for flattering specular highlights on skin.',
    softwareFocus: 'Dodge & Burn & Frequency Separation',
    suggestedTools: ['Dodge Tool (Midtones)', 'Burn Tool (Shadows)', 'Frequency Separation Layers']
  },

  // ==========================================
  // TOPIC 5: ASTROPHOTOGRAPHY & NIGHT SKY (9 Challenges)
  // ==========================================
  {
    id: 'astro_b1',
    title: 'The 500 Rule & Sharp Night Star Focus',
    category: 'astrophotography',
    level: 'Beginner',
    summary: 'Calculate maximum star exposure time without trailing and achieve tack-sharp focus on distant stars using Live View magnification.',
    objectives: [
      'Calculate exposure limit using 500 / Focal Length (e.g. 500 / 24mm = 20 seconds max).',
      'Set lens to Manual Focus, zoom in 10x on a bright star in Live View, and adjust focus until the star is a pinpoint dot.',
      'Shoot at f/1.8 - f/2.8, ISO 1600-3200, 15-20s exposure.'
    ],
    cameraTip: 'Always use a sturdy tripod and a 2-second shutter delay to avoid camera shake when taking night sky exposures.',
    softwareFocus: 'Pinpoint Star Sharpening & Sky Noise Reduction',
    suggestedTools: ['100% Zoom Inspection', 'Sharpening Masking', 'Luminance Noise Reduction'],
    gearNeeded: 'Tripod (required for sharp stars)'
  },
  {
    id: 'astro_b2',
    title: 'Foreground Light Painting with Handheld Flashlight',
    category: 'astrophotography',
    level: 'Beginner',
    summary: 'Paint dark foreground landscapes, trees, or rocks with a subtle sweep of handheld flashlight illumination during a long exposure.',
    objectives: [
      'Set a 20-second night exposure on tripod.',
      'During seconds 5-8 of the exposure, sweep a soft warm flashlight over foreground rocks or trees.',
      'Keep the light moving constantly to prevent harsh hotspot highlights.'
    ],
    cameraTip: 'Use a warm-toned flashlight or diffuse the beam with a tissue paper to create soft, natural illumination on rocks.',
    softwareFocus: 'Foreground Shadow Balance & Highlight Softening',
    suggestedTools: ['Shadows Slider', 'Linear Gradient on Ground', 'White Balance Warmth'],
    gearNeeded: 'Tripod + handheld flashlight or headlamp'
  },
  {
    id: 'astro_b3',
    title: 'Exposing the Moon Without Blowing Out Detail',
    category: 'astrophotography',
    level: 'Beginner',
    summary: 'Photograph a crisp, detailed Moon instead of an overexposed white blob by treating it as a sunlit daytime subject, not a dark-sky one.',
    objectives: [
      'Switch to full Manual mode and ignore your camera\'s night-sky meter reading.',
      'Start near the "Looney 11" rule: f/11, ISO 100, shutter 1/100s, then fine-tune with the histogram.',
      'Use your longest zoom or telephoto lens so the Moon fills a meaningful portion of the frame.'
    ],
    cameraTip: 'The Moon is a sunlit object in full daylight brightness — meter for it like a bright daytime scene, not like the dark night sky around it.',
    softwareFocus: 'Lunar Crater Detail & Micro-Contrast',
    suggestedTools: ['Clarity +20', 'Texture +15', 'Highlight Recovery'],
    gearNeeded: 'Telephoto lens (200mm+) or spotting scope'
  },
  {
    id: 'astro_i1',
    title: 'Milky Way Core RAW Exposure & Tone Recovery',
    category: 'astrophotography',
    level: 'Intermediate',
    summary: 'Process a RAW night sky image to make the dust lanes and stars of the Milky Way core pop vividly against dark space.',
    objectives: [
      'Apply a Radial Mask over the galactic core.',
      'Boost Contrast (+15), Dehaze (+10), and Clarity (+15) inside the core mask.',
      'Adjust Sky Tint toward subtle Deep Blue / Violet to counteract urban light pollution glow.'
    ],
    cameraTip: 'Shoot during a New Moon phase away from city lights for maximum galactic core contrast.',
    softwareFocus: 'Galactic Core Contrast & Color Grading',
    suggestedTools: ['Radial Mask on Milky Way Core', 'Dehaze +10', 'Temperature / Tint Sliders']
  },
  {
    id: 'astro_i2',
    title: 'Constellation Pop & Star Softening Mask',
    category: 'astrophotography',
    level: 'Intermediate',
    summary: 'Highlight major constellations (Orion, Ursa Major) by softening tiny background pinpoint stars while boosting major star saturation.',
    objectives: [
      'Create a luminance mask targeting tiny background noise stars.',
      'Apply subtle Clarity (-10) to background stars so major constellations stand out clearly.',
      'Enhance individual star colors (Orange Betelgeuse, Blue Rigel) using targeted Saturation.'
    ],
    cameraTip: 'A soft diffuse filter (like a Kenko Foggy filter) placed in front of your lens naturally enlarges bright star disks.',
    softwareFocus: 'Star Saturation & Selective Star Masking',
    suggestedTools: ['Luminance Range Mask', 'Clarity Reduction', 'Selective Saturation Brush']
  },
  {
    id: 'astro_i3',
    title: 'Star Trails via Stacked Sequence Exposures',
    category: 'astrophotography',
    level: 'Intermediate',
    summary: 'Capture a long sequence of shorter exposures and blend them with a Lighten stacking mode to draw circular or linear star trails without one risky multi-hour exposure.',
    objectives: [
      'Set an intervalometer to fire 60-120 consecutive frames at 20-30 seconds each, back-to-back with no gap.',
      'Keep aperture, ISO, and white balance locked identically across every frame.',
      'Stack all frames in StarStaX or Photoshop using "Lighten" blend mode so only the brightest pixel per position (the star trail) survives.'
    ],
    cameraTip: 'Point toward Polaris (in the Northern Hemisphere) for circular trails, or toward the celestial equator for long sweeping diagonal trails.',
    softwareFocus: 'Lighten-Mode Sequence Stacking',
    suggestedTools: ['Lighten Blend Mode', 'Batch Auto-Align', 'Gap-Filling Interpolation'],
    gearNeeded: 'Tripod + intervalometer'
  },
  {
    id: 'astro_a1',
    title: 'Multi-Shot Star Stacking for Zero-Noise Sky',
    category: 'astrophotography',
    level: 'Advanced',
    summary: 'Capture 15-20 identical sequential exposures and stack them in post to dramatically reduce digital sensor grain and noise.',
    objectives: [
      'Set intervalometer to take 15 consecutive 15-second light frames.',
      'Stack frames in Sequator, Starry Landscape Stacker, or Photoshop Median Blend.',
      'Compare single frame noise vs stacked frame silky-smooth sky.'
    ],
    cameraTip: 'Turn off In-Camera Long Exposure Noise Reduction so your camera takes consecutive frames without waiting between shots.',
    softwareFocus: 'Median Frame Stacking & Noise Reduction',
    suggestedTools: ['Convert to Smart Object', 'Stack Mode -> Median', 'Dehaze & Texture Boost'],
    gearNeeded: 'Tripod + intervalometer'
  },
  {
    id: 'astro_a2',
    title: 'Blue Hour Landscape & Deep Sky Mosaic Blend',
    category: 'astrophotography',
    level: 'Advanced',
    summary: 'Combine a tack-sharp, low-ISO foreground exposure taken during twilight (Blue Hour) with a night sky astro exposure.',
    objectives: [
      'Shoot foreground landscape at ISO 100, f/8 during late twilight.',
      'Keep tripod locked in place and shoot night sky at ISO 3200 2 hours later.',
      'Blend both exposures in Photoshop using a smooth horizon sky mask.'
    ],
    cameraTip: 'Never move your tripod between the twilight ground shot and night sky shot to ensure perfect horizon alignment.',
    softwareFocus: 'Horizon Masking & Exposure Blending',
    suggestedTools: ['Select Sky Mask', 'Layer Masking & Brush', 'Color Temperature Match'],
    gearNeeded: 'Tripod'
  },
  {
    id: 'astro_a3',
    title: 'Star Tracker Polar Alignment for Extended Exposures',
    category: 'astrophotography',
    level: 'Advanced',
    summary: 'Use a motorized star tracker to counter Earth\'s rotation, allowing exposures far longer than the 500 Rule allows while keeping stars as pinpoints.',
    objectives: [
      'Polar-align the tracker\'s axis to true celestial north/south using its polar scope or an alignment app.',
      'Mount the camera on the tracker and shoot a 2-4 minute exposure at ISO 400-800 — far longer than a static tripod could manage.',
      'Shoot a separate untracked foreground exposure at the same framing and blend the two, since the tracked sky exposure will blur the ground.'
    ],
    cameraTip: 'Re-check polar alignment every 20-30 minutes; even a fast tracker drifts enough over time to soften pinpoint stars on exposures this long.',
    softwareFocus: 'Tracked Sky & Static Foreground Blend',
    suggestedTools: ['Layer Masking', 'Horizon Blend Mask', 'Noise Reduction (Low ISO Advantage)'],
    gearNeeded: 'Tripod + star tracker (e.g. Star Adventurer)'
  },

  // ==========================================
  // TOPIC 6: HDR & PANORAMIC STITCHING (9 Challenges)
  // ==========================================
  {
    id: 'hdr_b1',
    title: 'Auto Exposure Bracketing (AEB) 3-Shot Setup',
    category: 'hdr_panoramas',
    level: 'Beginner',
    summary: 'Configure camera Auto Exposure Bracketing to automatically capture a sequence of 3 shots (-2 EV, 0 EV, +2 EV) for high-contrast scenes.',
    objectives: [
      'Enable AEB in camera drive mode menu set to 2.0 EV spacing.',
      'Set camera to high burst mode so holding shutter takes all 3 frames automatically.',
      'Verify dark frame preserves highlights and bright frame preserves shadow detail.'
    ],
    cameraTip: 'AEB guarantees you capture full dynamic range in bright sunsets or backlit window scenes.',
    softwareFocus: 'HDR Preview & Exposure Checking',
    suggestedTools: ['Grid View Comparison', 'Histogram Clipping Check', 'Auto Alignment']
  },
  {
    id: 'hdr_b2',
    title: 'Multi-Shot Handheld Panorama Sweep',
    category: 'hdr_panoramas',
    level: 'Beginner',
    summary: 'Capture a 5-shot vertical frame panorama sweep across a wide landscape or cityscape with 30% frame overlap.',
    objectives: [
      'Turn camera vertically (portrait orientation) to capture taller vertical view.',
      'Lock Manual Exposure and Manual White Balance.',
      'Pivoting from your body, take 5 overlapping frames with 30-40% overlap between shots.'
    ],
    cameraTip: 'Locking Manual Exposure prevents brightness jumps between adjacent panoramic frames.',
    softwareFocus: 'Photomerge Panorama Stitching',
    suggestedTools: ['Photo Merge -> Panorama', 'Perspective / Cylindrical Projection', 'Auto Crop']
  },
  {
    id: 'hdr_b3',
    title: 'Ghost-Free HDR for Scenes with Movement',
    category: 'hdr_panoramas',
    level: 'Beginner',
    summary: 'Merge a bracketed sequence cleanly when people, water, or clouds moved between frames, avoiding the transparent "ghosting" artifacts that ruin beginner HDR attempts.',
    objectives: [
      'Shoot your bracketed set as fast as possible in burst mode to minimize the time between frames.',
      'Choose one bracket exposure as your De-ghost "base frame" — usually the mid exposure — so software knows which version of moving elements to keep.',
      'Enable De-ghosting / Alignment at Medium or High strength during the HDR merge and inspect edges of moving subjects for double outlines.'
    ],
    cameraTip: 'If a subject is moving quickly (people walking, cars), consider manually masking that one region from a single well-exposed frame instead of relying on automatic de-ghosting.',
    softwareFocus: 'De-ghosting & Merge Artifact Cleanup',
    suggestedTools: ['De-ghosting (High)', 'Spot Healing on Ghost Edges', 'Base Frame Selection']
  },
  {
    id: 'hdr_i1',
    title: '32-Bit Natural RAW HDR Merging',
    category: 'hdr_panoramas',
    level: 'Intermediate',
    summary: 'Merge bracketed RAW files into a 32-bit floating point DNG file to edit full dynamic range cleanly without fake HDR artifacts.',
    objectives: [
      'Select 3 bracketed RAW exposures (-2, 0, +2 EV).',
      'Execute Lightroom / Camera RAW "Photo Merge -> HDR".',
      'Use Shadows (+40) and Highlights (-50) on the merged 32-bit DNG to recover full tonal range.'
    ],
    cameraTip: 'Check "De-ghosting" in software if clouds or foliage moved between your bracketed exposures.',
    softwareFocus: '32-Bit DNG Dynamic Range Recovery',
    suggestedTools: ['HDR Merge (Ctrl+H)', 'De-ghosting Medium', 'Highlights & Shadows Fine Tuning']
  },
  {
    id: 'hdr_i2',
    title: 'Multi-Row Nodal Point Landscape Stitch',
    category: 'hdr_panoramas',
    level: 'Intermediate',
    summary: 'Shoot a 2-row x 4-column 8-shot panorama grid to create a ultra-high resolution 80+ megapixel landscape image.',
    objectives: [
      'Set tripod level and sweep row 1 (bottom foreground) with 30% overlap.',
      'Tilt camera head up and sweep row 2 (sky and mountains).',
      'Stitch multi-row grid into a high-res master panorama.'
    ],
    cameraTip: 'Use a lens focal length between 35mm and 85mm to avoid heavy edge distortion during panoramic stitching.',
    softwareFocus: 'Multi-Row Boundary Warp & De-ghosting',
    suggestedTools: ['Boundary Warp Slider', 'Fill Edges Feature', '100% Crop Detail Inspection'],
    gearNeeded: 'Tripod + panoramic/nodal-slide head'
  },
  {
    id: 'hdr_i3',
    title: 'Natural-Looking HDR: Taming the "HDR Look"',
    category: 'hdr_panoramas',
    level: 'Intermediate',
    summary: 'Merge a bracketed exposure and then deliberately pull the tone-mapping back so the result reads as a well-exposed photo, not an over-processed halo-heavy HDR image.',
    objectives: [
      'Merge your bracketed set, then reduce the merged file\'s Tone Mapping / Detail strength before any other edits.',
      'Blend the tone-mapped HDR layer at 40-70% opacity over your best single exposure to reintroduce natural contrast.',
      'Check high-contrast edges (rooflines against sky, window frames) for glowing halos and locally reduce Clarity/Dehaze there.'
    ],
    cameraTip: 'If you can see a halo around a high-contrast edge at normal viewing size, it will look far worse printed — always zoom to 100% on edges before calling an HDR blend finished.',
    softwareFocus: 'Tone-Map Restraint & Halo Control',
    suggestedTools: ['Opacity Blend (40-70%)', 'Local Dehaze Reduction', 'Edge Halo Inspection']
  },
  {
    id: 'hdr_a1',
    title: 'Manual Luminance Mask Exposure Blending',
    category: 'hdr_panoramas',
    level: 'Advanced',
    summary: 'Hand-blend bright sky exposure into shadow ground exposure using Photoshop Luminosity Masks for total natural control.',
    objectives: [
      'Open bright ground exposure and dark sky exposure as Photoshop layers.',
      'Generate a "Lights 1" Luminosity Selection targeting bright sky regions.',
      'Apply selection as layer mask to smoothly paint in dark sky details without halo outlines.'
    ],
    cameraTip: 'Manual luminosity blending avoids the soft contrast compression that automated HDR algorithms sometimes produce.',
    softwareFocus: 'Luminosity Mask Generation & Painting',
    suggestedTools: ['TK / Luminosity Channels', 'Layer Masking', 'Soft Feather Brush (20% Opacity)']
  },
  {
    id: 'hdr_a2',
    title: '360-Degree Spherical Equirectangular Panorama',
    category: 'hdr_panoramas',
    level: 'Advanced',
    summary: 'Capture a full 360° x 180° spherical panorama grid including zenith (sky/ceiling) and nadir (ground/tripod footprint).',
    objectives: [
      'Capture 6 horizontal shots at 60° increments, 3 up, 3 down, plus 1 nadir tripod replacement shot.',
      'Stitch in PTGui or Lightroom into equirectangular 2:1 format.',
      'Patch nadir tripod footprint with Photoshop Content-Aware Fill.'
    ],
    cameraTip: 'Align camera lens optical nodal point over tripod pivot center to eliminate parallax error on close objects.',
    softwareFocus: 'Equirectangular Projection & Nadir Patching',
    suggestedTools: ['Equirectangular Projection', 'Content-Aware Fill', 'Nadir Patch Layer'],
    gearNeeded: 'Tripod + panoramic head (nodal rail recommended)'
  },
  {
    id: 'hdr_a3',
    title: 'Combined Focus-Stacked HDR Panorama',
    category: 'hdr_panoramas',
    level: 'Advanced',
    summary: 'Merge exposure bracketing and focus stacking across a multi-row panorama so a scene with both extreme dynamic range and a near-to-far foreground stays sharp and fully toned edge to edge.',
    objectives: [
      'At each panorama position, capture a full exposure bracket AND a focus-stacked sequence (near, mid, far focus points).',
      'HDR-merge each position\'s bracket first, producing one fully-toned, all-in-focus frame per position via focus stacking on the merged files.',
      'Stitch the resulting per-position master frames into the final panorama.'
    ],
    cameraTip: 'Lock white balance and aperture across the entire shoot — any drift between positions becomes very obvious once both exposure and focus are being blended at every point.',
    softwareFocus: 'Layered Multi-Row HDR + Focus Stack Merge',
    suggestedTools: ['Per-Position HDR Merge', 'Auto-Blend Focus Stack', 'Multi-Row Panorama Stitch']
  },

  // ==========================================
  // TOPIC 7: MACRO & FOCUS STACKING (9 Challenges)
  // ==========================================
  {
    id: 'macro_b1',
    title: 'Macro Extension Tube & Minimum Focal Distance',
    category: 'macro_stacking',
    level: 'Beginner',
    summary: 'Attach an extension tube to your lens to reduce minimum focus distance and achieve 1:1 macro magnification of small subjects.',
    objectives: [
      'Attach a 12mm or 25mm extension tube between camera body and prime lens.',
      'Move camera physically closer to subject (2-4 inches away) until subject fills frame.',
      'Observe paper-thin depth of field and practice focusing by physically leaning forward/backward.'
    ],
    cameraTip: 'Autofocus often hunts in macro distance; switch to Manual Focus and adjust focus by physically moving camera distance.',
    softwareFocus: 'Micro-Contrast & Fine Detail Sharpening',
    suggestedTools: ['Clarity +20', 'Texture +15', 'Sharpening Radius & Detail Sliders'],
    gearNeeded: 'Extension tube(s) (~$20-40)'
  },
  {
    id: 'macro_b2',
    title: 'Water Drop & Refraction Photography',
    category: 'macro_stacking',
    level: 'Beginner',
    summary: 'Capture a water drop suspended on a flower petal or leaf, refracting a colorful background pattern inside the droplet.',
    objectives: [
      'Place a flower or colorful background 3 inches behind a water droplet.',
      'Focus precisely on the front surface of the droplet where the refracted background appears inverted.',
      'Shoot at f/5.6 - f/8 for sharp droplet clarity.'
    ],
    cameraTip: 'Use a spray bottle with water mixed with a drop of glycerin for durable round droplets that stay in place.',
    softwareFocus: 'Vibrance & Droplet Highlight Enhancement',
    suggestedTools: ['Vibrance Boost', 'Radial Mask on Droplet', 'Highlight Specular Enhancement']
  },
  {
    id: 'macro_b3',
    title: 'Reversed-Lens Macro Photography on a Budget',
    category: 'macro_stacking',
    level: 'Beginner',
    summary: 'Reverse-mount a cheap 50mm prime lens using a reversal ring to achieve dramatic macro magnification without buying a dedicated macro lens.',
    objectives: [
      'Attach a reversal ring (body-mount side to your camera, filter-thread side to the lens) and mount the lens backward.',
      'Set the reversed lens to its widest aperture by hand before mounting, since electronic aperture control is usually lost when reversed.',
      'Move your whole body forward and back to find focus instead of using the focus ring, which has very limited effect reversed.'
    ],
    cameraTip: 'A cheap 50mm f/1.8 "nifty fifty" gives the strongest reversed-macro magnification and is the classic budget choice for this technique.',
    softwareFocus: 'Vignette Cleanup & Edge Softness Correction',
    suggestedTools: ['Vignette Removal', 'Edge Sharpening', 'Crop to Center Sharp Zone'],
    gearNeeded: 'Reversal ring (~$10) + manual lens'
  },
  {
    id: 'macro_i1',
    title: 'Focus Rail Micro-Adjustments & Focal Plane Alignment',
    category: 'macro_stacking',
    level: 'Intermediate',
    summary: 'Mount camera on a geared focus rail to make precise 1mm incremental steps across a macro subject’s focal plane.',
    objectives: [
      'Mount camera on a focus rail mounted on a tripod.',
      'Set aperture to sweet spot (f/5.6 or f/8).',
      'Turn focus rail knob 1mm between each shot, taking 5-8 overlapping focal slices.'
    ],
    cameraTip: 'Shooting at f/5.6 or f/8 avoids lens diffraction softening while focus stacking provides full depth sharpness.',
    softwareFocus: 'Focal Slice Alignment & Layer Merging',
    suggestedTools: ['Auto-Align Layers', 'Auto-Blend Layers (Stack Images)', 'Crop Edges'],
    gearNeeded: 'Tripod + macro focus rail'
  },
  {
    id: 'macro_i2',
    title: 'Insect Eye & Botanical Texture Isolation',
    category: 'macro_stacking',
    level: 'Intermediate',
    summary: 'Isolate intricate compound insect eyes or botanical leaf vein textures with specialized lighting and tight macro framing.',
    objectives: [
      'Use a LED ring light or diffused speedlight flash bracket for shadowless macro lighting.',
      'Capture intricate compound eye facets or leaf stomata structure.',
      'Boost Local Texture and Clarity inside macro subject mask.'
    ],
    cameraTip: 'Diffusion is critical in macro flash photography—use a white card diffuser to avoid harsh specular glares.',
    softwareFocus: 'Selective Texture & Micro-Contrast Enhancement',
    suggestedTools: ['Texture Slider', 'Clarity Brush', 'Targeted Contrast Curve'],
    gearNeeded: 'Ring light or speedlight + diffuser'
  },
  {
    id: 'macro_i3',
    title: 'Diffused Ring Light for Handheld Macro',
    category: 'macro_stacking',
    level: 'Intermediate',
    summary: 'Use a diffused ring flash or LED ring light to light close-up subjects evenly and freeze motion for handheld macro shooting without a tripod or focus rail.',
    objectives: [
      'Mount a ring light or ring flash on the front of the lens and set it to a soft, even diffused output.',
      'Shoot at a narrower aperture (f/11-f/16) for extra depth of field, relying on the flash — not ambient light — for exposure.',
      'Angle the diffuser slightly or use a two-zone ring flash to avoid a completely flat, shadowless look.'
    ],
    cameraTip: 'A ring light lets you shoot handheld macro of skittish subjects like insects, where a tripod and focus rail would be too slow to react.',
    softwareFocus: 'Catchlight & Shadow Balance',
    suggestedTools: ['Highlight Recovery on Ring Catchlight', 'Local Shadow Boost', 'Clarity +15'],
    gearNeeded: 'Macro ring light/flash + diffuser'
  },
  {
    id: 'macro_a1',
    title: '20-Shot Focus Stacking & Depth Merging',
    category: 'macro_stacking',
    level: 'Advanced',
    summary: 'Capture and combine a series of 20-30 incremental focal slices to produce an ultra-sharp macro photograph with front-to-back depth of field.',
    objectives: [
      'Take 20 sequential focus steps from tip of subject to rear edge.',
      'Import into Photoshop: "Edit -> Auto-Align Layers" then "Edit -> Auto-Blend Layers (Stack Images)".',
      'Inspect merged layer masks to clean up any ghosting artifacts.'
    ],
    cameraTip: 'Keep subject completely static indoors—any air draft or movement will ruin focus stack alignment.',
    softwareFocus: 'Focus Stack Blend Mask Cleaning',
    suggestedTools: ['Photoshop Auto-Blend Layers', 'Layer Mask Editing', 'Clone Stamp Artifact Clean']
  },
  {
    id: 'macro_a2',
    title: 'Extreme High-Magnification Micro-Contrast Grading',
    category: 'macro_stacking',
    level: 'Advanced',
    summary: 'Process extreme 3x-5x macro magnification images (e.g. butterfly wing scales or crystal formations) with specialized micro-contrast grading.',
    objectives: [
      'Apply High Pass filter sharpening on 2px radius overlay layer.',
      'Fine-tune micro-contrast curves to separate subtle tonal steps in tiny textures.',
      'Remove dust spots caused by tiny sensor particles visible at extreme magnification.'
    ],
    cameraTip: 'At 3x-5x magnification, even camera shutter shock causes blur—use Electronic Shutter (Silent Shooting).',
    softwareFocus: 'High Pass Sharpening & Micro-Contrast',
    suggestedTools: ['High Pass Filter (Soft Light)', 'Micro-Contrast Curve', 'Spot Healing Brush']
  },
  {
    id: 'macro_a3',
    title: 'Focus Stacking Live, Moving Macro Subjects',
    category: 'macro_stacking',
    level: 'Advanced',
    summary: 'Focus stack a subject that will not hold still — an insect, a wind-blown flower — using a fast handheld burst and software auto-alignment instead of a controlled focus rail.',
    objectives: [
      'Shoot a fast continuous burst (8-10+ fps) while gently rocking forward and back through the focal plane by hand.',
      'Select only the frames where the subject held roughly the same pose, discarding frames where it moved between shots.',
      'Auto-Align Layers before Auto-Blend to correct for the handheld position drift that a focus rail would normally prevent.'
    ],
    cameraTip: 'A faster shutter speed and a bit more flash power (to allow a narrower aperture) both help freeze subtle subject movement between burst frames.',
    softwareFocus: 'Handheld Stack Alignment & Ghost Removal',
    suggestedTools: ['Auto-Align Layers', 'Auto-Blend Layers', 'Manual Mask Cleanup on Mismatched Frames']
  },

  // ==========================================
  // TOPIC 8: OFF-CAMERA FLASH & STUDIO LIGHTING (9 Challenges)
  // ==========================================
  {
    id: 'studio_b1',
    title: 'Outdoor Fill Flash & High-Speed Sync (HSS)',
    category: 'studio_lighting',
    level: 'Beginner',
    summary: 'Use an off-camera speedlight with High-Speed Sync (HSS) to fill dark facial shadows under bright midday sunlight at 1/2000s shutter speed.',
    objectives: [
      'Position subject with back to sun (backlit).',
      'Set camera to 1/2000s, f/2.8, ISO 100 with wireless flash trigger set to HSS.',
      'Adjust flash power to illuminate face naturally without looking artificially flashed.'
    ],
    cameraTip: 'HSS lets you shoot wide open at f/1.8 or f/2.8 in bright sun while flash syncs above standard 1/250s limit.',
    softwareFocus: 'Flash Balance & Color Temperature Matching',
    suggestedTools: ['White Balance Tint', 'Radial Mask on Face', 'Highlight Recovery'],
    gearNeeded: 'Speedlight + wireless trigger (HSS-capable)'
  },
  {
    id: 'studio_b2',
    title: 'Single Softbox Rembrandt Portrait Lighting',
    category: 'studio_lighting',
    level: 'Beginner',
    summary: 'Set up a single key softbox light at 45 degrees to create classic Rembrandt lighting with a light triangle on the shadow cheek.',
    objectives: [
      'Place softbox light 45 degrees to the side and slightly above subject head level.',
      'Angle light down toward subject face.',
      'Verify small illuminated triangle of light forms on the cheek on the shadow side.'
    ],
    cameraTip: 'The larger the softbox modifier is relative to your subject, the softer the shadow transition edges will be.',
    softwareFocus: 'Portrait Tone Curve & Skin Tone Balance',
    suggestedTools: ['Skin Tone Color Wheel', 'Tone Curve Lift', 'Soft Contrast Adjustment'],
    gearNeeded: 'Softbox + light stand'
  },
  {
    id: 'studio_b3',
    title: 'Three-Point Lighting Fundamentals',
    category: 'studio_lighting',
    level: 'Beginner',
    summary: 'Build the classic Key + Fill + Back three-light setup that underlies almost every studio portrait pattern you will learn afterward.',
    objectives: [
      'Place the Key light to one side at roughly 45°, as your main light source and shadow-caster.',
      'Add a Fill light (or a white reflector) on the opposite side at lower power to soften — not erase — the Key light\'s shadows.',
      'Add a Back/hair light behind the subject to separate them from the background.'
    ],
    cameraTip: 'Set your Fill at 1-2 stops less powerful than your Key — equal power flattens the image and erases the shape-defining shadow entirely.',
    softwareFocus: 'Three-Light Ratio Balance',
    suggestedTools: ['Shadow/Highlight Balance', 'Skin Tone Color Wheel', 'Local Dodge on Rim Edge'],
    gearNeeded: '3 light sources (lamps or flashes) + reflector'
  },
  {
    id: 'studio_i1',
    title: '2-Point Lighting (Key Light + Hair/Rim Grid)',
    category: 'studio_lighting',
    level: 'Intermediate',
    summary: 'Combine a main softbox key light with a gridded rim light placed behind the subject to create glowing hair separation from a dark backdrop.',
    objectives: [
      'Key light at 45° front right (f/8 exposure).',
      'Rim light with honeycomb grid behind subject left pointing at head/shoulders (f/8.5 exposure).',
      'Capture distinct bright outline separating subject dark hair from dark background.'
    ],
    cameraTip: 'Honeycomb grids on lights prevent stray light from spilling into your camera lens and causing flare.',
    softwareFocus: 'Rim Highlight Separation & Contrast Boost',
    suggestedTools: ['Brush Mask on Hair/Rim Light', 'Highlights Slider', 'Dehaze Boost'],
    gearNeeded: '2 lights + softbox + grid modifier'
  },
  {
    id: 'studio_i2',
    title: 'Feathered Softbox & Backdrop Falloff Control',
    category: 'studio_lighting',
    level: 'Intermediate',
    summary: 'Angle softbox light ahead of subject ("feathering") so edge of light illuminates face while backdrop falls off into deep shadow.',
    objectives: [
      'Aim softbox slightly in front of subject rather than directly at them.',
      'Control light falloff using Inverse Square Law (move light closer to subject for faster falloff).',
      'Check background brightness drops by 2-3 stops.'
    ],
    cameraTip: 'Feathering utilizes the soft edge of light modifier output for super smooth skin gradient transitions.',
    softwareFocus: 'Background Vignette & Light Falloff Gradient',
    suggestedTools: ['Linear Gradient Backdrop Mask', 'Exposure Reduction (-1.0 EV)', 'Vignette Slider'],
    gearNeeded: 'Softbox + backdrop'
  },
  {
    id: 'studio_i3',
    title: 'Butterfly (Paramount) Lighting for Glamour Portraits',
    category: 'studio_lighting',
    level: 'Intermediate',
    summary: 'Position a single light directly above and in front of the subject to cast the small symmetrical "butterfly" shadow under the nose, the classic glamour and beauty lighting pattern.',
    objectives: [
      'Place the key light high and centered directly in front of the subject\'s face, angled down.',
      'Adjust the height until a small symmetrical shadow forms directly beneath the nose.',
      'Add a reflector directly below the face (a "clamshell" setup) to fill the shadow under the chin.'
    ],
    cameraTip: 'Butterfly lighting flatters high cheekbones and a centered nose, but tends to emphasize a larger nose — check profile shape before committing to this pattern.',
    softwareFocus: 'Clamshell Fill & Under-Chin Shadow Softening',
    suggestedTools: ['Shadow Lift Under Chin', 'Skin Retouching Brush', 'Catchlight Enhancement'],
    gearNeeded: 'Key light + reflector (beauty dish ideal)'
  },
  {
    id: 'studio_a1',
    title: 'Dramatic Low-Key Chiaroscuro & Gobo Shadows',
    category: 'studio_lighting',
    level: 'Advanced',
    summary: 'Create dramatic moody low-key portraits using hard flash through a gobo optical snoot/slat stencil with black negative fill cards.',
    objectives: [
      'Position hard flash with gobo stencil to cast Venetian blind light stripes across eyes.',
      'Place black foam core cards (negative fill) on shadow side to absorb bounce reflections.',
      'Expose for highlights so non-lit regions drop to 100% black.'
    ],
    cameraTip: 'Black V-flats (negative fill) absorb ambient bounces, boosting dramatic chiaroscuro shadow contrast.',
    softwareFocus: 'Chiaroscuro Black Point & Selective Contrast',
    suggestedTools: ['Blacks Slider (-25)', 'High Contrast Point Curve', 'Brush Masking'],
    gearNeeded: 'Single light + gobo/snoot + flags (foam core or V-flats)'
  },
  {
    id: 'studio_a2',
    title: 'High-Key Commercial Product Reflections & Polarizing Filters',
    category: 'studio_lighting',
    level: 'Advanced',
    summary: 'Photograph shiny glass or metal commercial products on a seamless white acrylic table using cross-polarization to kill glare.',
    objectives: [
      'Place polarizing film sheets over studio strobes.',
      'Attach Circular Polarizer (CPL) filter to camera lens and rotate until glass reflection glare disappears.',
      'Achieve 100% pure white background (RGB 255, 255, 255) while product edges remain crisp.'
    ],
    cameraTip: 'Cross-polarization eliminates glare on glossy plastic, glass, or oil paintings entirely.',
    softwareFocus: 'Pure White Background Masking & Reflection Cleaning',
    suggestedTools: ['White Threshold Mask', 'Pen Tool / Cutout Mask', 'Reflection Retouching'],
    gearNeeded: 'Strobe(s) + polarizing filter (CPL)'
  },
  {
    id: 'studio_a3',
    title: 'Manual Flash Ratios with a Handheld Light Meter',
    category: 'studio_lighting',
    level: 'Advanced',
    summary: 'Use a handheld incident light meter to set precise, repeatable lighting ratios between key, fill, and background lights instead of guessing from the camera\'s LCD preview.',
    objectives: [
      'Meter the Key light alone at the subject\'s position (incident dome facing the camera) and set your aperture to match its reading.',
      'Meter the Fill light alone and calculate the ratio in stops between Key and Fill (e.g. a 1-stop difference is a soft, low-contrast 2:1 ratio).',
      'Adjust flash power on each light until you hit a deliberate, chosen ratio rather than an accidental one.'
    ],
    cameraTip: 'A light meter reading is far more consistent shot-to-shot than trusting a camera LCD preview, especially under studio strobes where the screen can lie about true exposure.',
    softwareFocus: 'Ratio-Verified Exposure Consistency',
    suggestedTools: ['Cross-Frame Exposure Match', 'Histogram Consistency Check', 'Batch Tone Sync'],
    gearNeeded: '2+ strobes + handheld light meter'
  },

  // ==========================================
  // TOPIC 9: ARCHITECTURAL GEOMETRY & FINE-ART B&W (9 Challenges)
  // ==========================================
  {
    id: 'arch_b1',
    title: 'Architectural Grid Alignment & Leading Lines',
    category: 'architecture_bw',
    level: 'Beginner',
    summary: 'Use camera viewfinder grid lines to compose balanced architectural symmetry and strong converging perspective lines.',
    objectives: [
      'Enable 3x3 Rule of Thirds or 4x4 Grid in electronic viewfinder.',
      'Align dominant horizon line with horizontal grid line and building pillars with vertical lines.',
      'Compose symmetrical center perspective shot of building facade.'
    ],
    cameraTip: 'Level your camera both horizontally and vertically using internal electronic dual-axis level indicator.',
    softwareFocus: 'Straighten Tool & Crop Alignment',
    suggestedTools: ['Straighten Ruler Tool', 'Crop Aspect Ratio', 'Grid Display']
  },
  {
    id: 'arch_b2',
    title: 'Converting Color RAW to High-Contrast B&W',
    category: 'architecture_bw',
    level: 'Beginner',
    summary: 'Convert a vibrant color architectural RAW image into a fine-art Black & White master using black & white color mix channels.',
    objectives: [
      'Convert image to Black & White mode.',
      'Darken blue sky by sliding Blue and Aqua color mix sliders down (-40).',
      'Lighten yellow brick or concrete building highlights using Yellow and Orange mix sliders (+30).'
    ],
    cameraTip: 'Always shoot in Color RAW—the color channel data gives you total control over monochrome tone conversion in post!',
    softwareFocus: 'B&W Color Mix Channels & Contrast',
    suggestedTools: ['B&W Mix Panel', 'Blue Slider (-40)', 'Orange Slider (+30)', 'Contrast +20']
  },
  {
    id: 'arch_b3',
    title: 'Finding Clean Lines & Negative Space in the City',
    category: 'architecture_bw',
    level: 'Beginner',
    summary: 'Compose a minimalist architectural shot built around a single clean line or a large area of empty sky/wall, rather than trying to fit an entire building in frame.',
    objectives: [
      'Walk a building\'s exterior looking for one strong repeating line (a railing, a shadow edge, a row of windows) rather than the whole structure.',
      'Frame so at least a third of the image is genuinely empty — sky, a plain wall, or shadow — to give the line room to breathe.',
      'Shoot from a few different distances and crop tightly in-camera rather than relying on cropping later.'
    ],
    cameraTip: 'Stopping down to f/8-f/11 keeps both the line and the negative space area evenly sharp, which matters more here than a shallow depth of field would.',
    softwareFocus: 'Minimalist Crop & Negative Space Balance',
    suggestedTools: ['Crop Aspect Ratio', 'Straighten Tool', 'Dust Spot Removal on Empty Sky']
  },
  {
    id: 'arch_i1',
    title: 'Keystone Correction & Vertical Line Transformation',
    category: 'architecture_bw',
    level: 'Intermediate',
    summary: 'Correct keystoning distortion where tall building edges lean backward when tilting camera upward.',
    objectives: [
      'Open Geometry / Transform tool panel.',
      'Use "Guided Upright" tool to draw 2 vertical guides along outer left/right edges of building.',
      'Observe building vertical lines instantly transform into 100% perpendicular lines.'
    ],
    cameraTip: 'Stand further back with a longer focal length (e.g. 50mm instead of 16mm) to reduce keystoning before post-processing.',
    softwareFocus: 'Guided Upright & Geometry Transformation',
    suggestedTools: ['Guided Upright Tool', 'Vertical Slider', 'Constrain Crop']
  },
  {
    id: 'arch_i2',
    title: 'Ansel Adams Digital Zone System Contrast Tuning',
    category: 'architecture_bw',
    level: 'Intermediate',
    summary: 'Map tones across the 10 Ansel Adams Zone System steps (Zone 0 pure black to Zone X pure white) for full monochrome tonal range.',
    objectives: [
      'Identify Zone 0 (shadow gaps), Zone V (18% neutral gray stone), and Zone IX (sunlit concrete).',
      'Adjust Whites, Highlights, Shadows, and Blacks sliders so photo contains full Zone 0 to IX spectrum.',
      'Verify histogram spans smoothly from left to right border without unnatural clipping.'
    ],
    cameraTip: 'Expose to the Right (ETTR) on camera histogram to capture maximum data in highlights without clipping.',
    softwareFocus: 'Zone System Tonal Range Sculpting',
    suggestedTools: ['Blacks (-15)', 'Shadows (+25)', 'Highlights (-30)', 'Whites (+15)']
  },
  {
    id: 'arch_i3',
    title: 'Color Filter Simulation for B&W Sky Contrast',
    category: 'architecture_bw',
    level: 'Intermediate',
    summary: 'Simulate a classic red, orange, or yellow lens filter in the B&W Mix panel to control how dramatically the sky separates from the building in monochrome.',
    objectives: [
      'Convert to Black & White, then pull only the Blue and Cyan mix sliders down to simulate a Yellow filter for a mild sky darkening.',
      'Push the reduction further (Blue/Cyan toward -60/-70) to simulate an Orange filter for a moderately dramatic sky.',
      'Take it to the extreme (Blue/Cyan near -100) to simulate a Red filter for a near-black, high-drama sky against bright stone or brick.'
    ],
    cameraTip: 'This is a digital simulation done from full-color RAW data — you get to choose and preview the filter strength after the fact, unlike a physical lens filter.',
    softwareFocus: 'B&W Mix Channel Filter Simulation',
    suggestedTools: ['B&W Mix Panel', 'Blue/Cyan Sliders', 'Side-by-Side Filter Strength Comparison']
  },
  {
    id: 'arch_a1',
    title: 'Fine-Art Long Exposure Daytime Cloud Trails (10-Stop ND)',
    category: 'architecture_bw',
    level: 'Advanced',
    summary: 'Use a 10-stop Dark Neutral Density (ND1000) filter in daylight to take 2-minute exposures that streak passing clouds over static architectural geometry.',
    objectives: [
      'Screw 10-stop ND filter onto lens in bright daylight.',
      'Set ISO 50, f/11, and shutter speed to 120 seconds (Bulb Mode).',
      'Convert final image to high-contrast B&W with silky streaked sky and razor-sharp building structure.'
    ],
    cameraTip: 'Cover your camera optical viewfinder eyepiece during 2-minute daytime exposures to prevent rear light leaks onto sensor.',
    softwareFocus: 'Fine-Art Monochrome Long Exposure Contrast',
    suggestedTools: ['B&W Conversion', 'Clarity +30 on Building', 'Linear Gradient Sky Smoothing'],
    gearNeeded: 'Tripod + 10-stop ND filter (e.g. ND1000)'
  },
  {
    id: 'arch_a2',
    title: 'Architectural Dodge & Burn Heatmap Sculpting',
    category: 'architecture_bw',
    level: 'Advanced',
    summary: 'Hand-sculpt architectural light and shadow contours using targeted Dodge and Burn adjustment layers for a 3D fine-art gallery look.',
    objectives: [
      'Create 50% Neutral Gray overlay layer in Photoshop set to Soft Light blend mode.',
      'Dodge (brighten) leading architectural edges and sunlit columns.',
      'Burn (darken) under overhangs and recessed windows to deepen 3D dimensionality.'
    ],
    cameraTip: 'Look for directional side-lighting during morning or late afternoon for natural architectural form shadows.',
    softwareFocus: 'Dodge & Burn Layer Painting & Contrast',
    suggestedTools: ['Dodge Tool (Midtones 10%)', 'Burn Tool (Shadows 10%)', 'Soft Light Blend Layer']
  },
  {
    id: 'arch_a3',
    title: 'Blue Hour Architecture & Mixed Light Balance',
    category: 'architecture_bw',
    level: 'Advanced',
    summary: 'Photograph a building during Blue Hour so its interior tungsten/LED lighting balances evenly against a still-blue (not black) evening sky — the signature look of professional architectural photography.',
    objectives: [
      'Scout and set up 20-30 minutes before sunset, timing your shots for the 10-15 minute window after sunset when the sky holds rich blue tone.',
      'Expose for the building\'s interior lights first, then confirm the sky hasn\'t gone fully black in the same frame.',
      'Bracket 2-3 frames across the Blue Hour window, since the correct balance point shifts minute to minute as the sky darkens.'
    ],
    cameraTip: 'Interior lights are usually much warmer (tungsten/LED) than the cool blue sky — expect to do local white balance correction rather than one global setting for the whole image.',
    softwareFocus: 'Mixed Color Temperature Local Correction',
    suggestedTools: ['Local White Balance Brush', 'Graduated Sky Mask', 'Window Light Selective Warmth']
  }
];

/**
 * Returns custom step-by-step shooting & editing instructions for a challenge,
 * or generates dynamic, tailored steps based on the challenge objectives and tools.
 */
export function getChallengeSteps(
  challenge: Challenge,
  userSoftware: string = 'your editing software'
): { shooting: string[]; editing: string[] } {
  if (challenge.steps && challenge.steps.shooting.length > 0 && challenge.steps.editing.length > 0) {
    return challenge.steps;
  }

  // Dynamic fallback steps derived from challenge objectives, camera tip, and suggested tools
  const obj1 = challenge.objectives[0] || 'Set up your camera and compose the scene.';
  const obj2 = challenge.objectives[1] || 'Adjust exposure settings according to the target goal.';
  const obj3 = challenge.objectives[2] || 'Check focus and capture the shot.';

  const toolList = challenge.suggestedTools.length > 0
    ? challenge.suggestedTools.join(', ')
    : 'standard adjustment sliders';

  return {
    shooting: [
      `Mode & Dial Setup: ${obj1}`,
      `Shooting Technique: ${obj2}`,
      `Pro Field Tip: ${challenge.cameraTip}`,
      `Capture & Verification: ${obj3}`
    ],
    editing: [
      `Import & Inspection: Load your RAW/JPEG photo into ${userSoftware} and inspect histogram and composition.`,
      `Focus Adjustment (${challenge.softwareFocus}): Use ${toolList} to target the key areas of your frame.`,
      `Final Export: Verify sharpness at 100% zoom and export at full resolution.`
    ]
  };
}

