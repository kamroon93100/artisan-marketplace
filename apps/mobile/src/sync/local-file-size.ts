/**
 * Local file size port.
 *
 * A media intent records the size the client declared when the file was
 * captured. That declaration is a claim, not a measurement: the bytes that
 * will actually be uploaded are the file on the device, so the file is the
 * only authority on how large the object is.
 *
 * The port exists so the sync pipeline can be exercised without a device
 * filesystem, and so the sync logic never reads a native module directly.
 */
export type LocalFileSizeProbe = {
  /**
   * The file's current byte length, or `null` when it cannot be measured.
   *
   * `null` means "unknown", never "zero". A record whose size cannot be
   * measured is left exactly as it is: an unmeasurable file is not evidence
   * that the declaration is wrong.
   */
  sizeBytes(uri: string): number | null;
};

/**
 * The probe used when a caller supplies none.
 *
 * Measuring the file is an optimization layered on top of the existing
 * pipeline, not a new requirement for it, so a caller that wires no probe
 * keeps the behavior it had before this port existed.
 */
export const unmeasuredLocalFile: LocalFileSizeProbe = {
  sizeBytes() {
    return null;
  },
};

/**
 * A byte length is only usable as a declared size when it is a positive
 * integer. Anything else cannot describe an object, and rewriting a
 * record to claim it would replace a real declaration with a worse one.
 */
export function isUsableSize(
  value: number | null,
): value is number {
  return (
    value !== null &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}
