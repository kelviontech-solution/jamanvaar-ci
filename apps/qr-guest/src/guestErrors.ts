/** Preserve actionable restaurant rules while replacing internal/provider diagnostics. */
export function guestErrorMessage(message: string | undefined, code?: string): string {
  if (!message) return 'We could not complete your request. Please try again.';
  if (/razorpay|faulty key|incorrect JSON|stack trace|prisma|SQLSTATE|secret_key|api[_ -]?key|signature mismatch|internal server error/i.test(message)) {
    return /pay|razorpay|signature/i.test(message) || /PAYMENT/i.test(code || '')
      ? 'Online payment could not be started. Please try again, or choose pay at counter if available. Your payment has not been confirmed.'
      : 'The restaurant service is temporarily unavailable. Please try again or ask a team member for help.';
  }
  return message;
}
