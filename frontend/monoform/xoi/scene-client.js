export async function projectFingerprint(project){
  const copy=structuredClone(project)
  for(const shot of copy.shots||[])delete shot.thumbnail
  const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(ordered(copy))))
  return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('')
}
export async function sceneImageFromFile(file){
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024)throw Error('请选择 20 MB 以内的 PNG、JPG 或 WebP')
  const bitmap=await createImageBitmap(file)
  try{
    if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>80_000_000)throw Error('图片像素过大，请缩小后上传')
    const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#eee';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height)
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8));if(!blob||blob.size>1_200_000)throw Error('压缩后图片仍过大，请使用更小图片');return {blob,preview:canvas.toDataURL('image/jpeg',.8)}
  }finally{bitmap.close()}
}
