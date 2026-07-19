<?php
$ratesUrl = "https://widgets.mortgagenewsdaily.com/widget/rates";

$options = [
    "http" => [
        "header" => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n"
    ]
];
$context = stream_context_create($options);
$response = @file_get_contents($ratesUrl, false, $context);

$rate30 = null;
$rate15 = null;
$rateDate = date('Y-m-d');

if ($response) {
    $arr = json_decode($response, true);
    if (is_array($arr)) {
        foreach ($arr as $item) {
            $product = $item['product'] ?? '';
            $rateVal = $item['rate'] ?? null;
            if ($product === '30 Yr. Fixed') {
                $rate30 = floatval($rateVal);
                if (isset($item['RateDate'])) {
                    $rateDate = date('Y-m-d', strtotime($item['RateDate']));
                }
            } elseif ($product === '15 Yr. Fixed') {
                $rate15 = floatval($rateVal);
            }
        }
    }
}

// Fallbacks if download failed or structure changed
if ($rate30 === null || $rate30 < 3.0 || $rate30 > 12.0) {
    $rate30 = 6.68;
}
if ($rate15 === null || $rate15 < 3.0 || $rate15 > 12.0) {
    $rate15 = 6.19;
}

echo json_encode([
    'rate' => number_format($rate30, 2),
    'rate15' => number_format($rate15, 2),
    'date' => $rateDate,
    'source' => 'Mortgage News Daily'
]);
?>