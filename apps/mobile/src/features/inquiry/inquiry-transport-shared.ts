/**
 * The shared inquiry transports.
 *
 * Resolved through a lazy singleton rather than constructed in a component:
 * a client built during render is a different object on every render, which
 * makes the effect that calls it fire again, forever. The conjecture is
 * replaced with the real thing in a test by calling `resolveInquiryTransport`.
 */

import {
  HttpInquiryTransport,
  type InquiryTransport,
} from '../../network/inquiry-transport';

let shared: InquiryTransport | null = null;

export function resolveInquiryTransport(
  injected?: InquiryTransport,
): InquiryTransport {
  return injected ?? (shared ??= new HttpInquiryTransport());
}

/**
 * The buyer's own inquiries.
 *
 * A test or a screen that has just sent a question can replace this to
 * observe the list without a network.
 */
export function sharedInquiryTransport(): InquiryTransport {
  return resolveInquiryTransport();
}
