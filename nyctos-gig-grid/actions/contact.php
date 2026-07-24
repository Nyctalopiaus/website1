<?php

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/common.php';

applyApiResponseHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonErrorResponse('Invalid request method.');
}

if (isRateLimited('contact_form', 3, 300, $retryAfter)) {
    jsonRateLimitResponse('Too many messages sent. Please wait ' . $retryAfter . ' seconds before trying again.', $retryAfter);
}

$subjectCategory = trim($_POST['subject_category'] ?? 'General Feedback');
$userEmail = trim($_POST['user_email'] ?? '');
$message = trim($_POST['message'] ?? '');

if (empty($message)) {
    jsonErrorResponse('Please enter a message before sending.');
}

if (mb_strlen($message) > 500) {
    jsonErrorResponse('Message exceeds the maximum limit of 500 characters.');
}

if (!empty($userEmail) && !filter_var($userEmail, FILTER_VALIDATE_EMAIL)) {
    jsonErrorResponse('Please enter a valid email address.');
}

// Destination address (hidden from client)
$destinationEmail = 'joshuahankins77@gmail.com';
$emailSubject = "[Nycto's Gig Grid] New Contact: " . $subjectCategory;

$body = "New message received from Nycto's Gig Grid website:\n\n";
$body .= "Category: " . $subjectCategory . "\n";
$body .= "Sender Email: " . (!empty($userEmail) ? $userEmail : "Anonymous / None Provided") . "\n";
$body .= "Timestamp: " . date('F j, Y g:i A T') . "\n";
$body .= "IP Address: " . getClientIpAddress() . "\n\n";
$body .= "--- MESSAGE BODY (Max 500 chars) ---\n";
$body .= $message . "\n";

// Mail headers
$headers = [];
$headers[] = 'From: Nycto Gig Grid <noreply@nycto.ninja>';
if (!empty($userEmail)) {
    $headers[] = 'Reply-To: ' . $userEmail;
}
$headers[] = 'X-Mailer: PHP/' . phpversion();

$sent = @mail($destinationEmail, $emailSubject, $body, implode("\r\n", $headers));

if ($sent) {
    jsonResponse([
        'status' => 'success',
        'message' => 'Thank you! Your message has been sent directly to Nycto.'
    ]);
} else {
    // Fallback log to server error log if mail server fails
    error_log("[CONTACT FORM BACKUP LOG] Subject: {$subjectCategory} | From: {$userEmail} | Msg: {$message}");
    jsonResponse([
        'status' => 'success',
        'message' => 'Thank you! Your message has been logged for Nycto.'
    ]);
}
