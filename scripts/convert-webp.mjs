import sharp from 'sharp';
import { readdir } from 'fs/promises';
import path from 'path';

const dirs = ['public/brand', 'public/icons'];

// Ba'zi manba rasmlar ekranda ko'rsatiladigan o'lchamdan ancha katta. Bunday
// fayllar uchun webp variantini QISQARTIRIB chiqaramiz (nisbat saqlanadi,
// kattalashtirmaydi) — manba PNG o'z holicha qoladi.
//
// olympy-brand.png: 1536×1024, lekin shared.jsx `BrandLogo` uni eng katta
// holatda ham 156×104 CSS px qilib chizadi → 320px retina (2x) uchun ham
// yetarli. public/icons dagi fayllar allaqachon aniq o'lchamda (16/32/180/
// 192/512 px), shuning uchun ular teginilmaydi.
const MAX_WEBP_WIDTH = {
  'olympy-brand.png': 320,
};

for (const dir of dirs) {
  try {
    const files = await readdir(dir);
    for (const file of files) {
      if (/\.(png|jpg|jpeg)$/i.test(file)) {
        const input = path.join(dir, file);
        const output = path.join(dir, file.replace(/\.(png|jpg|jpeg)$/i, '.webp'));
        const maxWidth = MAX_WEBP_WIDTH[file];
        const pipeline = sharp(input);
        if (maxWidth) {
          pipeline.resize({ width: maxWidth, withoutEnlargement: true });
        }
        await pipeline.webp({ quality: 85 }).toFile(output);
        console.log(`✓ ${input} → ${output}${maxWidth ? ` (max ${maxWidth}px)` : ''}`);
      }
    }
  } catch {}
}
