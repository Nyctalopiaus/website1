/* keywords.js - Human-Editable Category Definitions, GIS Query Tags & Brand Keywords */
(function(window) {
  'use strict';

  const CATEGORY_CONFIG = {
    grocery: {
      label: 'Grocery',
      color: '#f97316',
      target: 3,
      overpassClauses: [
        '["shop"~"supermarket|grocery|convenience|food|deli"]',
        '["amenity"="marketplace"]'
      ],
      fallbackKeywords: [
        'supermarket', 'grocery store', 'grocery', 'Trader Joe\'s',
        'Safeway', 'King Soopers', 'Whole Foods', 'Sprouts', 'Target', 'Walmart',
        '7-Eleven', 'Circle K', 'Kroger', 'Albertsons', 'Publix', 'HEB', 'Meijer',
        'Aldi', 'Lidl', 'Costco', 'Sam\'s Club'
      ]
    },
    fitness: {
      label: 'Fitness',
      color: '#22d3ee',
      target: 4,
      overpassClauses: [
        '["leisure"~"fitness_centre|sports_centre|fitness_station|sports_hall|dance"]',
        '["amenity"~"gym|fitness_centre"]',
        '["sport"~"fitness|gymnastics|sports|pilates|yoga"]'
      ],
      fallbackKeywords: [
        'fitness center', 'gym', 'sports center', 'fitness club', 'health club',
        'VASA Fitness', '24 Hour Fitness', 'Anytime Fitness', 'Planet Fitness',
        'Orangetheory', 'F45 Training', 'Life Time', 'Equinox', 'YMCA',
        'CrossFit', 'Pilates', 'Yoga Studio', 'Athletic Club'
      ]
    },
    trails: {
      label: 'Trails',
      color: '#38bdf8',
      target: 2,
      overpassClauses: [
        '["highway"="cycleway"]',
        '["cycleway"="designated"]'
      ],
      fallbackKeywords: ['cycleway', 'bike path', 'trail', 'greenway']
    },
    cuisine: {
      label: 'Cuisine',
      color: '#f472b6',
      target: 6,
      overpassClauses: [
        '["amenity"~"restaurant|fast_food|cafe|pub|bar|food_court"]'
      ],
      fallbackKeywords: [
        'restaurant', 'cafe', 'fast food', 'dining', 'pizza', 'burger',
        'sushi', 'tacos', 'mexican', 'italian', 'chinese', 'thai', 'japanese'
      ]
    },
    gas: {
      label: 'Gas',
      color: '#f59e0b',
      target: 3,
      overpassClauses: [
        '["amenity"="fuel"]',
        '["shop"="gas"]'
      ],
      fallbackKeywords: [
        'gas station', 'fuel', 'Shell', '7-Eleven', 'Chevron', 'Conoco', 'Exxon',
        'Mobil', 'BP', 'Circle K', 'Speedway', 'Sinclair', 'Texaco', 'Phillips 66', 'King Soopers Gas Station'
      ]
    },
    parks: {
      label: 'Parks',
      color: '#34d399',
      target: 3,
      overpassClauses: [
        '["leisure"~"park|dog_park|playground"]'
      ],
      fallbackKeywords: ['park', 'recreation park', 'playground', 'dog park', 'community park']
    },
    pharmacy: {
      label: 'Pharmacy',
      color: '#a78bfa',
      target: 2,
      overpassClauses: [
        '["amenity"="pharmacy"]',
        '["healthcare"="pharmacy"]'
      ],
      fallbackKeywords: [
        'pharmacy', 'Walgreens', 'CVS Pharmacy', 'King Soopers Pharmacy',
        'Rite Aid', 'Wal-Mart Pharmacy', 'Target Pharmacy', 'Safeway Pharmacy'
      ]
    }
  };

  window.RelocationKeywords = {
    CATEGORY_CONFIG
  };
})(window);
