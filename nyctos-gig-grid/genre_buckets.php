<?php

function getGenreBucketConfig() {
    return [
        'all' => [
            'label' => 'All Genres',
            'title' => 'Show every event currently loaded into Nycto\'s Gig Grid.',
            'tags' => []
        ],
        'metal' => [
            'label' => 'Metal',
            'title' => 'Covers heavy metal, metalcore, doom metal, thrash metal, black metal, death metal, sludge metal, and adjacent heavy styles.',
            'tags' => [
                'alternative metal', 'black metal', 'brutal deathcore', 'brutal death metal',
                'death metal', 'deathcore', 'djent', 'doom metal', 'extreme power metal',
                'female fronted metal', 'glam metal', 'groove metal', 'gothic metal',
                'gothic-metal', 'hair metal', 'heavy metal', 'industrial metal',
                'math metal', 'melodic death metal', 'melodic metal', 'melodic metalcore',
                'metal', 'metalcore', 'nu metal', 'nu-metal', 'post metal', 'post-metal',
                'power metal', 'progressive metal', 'progressive metalcore',
                'sludge', 'sludge metal', 'stoner doom', 'stoner metal', 'symphonic metal',
                'technical death metal', 'traditional doom metal', 'thrash metal', 'war metal'
            ]
        ],
        'rock' => [
            'label' => 'Rock',
            'title' => 'Covers classic rock, hard rock, alternative rock, indie rock, grunge, post-rock, shoegaze, and other broad rock styles.',
            'tags' => [
                'acoustic rock', 'alternative rock', 'art rock', 'blues rock', 'blues-rock',
                'aor', 'britpop', 'classic pop and rock', 'classic rock', 'country rock',
                'desert rock', 'experimental rock', 'garage', 'garage rock', 'glam rock',
                'heartland rock', 'hard rock', 'indie rock', 'industrial rock', 'jangle pop',
                'krautrock', 'math rock', 'melodic rock', 'modern rock', 'noise rock',
                'power pop', 'pop rock', 'progressive rock', 'reggae rock', 'rock',
                'rock & roll', 'rock and indie', 'post grunge', 'post-grunge', 'post rock',
                'post-rock', 'psychedelic', 'psychedelic rock', 'shoegaze', 'soft rock',
                'southern rock', 'space rock', 'stoner', 'stoner rock', 'surf rock'
            ]
        ],
        'indie' => [
            'label' => 'Indie & Dream Pop',
            'title' => 'Covers indie, indie folk, indie pop, dream pop, lo-fi, and lighter left-of-center pop/folk styles.',
            'tags' => [
                'alternative', 'alternative country', 'alternative r&b', 'bedroom pop',
                'chamber pop', 'darkwave', 'dream pop', 'emo', 'folk-pop', 'indie',
                'indie folk', 'indie pop', 'lo-fi', 'new wave', 'noise pop', 'psychedelic',
                'singer-songwriter', 'twee'
            ]
        ],
        'punk' => [
            'label' => 'Punk & Post-Punk',
            'title' => 'Covers punk, punk rock, pop punk, post-punk, post-hardcore, and skate punk.',
            'tags' => [
                'alternative hardcore', 'art punk', 'beatdown', 'celt rock / punk', 'dance punk',
                'emocore', 'folk punk', 'garage punk', 'hardcore', 'hardcore punk', 'horror punk',
                'melodic hardcore', 'melodic punk', 'moshcore', 'orgcore', 'pop punk', 'pop-punk',
                'post hardcore', 'post punk', 'post-hardcore', 'post-punk', 'punk', 'punk rock',
                'riot grrrl', 'ska punk', 'ska-punk', 'skate punk', 'screamo', 'street punk',
                'surf punk', 'rapcore'
            ]
        ],
        'electronic' => [
            'label' => 'Electronic & Synth',
            'title' => 'Covers electronic, synthpop, synthwave, EDM, techno, house, dubstep, downtempo, and ambient.',
            'tags' => [
                'acid house', 'ambient', 'chillout', 'club', 'dance', 'deep house', 'downtempo',
                'drum and bass', 'dubstep', 'ebm', 'edm', 'electro', 'electronic', 'electronica',
                'electropop', 'house', 'idm', 'industrial', 'synth-pop', 'synth pop', 'synthpop',
                'synthwave', 'techno', 'trance', 'trip-hop', 'trip hop'
            ]
        ],
        'folk' => [
            'label' => 'Folk, Country & Americana',
            'title' => 'Covers folk, country, americana, bluegrass, alt-country, celtic, and acoustic acoustic traditions.',
            'tags' => [
                'acoustic', 'alt-country', 'americana', 'bluegrass', 'celtic', 'country',
                'country pop', 'country rock', 'folk', 'folk rock', 'indie folk', 'irish',
                'jam band', 'roots', 'scottish', 'traditional folk'
            ]
        ],
        'hiphop' => [
            'label' => 'Hip-Hop, R&B & Funk',
            'title' => 'Covers hip-hop, rap, trap, r&b, soul, neo-soul, funk, and afrobeat.',
            'tags' => [
                'abstract hip-hop', 'afrobeat', 'alternative rnb', 'def jux', 'disco',
                'east coast hip hop', 'funk', 'groove', 'hip hop', 'hip-hop',
                'instrumental hip-hop', 'neo-soul', 'r&b', 'rap', 'rhythm and blues',
                'rnb', 'soul', 'trap', 'underground hip-hop'
            ]
        ],
        'jazz' => [
            'label' => 'Jazz, Blues & World',
            'title' => 'Covers jazz, blues, reggae, dub, ska, world music, and latin rhythms.',
            'tags' => [
                'acid jazz', 'afrobeats', 'bossa nova', 'blues', 'dub', 'fusion', 'instrumental',
                'jazz', 'jazz funk', 'jazz fusion', 'latin', 'latin jazz', 'reggae', 'ska',
                'ska-jazz', 'world', 'world music'
            ]
        ]
    ];
}
