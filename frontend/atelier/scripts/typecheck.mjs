/** Match Vite's per-importer alias routing: host and upstream have distinct @/ roots. */
import ts from "typescript";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("..",import.meta.url));
const upstream=path.join(root,"upstream");
const configPath=path.join(root,"tsconfig.json");
const read=ts.readConfigFile(configPath,ts.sys.readFile);
if(read.error){console.error(ts.flattenDiagnosticMessageText(read.error.messageText,"\n"));process.exit(1);}
const config=ts.parseJsonConfigFileContent(read.config,ts.sys,root);
const options={...config.options,incremental:false};
const host=ts.createCompilerHost(options);
const hostAdapters=new Set(["@/xoi/owner","@/xoi/model-pricing","@/xoi/model-quote","@/xoi/quote-params","@/xoi/video-input"]);
const shims={"next/navigation":"next-navigation.ts","next/dynamic":"next-dynamic.tsx","next/link":"next-link.tsx"};
host.resolveModuleNames=(names,from)=>names.map(name=>{
  let target=name;
  if(shims[name])target=path.join(root,"src/shims",shims[name]);
  else if(hostAdapters.has(name))target=path.join(root,"src",name.slice(2));
  else if(from.startsWith(upstream+path.sep)&&name.startsWith("@/"))target=path.join(upstream,"src",name.slice(2));
  const resolved=ts.resolveModuleName(target,from,options,host).resolvedModule;
  // The source imports a package/alias, not the .tsx extension of our redirected target.
  return resolved&&target!==name?{...resolved,resolvedUsingTsExtension:false}:resolved;
});
const program=ts.createProgram(config.fileNames,options,host);
const diagnostics=[...config.errors,...ts.getPreEmitDiagnostics(program)];
if(diagnostics.length){
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:name=>name,getNewLine:()=>"\n"}));
  process.exitCode=1;
}else console.log("Host and upstream TypeScript checks passed with Vite-compatible aliases.");
