import {loadConfig} from './config.ts';
import {buildServer} from './server.ts';

const config = loadConfig(process.env);
const app = buildServer();

await app.listen(config);
