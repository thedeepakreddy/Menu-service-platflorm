// F-02: a root devDependency, undeclared here, resolves through the hoisted root node_modules.
import { value } from 'rootdevlib';
export const x: unknown = value;
