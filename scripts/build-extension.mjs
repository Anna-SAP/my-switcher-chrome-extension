import {build} from 'vite';

const supportedTargets = new Set(['chrome', 'firefox']);
const target = process.argv[2] ?? 'chrome';

if (!supportedTargets.has(target)) {
  console.error(`Unsupported extension target "${target}". Use "chrome" or "firefox".`);
  process.exit(1);
}

process.env.EXTENSION_TARGET = target;

build()
  .then(() => {
    console.log(`Built ${target} extension into dist/${target}`);
  })
  .catch((error) => {
    console.error(`Failed to build ${target} extension.`, error);
    process.exit(1);
  });
