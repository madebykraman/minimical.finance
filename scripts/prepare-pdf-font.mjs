import { mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";

const root=process.cwd();
const sourceBase=join(root,"node_modules","geist","dist","fonts");
const target=join(root,"public","fonts");
await mkdir(target,{recursive:true});
await copyFile(join(sourceBase,"geist-sans","Geist-Variable.ttf"),join(target,"Geist-Variable.ttf"));
await copyFile(join(sourceBase,"geist-mono","GeistMono-Variable.ttf"),join(target,"GeistMono-Variable.ttf"));
console.log("Prepared Geist Sans and Geist Mono PDF fonts.");
