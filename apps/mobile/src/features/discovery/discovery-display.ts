import { DiscoveryTransportError } from '../../network/discovery-transport';

/**
 * A discovery failure, as the screens show it.
 *
 * The server's own message is preserved verbatim: it is the only explanation
 * the buyer gets for why a listing will not open or a page will not load, and
 * rewording it client-side would risk saying something the server did not.
 * Anything that is not a classified transport failure keeps the generic
 * message and is treated as retryable, because an unknown failure is the
 * case where trying again is most likely to be the right next step.
 */
export function describeDiscoveryFailure(error: unknown): {
  message: string;
  retryable: boolean;
} {
  if (error instanceof DiscoveryTransportError) {
    return {
      message: error.message,
      retryable: error.retryable,
    };
  }

  return {
    message:
      error instanceof Error
        ? error.message
        : 'Something went wrong.',
    retryable: true,
  };
}

/**
 * Whether a discovery screen renders a back affordance.
 *
 * The Explore tab's root is the same screen as the pushed
 * `/explore/discovery` route, and only the pushed one has somewhere to go
 * back to. An unreachable back control on a tab's first impression reads as
 * a broken app, so it is absent rather than disabled.
 */
export function showsBackAffordance(props: {
  onBack?: () => void;
}): boolean {
  return typeof props.onBack === 'function';
}

/**
 * A publish time, shown as a date rather than as a timestamp.
 *
 * An unparseable value is shown raw rather than dropped or replaced with
 * "unknown": the server sent it, and hiding a field the buyer would use to
 * judge how fresh a listing is would be the reassuring direction.
 */
export function formatPublishedAt(publishedAt: string): string {
  const date = new Date(publishedAt);

  if (Number.isNaN(date.getTime())) {
    return publishedAt;
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
