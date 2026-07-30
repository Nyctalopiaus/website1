<?php
/**
 * Dynamic XML Sitemap for Google Search Console & Search Engines
 * Nycto's Gig Grid
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

header('Content-Type: application/xml; charset=utf-8');

// Determine scheme and host dynamically, defaulting to https://nycto.ninja
$scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') ? 'https' : 'https';
$host = $_SERVER['HTTP_HOST'] ?? 'nycto.ninja';
$baseUrl = rtrim($scheme . '://' . $host, '/');

// Get last sync or last event timestamp for lastmod
$lastModDate = date('Y-m-d');
$lastSyncFile = __DIR__ . '/cache/last_sync.txt';
if (file_exists($lastSyncFile)) {
    $syncTime = trim((string)file_get_contents($lastSyncFile));
    $ts = strtotime($syncTime);
    if ($ts !== false) {
        $lastModDate = date('Y-m-d', $ts);
    }
}

$markets = [
    'front-range' => 0.9,
    'socal'       => 0.9,
    'scotland'    => 0.9
];

echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
    <!-- Main Homepage -->
    <url>
        <loc><?php echo htmlspecialchars($baseUrl . '/'); ?></loc>
        <lastmod><?php echo $lastModDate; ?></lastmod>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>
    <!-- Market Region Pages -->
    <?php foreach ($markets as $marketKey => $priority): ?>
    <url>
        <loc><?php echo htmlspecialchars($baseUrl . '/index.php?market=' . $marketKey); ?></loc>
        <lastmod><?php echo $lastModDate; ?></lastmod>
        <changefreq>daily</changefreq>
        <priority><?php echo number_format($priority, 1); ?></priority>
    </url>
    <?php endforeach; ?>
</urlset>
