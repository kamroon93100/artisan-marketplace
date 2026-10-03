/**
 * Test shim for `expo-file-system`.
 *
 * The native module cannot load under Node, and the uploader's default
 * implementation is the only thing that needs it. Every test injects
 * its own upload function, so the shim exists only so the module graph
 * resolves and the default is never invoked.
 */

export const UploadType = {
  BINARY_CONTENT: 1,
} as const;

export class File {
  constructor(_uri: string) {}

  async upload(
    _url: string,
    _options: unknown,
  ): Promise<{ status: number; body: string }> {
    throw new Error(
      'The expo-file-system test shim cannot perform a real upload. Inject a uploader instead.',
    );
  }
}
