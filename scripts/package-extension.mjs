import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const supportedTargets = new Set(['chrome', 'firefox']);
const target = process.argv[2] ?? 'chrome';

if (!supportedTargets.has(target)) {
  console.error(`Unsupported extension target "${target}". Use "chrome" or "firefox".`);
  process.exit(1);
}

const sourceDir = path.resolve('dist', target);
const artifactsDir = path.resolve('artifacts');
const unpackedArtifactsDir = path.join(artifactsDir, `my-switcher-${target}`);
const extension = target === 'firefox' ? 'xpi' : 'zip';

function createOutputFilePath(fileExtension) {
  return path.join(artifactsDir, `my-switcher-${target}.${fileExtension}`);
}

function createTimestampedOutputFilePath(fileExtension) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(artifactsDir, `my-switcher-${target}-${timestamp}.${fileExtension}`);
}

async function addDirectoryToZip(zip, directoryPath, prefix = '') {
  const entries = await fs.readdir(directoryPath, {withFileTypes: true});

  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);
    const zipPath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, absolutePath, zipPath);
      continue;
    }

    const content = await fs.readFile(absolutePath);
    zip.file(zipPath, content);
  }
}

async function syncUnpackedBuild() {
  await fs.rm(unpackedArtifactsDir, {recursive: true, force: true});
  await fs.cp(sourceDir, unpackedArtifactsDir, {recursive: true});
  console.log(`${target} unpacked build synced to ${unpackedArtifactsDir}`);
}

async function main() {
  await fs.access(sourceDir);
  await fs.mkdir(artifactsDir, {recursive: true});
  await syncUnpackedBuild();

  const zip = new JSZip();
  await addDirectoryToZip(zip, sourceDir);

  const archive = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: {level: 9},
  });

  try {
    const outputFile = createOutputFilePath(extension);
    await fs.writeFile(outputFile, archive);
    console.log(`${target} package written to ${outputFile}`);
  } catch (error) {
    if (['UNKNOWN', 'EPERM', 'EBUSY'].includes(error?.code ?? '')) {
      const fallbackOutputFile = createTimestampedOutputFilePath(extension);
      await fs.writeFile(fallbackOutputFile, archive);
      console.log(
        `${target} package written to ${fallbackOutputFile} because the default artifact was locked.`,
      );
      return;
    }

    throw error;
  }
}

main().catch((error) => {
  console.error(`Failed to package ${target} extension.`, error);
  process.exitCode = 1;
});
