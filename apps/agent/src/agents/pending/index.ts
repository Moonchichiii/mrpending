import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { instructions } from './instructions';
import type { PromptVersion } from './instructions';

export { PROMPT_VERSION, PROMPT_VERSIONS, instructions } from './instructions';
export type { PromptVersion } from './instructions';

// No tools, no memory: the model's only effects are a blueprint, a patch and a memo (SECURITY section 8).
export const pendingAgent = (version: PromptVersion, model: MastraModelConfig): Agent =>
  new Agent({ id: 'pending', name: 'Mr. Pending', instructions: instructions(version), model });
