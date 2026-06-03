import sharp from 'sharp';
import { readdir } from 'fs/promises';
import path from 'path';

const dirs = ['public/brand', 'public/icons'];

for (const dir of dirs) {
  try {
    const files = await readdir(dir);
    for (const file of files) {
      if (/\.(png|jpg|jpeg)$/i.test(file)) {
        const input = path.join(dir, file);
        const output = path.join(dir, file.replace(/\.(png|jpg|jpeg)$/i, '.webp'));
        await sharp(input).webp({ quality: 85 }).toFile(output);
        console.log(`✓ ${input} → ${output}`);
      }
    }
  } catch {}
}
