import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.2);
  ctx.fill();

  // Neon glow effect
  ctx.shadowColor = '#00ffcc';
  ctx.shadowBlur = size * 0.15;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Text
  ctx.fillStyle = '#00ffcc';
  ctx.font = `bold ${size * 0.7}px "Arial", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Draw text multiple times to intensify the glow
  for (let i = 0; i < 3; i++) {
    ctx.fillText('S', size / 2, size / 2 + size * 0.05);
  }

  return canvas.toBuffer('image/png');
}

fs.writeFileSync(path.join(__dirname, 'public', 'extension', 'icon-16.png'), generateIcon(16));
fs.writeFileSync(path.join(__dirname, 'public', 'extension', 'icon-48.png'), generateIcon(48));
fs.writeFileSync(path.join(__dirname, 'public', 'extension', 'icon-128.png'), generateIcon(128));

console.log('Icons generated successfully.');
