import { describe, expect, it } from 'vitest';

import { insertProjectMount } from './lima.js';

describe('insertProjectMount', () => {
  it('inserts after home mount without duplicating writable', () => {
    const config = `mounts:\n  - location: "~"\n    writable: true\nmountInotify: true\n`;
    const result = insertProjectMount(config, '/Users/me/project');

    expect(result).toBe(
      `mounts:\n  - location: "~"\n    writable: true\n  - location: "/Users/me/project"\n    writable: true\nmountInotify: true\n`
    );
  });

  it('handles single-quoted home mount entries', () => {
    const config = `mounts:\n  - location: '~'\nmountInotify: true\n`;
    const result = insertProjectMount(config, '/Users/me/project');

    expect(result).toBe(
      `mounts:\n  - location: '~'\n  - location: "/Users/me/project"\n    writable: true\nmountInotify: true\n`
    );
  });
});
