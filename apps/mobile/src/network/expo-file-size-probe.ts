import { File } from 'expo-file-system';
import type { LocalFileSizeProbe } from '../sync/local-file-size';
import { isUsableSize } from '../sync/local-file-size';

/**
 * Measures a file that is about to be uploaded, on the device that holds it.
 *
 * `expo-file-system` reports a file's size as 0 when the file is missing or
 * unreadable, so a bare size is not enough to conclude anything: an
 * unreadable file must be reported as unknown rather than as empty, or an
 * unreadable file would be mistaken for a genuinely empty one and rewrite
 * the record to claim 0 bytes.
 */
export class ExpoFileSizeProbe implements LocalFileSizeProbe {
  sizeBytes(uri: string): number | null {
    try {
      const size = new File(uri).size;

      return isUsableSize(size) ? size : null;
    } catch {
      // A malformed or inaccessible path is unknown, not empty. The
      // caller decides what to do about an unknown size; deciding here
      // would invent a measurement the filesystem never gave us.
      return null;
    }
  }
}
