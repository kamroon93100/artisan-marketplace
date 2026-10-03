export const MODULES = [
  'identity',
  'catalog',
  'sync',
  'media',
  'ai',
  'review',
  'discovery',
  'inquiry',
  'audit',
] as const;

export type ModuleName = typeof MODULES[number];
