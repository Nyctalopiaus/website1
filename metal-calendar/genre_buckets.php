<?php

function getGenreBucketConfig() {
    return [
        'all' => [
            'label' => 'All Genres',
            'title' => 'Show every event currently loaded into the concert passport.',
            'keywords' => []
        ],
        'metal' => [
            'label' => 'Rock & Metal',
            'title' => 'Rock & Metal catch-all. Covers metal, rock, heavy metal, hard rock, nu-metal, classic rock, progressive metal, and any uncategorized new tags.',
            'keywords' => ['metal', 'rock', 'heavy metal', 'hard rock', 'nu-metal', 'classic rock', 'progressive metal', 'sludge metal', 'rock & roll', 'progressive rock']
        ],
        'extreme' => [
            'label' => 'Metalcore & Extreme',
            'title' => 'Covers metalcore, deathcore, hardcore, grindcore, screamo, black metal, death metal, doom metal, thrash metal, and adjacent extreme styles.',
            'keywords' => ['metalcore', 'deathcore', 'hardcore', 'grindcore', 'screamo', 'black metal', 'death metal', 'doom metal', 'thrash metal', 'sludge']
        ],
        'indie' => [
            'label' => 'Indie & Alternative',
            'title' => 'Covers alternative rock, indie rock, alternative, post rock, grunge, shoegaze, dream pop, art rock, and related left-of-center styles.',
            'keywords' => ['alternative rock', 'indie rock', 'alternative', 'post rock', 'post-rock', 'grunge', 'shoegaze', 'dream pop', 'art rock', 'alt-rock']
        ],
        'punk' => [
            'label' => 'Punk & Post-Punk',
            'title' => 'Covers punk, punk rock, pop-punk, post-punk, post-hardcore, skate punk, folk punk, and hardcore punk.',
            'keywords' => ['punk', 'punk rock', 'pop-punk', 'post-punk', 'post-hardcore', 'skate punk', 'folk punk', 'hardcore punk']
        ]
    ];
}
