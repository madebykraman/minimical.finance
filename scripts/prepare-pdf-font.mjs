import { mkdir, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fonts = [
  ["dejavu-fonts-ttf/ttf/DejaVuSans.ttf", "DejaVuSans.ttf"],
  ["dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf", "DejaVuSans-Bold.ttf"],
];

for (const [sourcePackage, fileName] of fonts) {
  const source = require.resolve(sourcePackage);
  const destination = join(process.cwd(), "public", "fonts", fileName);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  console.log("Prepared PDF font:", destination);
}
