<?php

use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\PHPMailer;

require_once __DIR__ . '/../PHPMailer/Exception.php';
require_once __DIR__ . '/../PHPMailer/PHPMailer.php';
require_once __DIR__ . '/../PHPMailer/SMTP.php';

function formatSyncRuntime(float $seconds): string {
    if ($seconds < 1) {
        return '<1s';
    }

    $total = (int)round($seconds);
    $h = intdiv($total, 3600);
    $m = intdiv($total % 3600, 60);
    $s = $total % 60;

    $parts = [];
    if ($h > 0) {
        $parts[] = $h . 'h';
    }
    if ($m > 0) {
        $parts[] = $m . 'm';
    }
    if ($s > 0 || empty($parts)) {
        $parts[] = $s . 's';
    }

    return implode(' ', $parts);
}

function marketLabelForReport(string $market): string {
    switch (strtolower(trim($market))) {
        case 'front-range':
            return 'Front Range';
        case 'socal':
            return 'SoCal';
        case 'scotland':
            return 'Scotland';
        default:
            return $market;
    }
}

function sourceLabelForReport(string $source): string {
    $key = strtolower(trim($source));
    switch ($key) {
        case 'ticketmaster':
            return 'Ticketmaster';
        case 'bandsintown':
            return 'Bandsintown';
        case 'venuescraper':
            return 'VenueScraper';
        case 'musicbrainz':
            return 'MusicBrainz';
        default:
            return trim($source) !== '' ? $source : 'Unknown';
    }
}

function escHtml(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function summarizeHttpErrors(array $httpErrors): array {
    $groups = [];
    $unparsed = [];

    foreach ($httpErrors as $entryRaw) {
        $entry = trim((string)$entryRaw);
        if ($entry === '') {
            continue;
        }

        $source = null;
        $market = null;
        $httpCode = null;
        $context = '';

        if (preg_match('/^([^|]+)\|\s*market=([^|]*)\|\s*(?:http=([0-9]{3})\|)?\s*(.*)$/i', $entry, $m)) {
            $source = trim($m[1]);
            $market = trim($m[2]) !== '' ? trim($m[2]) : 'all';
            $httpCode = !empty($m[3]) ? (string)$m[3] : '404';
            $context = trim($m[4]);
        } elseif (preg_match('/^\[ERROR\]\s+([A-Za-z0-9]+)\s+API query returned HTTP code\s+([0-9]{3})\s+for\s+([a-z\-]+)\s+location\s+(.+)$/i', $entry, $m)) {
            $source = trim($m[1]);
            $httpCode = (string)$m[2];
            $market = trim($m[3]);
            $context = 'location=' . trim($m[4]);
        }

        if ($source === null || $market === null || $httpCode === null) {
            $unparsed[$entry] = true;
            continue;
        }

        $key = strtolower($source) . '|' . strtolower($market) . '|' . $httpCode;
        if (!isset($groups[$key])) {
            $groups[$key] = [
                'source' => sourceLabelForReport($source),
                'market' => marketLabelForReport($market),
                'http_code' => $httpCode,
                'count' => 0,
                'locations' => [],
            ];
        }

        $groups[$key]['count'] += 1;
        if (preg_match('/location\s*=\s*(.+)$/i', $context, $locMatch)) {
            $loc = trim($locMatch[1]);
            if ($loc !== '') {
                $groups[$key]['locations'][strtolower($loc)] = $loc;
            }
        }
    }

    foreach ($groups as &$g) {
        $g['locations'] = array_values($g['locations']);
    }
    unset($g);

    usort($groups, function($a, $b) {
        if ($a['source'] === $b['source']) {
            if ($a['market'] === $b['market']) {
                return strcmp($a['http_code'], $b['http_code']);
            }
            return strcmp($a['market'], $b['market']);
        }
        return strcmp($a['source'], $b['source']);
    });

    return [
        'groups' => $groups,
        'unparsed' => array_keys($unparsed),
    ];
}

function buildSyncReportHtml(array $report): string {
    $execution = $report['execution'] ?? [];
    $ingestion = $report['ingestion'] ?? [];
    $enrichment = $report['enrichment'] ?? [];
    $errors = $report['errors'] ?? [];

    $runtime = formatSyncRuntime((float)($execution['runtime_seconds'] ?? 0));
    $markets = (array)($execution['markets_processed'] ?? []);
    $marketLabels = array_map('marketLabelForReport', $markets);
    $statusOk = !empty($execution['success']);
    $statusWord = $statusOk ? 'SUCCESS' : 'FAILED';
    $statusBg = $statusOk ? '#ecfdf5' : '#fef2f2';
    $statusFg = $statusOk ? '#166534' : '#991b1b';
    $statusBorder = $statusOk ? '#86efac' : '#fca5a5';

    $html = '';
    $html .= '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>';
    $html .= '<body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#111827;">';
    $html .= '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;">';
    $html .= '<tr><td align="center">';
    $html .= '<table role="presentation" width="760" cellspacing="0" cellpadding="0" style="width:100%;max-width:760px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">';

    $html .= '<tr><td style="padding:20px 24px;background:#111827;color:#ffffff;">';
    $html .= '<div style="font-size:20px;font-weight:700;letter-spacing:0.02em;">NYCTO\'S GIG GRID - DAILY SYNC REPORT</div>';
    $html .= '<div style="margin-top:6px;font-size:13px;color:#d1d5db;">Generated: ' . escHtml(date('Y-m-d H:i:s T')) . '</div>';
    $html .= '</td></tr>';

    $html .= '<tr><td style="padding:18px 24px 4px 24px;">';
    $html .= '<span style="display:inline-block;padding:6px 10px;border:1px solid ' . escHtml($statusBorder) . ';background:' . escHtml($statusBg) . ';color:' . escHtml($statusFg) . ';border-radius:999px;font-size:12px;font-weight:700;">Overall Status: ' . escHtml($statusWord) . '</span>';
    $html .= '</td></tr>';

    $html .= '<tr><td style="padding:12px 24px 0 24px;">';
    $html .= '<h2 style="margin:0 0 10px 0;font-size:16px;color:#111827;">1) Execution Overview</h2>';
    $html .= '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px;">';
    $html .= '<tr><td style="padding:6px 8px;border:1px solid #e5e7eb;background:#f9fafb;width:38%;font-weight:600;">Runtime</td><td style="padding:6px 8px;border:1px solid #e5e7eb;">' . escHtml($runtime) . '</td></tr>';
    $html .= '<tr><td style="padding:6px 8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;">Markets Processed</td><td style="padding:6px 8px;border:1px solid #e5e7eb;">' . (int)($execution['markets_processed_count'] ?? count($markets)) . '</td></tr>';
    $html .= '<tr><td style="padding:6px 8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;">Market List</td><td style="padding:6px 8px;border:1px solid #e5e7eb;">' . escHtml(!empty($marketLabels) ? implode(', ', $marketLabels) : 'N/A') . '</td></tr>';
    $html .= '</table>';
    $html .= '</td></tr>';

    $html .= '<tr><td style="padding:18px 24px 0 24px;">';
    $html .= '<h2 style="margin:0 0 10px 0;font-size:16px;color:#111827;">2) Ingestion Summary</h2>';
    $html .= '<div style="font-size:12px;color:#6b7280;margin-bottom:8px;">Added / Updated / Purged</div>';
    if (empty($ingestion)) {
        $html .= '<div style="font-size:13px;color:#6b7280;">No ingestion counters recorded.</div>';
    } else {
        $html .= '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px;">';
        $html .= '<tr>';
        $html .= '<th align="left" style="padding:8px;border:1px solid #e5e7eb;background:#f3f4f6;">Source</th>';
        $html .= '<th align="left" style="padding:8px;border:1px solid #e5e7eb;background:#f3f4f6;">Market</th>';
        $html .= '<th align="right" style="padding:8px;border:1px solid #e5e7eb;background:#f3f4f6;">Added</th>';
        $html .= '<th align="right" style="padding:8px;border:1px solid #e5e7eb;background:#f3f4f6;">Updated</th>';
        $html .= '<th align="right" style="padding:8px;border:1px solid #e5e7eb;background:#f3f4f6;">Purged</th>';
        $html .= '</tr>';
        ksort($ingestion);
        foreach ($ingestion as $source => $marketsForSource) {
            ksort($marketsForSource);
            foreach ($marketsForSource as $marketKey => $counts) {
                $html .= '<tr>';
                $html .= '<td style="padding:8px;border:1px solid #e5e7eb;">' . escHtml(sourceLabelForReport((string)$source)) . '</td>';
                $html .= '<td style="padding:8px;border:1px solid #e5e7eb;">' . escHtml(marketLabelForReport((string)$marketKey)) . '</td>';
                $html .= '<td align="right" style="padding:8px;border:1px solid #e5e7eb;color:#065f46;font-weight:600;">+' . (int)($counts['added'] ?? 0) . '</td>';
                $html .= '<td align="right" style="padding:8px;border:1px solid #e5e7eb;color:#1f2937;">~' . (int)($counts['updated'] ?? 0) . '</td>';
                $html .= '<td align="right" style="padding:8px;border:1px solid #e5e7eb;color:#7f1d1d;font-weight:600;">-' . (int)($counts['purged'] ?? 0) . '</td>';
                $html .= '</tr>';
            }
        }
        $html .= '</table>';
    }
    $html .= '</td></tr>';

    $html .= '<tr><td style="padding:18px 24px 0 24px;">';
    $html .= '<h2 style="margin:0 0 10px 0;font-size:16px;color:#111827;">3) Enrichment and Normalization Highlights</h2>';
    $html .= '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px;">';
    $html .= '<tr><td style="padding:6px 8px;border:1px solid #e5e7eb;background:#f9fafb;width:48%;font-weight:600;">Auto-approved artists via MusicBrainz</td><td style="padding:6px 8px;border:1px solid #e5e7eb;">' . (int)($enrichment['musicbrainz_auto_approved_count'] ?? 0) . '</td></tr>';
    $unknownCount = (int)($enrichment['unknown_tags_write_count'] ?? 0);
    $html .= '<tr><td style="padding:6px 8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;">Unknown tags written to cache log</td><td style="padding:6px 8px;border:1px solid #e5e7eb;">' . $unknownCount . '</td></tr>';
    $html .= '</table>';

    $genreDist = (array)($enrichment['genre_bucket_distribution'] ?? []);
    if (empty($genreDist)) {
        $html .= '<div style="margin-top:10px;font-size:13px;color:#6b7280;">Genre bucket distribution: N/A</div>';
    } else {
        $html .= '<div style="margin-top:10px;font-size:13px;font-weight:600;color:#111827;">Genre bucket distribution</div>';
        $html .= '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:6px;border-collapse:collapse;font-size:12px;">';
        $html .= '<tr><th align="left" style="padding:7px;border:1px solid #e5e7eb;background:#f3f4f6;">Market</th><th align="left" style="padding:7px;border:1px solid #e5e7eb;background:#f3f4f6;">Buckets</th></tr>';
        ksort($genreDist);
        foreach ($genreDist as $marketKey => $buckets) {
            $chunks = [];
            foreach ((array)$buckets as $bucket => $count) {
                $chunks[] = $bucket . '=' . (int)$count;
            }
            $html .= '<tr><td style="padding:7px;border:1px solid #e5e7eb;vertical-align:top;font-weight:600;">' . escHtml(marketLabelForReport((string)$marketKey)) . '</td><td style="padding:7px;border:1px solid #e5e7eb;">' . escHtml(implode(', ', $chunks)) . '</td></tr>';
        }
        $html .= '</table>';
    }

    if ($unknownCount > 0) {
        $unknownTags = array_slice((array)($enrichment['unknown_tags_written'] ?? []), 0, 20);
        $html .= '<div style="margin-top:10px;font-size:12px;color:#374151;">Unknown tags sample: ' . escHtml(implode(', ', $unknownTags)) . '</div>';
    }
    $html .= '</td></tr>';

    $html .= '<tr><td style="padding:18px 24px 22px 24px;">';
    $html .= '<h2 style="margin:0 0 10px 0;font-size:16px;color:#111827;">4) Errors and Failures</h2>';

    $httpErrors = (array)($errors['http_non_200'] ?? []);
    $connErrors = array_values(array_unique(array_map('strval', (array)($errors['connection_failures'] ?? []))));
    $scraperDrops = array_values(array_unique(array_map('strval', (array)($errors['scraper_dropouts'] ?? []))));
    $fatalErrors = array_values(array_unique(array_map('strval', (array)($errors['fatal'] ?? []))));

    if (empty($httpErrors) && empty($connErrors) && empty($scraperDrops) && empty($fatalErrors)) {
        $html .= '<div style="font-size:13px;color:#065f46;background:#ecfdf5;border:1px solid #86efac;padding:10px 12px;border-radius:8px;">No warning/error events captured.</div>';
    } else {
        if (!empty($httpErrors)) {
            $httpSummary = summarizeHttpErrors($httpErrors);
            $groups = $httpSummary['groups'];
            $unparsed = $httpSummary['unparsed'];

            if (!empty($groups)) {
                $html .= '<div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:6px;">API HTTP non-200 responses (grouped)</div>';
                $html .= '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:12px;margin-bottom:10px;">';
                $html .= '<tr><th align="left" style="padding:7px;border:1px solid #e5e7eb;background:#f3f4f6;">Source</th><th align="left" style="padding:7px;border:1px solid #e5e7eb;background:#f3f4f6;">Market</th><th align="left" style="padding:7px;border:1px solid #e5e7eb;background:#f3f4f6;">HTTP</th><th align="right" style="padding:7px;border:1px solid #e5e7eb;background:#f3f4f6;">Count</th><th align="left" style="padding:7px;border:1px solid #e5e7eb;background:#f3f4f6;">Locations (sample)</th></tr>';
                foreach ($groups as $g) {
                    $locSample = empty($g['locations']) ? '-' : implode(', ', array_slice($g['locations'], 0, 6));
                    $html .= '<tr>';
                    $html .= '<td style="padding:7px;border:1px solid #e5e7eb;">' . escHtml((string)$g['source']) . '</td>';
                    $html .= '<td style="padding:7px;border:1px solid #e5e7eb;">' . escHtml((string)$g['market']) . '</td>';
                    $html .= '<td style="padding:7px;border:1px solid #e5e7eb;">' . escHtml((string)$g['http_code']) . '</td>';
                    $html .= '<td align="right" style="padding:7px;border:1px solid #e5e7eb;font-weight:600;">' . (int)$g['count'] . '</td>';
                    $html .= '<td style="padding:7px;border:1px solid #e5e7eb;">' . escHtml($locSample) . '</td>';
                    $html .= '</tr>';
                }
                $html .= '</table>';
            }

            if (!empty($unparsed)) {
                $html .= '<div style="font-size:12px;color:#6b7280;margin-bottom:10px;">Additional unparsed HTTP entries: ' . count($unparsed) . '</div>';
            }
        }

        if (!empty($connErrors)) {
            $html .= '<div style="font-size:13px;font-weight:600;color:#111827;margin:10px 0 6px 0;">Failed connection handles</div>';
            $html .= '<ul style="margin:0 0 0 18px;padding:0;font-size:12px;color:#374151;">';
            foreach (array_slice($connErrors, 0, 12) as $entry) {
                $html .= '<li style="margin:3px 0;">' . escHtml($entry) . '</li>';
            }
            if (count($connErrors) > 12) {
                $html .= '<li style="margin:3px 0;color:#6b7280;">+' . (count($connErrors) - 12) . ' more</li>';
            }
            $html .= '</ul>';
        }

        if (!empty($scraperDrops)) {
            $html .= '<div style="font-size:13px;font-weight:600;color:#111827;margin:10px 0 6px 0;">Scraper dropouts/fallbacks</div>';
            $html .= '<ul style="margin:0 0 0 18px;padding:0;font-size:12px;color:#374151;">';
            foreach (array_slice($scraperDrops, 0, 12) as $entry) {
                $html .= '<li style="margin:3px 0;">' . escHtml($entry) . '</li>';
            }
            if (count($scraperDrops) > 12) {
                $html .= '<li style="margin:3px 0;color:#6b7280;">+' . (count($scraperDrops) - 12) . ' more</li>';
            }
            $html .= '</ul>';
        }

        if (!empty($fatalErrors)) {
            $html .= '<div style="font-size:13px;font-weight:600;color:#991b1b;margin:10px 0 6px 0;">Fatal errors</div>';
            $html .= '<ul style="margin:0 0 0 18px;padding:0;font-size:12px;color:#7f1d1d;">';
            foreach (array_slice($fatalErrors, 0, 12) as $entry) {
                $html .= '<li style="margin:3px 0;">' . escHtml($entry) . '</li>';
            }
            if (count($fatalErrors) > 12) {
                $html .= '<li style="margin:3px 0;color:#6b7280;">+' . (count($fatalErrors) - 12) . ' more</li>';
            }
            $html .= '</ul>';
        }
    }
    $html .= '</td></tr>';

    $html .= '</table></td></tr></table></body></html>';

    return $html;
}

function buildSyncReportText(array $report): string {
    $execution = $report['execution'] ?? [];
    $ingestion = $report['ingestion'] ?? [];
    $enrichment = $report['enrichment'] ?? [];
    $errors = $report['errors'] ?? [];

    $runtime = formatSyncRuntime((float)($execution['runtime_seconds'] ?? 0));
    $markets = $execution['markets_processed'] ?? [];
    $marketLabels = array_map('marketLabelForReport', $markets);
    $success = !empty($execution['success']) ? 'SUCCESS' : 'FAILED';

    $lines = [];
    $lines[] = "NYCTO'S GIG GRID - DAILY SYNC REPORT";
    $lines[] = 'Generated: ' . date('Y-m-d H:i:s T');
    $lines[] = '';

    $lines[] = '1) EXECUTION OVERVIEW';
    $lines[] = '- Runtime: ' . $runtime;
    $lines[] = '- Markets Processed: ' . (int)($execution['markets_processed_count'] ?? count($markets));
    $lines[] = '- Market List: ' . (!empty($marketLabels) ? implode(', ', $marketLabels) : 'N/A');
    $lines[] = '- Overall Status: ' . $success;
    $lines[] = '';

    $lines[] = '2) INGESTION SUMMARY (ADDED / UPDATED / PURGED)';
    if (empty($ingestion)) {
        $lines[] = '- No ingestion counters recorded.';
    } else {
        ksort($ingestion);
        foreach ($ingestion as $source => $marketsForSource) {
            $lines[] = '- Source: ' . $source;
            ksort($marketsForSource);
            foreach ($marketsForSource as $marketKey => $counts) {
                $lines[] = '  * ' . marketLabelForReport((string)$marketKey)
                    . ': +' . (int)($counts['added'] ?? 0)
                    . ' / ~' . (int)($counts['updated'] ?? 0)
                    . ' / -' . (int)($counts['purged'] ?? 0);
            }
        }
    }
    $lines[] = '';

    $lines[] = '3) ENRICHMENT & NORMALIZATION HIGHLIGHTS';
    $lines[] = '- Auto-approved artists via MusicBrainz: ' . (int)($enrichment['musicbrainz_auto_approved_count'] ?? 0);

    $genreDist = $enrichment['genre_bucket_distribution'] ?? [];
    if (empty($genreDist)) {
        $lines[] = '- Genre bucket distribution: N/A';
    } else {
        $lines[] = '- Genre bucket distribution:';
        ksort($genreDist);
        foreach ($genreDist as $marketKey => $buckets) {
            $chunks = [];
            foreach ($buckets as $bucket => $count) {
                $chunks[] = $bucket . '=' . (int)$count;
            }
            $lines[] = '  * ' . marketLabelForReport((string)$marketKey) . ': ' . implode(', ', $chunks);
        }
    }

    $unknownCount = (int)($enrichment['unknown_tags_write_count'] ?? 0);
    $lines[] = '- Unknown tags written to cache log: ' . $unknownCount;
    if ($unknownCount > 0) {
        $unknownTags = array_slice((array)($enrichment['unknown_tags_written'] ?? []), 0, 20);
        $lines[] = '  * ' . implode(', ', $unknownTags);
    }
    $lines[] = '';

    $lines[] = '4) ERRORS & FAILURES';
    $httpErrors = (array)($errors['http_non_200'] ?? []);
    $connErrors = (array)($errors['connection_failures'] ?? []);
    $scraperDrops = (array)($errors['scraper_dropouts'] ?? []);
    $fatalErrors = (array)($errors['fatal'] ?? []);

    if (empty($httpErrors) && empty($connErrors) && empty($scraperDrops) && empty($fatalErrors)) {
        $lines[] = '- No warning/error events captured.';
    } else {
        if (!empty($httpErrors)) {
            $lines[] = '- API HTTP non-200 responses (grouped):';
            $httpSummary = summarizeHttpErrors($httpErrors);
            foreach ($httpSummary['groups'] as $group) {
                $locationText = empty($group['locations']) ? 'locations: n/a' : 'locations: ' . implode(', ', array_slice($group['locations'], 0, 6));
                $lines[] = '  * ' . $group['source'] . ' | market=' . $group['market'] . ' | http=' . $group['http_code'] . ' | count=' . (int)$group['count'] . ' | ' . $locationText;
            }
            if (!empty($httpSummary['unparsed'])) {
                $lines[] = '  * Additional unparsed HTTP entries: ' . count($httpSummary['unparsed']);
            }
        }
        if (!empty($connErrors)) {
            $lines[] = '- Failed connection handles:';
            foreach (array_slice($connErrors, 0, 20) as $entry) {
                $lines[] = '  * ' . $entry;
            }
        }
        if (!empty($scraperDrops)) {
            $lines[] = '- Scraper dropouts/fallbacks:';
            foreach (array_slice($scraperDrops, 0, 20) as $entry) {
                $lines[] = '  * ' . $entry;
            }
        }
        if (!empty($fatalErrors)) {
            $lines[] = '- Fatal errors:';
            foreach (array_slice($fatalErrors, 0, 20) as $entry) {
                $lines[] = '  * ' . $entry;
            }
        }
    }

    return implode("\n", $lines) . "\n";
}

function sendSyncReportEmail(array $report, callable $logger = null): bool {
    if (!defined('SYNC_REPORT_EMAIL_ENABLED') || SYNC_REPORT_EMAIL_ENABLED !== true) {
        return false;
    }

    $toRaw = defined('SYNC_REPORT_EMAIL_TO') ? trim((string)SYNC_REPORT_EMAIL_TO) : '';
    if ($toRaw === '') {
        if ($logger) {
            $logger('[SYNC REPORT] Email enabled but SYNC_REPORT_EMAIL_TO is empty. Skipping report email.');
        }
        return false;
    }

    $recipients = array_filter(array_map('trim', preg_split('/[,;]+/', $toRaw)));
    if (empty($recipients)) {
        if ($logger) {
            $logger('[SYNC REPORT] No valid report email recipients found.');
        }
        return false;
    }

    $subjectPrefix = defined('SYNC_REPORT_EMAIL_SUBJECT_PREFIX') ? trim((string)SYNC_REPORT_EMAIL_SUBJECT_PREFIX) : '[Nycto Sync]';
    $statusWord = !empty($report['execution']['success']) ? 'SUCCESS' : 'FAILED';
    $subject = $subjectPrefix . ' Daily Sync Report - ' . $statusWord . ' - ' . date('Y-m-d');

    $bodyText = buildSyncReportText($report);
    $bodyHtml = buildSyncReportHtml($report);

    $mail = new PHPMailer(true);

    try {
        $mail->isSMTP();
        $mail->Host = SMTP_HOST;
        $mail->SMTPAuth = !empty(SMTP_PASSWORD);

        if (!empty(SMTP_PASSWORD)) {
            $mail->Username = SMTP_USERNAME;
            $mail->Password = SMTP_PASSWORD;
        }

        if (defined('SMTP_ENCRYPTION') && SMTP_ENCRYPTION === 'ssl') {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
            $mail->Port = defined('SMTP_PORT') ? SMTP_PORT : 465;
        } elseif (defined('SMTP_ENCRYPTION') && SMTP_ENCRYPTION === 'tls') {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            $mail->Port = defined('SMTP_PORT') ? SMTP_PORT : 587;
        } else {
            $mail->SMTPSecure = '';
            $mail->Port = defined('SMTP_PORT') ? SMTP_PORT : 25;
            $mail->SMTPOptions = [
                'ssl' => [
                    'verify_peer' => false,
                    'verify_peer_name' => false,
                    'allow_self_signed' => true
                ]
            ];
        }

        $fromEmail = defined('SYNC_REPORT_EMAIL_FROM') ? trim((string)SYNC_REPORT_EMAIL_FROM) : 'noreply@localhost';
        $fromName = defined('SYNC_REPORT_EMAIL_FROM_NAME') ? trim((string)SYNC_REPORT_EMAIL_FROM_NAME) : "Nycto's Gig Grid";

        $mail->setFrom($fromEmail, $fromName);
        foreach ($recipients as $to) {
            $mail->addAddress($to);
        }

        $mail->Subject = $subject;
        $mail->isHTML(true);
        $mail->Body = $bodyHtml;
        $mail->AltBody = $bodyText;

        $mail->send();

        if ($logger) {
            $logger('[SYNC REPORT] Report email delivered to: ' . implode(', ', $recipients));
        }

        return true;
    } catch (Exception $e) {
        if ($logger) {
            $logger('[SYNC REPORT ERROR] ' . $mail->ErrorInfo);
        }
        error_log('[SYNC REPORT ERROR] ' . $e->getMessage());
        return false;
    }
}
