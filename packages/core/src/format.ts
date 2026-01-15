/**
 * JSON formatting utilities using Prettier
 */

import prettier from 'prettier';

/**
 * Format JSON using Prettier for consistent output
 * @param data - The data to format as JSON
 * @returns Formatted JSON string with trailing newline
 */
export async function formatJson(data: unknown): Promise<string> {
  const json = JSON.stringify(data);
  return prettier.format(json, {
    parser: 'json',
    printWidth: 80,
    tabWidth: 2,
  });
}

/**
 * Synchronous JSON formatting (fallback to JSON.stringify if prettier fails)
 * @param data - The data to format as JSON
 * @returns Formatted JSON string with trailing newline
 */
export function formatJsonSync(data: unknown): string {
  return JSON.stringify(data, null, 2) + '\n';
}
