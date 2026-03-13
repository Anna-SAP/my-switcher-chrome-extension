import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const sourceDir = path.resolve('dist', 'firefox');
const artifactsDir = path.resolve('artifacts');
const outputFile = path.join(artifactsDir, 'my-switcher-firefox.xpi');

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

async function main() {
  await fs.access(sourceDir);
  await fs.mkdir(artifactsDir, {recursive: true});

  const zip = new JSZip();
  await addDirectoryToZip(zip, sourceDir);

  const archive = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: {level: 9},
  });

  try {
    await fs.writeFile(outputFile, archive);
  } catch (error) {
    if (['UNKNOWN', 'EPERM', 'EBUSY'].includes(error?.code ?? '')) {
      throw new Error(
        `Failed to overwrite ${outputFile}. Close Firefox or remove the loaded add-on, then run the package command again.`,
      );
    }

    throw error;
  }

  console.log(`Firefox XPI written to ${outputFile}`);
}

main().catch((error) => {
  console.error('Failed to package Firefox extension.', error);
  process.exitCode = 1;
});
