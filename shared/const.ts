export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// User-facing labels for quote statuses. The underlying stored values
// (pending/accepted/declined/expired) are unchanged; this only affects display.
export const QUOTE_STATUS_LABELS: Record<string, string> = {
  pending: "Quote Sent",
  accepted: "Approved",
  declined: "Declined",
  expired: "Expired",
  all: "All",
};

export function quoteStatusLabel(status: string): string {
  return QUOTE_STATUS_LABELS[status] ?? status;
}
