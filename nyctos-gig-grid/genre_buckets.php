<?php

function getGenreBucketConfig() {
    return [
        'all' => [
            'label' => 'All Genres',
            'title' => 'Show every event currently loaded into Nycto\'s Gig Grid.',
            'tags' => []
        ],
        'metal' => [
            'label' => 'Rock & Metal',
            'title' => 'Covers heavy metal, hard rock, classic rock, alternative metal, stoner rock, metalcore, doom metal, thrash metal, screamo, sludge, and adjacent heavy styles.',
            'tags' => [
                'acoustic rock', 'alternative metal', 'black metal', 'blues rock', 'blues-rock',
                'classic rock', 'death metal', 'deathcore', 'doom metal', 'glam metal',
                'groove metal', 'gothic metal', 'gothic-metal', 'hair metal', 'hard rock',
                'hardcore', 'heavy metal', 'industrial metal', 'melodic death metal', 'metal',
                'metalcore', 'nu metal', 'nu-metal', 'post grunge', 'post-grunge',
                'power metal', 'progressive metal', 'progressive rock', 'rock', 'rock & roll',
                'screamo', 'sludge', 'sludge metal', 'soft rock', 'southern rock',
                'space rock', 'speed metal', 'stoner metal', 'stoner rock', 'symphonic metal',
                'thrash metal'
            ]
        ],
        'indie' => [
            'label' => 'Indie & Alternative',
            'title' => 'Covers indie rock, alternative rock, alternative pop, shoegaze, goth rock, and post-rock.',
            'tags' => [
                'alternative', 'alternative r&b', 'alternative rock',
                'art rock', 'britpop', 'darkwave', 'dream pop',
                'emo', 'garage rock', 'goth rock', 'gothic rock',
                'grunge', 'indie', 'indie folk', 'indie pop', 'indie rock',
                'industrial rock', 'lo-fi', 'math rock', 'new wave', 'noise rock',
                'pop rock', 'post metal', 'post rock', 'post-metal', 'post-rock',
                'psychedelic', 'psychedelic rock', 'shoegaze', 'stoner'
            ]
        ],
        'punk' => [
            'label' => 'Punk & Post-Punk',
            'title' => 'Covers punk, punk rock, pop punk, post-punk, post-hardcore, and skate punk.',
            'tags' => [
                'alternative hardcore', 'celt rock / punk', 'emocore', 'folk punk', 'garage punk',
                'hardcore punk', 'horror punk', 'melodic hardcore', 'pop punk', 'post hardcore',
                'post punk', 'post-hardcore', 'post-punk', 'punk', 'punk rock',
                'skate punk', 'street punk'
            ]
        ],
        'electronic' => [
            'label' => 'Electronic & Synth',
            'title' => 'Covers electronic, synthpop, synthwave, EDM, techno, house, dubstep, downtempo, and ambient.',
            'tags' => [
                'acid house', 'ambient', 'club', 'dance', 'deep house', 'downtempo', 'drum and bass',
                'dubstep', 'edm', 'electro', 'electronic', 'electronica', 'house', 'idm', 'industrial',
                'synth-pop', 'synthpop', 'synthwave', 'techno', 'trance', 'trip-hop', 'trip hop'
            ]
        ],
        'folk' => [
            'label' => 'Folk, Country & Americana',
            'title' => 'Covers folk, country, americana, bluegrass, alt-country, celtic, and acoustic acoustic traditions.',
            'tags' => [
                'acoustic', 'alt-country', 'americana', 'bluegrass', 'celtic', 'country',
                'country pop', 'country rock', 'folk', 'folk rock', 'indie folk', 'irish',
                'roots', 'scottish', 'traditional folk'
            ]
        ],
        'hiphop' => [
            'label' => 'Hip-Hop, R&B & Funk',
            'title' => 'Covers hip-hop, rap, trap, r&b, soul, neo-soul, funk, and afrobeat.',
            'tags' => [
                'abstract hip-hop', 'afrobeat', 'def jux', 'disco', 'east coast hip hop',
                'funk', 'groove', 'hip hop', 'hip-hop', 'instrumental hip-hop', 'neo-soul',
                'r&b', 'rap', 'rhythm and blues', 'soul', 'trap', 'underground hip-hop'
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
