/** What every command handler receives. */
import { Args } from './args';
import { MetaClient } from './client';
import { Config } from './env';

export interface Ctx {
  client: MetaClient;
  config: Config;
  args: Args;
  /** Positional words after the command name, e.g. `adset pause 123` → ['123']. */
  rest: string[];
}

export type Handler = (ctx: Ctx) => Promise<void>;
