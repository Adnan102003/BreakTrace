import { startDemo } from './server';

const demo = await startDemo({ port: 4312, resilient: process.argv.includes('--resilient') });
console.log(`Fieldwork shop available at ${demo.url}`);
