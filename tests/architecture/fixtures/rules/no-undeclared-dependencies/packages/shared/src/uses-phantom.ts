// A package importing a dependency that only another package (or nobody) declares.
import { value } from 'phantomlib';
export const z: unknown = value;
