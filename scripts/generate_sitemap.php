<?php
/**
 * Automated Cron Sitemap Generator for Nycto Ecosystem
 * Scans application directories & database sync timestamps to generate/update sitemap.xml daily.
 *
 * Cron Schedule (Daily at midnight):
 * 0 0 * * * php /home/nyctltlc/public_html/scripts/generate_sitemap.php
 */

header('Content-Type: application/json');

$baseDir = dirname(__DIR__);
$sitemapXmlPath = $baseDir . '/sitemap.xml';
$baseUrl = 'https://nycto.ninja';

// Per-tool metadata (slug, sitemap changefreq/priority) lives in tools_config.php,
// shared with soar_monitor.php, so a rename only needs one entry updated there
// instead of two separate hardcoded arrays kept in sync by hand.
$toolsConfig = require __DIR__ . '/tools_config.php';

// Define monitored pages & app subdirectories
$pages = [
    [
        'loc' => $baseUrl . '/',
        'dir' => $baseDir,
        'changefreq' => 'daily',
        'priority' => '1.0',
        'is_root' => true
    ],
    [
        'loc' => $baseUrl . '/status/',
        'dir' => $baseDir . '/status',
        'changefreq' => 'hourly',
        'priority' => '0.9',
        'is_root' => false
    ],
];

foreach ($toolsConfig as $slug => $tool) {
    if (empty($tool['sitemap'])) continue;
    $sm = $tool['sitemap'];
    $pages[] = [
        'loc' => $baseUrl . '/' . $slug . '/',
        'dir' => $baseDir . '/' . $slug,
        'changefreq' => $sm['changefreq'],
        'priority' => $sm['priority'],
        'is_root' => false,
        'check_db' => $sm['check_db'] ?? false
    ];
}

// NOTE: crypto-game and game-rating-log are intentionally NOT in tools_config.php's
// sitemap entries. Both are marked <article hidden> on the hub (Beta, not yet linked
// from the project grid) as of 2026-08-18. Once either is unhidden/launched on the
// hub, add a 'sitemap' key to its tools_config.php entry (changefreq: monthly,
// priority: 0.6) to include it here.

// Setup Logs Directory & 7-Day Log Rotation
$logsDir = __DIR__ . '/logs';
if (!file_exists($logsDir)) {
    @mkdir($logsDir, 0755, true);
}

// Delete log files older than 7 days
$cutoffTime = time() - (7 * 86400);
$existingLogFiles = glob($logsDir . '/sitemap_generator_*.log');
if ($existingLogFiles) {
    foreach ($existingLogFiles as $oldLog) {
        if (@filemtime($oldLog) < $cutoffTime) {
            @unlink($oldLog);
        }
    }
}

// Log file for today's run
$todayLogFile = $logsDir . '/sitemap_generator_' . date('Y-m-d') . '.log';

function writeLog($message, $level = 'INFO') {
    global $todayLogFile;
    $timeStr = gmdate('Y-m-d H:i:s \U\T\C');
    $logLine = "[{$timeStr}] [{$level}] {$message}\n";
    @file_put_contents($todayLogFile, $logLine, FILE_APPEND);
}

// Register PHP Error & Exception Handlers to log unhandled runtime errors
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    writeLog("PHP Error [{$errno}] on line {$errline} in " . basename($errfile) . ": {$errstr}", "ERROR");
    return true;
});

set_exception_handler(function($exception) {
    writeLog("Fatal Exception: " . $exception->getMessage() . " in " . basename($exception->getFile()) . ":" . $exception->getLine(), "FATAL");
});

writeLog("Starting automated sitemap generation sweep...");

function getLatestMtime($dir, $isRoot = false) {
    if (!file_exists($dir)) return time();
    $maxMtime = 0;

    if ($isRoot) {
        $files = glob($dir . '/*.{html,php,css,js}', GLOB_BRACE);
        if ($files) {
            foreach ($files as $f) {
                $mt = @filemtime($f);
                if ($mt > $maxMtime) $maxMtime = $mt;
            }
        }
    } else {
        $dirIter = new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS);
        $iter = new RecursiveIteratorIterator($dirIter, RecursiveIteratorIterator::SELF_FIRST);

        foreach ($iter as $fileinfo) {
            if ($fileinfo->isFile()) {
                $ext = strtolower($fileinfo->getExtension());
                if (in_array($ext, ['php', 'html', 'css', 'js', 'json'], true)) {
                    $fn = $fileinfo->getFilename();
                    if ($fn === 'status-data.json') continue;
                    $mt = $fileinfo->getMTime();
                    if ($mt > $maxMtime) $maxMtime = $mt;
                }
            }
        }
    }

    return $maxMtime > 0 ? $maxMtime : time();
}

$xmlEntries = [];

foreach ($pages as $p) {
    $mtime = getLatestMtime($p['dir'], $p['is_root'] ?? false);
    $source = 'filemtime';

    if (!empty($p['check_db'])) {
        $gigDbPath = $baseDir . '/nyctos-gig-grid/gigs.db';
        if (file_exists($gigDbPath)) {
            try {
                $pdo = new PDO('sqlite:' . $gigDbPath);
                $stmt = $pdo->query("SELECT MAX(created_at) FROM events");
                $dbTime = $stmt->fetchColumn();
                if ($dbTime) {
                    $ts = is_numeric($dbTime) ? (int)$dbTime : strtotime($dbTime);
                    if ($ts && $ts > $mtime) {
                        $mtime = $ts;
                        $source = 'gigs.db MAX(created_at)';
                    }
                }
            } catch (Exception $e) {
                // Ignore DB error
            }
        }
    }

    $lastmod = date('Y-m-d', $mtime);
    writeLog("Scanned URL {$p['loc']} -> lastmod: {$lastmod} (source: {$source})");

    $xmlEntries[] = [
        'loc' => $p['loc'],
        'lastmod' => $lastmod,
        'changefreq' => $p['changefreq'],
        'priority' => $p['priority']
    ];
}

$xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
$xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"' . "\n";
$xml .= '        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' . "\n";
$xml .= '        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">' . "\n";

foreach ($xmlEntries as $entry) {
    $xml .= '    <url>' . "\n";
    $xml .= '        <loc>' . htmlspecialchars($entry['loc']) . '</loc>' . "\n";
    $xml .= '        <lastmod>' . $entry['lastmod'] . '</lastmod>' . "\n";
    $xml .= '        <changefreq>' . $entry['changefreq'] . '</changefreq>' . "\n";
    $xml .= '        <priority>' . $entry['priority'] . '</priority>' . "\n";
    $xml .= '    </url>' . "\n";
}

$xml .= '</urlset>' . "\n";

$saved = @file_put_contents($sitemapXmlPath, $xml);

if ($saved !== false) {
    writeLog("Successfully updated sitemap.xml with " . count($xmlEntries) . " URL entries.", "SUCCESS");
} else {
    writeLog("Failed to write updated XML to {$sitemapXmlPath}.", "ERROR");
}

$res = [
    'success' => $saved !== false,
    'timestamp' => gmdate('Y-m-d H:i:s \U\T\C'),
    'updated_file' => $sitemapXmlPath,
    'log_file' => $todayLogFile,
    'entries_count' => count($xmlEntries),
    'entries' => $xmlEntries
];

echo json_encode($res, JSON_PRETTY_PRINT);
