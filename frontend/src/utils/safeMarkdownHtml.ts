import filterXSS from "xss";
/** Preserve ordinary markdown and syntax classes, never handlers or active HTML embeds. */
export function safeMarkdownHtml(html:string){return filterXSS(html,{
  stripIgnoreTag:true,stripIgnoreTagBody:["script","iframe","object","embed","svg","math","style"],
  onIgnoreTagAttr(_tag,name,value){
    if(name==="class"&&/^[\w\s:.-]{0,500}$/.test(value))return `class="${value}"`;
    if(name==="id"&&/^[A-Za-z][\w:.-]{0,150}$/.test(value))return `id="${value}"`;
    return undefined;
  },
});}
