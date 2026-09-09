import type { PoolConfig } from "./types";
import { NFL_FUTURES_26_27 } from "./nfl-futures-26-27/config";

/**
 * Every tracker this site knows about. Adding a pool: drop a `config.ts` under
 * `lib/pools/<slug>/`, a data folder under `data/<slug>/`, and list it here.
 */
export const POOLS: PoolConfig[] = [NFL_FUTURES_26_27];

export const poolBySlug = (slug: string): PoolConfig | undefined => POOLS.find((p) => p.slug === slug);
