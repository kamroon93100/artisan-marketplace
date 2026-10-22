/**
 * The Home screen's entry point to the buyer's inquiry history.
 *
 * A question sent from a listing has to be findable later, and the history is
 * a real, session-scoped screen the server owns. The destination is named in
 * one place so the action and its test cannot drift to a placeholder route:
 * the test asserts the href is exactly `/inquiries`, the route that renders
 * `InquiryHistory`.
 */

export const INQUIRY_HISTORY_ROUTE = '/inquiries' as const;

export type InquiryHistoryAction = {
  href: typeof INQUIRY_HISTORY_ROUTE;
  title: string;
  subtitle: string;
  accessibilityLabel: string;
};

/**
 * The visible, screen-reader-labelled action Home offers the buyer.
 *
 * The label states the destination ("your questions") rather than repeating
 * the visible title, so a screen reader announces where the control leads.
 */
export function inquiryHistoryAction(): InquiryHistoryAction {
  return {
    href: INQUIRY_HISTORY_ROUTE,
    title: 'Your questions',
    subtitle: 'See what you have asked artisans',
    accessibilityLabel: 'Open your questions to artisans',
  };
}
