import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('build/icons', { recursive:true });
const svg = await readFile('src/icon.svg');
for (const size of [32, 64, 128, 256, 512, 1024]) {
  await sharp(svg).resize(size, size).png().toFile('build/icons/' + size + '.png');
}
const sizes = [32, 64, 128, 256];
const images = await Promise.all(sizes.map(size => readFile('build/icons/' + size + '.png')));
const header = Buffer.alloc(6 + images.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((data, index) => {
  const position = 6 + index * 16;
  header[position] = sizes[index] === 256 ? 0 : sizes[index];
  header[position + 1] = header[position];
  header.writeUInt16LE(1, position + 4);
  header.writeUInt16LE(32, position + 6);
  header.writeUInt32LE(data.length, position + 8);
  header.writeUInt32LE(offset, position + 12);
  offset += data.length;
});
await writeFile('build/icons/icon.ico', Buffer.concat([header, ...images]));
await mkdir('public', { recursive:true });
await writeFile('public/icon.svg', svg);
for (const size of [192, 512]) await sharp(svg).resize(size, size).png().toFile('public/icon-' + size + '.png');
console.log('Desktop and Android source icons are ready.');
