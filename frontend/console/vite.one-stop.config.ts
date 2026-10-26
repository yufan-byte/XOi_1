import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import react from "@vitejs/plugin-react";
import {defineConfig} from "vite";
const dir=fileURLToPath(new URL(".",import.meta.url));
const adapter=(name:string)=>resolve(dir,"src/one-stop/adapters",name);
export default defineConfig({root:resolve(dir,"one-stop"),base:"/one-stop/",publicDir:resolve(dir,"one-stop/public"),plugins:[react()],
  resolve:{dedupe:["react","react-dom","react-router-dom","@tanstack/react-query"],alias:{
    "@/lib/store-local":adapter("collections.ts"),"@/lib/queries":adapter("queries.ts"),"@/lib/llm":adapter("llm.ts"),"@/lib/voices":adapter("voices.ts"),"@/lib/extract-audio":adapter("extract-audio.ts"),
    "@/components/shell/app-shell":adapter("shell.tsx"),"@/components/ui/drawer":adapter("drawer.tsx"),"@/components/ui/model-picker":adapter("model-picker.tsx"),
    "next/navigation":resolve(dir,"src/shims/next-navigation.ts"),"next/link":resolve(dir,"src/shims/next-link.tsx"),"@":resolve(dir,"src")}},
  server:{fs:{allow:[resolve(dir,".."),resolve(dir,"../../shared")]},proxy:{"/api":{target:"http://localhost:12121",changeOrigin:true},"/brand":{target:"http://localhost:12121"}}},
  css:{postcss:resolve(dir,"postcss.config.mjs")},build:{outDir:resolve(dir,"../public/one-stop"),emptyOutDir:true}});
