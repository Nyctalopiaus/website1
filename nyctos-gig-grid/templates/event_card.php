<?php
/**
 * Single Event Card Template Component
 *
 * Expected variables in scope:
 *   $group          (array)  - Grouped event data
 *   $residencyCounts(array)  - Multi-day residency counts
 *   $activeMarket   (string) - Active market slug
 *   $ignoredTags    (array)  - Normalized ignored tags
 */

$event = $group['primary'];
$dateInfo = getEventDateDetails($event['start_time']);
$ticketUrl = $event['ticket_url'];
$isCoheadliner = count($group['artists']) > 1;
$availabilityTag = trim((string)($event['availability_tag'] ?? ''));
$combinedTagsStr = implode(', ', $group['tags']);
$resolvedCity = resolveEventCardCity($event);
$searchBlob = strtolower(trim(implode(' ', array_filter([
    implode(' ', $group['artists']),
    (string)($event['artist_name'] ?? ''),
    (string)($event['venue_name'] ?? ''),
    (string)$resolvedCity,
    $combinedTagsStr
]))));

// Check for Multi-Day Stand / Residency
$isMultiDayResidency = false;
$residencyNightCount = 0;
foreach ($group['artists'] as $artName) {
    $comboKey = strtolower(trim($artName)) . '||' . strtolower(trim((string)$event['venue_name']));
    if (isset($residencyCounts[$comboKey]) && count($residencyCounts[$comboKey]) > 1) {
        $isMultiDayResidency = true;
        $residencyNightCount = max($residencyNightCount, count($residencyCounts[$comboKey]));
    }
}
$groupEventIdsStr = implode(',', array_column($group['events'], 'event_id'));

$pMin = isset($event['price_min']) ? (float)$event['price_min'] : null;
$pMax = isset($event['price_max']) ? (float)$event['price_max'] : null;
$priceTextSources = [
    trim((string)($event['availability_tag'] ?? '')),
    trim((string)($event['ticket_url'] ?? '')),
    trim((string)($event['artist_name'] ?? '')),
    trim((string)($event['venue_name'] ?? '')),
];
foreach ((array)($group['tags'] ?? []) as $tag) {
    $tagText = trim((string)$tag);
    if ($tagText !== '') {
        $priceTextSources[] = $tagText;
    }
}
$priceTextBlob = strtolower(implode(' ', array_filter($priceTextSources, static function ($value) {
    return trim((string)$value) !== '';
})));
$hasExplicitFreeSignal = preg_match('/\b(?:free(?:\s+(?:show|event|entry|admission|concert|music|night))?|no cover|no cover charge|complimentary|doors? free)\b/i', $priceTextBlob) === 1;
$looksFreeByPrice = $pMin !== null && $pMin === 0.0 && ($pMax === null || $pMax <= 0.0);
$shouldShowFreeBadge = $hasExplicitFreeSignal || $looksFreeByPrice;
?>
<article class="event-card" data-status="Approved" data-event-ids="<?php echo htmlspecialchars($groupEventIdsStr); ?>" data-city="<?php echo htmlspecialchars(strtolower($resolvedCity)); ?>" data-venue="<?php echo htmlspecialchars(strtolower($event['venue_name'])); ?>" data-genre="<?php echo htmlspecialchars(strtolower($event['genre'] ?? 'all')); ?>" data-tags="<?php echo htmlspecialchars(strtolower($combinedTagsStr)); ?>" data-search="<?php echo htmlspecialchars($searchBlob); ?>" data-free="<?php echo $shouldShowFreeBadge ? '1' : '0'; ?>" id="card-<?php echo $event['event_id']; ?>">
    <!-- Left Stub -->
    <div class="date-stub">
        <div class="date-block-vertical">
            <span class="date-month"><?php echo $dateInfo['month_abbr']; ?></span>
            <span class="date-day"><?php echo $dateInfo['day']; ?></span>
            <span class="date-weekday"><?php echo $dateInfo['weekday']; ?></span>
        </div>
        <?php if ($availabilityTag !== ''): ?>
            <span class="event-availability-tag" title="Ticket availability status from source feed."><?php echo htmlspecialchars($availabilityTag); ?></span>
        <?php endif; ?>
        <button type="button" class="btn-ignore-event" data-event-ids="<?php echo htmlspecialchars($groupEventIdsStr); ?>" title="Hide this show from your view">
            <span class="btn-ignore-icon">🚫</span>
            <span class="btn-ignore-text">Ignore</span>
        </button>
    </div>

    <!-- Center Info -->
    <div class="event-info">
        <?php 
            $eventTitleBanner = null;
            $filteredArtists = [];
            $eventGenre = strtolower((string)($event['genre'] ?? 'all'));
            $isSpecialEvent = ($eventGenre === 'special_event');

            $adminSpecialEvents = getAdminSpecialEvents();
            $adminEventTitles = getAdminEventTitles();

            foreach ($group['artists'] as $artName) {
                $aLower = strtolower(trim($artName));
                
                foreach (array_keys($adminSpecialEvents) as $specPattern) {
                    $pLower = strtolower(trim($specPattern));
                    if ($pLower !== '' && preg_match('/\b' . preg_quote($pLower, '/') . '\b/i', $aLower)) {
                        $isSpecialEvent = true;
                        break;
                    }
                }
                
                $isBannerMatch = false;
                foreach ($adminEventTitles as $titlePattern => $displayTitle) {
                    if ($titlePattern !== '' && (strpos($aLower, $titlePattern) !== false || $aLower === $titlePattern)) {
                        if (!$eventTitleBanner) {
                            $eventTitleBanner = strtoupper(trim($artName));
                        }
                        $isBannerMatch = true;
                        break;
                    }
                }
                
                if (!$isBannerMatch) {
                    $filteredArtists[] = $artName;
                }
            }

            if (empty($filteredArtists) && $eventTitleBanner) {
                $filteredArtists[] = $eventTitleBanner;
                $isSpecialEvent = true;
            }
        ?>

        <?php if ($eventTitleBanner): ?>
            <div class="event-title-badge">
                <span class="event-title-icon">🎟️</span> <span class="event-title-text"><?php echo htmlspecialchars($eventTitleBanner); ?></span>
            </div>
        <?php endif; ?>
        <?php if ($isCoheadliner): ?>
            <div class="artist-list">
                <?php foreach ($filteredArtists as $artIndex => $artName): ?>
                    <?php if ($artIndex === 0): ?>
                        <div class="artist-line headliner-line">
                            <h2 class="artist-name"><?php echo htmlspecialchars($artName); ?></h2>
                            <?php if (!$isSpecialEvent): ?>
                            <div class="artist-line-actions inline-actions">
                                <button type="button" class="btn-listen" data-artist="<?php echo htmlspecialchars($artName); ?>">
                                    🎧 Listen
                                </button>
                                <button type="button" class="btn-insights" data-artist="<?php echo htmlspecialchars($artName); ?>">
                                    ℹ️ Artist Bio
                                </button>
                                <div class="artist-links-dropdown">
                                    <button type="button" class="btn-links-toggle" data-artist="<?php echo htmlspecialchars($artName); ?>">
                                        🌐 Links <span class="dropdown-caret">▼</span>
                                    </button>
                                    <div class="links-popover">
                                        <a href="https://open.spotify.com/search/<?php echo rawurlencode($artName); ?>" target="_blank" rel="noopener noreferrer" class="link-item spotify">
                                            <span class="link-icon">🟢</span> Spotify
                                        </a>
                                        <a href="https://www.youtube.com/results?search_query=<?php echo rawurlencode($artName); ?>" target="_blank" rel="noopener noreferrer" class="link-item youtube">
                                            <span class="link-icon">🔴</span> YouTube
                                        </a>
                                        <a href="https://music.apple.com/us/search?term=<?php echo rawurlencode($artName); ?>" target="_blank" rel="noopener noreferrer" class="link-item applemusic">
                                            <span class="link-icon">🔵</span> Apple Music
                                        </a>
                                        <a href="https://www.last.fm/music/<?php echo rawurlencode($artName); ?>" target="_blank" rel="noopener noreferrer" class="link-item lastfm">
                                            <span class="link-icon">🟠</span> Last.fm
                                        </a>
                                        <a href="https://www.pandora.com/search/<?php echo rawurlencode($artName); ?>/all" target="_blank" rel="noopener noreferrer" class="link-item pandora">
                                            <span class="link-icon">🟣</span> Pandora
                                        </a>
                                    </div>
                                </div>
                            </div>
                            <?php endif; ?>
                            <?php if (!empty($isAdmin)): ?>
                                <div class="admin-artist-inline-tools">
                                    <button type="button" class="btn-admin-act btn-admin-mini btn-admin-headliner" data-artist="<?php echo htmlspecialchars($artName); ?>" data-event-id="<?php echo $event['event_id']; ?>" title="Promote '<?php echo htmlspecialchars($artName); ?>' to #1 Headliner">👑 Headliner</button>
                                    <button type="button" class="btn-admin-act btn-admin-mini btn-admin-banner" data-artist="<?php echo htmlspecialchars($artName); ?>" title="Set '<?php echo htmlspecialchars($artName); ?>' as Tour/Event Banner">🎟️ Banner</button>
                                    <button type="button" class="btn-admin-act btn-admin-mini btn-admin-special" data-artist="<?php echo htmlspecialchars($artName); ?>" title="Suppress Music Buttons for '<?php echo htmlspecialchars($artName); ?>'">🚫 Suppress</button>
                                    <button type="button" class="btn-admin-act btn-admin-mini btn-admin-split" data-artist="<?php echo htmlspecialchars($artName); ?>" title="Split combined band names in '<?php echo htmlspecialchars($artName); ?>'">✂️ Split</button>
                                    <button type="button" class="btn-admin-act btn-admin-mini btn-admin-artist-override" data-event-id="<?php echo $event['event_id']; ?>" data-current-artists="<?php echo htmlspecialchars($event['artist_name'] ?? ''); ?>" title="Override artist name(s) for this card (supports multiple bands)">✍️ Artists</button>
                                    <button type="button" class="btn-admin-act btn-admin-mini btn-admin-omit" data-artist="<?php echo htmlspecialchars($artName); ?>" title="Omit/Ignore '<?php echo htmlspecialchars($artName); ?>'">🗑️ Omit</button>
                                </div>
                            <?php endif; ?>
                        </div>
                    <?php else: ?>
                        <div class="artist-line supporting-line">
                            <span class="supporting-artist-name"><?php echo htmlspecialchars($artName); ?></span>
                            <?php if (!$isSpecialEvent): ?>
                            <div class="artist-line-actions inline-actions">
                                <button type="button" class="btn-listen" data-artist="<?php echo htmlspecialchars($artName); ?>">
                                    🎧 Listen
                                </button>
                                <button type="button" class="btn-insights" data-artist="<?php echo htmlspecialchars($artName); ?>">
                                    ℹ️ Artist Bio
                                </button>
                                <div class="artist-links-dropdown">
                                    <button type="button" class="btn-links-toggle" data-artist="<?php echo htmlspecialchars($artName); ?>">
                                        🌐 Links <span class="dropdown-caret">▼</span>
                                    </button>
                                    <div class="links-popover">
                                        <a href="https://open.spotify.com/search/<?php echo rawurlencode($artName); ?>" target="_blank" rel="noopener noreferrer" class="link-item spotify">
                                            <span class="link-icon">🟢</span> Spotify
                                        </a>
                                        <a href="https://www.youtube.com/results?search_query=<?php echo rawurlencode($artName); ?>" target="_blank" rel="noopener noreferrer" class="link-item youtube">
                                            <span class="link-icon">🔴</span> YouTube
                                        </a>
                                        <a href="https://music.apple.com/us/search?term=<?php echo rawurlencode($artName); ?>" target="_blank" rel="noopener noreferrer" class="link-item applemusic">
                                            <span class="link-icon">🔵</span> Apple Music
                                        </a>
                                        <a href="https://www.last.fm/music/<?php echo rawurlencode($artName); ?>" target="_blank" rel="noopener noreferrer" class="link-item lastfm">
                                            <span class="link-icon">🟠</span> Last.fm
                                        </a>
                                        <a href="https://www.pandora.com/search/<?php echo rawurlencode($artName); ?>/all" target="_blank" rel="noopener noreferrer" class="link-item pandora">
                                            <span class="link-icon">🟣</span> Pandora
                                        </a>
                                    </div>
                                </div>
                            </div>
                            <?php endif; ?>
                            <?php if (!empty($isAdmin)): ?>
                                <div class="admin-artist-inline-tools">
                                    <button type="button" class="btn-admin-act btn-admin-mini btn-admin-headliner" data-artist="<?php echo htmlspecialchars($artName); ?>" data-event-id="<?php echo $event['event_id']; ?>" title="Promote '<?php echo htmlspecialchars($artName); ?>' to #1 Headliner">👑 Headliner</button>
                                    <button type="button" class="btn-admin-act btn-admin-mini btn-admin-banner" data-artist="<?php echo htmlspecialchars($artName); ?>" title="Set '<?php echo htmlspecialchars($artName); ?>' as Tour/Event Banner">🎟️ Banner</button>
                                    <button type="button" class="btn-admin-act btn-admin-mini btn-admin-special" data-artist="<?php echo htmlspecialchars($artName); ?>" title="Suppress Music Buttons for '<?php echo htmlspecialchars($artName); ?>'">🚫 Suppress</button>
                                    <button type="button" class="btn-admin-act btn-admin-mini btn-admin-split" data-artist="<?php echo htmlspecialchars($artName); ?>" title="Split combined band names in '<?php echo htmlspecialchars($artName); ?>'">✂️ Split</button>
                                    <button type="button" class="btn-admin-act btn-admin-mini btn-admin-artist-override" data-event-id="<?php echo $event['event_id']; ?>" data-current-artists="<?php echo htmlspecialchars($event['artist_name'] ?? ''); ?>" title="Override artist name(s) for this card (supports multiple bands)">✍️ Artists</button>
                                    <button type="button" class="btn-admin-act btn-admin-mini btn-admin-omit" data-artist="<?php echo htmlspecialchars($artName); ?>" title="Omit/Ignore '<?php echo htmlspecialchars($artName); ?>'">🗑️ Omit</button>
                                </div>
                            <?php endif; ?>
                        </div>
                    <?php endif; ?>
                <?php endforeach; ?>
            </div>
        <?php else: ?>
            <?php $singleArt = $filteredArtists[0] ?? 'Unknown Artist'; ?>
            <div class="artist-list">
                <div class="artist-line headliner-line">
                    <h2 class="artist-name"><?php echo htmlspecialchars($singleArt); ?></h2>
                    <?php if (!$isSpecialEvent): ?>
                    <div class="artist-line-actions inline-actions">
                        <button type="button" class="btn-listen" data-artist="<?php echo htmlspecialchars($singleArt); ?>">
                            🎧 Listen
                        </button>
                        <button type="button" class="btn-insights" data-artist="<?php echo htmlspecialchars($singleArt); ?>">
                            ℹ️ Artist Bio
                        </button>
                        <div class="artist-links-dropdown">
                            <button type="button" class="btn-links-toggle" data-artist="<?php echo htmlspecialchars($singleArt); ?>">
                                🌐 Links <span class="dropdown-caret">▼</span>
                            </button>
                            <div class="links-popover">
                                <a href="https://open.spotify.com/search/<?php echo rawurlencode($singleArt); ?>" target="_blank" rel="noopener noreferrer" class="link-item spotify">
                                    <span class="link-icon">🟢</span> Spotify
                                </a>
                                <a href="https://www.youtube.com/results?search_query=<?php echo rawurlencode($singleArt); ?>" target="_blank" rel="noopener noreferrer" class="link-item youtube">
                                    <span class="link-icon">🔴</span> YouTube
                                </a>
                                <a href="https://music.apple.com/us/search?term=<?php echo rawurlencode($singleArt); ?>" target="_blank" rel="noopener noreferrer" class="link-item applemusic">
                                    <span class="link-icon">🔵</span> Apple Music
                                </a>
                                <a href="https://www.last.fm/music/<?php echo rawurlencode($singleArt); ?>" target="_blank" rel="noopener noreferrer" class="link-item lastfm">
                                    <span class="link-icon">🟠</span> Last.fm
                                </a>
                                <a href="https://www.pandora.com/search/<?php echo rawurlencode($singleArt); ?>/all" target="_blank" rel="noopener noreferrer" class="link-item pandora">
                                    <span class="link-icon">🟣</span> Pandora
                                </a>
                            </div>
                        </div>
                    </div>
                    <?php endif; ?>
                    <?php if (!empty($isAdmin)): ?>
                        <div class="admin-artist-inline-tools">
                            <button type="button" class="btn-admin-act btn-admin-mini btn-admin-banner" data-artist="<?php echo htmlspecialchars($singleArt); ?>" title="Set '<?php echo htmlspecialchars($singleArt); ?>' as Tour/Event Banner">🎟️ Banner</button>
                            <button type="button" class="btn-admin-act btn-admin-mini btn-admin-special" data-artist="<?php echo htmlspecialchars($singleArt); ?>" title="Suppress Music Buttons for '<?php echo htmlspecialchars($singleArt); ?>'">🚫 Suppress</button>
                            <button type="button" class="btn-admin-act btn-admin-mini btn-admin-split" data-artist="<?php echo htmlspecialchars($singleArt); ?>" title="Split combined band names in '<?php echo htmlspecialchars($singleArt); ?>'">✂️ Split</button>
                            <button type="button" class="btn-admin-act btn-admin-mini btn-admin-artist-override" data-event-id="<?php echo $event['event_id']; ?>" data-current-artists="<?php echo htmlspecialchars($event['artist_name'] ?? ''); ?>" title="Override artist name(s) for this card (supports multiple bands)">✍️ Artists</button>
                            <button type="button" class="btn-admin-act btn-admin-mini btn-admin-omit" data-artist="<?php echo htmlspecialchars($singleArt); ?>" title="Omit/Ignore '<?php echo htmlspecialchars($singleArt); ?>'">🗑️ Omit</button>
                        </div>
                    <?php endif; ?>
                </div>
            </div>
        <?php endif; ?>
         <div class="tags-row tags-row-spaced">
             <?php if ($isCoheadliner): ?>
                 <span class="badge-price-alert alert-drop badge-shared-lineup" title="Multiple bands performing on the same stage tonight!">
                     🔥 Shared Lineup (<?php echo count($group['artists']); ?> Bands)
                 </span>
             <?php endif; ?>

             <?php if ($isMultiDayResidency): ?>
                 <span class="badge-price-alert alert-drop badge-multi-day" title="This artist is performing multiple nights at this venue!">
                     🗓️ Multi-Day Event! (<?php echo $residencyNightCount; ?> Nights)
                 </span>
             <?php endif; ?>

             <?php if ($shouldShowFreeBadge): ?>
                 <span class="badge-price price-free" title="Free event indicated by the source data.">
                     🆓 FREE
                 </span>
             <?php elseif ($pMin !== null): ?>
                 <?php if ($pMin < 30) {
                     $tier = '$';
                     $tierClass = 'price-low';
                     $tierText = 'Budget-Friendly';
                 } elseif ($pMin <= 60) {
                     $tier = '$$';
                     $tierClass = 'price-mid';
                     $tierText = 'Moderate';
                 } else {
                     $tier = '$$$';
                     $tierClass = 'price-high';
                     $tierText = 'Premium';
                 }
                 $tooltipText = "Est: $" . number_format($pMin, 2);
                 if ($pMax !== null && $pMax > $pMin) {
                     $tooltipText .= " - $" . number_format($pMax, 2);
                 }
                 ?>
                 <span class="badge-price <?php echo $tierClass; ?>" title="<?php echo htmlspecialchars($tooltipText . ' (' . $tierText . ')'); ?>">
                     💵 <?php echo $tier; ?>
                 </span>
             <?php endif; ?>

             <?php if (!empty($event['price_dropped_flag'])):
                 $dropAmount = isset($event['price_drop_amount']) ? (float)$event['price_drop_amount'] : 0;
                 $dropDetectedAt = $event['price_drop_detected_at'] ?? null;
                 $dropTooltip = 'Recent ticket price drop detected during sync.';
                 if ($dropAmount > 0) {
                     $dropTooltip .= ' Down by $' . number_format($dropAmount, 2) . '.';
                 }
                 if (!empty($dropDetectedAt)) {
                     $dropTooltip .= ' Triggered: ' . date('M j, g:i A', strtotime($dropDetectedAt)) . '.';
                 }
             ?>
                 <span class="badge-price-alert alert-drop alert-pulse" title="<?php echo htmlspecialchars($dropTooltip); ?>">
                     ⬇ Price Dropped
                 </span>
             <?php endif; ?>

             <?php if (!empty($event['low_ticket_flag'])): ?>
                 <span class="badge-price-alert alert-low-ticket alert-pulse" title="Low ticket inventory warning from source API.">
                     ! Low Tickets
                 </span>
             <?php endif; ?>
             
             <?php if (!empty($group['tags'])): ?>
                 <?php foreach ($group['tags'] as $tag): 
                     $tag = trim($tag);
                     if (empty($tag)) continue;
                 ?>
                     <span class="tag-pill"><?php echo htmlspecialchars($tag); ?></span>
                 <?php endforeach; ?>
             <?php endif; ?>
         </div>
        <div class="venue-row">
            <span>📍</span>
            <strong class="clickable-venue" data-venue-name="<?php echo htmlspecialchars($event['venue_name']); ?>"><?php echo htmlspecialchars($event['venue_name']); ?></strong> 
            <span class="venue-location-text"><?php echo htmlspecialchars(formatMarketLocation(resolveEventCardCity($event), $event['market'] ?? $activeMarket)); ?></span>
        </div>
        <div class="time-row time-row-wrap">
            <span>⏱️</span>
            <span>
                <?php if (!empty($event['doors_time']) && strtotime($event['doors_time']) !== false && strtotime($event['doors_time']) !== strtotime($event['start_time'])): ?>
                    <?php echo 'Doors ' . date('g:i A', strtotime($event['doors_time'])) . ' // Show ' . $dateInfo['time']; ?>
                <?php else: ?>
                    <?php echo 'Show starts at ' . $dateInfo['time']; ?>
                <?php endif; ?>
            </span>
            <span class="weather-container" data-venue="<?php echo htmlspecialchars($event['venue_name']); ?>" data-start="<?php echo htmlspecialchars($event['start_time']); ?>" data-is-outdoor="<?php echo isOutdoorVenue($event['venue_name']) ? '1' : '0'; ?>"></span>
        </div>
        <?php if (!empty($group['tags'])): ?>
            <div class="subgenre-source-note">
                *Subgenre tags auto-imported from Last.fm / Ticketmaster / Bandsintown
            </div>
        <?php endif; ?>
    </div>

    <div class="ticket-stub">
        <?php
            $ticketLinks = [];
            $addedUrls = [];

            $resolveVendor = function($url, $defaultName = 'Primary Tickets', $defaultIcon = '🎟️') {
                $uLower = strtolower((string)$url);
                if (strpos($uLower, 'ticketmaster.com') !== false || strpos($uLower, 'livenation.com') !== false) {
                    return ['name' => 'Ticketmaster', 'icon' => '🎫'];
                }
                if (strpos($uLower, 'eventbrite.com') !== false) {
                    return ['name' => 'Eventbrite', 'icon' => '🎟️'];
                }
                if (strpos($uLower, 'axs.com') !== false) {
                    return ['name' => 'AXS', 'icon' => '🎫'];
                }
                if (strpos($uLower, 'bandsintown.com') !== false) {
                    return ['name' => 'Bandsintown', 'icon' => '🎸'];
                }
                if (strpos($uLower, 'dice.fm') !== false) {
                    return ['name' => 'DICE', 'icon' => '🎲'];
                }
                if (strpos($uLower, 'seatgeek.com') !== false) {
                    return ['name' => 'SeatGeek', 'icon' => '🎟️'];
                }
                if (strpos($uLower, 'stubhub.com') !== false) {
                    return ['name' => 'StubHub', 'icon' => '🎫'];
                }
                return ['name' => $defaultName, 'icon' => $defaultIcon];
            };

            $candidateRawUrls = array_filter([
                'ticketmaster' => $event['ticketmaster_url'] ?? null,
                'eventbrite'   => $event['eventbrite_url'] ?? null,
                'bandsintown'  => $event['bandsintown_url'] ?? null,
                'venue'        => $event['venue_url'] ?? null,
                'primary'      => $ticketUrl ?? null,
            ]);

            foreach ($candidateRawUrls as $srcType => $rawUrl) {
                if (empty($rawUrl) || in_array($rawUrl, $addedUrls, true)) {
                    continue;
                }
                if ($srcType === 'venue') {
                    $vInfo = $resolveVendor($rawUrl, 'Venue Direct', '🏢');
                } else {
                    $vInfo = $resolveVendor($rawUrl);
                }
                $ticketLinks[] = ['url' => $rawUrl, 'icon' => $vInfo['icon'], 'name' => $vInfo['name']];
                $addedUrls[] = $rawUrl;
            }

            if (empty($ticketLinks)) {
                $searchUrl = "https://www.google.com/search?q=" . urlencode($event['artist_name'] . ' concert ' . $event['venue_name']);
                $ticketLinks[] = ['url' => $searchUrl, 'icon' => '🔍', 'name' => 'Search Tickets'];
            }
        ?>
        <div class="artist-links-dropdown" style="width: 100%;">
            <button type="button" class="btn-tickets secondary btn-links-toggle" style="width: 100% !important; display: flex; justify-content: space-between; align-items: center; box-sizing: border-box; padding: 0.5rem 0.35rem; font-size: 0.76rem; font-weight: 700; letter-spacing: 0;">
                <span>🎟️</span>
                <span>GET TICKETS</span>
                <span class="dropdown-caret" style="font-size: 0.65rem;">▼</span>
            </button>
            <div class="links-popover" style="width: 100%; min-width: 100%; box-sizing: border-box;">
                <?php foreach ($ticketLinks as $link): ?>
                    <a href="<?php echo htmlspecialchars($link['url']); ?>" target="_blank" rel="noopener noreferrer" class="link-item">
                        <span class="link-icon"><?php echo $link['icon']; ?></span> <?php echo htmlspecialchars($link['name']); ?>
                    </a>
                <?php endforeach; ?>
            </div>
        </div>
         
         <div class="ticket-action-row">
             <a href="ical.php?event_id=<?php echo $event['event_id']; ?>" class="btn-ticket-action" title="Add to Calendar">
                 📅
             </a>
             <button type="button" 
                     class="btn-ticket-action btn-view-setlist" 
                     data-id="<?php echo $event['event_id']; ?>"
                     data-artist="<?php echo htmlspecialchars($event['artist_name']); ?>"
                     data-date="<?php echo htmlspecialchars($event['start_time']); ?>"
                     data-venue="<?php echo htmlspecialchars($event['venue_name']); ?>"
                    data-city="<?php echo htmlspecialchars($resolvedCity); ?>"
                     title="View Setlist">
                 🎵
             </button>
             <button type="button" 
                     class="btn-ticket-action btn-interested-toggle" 
                     data-id="<?php echo $event['event_id']; ?>"
                     data-artist="<?php echo htmlspecialchars($event['artist_name']); ?>"
                     data-venue="<?php echo htmlspecialchars($event['venue_name']); ?>"
                    data-city="<?php echo htmlspecialchars($resolvedCity); ?>"
                     data-start="<?php echo htmlspecialchars($event['start_time']); ?>"
                     data-tags="<?php echo htmlspecialchars($combinedTagsStr); ?>"
                     title="Mark as Interested">
                 ☆
             </button>
          </div>
    </div>
    <!-- Audio Preview Drawer -->
    <div class="audio-drawer" style="display: none;"></div>
    
    <!-- Artist Insights Drawer -->
    <div class="insights-drawer-wrapper">
        <div class="insights-drawer"></div>
    </div>

    <?php if (!empty($isAdmin)): ?>
        <div class="admin-card-bar">
            <div class="admin-card-bar-header">
                <span class="admin-card-bar-label">Card Overrides</span>
                <span class="admin-card-id">ID: <?php echo htmlspecialchars($event['event_id']); ?></span>
            </div>

            <div class="admin-card-grid">
                <div class="admin-control-card">
                    <label class="admin-field admin-field-genre">
                        <span class="admin-field-label">Genre</span>
                        <select class="admin-genre-select admin-input" data-event-id="<?php echo htmlspecialchars($event['event_id']); ?>">
                            <?php 
                            $currGenre = strtolower((string)($event['genre'] ?? 'all'));
                            $genres = ['all' => 'All Genres', 'rock' => 'Rock', 'metal' => 'Metal', 'electronic' => 'Electronic / EDM', 'country' => 'Country / Folk', 'hip-hop' => 'Hip-Hop / Rap', 'pop' => 'Pop', 'indie' => 'Indie / Alt', 'jazz' => 'Jazz / Blues', 'special_event' => 'Special Event'];
                            foreach ($genres as $gVal => $gLbl) {
                                $sel = ($currGenre === $gVal) ? 'selected' : '';
                                echo '<option value="' . $gVal . '" ' . $sel . '>' . htmlspecialchars($gLbl) . '</option>';
                            }
                            ?>
                        </select>
                    </label>
                </div>

                <div class="admin-control-card">
                    <label class="admin-field admin-field-city">
                        <span class="admin-field-label">City Override</span>
                        <div class="admin-input-row">
                            <input type="text" class="admin-city-input admin-input" data-venue="<?php echo htmlspecialchars($event['venue_name']); ?>" value="<?php echo htmlspecialchars($resolvedCity); ?>" placeholder="Override city..." />
                            <button type="button" class="btn-admin-act btn-admin-save-city btn-admin-slim" data-venue="<?php echo htmlspecialchars($event['venue_name']); ?>">Save City</button>
                        </div>
                    </label>
                </div>

                <div class="admin-control-card admin-control-card-actions">
                    <button type="button" class="btn-admin-act btn-admin-title btn-admin-slim" data-event-id="<?php echo htmlspecialchars($event['event_id']); ?>" data-current-title="<?php echo htmlspecialchars($event['artist_name'] ?? ''); ?>" title="Set a single banner/title line (disables artist splitting for this card)">Set Banner Name</button>
                    <button type="button" class="btn-admin-act btn-admin-mark-special btn-admin-slim btn-admin-warn" data-event-id="<?php echo htmlspecialchars($event['event_id']); ?>" title="Mark this event as non-music and hide listen/link buttons">Mark Non-Music</button>
                </div>
            </div>
        </div>
    <?php endif; ?>
</article>
