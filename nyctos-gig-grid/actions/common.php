<?php

function applyApiResponseHeaders() {
    if (headers_sent()) {
        return;
    }

    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('X-Frame-Options: SAMEORIGIN');
    header('Permissions-Policy: geolocation=(), microphone=(), camera=()');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
}

function fetchHttpResource($url, array $options = []) {
    $timeout = (int)($options['timeout'] ?? 6);
    $headers = $options['headers'] ?? [];
    $userAgent = (string)($options['user_agent'] ?? 'MetalConcertCalendar/1.0');
    $followRedirects = array_key_exists('follow_redirects', $options) ? (bool)$options['follow_redirects'] : true;

    if (function_exists('curl_init')) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
        curl_setopt($ch, CURLOPT_USERAGENT, $userAgent);
        if ($followRedirects) {
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        }
        if (!empty($headers)) {
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        }

        $body = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($body === false) {
            return [
                'status' => 0,
                'body' => '',
                'error' => $error !== '' ? $error : 'Request failed.'
            ];
        }

        return [
            'status' => $status,
            'body' => (string)$body,
            'error' => ''
        ];
    }

    $headerLines = [];
    foreach ($headers as $headerLine) {
        $headerLines[] = (string)$headerLine;
    }
    if ($userAgent !== '') {
        $headerLines[] = 'User-Agent: ' . $userAgent;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => implode("\r\n", $headerLines),
            'timeout' => $timeout,
            'ignore_errors' => true,
            'follow_location' => $followRedirects ? 1 : 0,
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
        ]
    ]);

    $body = @file_get_contents($url, false, $context);
    $status = 0;
    if (!empty($http_response_header) && is_array($http_response_header)) {
        foreach ($http_response_header as $headerLine) {
            if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $headerLine, $matches)) {
                $status = (int)$matches[1];
            }
        }
    }

    if ($body === false) {
        return [
            'status' => $status,
            'body' => '',
            'error' => 'Request failed.'
        ];
    }

    return [
        'status' => $status,
        'body' => (string)$body,
        'error' => ''
    ];
}

function getClientIpAddress() {
    return trim((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
}

function getRateLimitFilePath($bucket) {
    $cacheDir = __DIR__ . '/../cache';
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0755, true);
    }

    $safeBucket = preg_replace('/[^a-zA-Z0-9_\-]/', '_', (string)$bucket);
    return $cacheDir . '/rate_limit_' . md5($safeBucket . '|' . getClientIpAddress()) . '.json';
}

function isRateLimited($bucket, $limit, $windowSeconds, &$retryAfter = 0) {
    $filePath = getRateLimitFilePath($bucket);
    $now = time();
    $data = [
        'count' => 0,
        'window_start' => $now,
        'last_hit' => $now
    ];

    if (is_readable($filePath)) {
        $decoded = json_decode((string)file_get_contents($filePath), true);
        if (is_array($decoded)) {
            $data = array_merge($data, $decoded);
        }
    }

    if (($now - (int)$data['window_start']) >= $windowSeconds) {
        $data['count'] = 0;
        $data['window_start'] = $now;
    }

    $data['count'] = (int)$data['count'] + 1;
    $data['last_hit'] = $now;

    $remainingWindow = $windowSeconds - ($now - (int)$data['window_start']);
    if ($remainingWindow < 0) {
        $remainingWindow = 0;
    }

    file_put_contents($filePath, json_encode($data), LOCK_EX);

    if ($data['count'] > $limit) {
        $retryAfter = $remainingWindow > 0 ? $remainingWindow : $windowSeconds;
        return true;
    }

    $retryAfter = 0;
    return false;
}

function jsonRateLimitResponse($message = 'Too many requests. Please wait and try again.', $retryAfter = 0) {
    applyApiResponseHeaders();
    if ($retryAfter > 0 && !headers_sent()) {
        header('Retry-After: ' . (int)$retryAfter);
    }
    if (!headers_sent()) {
        http_response_code(429);
    }
    jsonResponse(['status' => 'error', 'message' => $message]);
}

function jsonResponse(array $payload) {
    applyApiResponseHeaders();
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

function logServerException($context, Throwable $exception) {
    error_log(sprintf('[%s] %s: %s in %s:%d', date('Y-m-d H:i:s'), $context, $exception->getMessage(), $exception->getFile(), $exception->getLine()));
}

function jsonErrorResponse($message = 'An unexpected error occurred.') {
    jsonResponse(['status' => 'error', 'message' => $message]);
}
