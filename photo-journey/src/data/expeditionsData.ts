import { Expedition } from '../types';

export const INITIAL_EXPEDITIONS: Expedition[] = [
  {
    id: 'exp_1',
    title: 'Learning to See',
    goal: 'Learn to observe light, composition, and storytelling before touching the camera. Develop the habits that separate intentional photographers from people who simply take pictures.',
    missions: [
      { id: 'm_lts_1', title: 'Learning to See', status: 'created' },
      { id: 'm_lts_2', title: 'One Flower, Twenty Ways', status: 'created' },
      { id: 'm_lts_3', title: 'Texture Hunter', status: 'planned' },
      { id: 'm_lts_4', title: 'One Subject, Three Stories', status: 'planned' },
      { id: 'm_lts_5', title: 'The Power of Perspective', status: 'planned' },
      { id: 'm_lts_6', title: 'Finding the Background', status: 'planned' },
      { id: 'm_lts_7', title: 'Photographing Light Before Subjects', status: 'planned' },
      { id: 'm_lts_8', title: 'Seeing Like a Macro Photographer', status: 'planned' },
      { id: 'm_lts_9', title: 'Finding the Best Angle', status: 'future_idea' },
      { id: 'm_lts_10', title: 'Learning to Slow Down', status: 'future_idea' },
      { id: 'm_lts_11', title: 'Seeing Beyond the Subject', status: 'future_idea' },
      { id: 'm_lts_12', title: 'Less Is More', status: 'future_idea' },
      { id: 'm_lts_13', title: 'Framing the Story', status: 'future_idea' }
    ]
  },
  {
    id: 'exp_2',
    title: 'The Language of Light',
    goal: 'Learn to confidently create, control, and shape light using natural light and your speedlight/flash, building from flash basics to advanced macro lighting.',
    missions: [
      { id: 'm_lol_1', title: 'Meet Your Flash', status: 'created' },
      { id: 'm_lol_2', title: 'Painting with Flash', status: 'created' },
      { id: 'm_lol_3', title: 'Black Background Challenge', status: 'created' },
      { id: 'm_lol_4', title: 'TTL: Your First Flash Photos', status: 'planned' },
      { id: 'm_lol_5', title: 'Flash Exposure Compensation', status: 'planned' },
      { id: 'm_lol_6', title: 'Manual Flash Power', status: 'planned' },
      { id: 'm_lol_7', title: 'Flash Zoom', status: 'planned' },
      { id: 'm_lol_8', title: 'Modeling Lamp', status: 'planned' },
      { id: 'm_lol_9', title: 'High-Speed Sync', status: 'planned' },
      { id: 'm_lol_10', title: 'Macro Flash Workflow', status: 'planned' },
      { id: 'm_lol_11', title: 'Hard vs. Soft Light', status: 'future_idea' },
      { id: 'm_lol_12', title: 'Light Direction', status: 'future_idea' },
      { id: 'm_lol_13', title: 'Flash Distance', status: 'future_idea' },
      { id: 'm_lol_14', title: 'Feathering the Light', status: 'future_idea' },
      { id: 'm_lol_15', title: 'Fill Flash Outdoors', status: 'future_idea' },
      { id: 'm_lol_16', title: 'Flash at Sunset', status: 'future_idea' },
      { id: 'm_lol_17', title: 'Flash in the Rain', status: 'future_idea' }
    ]
  },
  {
    id: 'exp_3',
    title: 'The Small World',
    goal: 'Reveal beauty that most people overlook by exploring flowers, insects, textures, and tiny details through macro photography.',
    missions: [
      { id: 'm_sw_1', title: 'The Backyard Expedition', status: 'planned', isStarred: true },
      { id: 'm_sw_2', title: 'Worlds in a Water Drop', status: 'planned' },
      { id: 'm_sw_3', title: 'One Leaf, Infinite Details', status: 'planned' },
      { id: 'm_sw_4', title: 'Landscapes in Miniature', status: 'planned' },
      { id: 'm_sw_5', title: 'The Busy Garden', status: 'planned' },
      { id: 'm_sw_6', title: 'Morning Dew', status: 'planned' },
      { id: 'm_sw_7', title: 'Spider Silk', status: 'future_idea' },
      { id: 'm_sw_8', title: 'Mushroom Kingdom', status: 'future_idea' },
      { id: 'm_sw_9', title: 'Monarch Chronicles', status: 'future_idea' },
      { id: 'm_sw_10', title: 'Hidden Textures', status: 'future_idea' },
      { id: 'm_sw_11', title: 'Tiny Beach Worlds', status: 'future_idea' }
    ]
  },
  {
    id: 'exp_4',
    title: 'Beyond One Plane',
    goal: 'Master focus, depth of field, and focus stacking to create technically excellent macro photographs with maximum detail.',
    missions: [
      { id: 'm_bop_1', title: 'Focus Bracketing', status: 'planned' },
      { id: 'm_bop_2', title: 'Focus Stacking In-Camera', status: 'planned' },
      { id: 'm_bop_3', title: 'Focus Stacking in Photoshop', status: 'planned' },
      { id: 'm_bop_4', title: 'Focus Stacking in Helicon Focus', status: 'planned' },
      { id: 'm_bop_5', title: 'Diffraction Demystified', status: 'planned' },
      { id: 'm_bop_6', title: 'Choosing the Perfect Aperture', status: 'planned' },
      { id: 'm_bop_7', title: 'Macro Rail Fundamentals', status: 'planned' },
      { id: 'm_bop_8', title: 'Handheld Focus Stacking', status: 'future_idea' },
      { id: 'm_bop_9', title: 'Conquering the Wind', status: 'future_idea' },
      { id: 'm_bop_10', title: 'Beyond Maximum Magnification', status: 'future_idea' }
    ]
  },
  {
    id: 'exp_5',
    title: 'From Capture to Art',
    goal: 'Transform RAW images into finished artwork by developing a thoughtful editing workflow in Lightroom and Photoshop.',
    missions: [
      { id: 'm_fca_1', title: 'Between Earth & Stars', status: 'created' },
      { id: 'm_fca_2', title: 'Lightroom Without Presets', status: 'created' },
      { id: 'm_fca_3', title: 'Preset Detective', status: 'created' },
      { id: 'm_fca_4', title: 'One Image, Five Stories', status: 'created' },
      { id: 'm_fca_5', title: 'Mastering Masks', status: 'planned' },
      { id: 'm_fca_6', title: 'Color Grading Essentials', status: 'planned' },
      { id: 'm_fca_7', title: 'Curves Demystified', status: 'planned' },
      { id: 'm_fca_8', title: 'Photoshop Layers', status: 'planned' },
      { id: 'm_fca_9', title: 'Clean It Up', status: 'planned' },
      { id: 'm_fca_10', title: 'Taming Noise', status: 'planned' },
      { id: 'm_fca_11', title: 'Build Your Own Presets', status: 'future_idea' },
      { id: 'm_fca_12', title: 'From Screen to Print', status: 'future_idea' }
    ]
  },
  {
    id: 'exp_6',
    title: 'Storytelling',
    goal: 'Create photographs that make people stop, wonder, and feel something by using composition, light, and editing to tell compelling visual stories.',
    missions: [
      { id: 'm_st_1', title: 'My Favorite Possession', status: 'planned' },
      { id: 'm_st_2', title: 'Photographing Emotion', status: 'planned' },
      { id: 'm_st_3', title: 'Environmental Storytelling', status: 'planned' },
      { id: 'm_st_4', title: 'The Color of Emotion', status: 'planned' },
      { id: 'm_st_5', title: 'Before the Shutter', status: 'planned' },
      { id: 'm_st_6', title: 'Editing for Mood', status: 'planned' },
      { id: 'm_st_7', title: 'The Story on the Shelf', status: 'future_idea' },
      { id: 'm_st_8', title: 'Five Stories, One Object', status: 'future_idea' },
      { id: 'm_st_9', title: 'Photographing Memories', status: 'future_idea' },
      { id: 'm_st_10', title: 'A Sense of Place', status: 'future_idea' }
    ]
  },
  {
    id: 'exp_7',
    title: 'Adventure Photography',
    goal: 'Capture the dramatic scope of nature, night skies, and outdoor explorations.',
    missions: [
      { id: 'm_adv_1', title: 'Chasing the Milky Way', status: 'created' },
      { id: 'm_adv_2', title: 'Milky Way Timelapse', status: 'planned' },
      { id: 'm_adv_3', title: 'Star Trails', status: 'planned' },
      { id: 'm_adv_4', title: 'Photographing the Dunes', status: 'planned' },
      { id: 'm_adv_5', title: 'Baja Roadside Stories', status: 'planned' },
      { id: 'm_adv_6', title: 'Ocean Motion', status: 'planned' },
      { id: 'm_adv_7', title: 'Golden Hour at the Beach House', status: 'planned' },
      { id: 'm_adv_8', title: 'Desert Light', status: 'planned' },
      { id: 'm_adv_9', title: 'Baja Race Photography', status: 'future_idea' },
      { id: 'm_adv_10', title: 'Camping Under the Stars', status: 'future_idea' },
      { id: 'm_adv_11', title: 'Storm Watching', status: 'future_idea' }
    ]
  },
  {
    id: 'exp_8',
    title: 'Urban & Architectural Geometry',
    goal: 'Master perspective, structural symmetry, light trails, and geometric composition in urban environments.',
    missions: [
      { id: 'm_uag_1', title: 'Keystoning & Vertical Horizon', status: 'created' },
      { id: 'm_uag_2', title: 'Neon Reflections', status: 'planned' },
      { id: 'm_uag_3', title: 'Light Trails & Traffic Motion', status: 'planned' },
      { id: 'm_uag_4', title: 'Glass & Steel Reflections', status: 'planned' },
      { id: 'm_uag_5', title: 'Subway Motion Blur', status: 'future_idea' },
      { id: 'm_uag_6', title: 'Brutalist B&W Architecture', status: 'future_idea' }
    ]
  },
  {
    id: 'exp_9',
    title: 'The Art of Natural Light Portraiture',
    goal: 'Harness window light, golden hour backlighting, catchlights, and shallow depth of field for compelling human portraits.',
    missions: [
      { id: 'm_nlp_1', title: 'Window Light Rembrandt', status: 'created' },
      { id: 'm_nlp_2', title: 'Catchlight Sparkle', status: 'planned' },
      { id: 'm_nlp_3', title: 'Golden Hour Rim Light', status: 'planned' },
      { id: 'm_nlp_4', title: 'Environmental Character Study', status: 'planned' },
      { id: 'm_nlp_5', title: 'High-Key Beauty Lighting', status: 'future_idea' },
      { id: 'm_nlp_6', title: 'Low-Key Film Noir Portrait', status: 'future_idea' }
    ]
  },
  {
    id: 'exp_10',
    title: 'Wildlife & Wild Encounters',
    goal: 'Lock onto fast wildlife, master Eye-AF tracking, telephoto hand-holding stability, and ethical animal photography.',
    missions: [
      { id: 'm_wwe_1', title: 'Freeze the Wing', status: 'planned' },
      { id: 'm_wwe_2', title: 'Through the Foliage', status: 'planned' },
      { id: 'm_wwe_3', title: 'Backlit Fur & Feathers', status: 'planned' },
      { id: 'm_wwe_4', title: 'Wildlife Panning', status: 'planned' },
      { id: 'm_wwe_5', title: 'The Camouflage Challenge', status: 'future_idea' }
    ]
  },
  {
    id: 'exp_11',
    title: 'Street & Documentary Storytelling',
    goal: 'Capture unscripted human moments, street geometry, zone focusing, and Henri Cartier-Bresson\'s "Decisive Moment".',
    missions: [
      { id: 'm_sds_1', title: 'The Decisive Moment', status: 'planned' },
      { id: 'm_sds_2', title: 'Street Color Pop', status: 'planned' },
      { id: 'm_sds_3', title: 'Zone Focusing Mastery', status: 'planned' },
      { id: 'm_sds_4', title: 'Night Street Silhouettes', status: 'planned' },
      { id: 'm_sds_5', title: 'Urban Layering', status: 'future_idea' }
    ]
  },
  {
    id: 'exp_12',
    title: 'Product & Studio Commercial Photography',
    goal: 'Learn tabletop studio lighting, acrylic reflections, liquid splash freezes, and reflection control for commercial products.',
    missions: [
      { id: 'm_psc_1', title: 'The Glass Challenge', status: 'planned' },
      { id: 'm_psc_2', title: 'Liquid Splash Burst', status: 'planned' },
      { id: 'm_psc_3', title: 'Matte vs. Metallic Contrast', status: 'planned' },
      { id: 'm_psc_4', title: 'E-Commerce Pure White Backdrop', status: 'planned' },
      { id: 'm_psc_5', title: 'Floating Product Illusion', status: 'future_idea' }
    ]
  },
  {
    id: 'exp_13',
    title: 'Fine Art Monochrome Mastery',
    goal: 'Learn to "see in black & white", mapping 10 tonal zones from deep black to pure white.',
    missions: [
      { id: 'm_fmm_1', title: 'The 10 Tonal Zones', status: 'created' },
      { id: 'm_fmm_2', title: 'Red Filter Sky Conversion', status: 'planned' },
      { id: 'm_fmm_3', title: 'High-Contrast Street Silhouettes', status: 'planned' },
      { id: 'm_fmm_4', title: 'Soft Infrared Mood', status: 'planned' },
      { id: 'm_fmm_5', title: 'Silver Gelatin Film Print Look', status: 'future_idea' }
    ]
  },
  {
    id: 'exp_14',
    title: 'Intentional Camera Movement & Fine Art Abstract',
    goal: 'Push photography into abstract visual art using camera motion, prisms, double exposures, and custom bokeh.',
    missions: [
      { id: 'm_icm_1', title: 'Forest ICM Swipe', status: 'planned' },
      { id: 'm_icm_2', title: 'In-Camera Double Exposure', status: 'planned' },
      { id: 'm_icm_3', title: 'Prism & Crystal Light Leaks', status: 'planned' },
      { id: 'm_icm_4', title: 'Custom Shaped Bokeh', status: 'planned' },
      { id: 'm_icm_5', title: 'Water Surface Abstractions', status: 'future_idea' }
    ]
  },
  {
    id: 'exp_15',
    title: 'Motorsports & High-Speed Action',
    goal: 'Master fast action tracking, high-speed shutter burst, waist-rotation panning, and pit lane storytelling.',
    missions: [
      { id: 'm_mha_1', title: '1/15s Slow Shutter Panning', status: 'planned' },
      { id: 'm_mha_2', title: 'Corner Apex Freeze', status: 'planned' },
      { id: 'm_mha_3', title: 'Pit Lane Environmental', status: 'planned' },
      { id: 'm_mha_4', title: 'Wheel & Rotor Glow', status: 'future_idea' }
    ]
  },
  {
    id: 'exp_16',
    title: 'Parking Lot',
    goal: 'Ideas that don\'t have a home yet.',
    missions: [
      { id: 'm_pl_1', title: 'Baja race panning', status: 'future_idea' },
      { id: 'm_pl_2', title: 'Milky Way timelapse', status: 'future_idea' },
      { id: 'm_pl_3', title: 'Star trails', status: 'future_idea' },
      { id: 'm_pl_4', title: 'Astrophotography panoramas', status: 'future_idea' },
      { id: 'm_pl_5', title: 'Water splash photography', status: 'future_idea' },
      { id: 'm_pl_6', title: 'Product photography', status: 'future_idea' },
      { id: 'm_pl_7', title: 'Printing large wall art', status: 'future_idea' },
      { id: 'm_pl_8', title: 'Reflections', status: 'future_idea' },
      { id: 'm_pl_9', title: 'Photographing glass', status: 'future_idea' }
    ]
  }
];
