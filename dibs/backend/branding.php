<?php
/**
 * Agent branding images for printouts (tour packet) and client-facing banners.
 *
 *   upload_branding_image   realtor/admin: multipart POST, field "image", kind=headshot|logo
 *   remove_branding_image   realtor/admin: JSON {kind}
 *
 * The headshot is stored in users.avatar_url (which the client banners already use); the logo in
 * users.logo_url. Files live in media/branding/ under random names. Only real JPEG or PNG images
 * (checked by content, not by name) up to 4 MB are accepted, since those are what the PDF can embed.
 */

const BRANDING_MAX_BYTES = 4 * 1024 * 1024;
const BRANDING_COLUMNS = ['headshot' => 'avatar_url', 'logo' => 'logo_url', 'brokerage_logo' => 'brokerage'];

function brandingDir(): string {
    $dir = MEDIA_DIR . '/branding';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    return $dir;
}

/** Deletes a previous branding file, but only one inside media/branding/. */
function brandingDeleteOld(?string $relative): void {
    if (!$relative || !preg_match('#^media/branding/[a-f0-9]{24}\.(?:jpg|png)$#', $relative)) return;
    $path = brandingDir() . '/' . basename($relative);
    if (is_file($path)) @unlink($path);
}

function brandingKind($v): ?string {
    $v = (string)$v;
    return isset(BRANDING_COLUMNS[$v]) ? $v : null;
}

function handleUploadBrandingImage(PDO $pdo) {
    requireRealtorOrAdmin();
    requireCsrf();
    $kind = brandingKind($_POST['kind'] ?? '');
    $file = $_FILES['image'] ?? null;
    $fail = function (string $msg, int $code = 400) { http_response_code($code); echo json_encode(['error' => $msg]); };

    if (!$kind) return $fail('Choose headshot or logo.');
    if ($kind === 'brokerage_logo' && !brokerageIsAdmin()) return $fail('Only a brokerage admin can change the office logo.', 403);
    if (!$file || !is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $err = $file['error'] ?? UPLOAD_ERR_NO_FILE;
        return $fail(in_array($err, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 'That image is too large (4 MB max).' : 'No image received. Try again.');
    }
    if (!is_uploaded_file($file['tmp_name'])) return $fail('No image received. Try again.');
    if ($file['size'] > BRANDING_MAX_BYTES) return $fail('That image is too large (4 MB max).');

    $info = @getimagesize($file['tmp_name']);
    $types = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png'];
    if (!$info || !isset($types[$info[2]])) return $fail('Use a JPG or PNG image.');
    [$w, $h] = $info;
    if ($w < 60 || $h < 60) return $fail('That image is too small. Use one at least 200 pixels wide.');
    if ($w > 8000 || $h > 8000) return $fail('That image is too large. Use one under 8000 pixels on each side.');

    $relative = 'media/branding/' . bin2hex(random_bytes(12)) . '.' . $types[$info[2]];
    if (!@move_uploaded_file($file['tmp_name'], brandingDir() . '/' . basename($relative))) {
        return $fail('Could not save the image on the server.', 500);
    }

    if ($kind === 'brokerage_logo') {
        // The office logo lives in brokerage_settings (brokerage.php); only a brokerage admin sets it.
        $previous = (string)($pdo->query("SELECT logo_url FROM brokerage_settings WHERE id = 1")->fetchColumn() ?: '');
        $pdo->prepare("UPDATE brokerage_settings SET logo_url = :v, updated_at = CURRENT_TIMESTAMP WHERE id = 1")->execute([':v' => $relative]);
        brandingDeleteOld($previous);
        logEvent($pdo, 'system', 'info', 'Brokerage logo uploaded', null, ['width' => $w, 'height' => $h]);
        echo json_encode(['success' => true, 'kind' => $kind, 'url' => $relative, 'width' => $w, 'height' => $h]);
        return;
    }
    $col = BRANDING_COLUMNS[$kind];
    $me = (int)$_SESSION['user_id'];
    $old = $pdo->prepare("SELECT $col FROM users WHERE id = :id");
    $old->execute([':id' => $me]);
    $previous = (string)($old->fetchColumn() ?: '');
    $pdo->prepare("UPDATE users SET $col = :v WHERE id = :id")->execute([':v' => $relative, ':id' => $me]);
    brandingDeleteOld($previous);

    logEvent($pdo, 'system', 'info', "Branding $kind uploaded", null, ['width' => $w, 'height' => $h]);
    echo json_encode(['success' => true, 'kind' => $kind, 'url' => $relative, 'width' => $w, 'height' => $h]);
}

function handleRemoveBrandingImage(PDO $pdo) {
    requireRealtorOrAdmin();
    requireCsrf();
    $data = json_decode(dibsRequestBody(), true) ?: [];
    $kind = brandingKind($data['kind'] ?? '');
    if (!$kind) { http_response_code(400); echo json_encode(['error' => 'Choose headshot or logo.']); return; }
    if ($kind === 'brokerage_logo') {
        if (!brokerageIsAdmin()) { http_response_code(403); echo json_encode(['error' => 'Only a brokerage admin can change the office logo.']); return; }
        $previous = (string)($pdo->query("SELECT logo_url FROM brokerage_settings WHERE id = 1")->fetchColumn() ?: '');
        $pdo->prepare("UPDATE brokerage_settings SET logo_url = '' WHERE id = 1")->execute();
        brandingDeleteOld($previous);
        echo json_encode(['success' => true, 'kind' => $kind]);
        return;
    }
    $col = BRANDING_COLUMNS[$kind];
    $me = (int)$_SESSION['user_id'];
    $old = $pdo->prepare("SELECT $col FROM users WHERE id = :id");
    $old->execute([':id' => $me]);
    $previous = (string)($old->fetchColumn() ?: '');
    $pdo->prepare("UPDATE users SET $col = '' WHERE id = :id")->execute([':id' => $me]);
    brandingDeleteOld($previous);
    echo json_encode(['success' => true, 'kind' => $kind]);
}
