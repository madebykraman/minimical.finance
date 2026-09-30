import { mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";

const root=process.cwd();
const sourceBase=join(root,"node_modules","geist","dist","fonts");
const target=join(root,"public","fonts");
await mkdir(target,{recursive:true});
for (const [src,dst] of [
  ["Geist-Regular.ttf","Geist-Regular.ttf"],
  ["Geist-SemiBold.ttf","Geist-SemiBold.ttf"],
  ["GeistMono-Regular.ttf","GeistMono-Regular.ttf"],
]) {
  await copyFile(join(sourceBase,"geist-sans",src.replace("GeistMono-","Geist-")),join(target,dst));
}
await copyFile(join(sourceBase,"geist-mono","GeistMono-Regular.ttf"),join(target,"GeistMono-Regular.ttf"));
console.log("Prepared Geist Sans Regular/SemiBold and Geist Mono Regular.");
