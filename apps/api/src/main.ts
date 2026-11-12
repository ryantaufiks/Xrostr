import { createApp } from './bootstrap.js';
import { loadConfig } from './shared/config/app-config.js';

const config = loadConfig();
const app = await createApp(config);
await app.listen(config.port);
