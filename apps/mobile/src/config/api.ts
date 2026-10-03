/**
 * The base URL is read at call time rather than at module load.
 *
 * Reading it once at import makes the value impossible to supply later,
 * which forces a test to mutate the environment before the module graph
 * is evaluated. A missing or blank value is still a configuration fault
 * and is reported as one.
 */
export function getApiBaseUrl(): string {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;

  if (!apiUrl || !apiUrl.trim()) {
    throw new Error(
      'EXPO_PUBLIC_API_URL is not configured. Set it in the mobile environment before making API requests.',
    );
  }

  return apiUrl.replace(/\/+$/, '');
}
