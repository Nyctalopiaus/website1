<?php
/**
 * Filter Controls Template Component
 */
if (!isset($activeCountry) || !in_array($activeCountry, ['scotland', 'england', 'wales', 'ireland'], true)) {
    $activeCountry = strtolower($_GET['region'] ?? $_COOKIE['active_country_uk'] ?? $_COOKIE['active_country_market'] ?? 'england');
}
if (!in_array($activeCountry, ['scotland', 'england', 'wales', 'ireland'], true)) {
    $activeCountry = 'england';
}
?>
<!-- Tightened Unified Sticky Controls Wrapper -->
<div class="sticky-controls-wrapper" style="width: 100%; box-sizing: border-box;">
    <!-- Row 1: Market Tabs (Left) + Month Selection (Far Right Edge) -->
    <div class="controls-row-primary" style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 0.75rem; margin-bottom: 0.5rem; flex-wrap: nowrap;">
        <div class="region-market-navigator" style="display: flex; align-items: center; gap: 0.6rem; flex: 0 0 auto;">
            <!-- Glassmorphic Region Switcher Toggle -->
            <div class="region-toggle-pill">
                <a class="region-toggle-btn <?php echo $activeRegionCategory === 'us' ? 'active' : ''; ?>" data-target-group="us" href="<?php echo htmlspecialchars(buildMarketLink('colorado', null, false)); ?>">
                    🗽 America
                </a>
                <a class="region-toggle-btn <?php echo $activeRegionCategory === 'intl' ? 'active' : ''; ?>" data-target-group="intl" href="<?php echo htmlspecialchars(buildMarketLink('uk', $activeCountry, false)); ?>">
                    🌐 International
                </a>
            </div>

            <!-- Dynamic US States Dropdown -->
            <div id="us-states-select-container" class="market-select-wrapper" style="display: <?php echo $activeRegionCategory === 'us' ? 'inline-block' : 'none'; ?>;">
                <select id="us-state-dropdown-select" class="market-dropdown-select">
                    <?php foreach ($usStateMarkets as $st): ?>
                        <option value="<?php echo htmlspecialchars($st['link']); ?>" <?php echo ($activeMarket === $st['key'] || ($activeRegionCategory !== 'us' && $st['key'] === 'california')) ? 'selected' : ''; ?>>
                            <?php echo htmlspecialchars($st['name'] . ' (' . number_format($st['count']) . ')'); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>

            <!-- Dynamic International Countries Dropdown -->
            <div id="intl-countries-select-container" class="market-select-wrapper" style="display: <?php echo $activeRegionCategory === 'intl' ? 'inline-block' : 'none'; ?>;">
                <select id="intl-country-dropdown-select" class="market-dropdown-select">
                    <?php foreach ($intlCountryMarkets as $co): ?>
                        <option value="<?php echo htmlspecialchars($co['link']); ?>" <?php echo (($activeMarket === 'uk' && $activeCountry === $co['key']) || $activeMarket === $co['key']) ? 'selected' : ''; ?>>
                            <?php echo htmlspecialchars($co['name'] . ' (' . number_format($co['count']) . ')'); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>
        </div>

        <div class="month-select-controls" style="margin-left: auto; flex: 0 0 auto;">
            <select id="month-dropdown-select">
                <?php if (empty($activeMonths)): ?>
                    <option value="empty-view">No Shows Found</option>
                <?php else: ?>
                    <?php foreach ($activeMonths as $index => $month): ?>
                        <option value="month-<?php echo $month; ?>" <?php echo (isset($requestedMonth) && $requestedMonth === $month) || (!isset($requestedMonth) && $index === 0) ? 'selected' : ''; ?>>
                            📅 <?php echo formatMonthName($month); ?>
                        </option>
                    <?php endforeach; ?>
                    <option id="interested-dropdown-option" value="interested-view">⭐ Favorite Shows (0)</option>
                <?php endif; ?>
            </select>
        </div>
    </div>

    <!-- Row 2: Region Toggles (Left) + Venue Select + Genre Select (Far Right) -->
    <div class="controls-row-secondary" style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 0.5rem; margin-bottom: 0.5rem; flex-wrap: nowrap;">
        <div class="region-controls" style="display: flex; align-items: center; gap: 0.35rem; flex: 0 0 auto;">
            <button class="region-btn active" data-region="all">All</button>
            <?php if ($activeMarket === 'colorado'): ?>
                <button class="region-btn" data-region="denver">Denver / Boulder</button>
                <button class="region-btn" data-region="springs">Springs / Pueblo</button>
                <button class="region-btn" data-region="north">Ft Collins / North</button>
                <button class="region-btn" data-region="west">West Slope / Grand Junction</button>
            <?php elseif ($activeMarket === 'california'): ?>
                <button class="region-btn" data-region="norcal">NorCal / Bay Area</button>
                <button class="region-btn" data-region="la">Los Angeles</button>
                <button class="region-btn" data-region="oc">Orange County</button>
                <button class="region-btn" data-region="sd">San Diego</button>
            <?php elseif ($activeMarket === 'uk' || in_array($activeMarket, ['england', 'scotland', 'wales', 'ireland'], true)): ?>
                <?php if ($activeCountry === 'scotland'): ?>
                    <button class="region-btn" data-region="glasgow">Glasgow / West</button>
                    <button class="region-btn" data-region="edinburgh">Edinburgh / East</button>
                    <button class="region-btn" data-region="aberdeen">Aberdeen / North East</button>
                    <button class="region-btn" data-region="highlands">Highlands & Islands</button>
                <?php elseif ($activeCountry === 'wales'): ?>
                    <button class="region-btn" data-region="cardiff">Cardiff / South</button>
                    <button class="region-btn" data-region="swansea">Swansea / West</button>
                    <button class="region-btn" data-region="northwales">North Wales</button>
                <?php elseif ($activeCountry === 'ireland'): ?>
                    <button class="region-btn" data-region="dublin">Dublin / East</button>
                    <button class="region-btn" data-region="belfast">Belfast / North</button>
                    <button class="region-btn" data-region="cork">Cork / South</button>
                    <button class="region-btn" data-region="galway">Galway / West</button>
                <?php else: /* England */ ?>
                    <button class="region-btn" data-region="london">Greater London</button>
                    <button class="region-btn" data-region="manchester">Manchester / North West</button>
                    <button class="region-btn" data-region="birmingham">Birmingham / Midlands</button>
                    <button class="region-btn" data-region="bristol">Bristol / South West</button>
                    <button class="region-btn" data-region="leeds">Leeds / Yorkshire</button>
                <?php endif; ?>
            <?php elseif ($activeMarket === 'texas'): ?>
                <button class="region-btn" data-region="austin">Austin / Central</button>
                <button class="region-btn" data-region="dallas">Dallas / DFW</button>
                <button class="region-btn" data-region="houston">Houston / Gulf</button>
                <button class="region-btn" data-region="san-antonio">San Antonio / South</button>
            <?php endif; ?>
        </div>

        <div class="dropdown-filters-group" style="display: flex; align-items: center; gap: 0.5rem; margin-left: auto; flex: 0 0 auto;">
            <div class="dropdown-wrapper">
                <button id="venue-dropdown-toggle">
                    <span id="venue-selected-count">All Venues</span>
                    <span class="dropdown-caret-sm">▼</span>
                </button>
                <div id="venue-dropdown-menu">
                    <div class="venue-dropdown-header">
                        <input type="text" id="venue-search-input" placeholder="🔍 Search venues..." />
                        <div class="venue-dropdown-actions">
                            <button type="button" id="btn-venue-select-all">Select All</button>
                            <button type="button" id="btn-venue-clear-all">Clear All</button>
                        </div>
                    </div>
                    <div id="venue-checkboxes-list"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Row 3: Search Input Expanded to 50% Width -->
    <div class="controls-row-actions" style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 0.75rem; margin-top: 0.4rem; flex-wrap: nowrap;">
        <div class="search-input-wrap" style="flex: 0 0 50%; width: 50%; max-width: 50%; min-width: 220px; margin-right: 0.5rem;">
            <input type="text" id="artist-search-input" style="width: 100%; height: 36px; box-sizing: border-box;" placeholder="🔍 Search band, venue, subgenre..." />
            <button type="button" id="btn-clear-search" aria-label="Clear search" title="Clear search">&times;</button>
        </div>
    </div>

    <!-- Row 4: Genres (Left) + Action Buttons (Right) -->
    <div class="controls-row-actions-secondary" style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 0.45rem; margin-top: 0.4rem; flex-wrap: wrap;">
        <div class="genre-filter-group" style="flex: 0 0 auto;">
            <select id="genre-select">
                <?php foreach ($genreBuckets as $bucketKey => $bucket): ?>
                    <option value="<?php echo htmlspecialchars($bucketKey); ?>"><?php echo htmlspecialchars($bucket['label']); ?></option>
                <?php endforeach; ?>
            </select>
            <button type="button" id="genre-help-trigger" class="genre-help-trigger" aria-label="Genre filter help" title="Genre info & definitions">?</button>
            <div id="genre-help-panel" class="genre-help-panel" role="note" aria-live="polite">
                <div id="genre-help-title" class="genre-help-title"><?php echo htmlspecialchars($genreBuckets['all']['label']); ?></div>
                <div id="genre-help-text" class="genre-help-text"><?php echo htmlspecialchars($genreBuckets['all']['title']); ?></div>
            </div>
        </div>

        <div class="filter-actions-group" style="display: flex; align-items: center; gap: 0.45rem; flex: 0 0 auto; margin-left: auto;">
            <button type="button" id="btn-free-filter" class="btn-premium-filter btn-premium-filter--secondary btn-premium-filter--free" title="Show only free events">
                <span class="btn-premium-filter-icon">🆓</span>
                <span class="btn-premium-filter-label">Free Events</span>
            </button>
            <button type="button" id="btn-interested-filter" class="btn-premium-filter btn-premium-filter--secondary" title="Show starred favorite shows">
                <span class="btn-premium-filter-icon">⭐</span>
                <span class="btn-premium-filter-label">Interested Only</span>
            </button>
            <button type="button" id="btn-email-passport" class="btn-premium-filter btn-premium-filter--secondary" title="Email favorite shows (100% Private & Dispatch-Only)">
                <span class="btn-premium-filter-icon">✉️</span>
                <span class="btn-premium-filter-label">Email Me My Favs</span>
            </button>
            <button type="button" id="btn-reset-ignored" class="btn-premium-filter btn-premium-filter--secondary btn-reset-ignored" title="Reset ignored shows">
                <span class="btn-premium-filter-icon">🔄</span>
                <span class="btn-premium-filter-label" id="reset-ignored-label">Reset Ignored (0)</span>
            </button>
            <?php if (!empty($isAdmin)): ?>
                <a href="admin_data_quality.php" class="btn-premium-filter btn-premium-filter--secondary" title="Review events filtered by geo sanity checks" style="text-decoration: none; border-color: rgba(251, 191, 36, 0.4); color: #fcd34d; background: rgba(245, 158, 11, 0.12);">
                    <span class="btn-premium-filter-icon">🧪</span>
                    <span class="btn-premium-filter-label">Data QA</span>
                </a>
                <a href="admin.php?action=logout" class="btn-premium-filter btn-premium-filter--secondary btn-admin-logout" title="Log out of Admin Session" style="text-decoration: none; border-color: rgba(255, 68, 68, 0.4); color: #ff6b6b; background: rgba(255, 68, 68, 0.08);">
                    <span class="btn-premium-filter-icon">🔒</span>
                    <span class="btn-premium-filter-label">Admin Logout</span>
                </a>
            <?php endif; ?>
        </div>
    </div>

    <!-- Compact Live Filter Summary Line -->
    <div id="live-filter-summary" class="live-filter-summary live-filter-summary-compact" role="status" aria-live="polite">
        <span class="summary-chip summary-chip-market" id="summary-market">Market: <?php echo htmlspecialchars($marketDisplayLabels[$activeMarket] ?? 'Colorado'); ?></span>
        <span class="summary-chip" id="summary-results">Visible shows: 0</span>
        <span class="summary-chip" id="summary-filters">Filters: default</span>
        <span class="privacy-inline-badge" title="Your data is processed locally. Emails are used for one-time dispatch only.">🔒 100% Private</span>
    </div>
</div>
