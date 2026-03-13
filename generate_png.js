import {createCanvas} from 'canvas';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionDir = path.join(__dirname, 'public', 'extension');
const sizes = [16, 32, 48, 96, 128];

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const radius = Math.max(3, Math.round(size * 0.19));

  ctx.clearRect(0, 0, size, size);

  drawRoundedRect(ctx, 0, 0, size, size, radius);
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();

  ctx.shadowColor = '#00ffcc';
  ctx.shadowBlur = size * 0.08;
  ctx.fillStyle = '#00ffcc';
  ctx.font = `normal ${Math.round(size * 0.78)}px Georgia`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S', size / 2, size / 2 + size * 0.03);

  return canvas.toBuffer('image/png');
}

for (const size of sizes) {
  fs.writeFileSync(path.join(extensionDir, `icon-${size}.png`), generateIcon(size));
}

fs.writeFileSync(path.join(extensionDir, 'icon.png'), generateIcon(128));
console.log('Generated Firefox PNG icons from the existing icon design.');