import { Stack, router } from 'expo-router';

import { InquiryHistory } from '@/features/inquiry/InquiryHistory';

/**
 * Route: /inquiries
 *
 * The buyer's own questions, newest first. A question sent from a listing has
 * to be findable later, and the list is where a buyer checks what they have
 * asked and what it was about.
 */
export default function InquiriesRoute() {
  return <InquiryHistory onBack={() => router.back()} />;
}
