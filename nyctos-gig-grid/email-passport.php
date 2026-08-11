<?php
/**
 * Email Interested Shows Endpoint - Stateless mail client using PHPMailer
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/actions/common.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\SMTP;

require_once __DIR__ . '/PHPMailer/Exception.php';
require_once __DIR__ . '/PHPMailer/PHPMailer.php';
require_once __DIR__ . '/PHPMailer/SMTP.php';

header('Content-Type: application/json');
applyApiResponseHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method.']);
    exit;
}

$retryAfter = 0;
if (isRateLimited('email-passport', 3, 900, $retryAfter)) {
    jsonRateLimitResponse('Email dispatch is rate limited. Please try again later.', $retryAfter);
}

$inputJSON = file_get_contents('php://input');
if (empty($inputJSON)) {
    $inputJSON = @file_get_contents('php://stdin');
}
$input = json_decode((string)$inputJSON, true);

$email = trim($input['email'] ?? $_POST['email'] ?? '');
$eventIds = $input['event_ids'] ?? $_POST['event_ids'] ?? [];

if (is_string($eventIds)) {
    $eventIds = json_decode($eventIds, true);
}

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['status' => 'error', 'message' => 'Please enter a valid email address.']);
    exit;
}

if (!is_array($eventIds) || empty($eventIds)) {
    echo json_encode(['status' => 'error', 'message' => 'Your Interested Shows list is empty.']);
    exit;
}

$eventIds = array_filter(array_map('trim', $eventIds));
if (empty($eventIds)) {
    echo json_encode(['status' => 'error', 'message' => 'Your Interested Shows list is empty.']);
    exit;
}

try {
    $db = getDbConnection();
    $placeholders = implode(',', array_fill(0, count($eventIds), '?'));
    $stmt = $db->prepare("SELECT e.*, v.city FROM events e LEFT JOIN venues v ON e.venue_id = v.venue_id WHERE e.event_id IN ($placeholders) AND (e.is_approved = 1 OR e.status = 'Approved') ORDER BY e.start_time ASC");
    $stmt->execute(array_values($eventIds));
    $events = $stmt->fetchAll();
} catch (Exception $e) {
    logServerException('email-passport-db-query', $e);
    echo json_encode(['status' => 'error', 'message' => 'Unable to prepare your interested shows right now.']);
    exit;
}

if (empty($events)) {
    echo json_encode(['status' => 'error', 'message' => 'No upcoming approved shows found matching your selected list.']);
    exit;
}

function getEmailDateDetails($dateTimeStr) {
    $timestamp = strtotime($dateTimeStr);
    return [
        'day' => date('d', $timestamp),
        'month_abbr' => date('M', $timestamp),
        'weekday' => date('D', $timestamp),
        'time' => date('g:i A', $timestamp)
    ];
}

$emailBody = '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your Nycto\'s Gig Grid Interested Shows</title>
</head>
<body style="margin: 0; padding: 0; background-color: #111215; font-family: \'Outfit\', -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0; -webkit-font-smoothing: antialiased;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #111215; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #14161a; border: 1px solid #2d3139; border-radius: 8px; overflow: hidden;">
                    <tr>
                        <td style="background-color: #111215; padding: 30px 40px; border-bottom: 2px solid #ef4444; text-align: center;">
                            <span style="font-size: 32px; vertical-align: middle;">🤘</span>
                            <span style="font-size: 20px; font-weight: 800; color: #ffffff; text-transform: uppercase; letter-spacing: 0.1em; vertical-align: middle; margin-left: 10px;">Nycto\'s Gig Grid</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px 40px 20px 40px;">
                            <h1 style="font-size: 24px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em;">Your Interested Shows</h1>
                            <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 30px;">Here is your custom list of upcoming live shows you saved. Have a great time out there.</p>';

foreach ($events as $e) {
    $dateInfo = getEmailDateDetails($e['start_time']);
    $artistName = htmlspecialchars($e['artist_name']);
    $venueName = htmlspecialchars($e['venue_name']);
    $cityName = htmlspecialchars($e['city'] ?? '');
    $locationText = htmlspecialchars(formatMarketLocation($e['city'] ?? '', $e['market'] ?? 'front-range'));
    $ticketUrl = $e['ticket_url'] ?: 'https://www.google.com/search?q=' . urlencode($e['artist_name'] . ' concert ' . $e['venue_name']);

    $emailBody .= '
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px; border-collapse: separate; border-spacing: 0; background-color: #1a1d24; border: 1px solid #2d3139; border-radius: 6px;">
                                <tr>
                                    <td width="90" align="center" valign="middle" style="background-color: rgba(255, 255, 255, 0.02); border-right: 1px dashed #2d3139; padding: 20px 10px; text-align: center;">
                                        <div style="font-size: 12px; font-weight: 800; color: #ef4444; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px;">' . $dateInfo['month_abbr'] . '</div>
                                        <div style="font-size: 32px; font-weight: 800; color: #ffffff; line-height: 1;">' . $dateInfo['day'] . '</div>
                                        <div style="font-size: 10px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px;">' . $dateInfo['weekday'] . '</div>
                                    </td>
                                    <td style="padding: 20px 24px;" valign="middle">
                                        <div style="font-size: 18px; font-weight: 800; color: #ffffff; margin-bottom: 8px; text-transform: uppercase;">' . $artistName . '</div>
                                        <div style="font-size: 13px; color: #cbd5e1; margin-bottom: 4px;">
                                            <span style="margin-right: 5px;">📍</span><strong>' . $venueName . '</strong> <span style="color: #64748b;">// ' . $locationText . '</span>
                                        </div>
                                        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 12px;">
                                            <span style="margin-right: 5px;">⏱️</span>Show starts at ' . $dateInfo['time'] . '
                                        </div>
                                        <a href="' . htmlspecialchars($ticketUrl) . '" target="_blank" style="display: inline-block; background-color: #ef4444; color: #ffffff; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; text-decoration: none; padding: 8px 18px; border-radius: 4px;">
                                            Get Tickets
                                        </a>
                                    </td>
                                </tr>
                            </table>';
}

$emailBody .= '
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 0 40px 30px 40px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: rgba(239, 68, 68, 0.03); border: 1px solid rgba(239, 68, 68, 0.15); border-radius: 6px; padding: 15px;">
                                <tr>
                                    <td style="font-size: 12px; color: #94a3b8; line-height: 1.5; text-align: center;">
                                        🔒 <strong>100% Private & Dispatch-Only</strong><br>
                                        This email was sent instantly in-memory. Your email address has not been logged or stored in our database.
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #0c0d0f; padding: 30px 40px; text-align: center; border-top: 1px solid #2d3139;">
                            <p style="font-size: 12px; color: #64748b; margin: 0;">Sent via Nycto\'s Gig Grid</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>';

$mail = new PHPMailer(true);
$mail->CharSet = 'UTF-8';

$fromEmail = defined('SYNC_REPORT_EMAIL_FROM') && !empty(SYNC_REPORT_EMAIL_FROM) && strpos(SYNC_REPORT_EMAIL_FROM, '@') !== false
    ? trim((string)SYNC_REPORT_EMAIL_FROM)
    : 'noreply@nycto.ninja';

$fromName = defined('SYNC_REPORT_EMAIL_FROM_NAME') && !empty(SYNC_REPORT_EMAIL_FROM_NAME)
    ? trim((string)SYNC_REPORT_EMAIL_FROM_NAME)
    : "Nycto's Gig Grid";

$mail->setFrom($fromEmail, $fromName);
$mail->addAddress($email);
$mail->isHTML(true);
$mail->Subject = "Your Nycto's Gig Grid Interested Shows";
$mail->Body = $emailBody;

$httpHost = $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '';
$domainName = preg_replace('/^www\./i', '', $httpHost);

$hostsToTry = array_values(array_unique(array_filter([
    (defined('SMTP_HOST') && !empty(SMTP_HOST)) ? trim((string)SMTP_HOST) : null,
    !empty($domainName) ? 'mail.' . $domainName : null,
    !empty($domainName) ? $domainName : null,
    !empty($_SERVER['SERVER_NAME']) ? trim((string)$_SERVER['SERVER_NAME']) : null,
    function_exists('gethostname') ? gethostname() : null,
    '127.0.0.1',
    'localhost'
])));

$portsToTry = [
    ['port' => (defined('SMTP_PORT') && SMTP_PORT > 0) ? (int)SMTP_PORT : 25, 'secure' => (defined('SMTP_ENCRYPTION') ? strtolower(SMTP_ENCRYPTION) : '')],
    ['port' => 465, 'secure' => PHPMailer::ENCRYPTION_SMTPS],
    ['port' => 587, 'secure' => PHPMailer::ENCRYPTION_STARTTLS],
    ['port' => 25, 'secure' => '']
];

$sent = false;
$attemptLogs = [];

foreach ($hostsToTry as $hostCandidate) {
    foreach ($portsToTry as $pConfig) {
        $secType = $pConfig['secure'];
        if ($secType === 'ssl') $secType = PHPMailer::ENCRYPTION_SMTPS;
        if ($secType === 'tls') $secType = PHPMailer::ENCRYPTION_STARTTLS;

        try {
            $testMail = clone $mail;
            $testMail->isSMTP();
            $testMail->Host = $hostCandidate;
            $testMail->Port = $pConfig['port'];
            $testMail->SMTPSecure = $secType;
            $smtpPass = defined('SMTP_PASSWORD') ? SMTP_PASSWORD : '';
            $testMail->SMTPAuth = !empty($smtpPass);
            if (!empty($smtpPass)) {
                $testMail->Username = defined('SMTP_USERNAME') ? SMTP_USERNAME : '';
                $testMail->Password = $smtpPass;
            }
            $testMail->SMTPOptions = [
                'ssl' => [
                    'verify_peer' => false,
                    'verify_peer_name' => false,
                    'allow_self_signed' => true
                ]
            ];
            $testMail->Timeout = 3;
            $testMail->send();
            $sent = true;
            break 2;
        } catch (Exception $eConn) {
            $attemptLogs[] = $hostCandidate . ':' . $pConfig['port'] . ' (' . ($secType ?: 'none') . ') -> ' . $testMail->ErrorInfo;
        }
    }
}

if (!$sent) {
    try {
        $mail->isMail();
        $mail->send();
        $sent = true;
    } catch (Exception $eMail) {
        $attemptLogs[] = 'isMail() -> ' . $mail->ErrorInfo;
    }
}

if ($sent) {
    echo json_encode(['status' => 'success', 'message' => 'Interested shows emailed successfully! Check your inbox (and spam folder).']);
} else {
    $errSummary = implode(' | ', array_slice($attemptLogs, 0, 3));
    logServerException('email-passport-mail', new Exception($errSummary));
    error_log('[email-passport] Mailer error: ' . $errSummary);
    echo json_encode(['status' => 'error', 'message' => 'Mail delivery failed: ' . $errSummary]);
}
