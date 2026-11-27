// Type-only imports of undeclared packages are rejected too: their resolution is accidental.
import type { value } from 'phantomlib';
export type T = typeof value;
