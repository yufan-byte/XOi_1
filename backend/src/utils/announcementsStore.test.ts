import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AnnouncementsStore } from "./announcementsStore";
test("announcement edits survive immutable release changes without overwriting legacy content",async()=>{
  const root=await mkdtemp(path.join(tmpdir(),"xoi-announcements-"));
  try {
    const data=path.join(root,"data"),web=path.join(root,"release","web");
    await mkdir(path.join(data,"web"),{recursive:true});await mkdir(web,{recursive:true});
    const legacy=JSON.stringify({data:[{id:"old",title:"operator"}]});
    await writeFile(path.join(data,"web","announcements.json"),legacy);
    await writeFile(path.join(web,"announcements.json"),JSON.stringify({data:[{id:"image"}]}));
    const store=new AnnouncementsStore(data,web);
    await store.preserveLegacy();
    assert.equal(await readFile(path.join(data,"announcements.json"),"utf8"),legacy);
    assert.equal((await store.read()).data[0]&&((await store.read()).data[0] as any).id,"old");
    await store.write([{id:"new",title:"edited"}]);
    assert.equal(((await store.read()).data[0] as any).id,"new");
    assert.equal(await readFile(path.join(data,"web","announcements.json"),"utf8"),legacy);
    assert.equal(((await new AnnouncementsStore(data,path.join(root,"other-release")).read()).data[0] as any).id,"new");
  } finally { await rm(root,{recursive:true,force:true}); }
});
