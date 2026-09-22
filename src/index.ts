import * as Env from './core/env';
import { HighQConfig } from './core/config';

export const version = '0.1.0';

/**
 * Main runtime configuration API.
 *
 * Example:
 * HighQTools.config.setBaseUrl("https://host/instance/api/3");
 */
export const config = HighQConfig;

/**
 * Kept for backwards compatibility with the API used during development.
 * Prefer `HighQTools.config` for base URL handling.
 */
export const HighQEnv = Env;

export * from './isheets/items';
export * from './isheets/fetch';
export * from './isheets/attachments';
export * from './isheets/relations';
