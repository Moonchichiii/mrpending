import { CONTRACT_VERSION } from '@pending/contract';

// One rules version at a time (MACHINE-RULES); a change bumps it before the fixtures move.
export const RULES_VERSION = 'r1' as const;
export const VERSIONS = { contract: CONTRACT_VERSION, rules: RULES_VERSION } as const;

export { validate } from './validate';
