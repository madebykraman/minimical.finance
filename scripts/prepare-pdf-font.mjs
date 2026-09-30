import { mkdir, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const source = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf");
const destination = join(process.cwd(), "public", "fonts", "DejaVuSans.ttf");

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
console.log("Prepared PDF font:", destination);
