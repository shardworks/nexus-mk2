export { default as commission } from './tools/commission.ts';
export { default as signal } from './tools/signal.ts';
export { default as install } from './tools/install.ts';
export { default as remove } from './tools/remove.ts';
export { default as instantiate } from './tools/instantiate.ts';
export { default as nexusVersion } from './tools/nexus-version.ts';

import commission from './tools/commission.ts';
import signal from './tools/signal.ts';
import install from './tools/install.ts';
import remove from './tools/remove.ts';
import instantiate from './tools/instantiate.ts';
import nexusVersion from './tools/nexus-version.ts';

export default [commission, signal, install, remove, instantiate, nexusVersion];
