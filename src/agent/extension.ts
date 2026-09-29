import type {
  AgentLoopHooks,
} from "./hooks.js";


export type AgentExtension = {
  name: string;
  hooks: AgentLoopHooks;
};
