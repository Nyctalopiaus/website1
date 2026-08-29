<?php
/**
 * Possible Double-Bill Review now lives as a tab on admin_data_quality.php
 * (merged Aug 2026 alongside Market Mismatch review into one "Data Quality"
 * page). This stub just forwards anyone with the old URL bookmarked.
 */
header('Location: admin_data_quality.php?tab=double_bills');
exit;
