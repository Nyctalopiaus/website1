import { FieldGuide } from '../types';

export const DEFAULT_FIELD_GUIDE: FieldGuide = {
  cameraBrand: 'Sony',
  cameraModel: 'A7IV',
  primaryLens: '35mm f/1.8',
  lastUpdated: new Date().toISOString(),
  baselines: [
    {
      customPresetName: 'C1 - Macro',
      purpose: 'Macro & close-ups',
      mode: 'Av',
      startingExposure: 'f/8 • ISO 100',
      afMode: 'Servo / AF-C',
      afArea: 'Whole Area',
      subjectDetection: 'Off',
      eyeDetection: 'Off',
      driveMode: 'High',
      meteringMode: 'Evaluative',
      shutterMode: 'EFCS',
      whiteBalance: 'Auto',
      imageQuality: 'RAW',
      flashSettings: 'E-TTL / TTL • FEC 0 • Zoom A • 1st Curtain'
    },
    {
      customPresetName: 'C2 - Action',
      purpose: 'Kids, dogs, wildlife, sports',
      mode: 'Tv / S',
      startingExposure: '1/1000s • Auto ISO',
      afMode: 'Servo / AF-C',
      afArea: 'Whole Area / Tracking',
      subjectDetection: 'Auto / Animal / Bird',
      eyeDetection: 'On',
      driveMode: 'High+',
      meteringMode: 'Evaluative',
      shutterMode: 'Electronic / EFCS',
      whiteBalance: 'Auto',
      imageQuality: 'RAW',
      flashSettings: 'Off'
    },
    {
      customPresetName: 'C3 - Tripod & Night',
      purpose: 'Night, tripod, landscapes, astrophotography',
      mode: 'Manual',
      startingExposure: 'Scene dependent (1-15s • f/2.8-8 • ISO 100-3200)',
      afMode: 'One Shot / Manual (MF)',
      afArea: 'Whole Area / Spot',
      subjectDetection: 'Off',
      eyeDetection: 'Off',
      driveMode: '2 sec Timer',
      meteringMode: 'Evaluative',
      shutterMode: 'EFCS',
      whiteBalance: 'Auto / 5500K / Kelvin',
      imageQuality: 'RAW',
      flashSettings: 'Off'
    },
    {
      customPresetName: 'Av - General Photography',
      purpose: 'Portraits & everyday walkaround',
      mode: 'Av',
      startingExposure: 'f/2.8 • ISO 100',
      afMode: 'Servo / AF-C',
      afArea: 'Whole Area',
      subjectDetection: 'Auto / Human',
      eyeDetection: 'On',
      driveMode: 'Single',
      meteringMode: 'Evaluative',
      shutterMode: 'EFCS',
      whiteBalance: 'Auto',
      imageQuality: 'RAW',
      flashSettings: 'Off'
    },
    {
      customPresetName: 'M - Flash Controlled Light',
      purpose: 'Off-camera flash & studio controlled lighting',
      mode: 'Manual',
      startingExposure: '1/200s • f/8 • ISO 100',
      afMode: 'Servo / AF-C',
      afArea: 'Whole Area',
      subjectDetection: 'Off',
      eyeDetection: 'Off',
      driveMode: 'High',
      meteringMode: 'Evaluative',
      shutterMode: 'EFCS',
      whiteBalance: 'Auto / Flash 5500K',
      imageQuality: 'RAW',
      flashSettings: 'E-TTL / TTL • FEC 0 • Zoom A • 1st Curtain'
    }
  ],
  startingPoints: [
    {
      id: 'sp_1',
      subjectStyle: 'Everyday Macro',
      startWith: 'C1',
      adjust: 'f/8 • ISO 100',
      rememberTip: 'Watch shutter speed; raise ISO if needed.'
    },
    {
      id: 'sp_2',
      subjectStyle: 'Dreamy Isolation',
      startWith: 'C1',
      adjust: 'f/2.8–4 • ISO for light',
      rememberTip: 'Focus on the eye or flower center.'
    },
    {
      id: 'sp_3',
      subjectStyle: 'Fast Insects',
      startWith: 'M',
      adjust: '1/2000–3200 • f/2.8–5.6 • Auto ISO or Manual ISO • High+',
      rememberTip: 'Prioritize shutter speed over depth of field.'
    },
    {
      id: 'sp_4',
      subjectStyle: 'Close-ups',
      startWith: 'C1',
      adjust: 'f/5.6–6.3 • ISO 200–1600 • Drive: Medium',
      rememberTip: 'Balanced detail and background blur.'
    },
    {
      id: 'sp_5',
      subjectStyle: 'Detailed Macro',
      startWith: 'C1',
      adjust: 'f/8–11 • ISO 100–1600 • Drive: Medium',
      rememberTip: 'Keep the sensor parallel to the subject.'
    },
    {
      id: 'sp_6',
      subjectStyle: 'Night Macro (Flash)',
      startWith: 'M',
      adjust: '1/200 • f/8 • ISO 100–400 • E-TTL / TTL • Modeling Lamp: Medium',
      rememberTip: 'Flash lights the subject; adjust FEC first if needed.'
    },
    {
      id: 'sp_7',
      subjectStyle: 'Spider Webs',
      startWith: 'C1',
      adjust: 'One Shot • f/8–11 • ISO 100–400 • Flash Off',
      rememberTip: 'Move until the web catches the light.'
    },
    {
      id: 'sp_8',
      subjectStyle: 'Mushrooms',
      startWith: 'C1',
      adjust: 'One Shot • f/8–11 • ISO 100–800 • Drive: Medium',
      rememberTip: 'Tripod or flash if shutter gets slow.'
    },
    {
      id: 'sp_9',
      subjectStyle: 'Focus Stacking',
      startWith: 'M',
      adjust: 'f/5.6–8 • ISO 100 • Focus Bracketing • Single',
      rememberTip: 'Stable subject, no wind.'
    },
    {
      id: 'sp_10',
      subjectStyle: 'Kids / Fast Action',
      startWith: 'C2',
      adjust: '1/1000s • Auto ISO • Tracking AF',
      rememberTip: 'Leave room in front of the action.'
    },
    {
      id: 'sp_11',
      subjectStyle: 'Baseball / Field Sports',
      startWith: 'C2',
      adjust: '1/1600–2000s • Auto ISO',
      rememberTip: 'Track before the action starts.'
    },
    {
      id: 'sp_12',
      subjectStyle: 'Dogs Running',
      startWith: 'C2',
      adjust: '1/1600s • Animal AF • High+ Drive',
      rememberTip: 'Get low and start tracking early.'
    },
    {
      id: 'sp_13',
      subjectStyle: 'Birds in Flight',
      startWith: 'C2',
      adjust: '1/2000–3200s • Bird AF • Auto ISO',
      rememberTip: 'Keep both eyes open while tracking.'
    },
    {
      id: 'sp_14',
      subjectStyle: 'Motorsports / Baja Racing (Freeze)',
      startWith: 'C2',
      adjust: '1/1600–2500s • Vehicle AF',
      rememberTip: 'Leave space for the vehicle to move into.'
    }
  ]
};
