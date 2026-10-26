/** Local PostgreSQL + loopback HTTP only. Never imports the application's DB/model runtime. */
import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import { request as httpRequest, type Server } from "node:http";
import express from "express";
import pg from "pg";
import { OneStopDocuments, OneStopError, ONE_STOP_MAX_BYTES } from "../src/lib/oneStop/documents";
import { createOneStopRouter } from "../src/lib/oneStop/router";

async function main() {
  const connection = process.env.ONE_STOP_TEST_DATABASE_URL || process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL;
  if (!connection) throw new Error("local PostgreSQL required");
  const url = new URL(connection);
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      // Prevent connection-string query parameters from overriding the validated host/search_path.
      [...url.searchParams.keys()].some(key => !["sslmode", "application_name"].includes(key))) {
    throw new Error("local PostgreSQL with no connection overrides required");
  }
  const schema = `xoi_one_stop_test_${crypto.randomBytes(12).toString("hex")}`;
  const ownedSchema = /^xoi_one_stop_test_[a-f0-9]{24}$/;
  const admin = new pg.Pool({ connectionString: connection, max: 1, connectionTimeoutMillis: 5000 });
  const config = {
    connectionString: connection, options: `-c search_path=${schema} -c statement_timeout=10000 -c lock_timeout=5000`,
    max: 6, connectionTimeoutMillis: 5000,
  };
  const a = new pg.Pool(config), b = new pg.Pool(config);
  const one = new OneStopDocuments(a), two = new OneStopDocuments(b);
  const checks: string[] = [];
  let server: Server | undefined, created = false;
  let activeCheck = "setup";
  const check = async (name: string, run: () => Promise<void>) => {
    activeCheck = name;
    await run();
    checks.push(name);
  };
  const conflict = (error: unknown) => error instanceof OneStopError && error.status === 409;
  try {
    assert.match(schema, ownedSchema);
    // CREATE without IF NOT EXISTS proves this invocation owns the cleanup target.
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await check("multi-node transactional initialization on independent pools", async () => {
      await Promise.all(Array.from({ length: 12 }, (_, i) => new OneStopDocuments(i % 2 ? a : b).initialize()));
      await Promise.all([one.initialize(), two.initialize()]);
      const tables = await a.query("SELECT table_name FROM information_schema.tables WHERE table_schema = $1", [schema]);
      assert.deepEqual(tables.rows.map(row => row.table_name), ["xoi_one_stop_documents"]);
      const key = await a.query(`SELECT a.attname FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = 'xoi_one_stop_documents'::regclass AND c.contype = 'p'
        ORDER BY array_position(c.conkey, a.attnum)`);
      assert.deepEqual(key.rows.map(row => row.attname), ["user_id", "collection", "document_id"]);
    });

    const app = express();
    // Synthetic test identities only; no login, JWT or real user lookup.
    app.use((req, _res, next) => {
      if (req.get("x-test-user")) (req as express.Request & { user?: { id: string } }).user = { id: req.get("x-test-user")! };
      next();
    });
    let getterCalls = 0;
    const router = (store: OneStopDocuments) => createOneStopRouter(() => { getterCalls++; return store; });
    app.use("/a", router(one));
    app.use("/b", router(two));
    // Exercise the host application's larger JSON parser as well.
    app.use("/preparsed", express.json({ limit: "16mb" }), router(one));
    app.use("/unavailable", createOneStopRouter(() => { throw new Error("postgres://SECRET/internal/path"); }));
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    type Reply = { status: number; body: any };
    const request = async (path: string, method = "GET", body?: unknown, user: string | null = "1", node = "a", raw = false): Promise<Reply> => {
      const headers: Record<string, string> = {};
      if (user !== null) headers["x-test-user"] = user;
      if (body !== undefined) headers["content-type"] = "application/json";
      const response = await fetch(`${origin}/${node}${path}`, {
        method, headers, body: body === undefined ? undefined : raw ? String(body) : JSON.stringify(body),
      });
      assert.equal(response.headers.get("cache-control"), "no-store");
      const result = await response.json();
      assert.equal(result.success, response.ok);
      return { status: response.status, body: result };
    };
    const id: string = crypto.randomUUID();
    const body = (revision = 0, collection = "comic", documentId = id) => ({
      collection, revision, title: "隔离文档", payload: { id: documentId, title: "隔离文档", nodes: [{ id: "n1", text: "fixture" }] },
    });
    const path = (documentId = id, collection = "comic") => `/documents/${documentId}?collection=${collection}`;
    const save = (documentId = id, value: unknown = body(), user = "1", node = "a") => request(`/documents/${documentId}`, "PUT", value, user, node);

    await check("anonymous and invalid identities rejected before store resolution", async () => {
      const before = getterCalls;
      for (const user of [null, "0", "-1", "NaN", "9007199254740992", "1.0", "1e0"]) {
        for (const method of ["GET", "PUT", "DELETE"]) {
          assert.equal((await request(path(), method, method === "GET" ? undefined : body(), user)).status, 401);
        }
      }
      assert.equal(getterCalls, before);
    });
    await check("PUT/GET contract, independent user and collection IDs", async () => {
      const result = await save();
      assert.equal(result.status, 200);
      assert.deepEqual(Object.keys(result.body.data).sort(), ["id", "payload", "revision", "updatedAt"]);
      assert.equal(result.body.data.revision, 1);
      assert.equal(typeof result.body.data.updatedAt, "number");
      assert.deepEqual(result.body.data.payload, body().payload);
      assert.deepEqual((await request(path(), "GET", undefined, "1", "b")).body.data, result.body.data);
      assert.equal((await request(path(), "GET", undefined, "2")).status, 404);
      assert.deepEqual((await request("/documents?collection=comic", "GET", undefined, "2")).body.data.items, []);
      assert.equal((await save(id, body(1), "2")).status, 409);
      assert.equal((await request(`/documents/${id}`, "DELETE", { collection: "comic", revision: 1 }, "2")).status, 409);
      assert.equal((await save(id, { ...body(), title: "other owner", payload: { id, owner: "inert payload metadata" } }, "2")).status, 200);
      assert.equal((await request(path())).body.data.payload.title, "隔离文档");
      assert.equal((await save(id, body(0, "comic-styles"))).status, 200);
      assert.equal((await request(path(id, "comic-styles"))).body.data.revision, 1);
    });
    await check("original non-UUID UIDs and exact 160-character IDs accepted", async () => {
      for (const documentId of ["original_uid-01", "a".repeat(160)]) {
        assert.equal((await save(documentId, body(0, "comic", documentId))).status, 200);
        assert.equal((await request(path(documentId))).body.data.id, documentId);
        assert.equal((await request(`/documents/${documentId}`, "DELETE", { collection: "comic", revision: 1 })).status, 200);
      }
    });
    await check("revision zero conflicts and concurrent cross-pool CAS has one winner", async () => {
      assert.equal((await save()).status, 409);
      const results = await Promise.all(Array.from({ length: 16 }, (_, i) => save(id, { ...body(1), title: `edit-${i}` }, "1", i % 2 ? "a" : "b")));
      assert.equal(results.filter(result => result.status === 200).length, 1);
      assert.equal(results.filter(result => result.status === 409).length, 15);
      const current = await request(path());
      assert.equal(current.body.data.revision, 2);
      assert.equal((await save(id, body(1))).status, 409);
      const before = await a.query("SELECT created_at, updated_at FROM xoi_one_stop_documents WHERE user_id=1 AND collection='comic' AND document_id=$1", [id]);
      assert.equal((await save(id, body(2))).body.data.revision, 3);
      const after = await b.query("SELECT created_at, updated_at FROM xoi_one_stop_documents WHERE user_id=1 AND collection='comic' AND document_id=$1", [id]);
      assert.equal(after.rows[0].created_at, before.rows[0].created_at);
      assert.ok(Number(after.rows[0].updated_at) > Number(before.rows[0].updated_at));
    });
    await check("strict mutation/query schemas reject malformed and tenant overrides", async () => {
      const invalid: unknown[] = [null, [], {}, { ...body(), collection: "director" }, { ...body(), revision: "0" },
        { ...body(), revision: -1 }, { ...body(), revision: 0.5 }, { ...body(), revision: 2147483647 },
        { ...body(), title: 1 }, { ...body(), title: "x".repeat(161) }, { ...body(), payload: [] },
        { ...body(), payload: {} }, { ...body(), payload: { id: crypto.randomUUID() } },
        { ...body(), title: "bad\0title" }, { ...body(), payload: { id, text: "bad\0text" } },
        { ...body(), payload: { id, text: "\ud800" } }];
      for (const key of ["userId", "user_id", "owner", "tenant", "tenantId", "collectionId", "deleted_at", "created_at"]) {
        invalid.push({ ...body(), [key]: 2 });
      }
      for (const value of invalid) assert.equal((await save(id, value)).status, 400);
      for (const query of ["", "collection=unknown", "collection=comic&userId=2", "collection=comic&owner=2",
        "collection=comic&collection=comic-styles", "collection[owner]=2", "collection=comic&page=0",
        "collection=comic&page=-1", "collection=comic&page=1.5", "collection=comic&page=10001",
        "collection=comic&page=9999&pageSize=100", "collection=comic&pageSize=101", "collection=comic&pageSize=0",
        "collection=comic&pageSize=", "collection=comic&page=1e3", "collection=comic&page=1%0A"]) {
        assert.equal((await request(`/documents?${query}`)).status, 400);
      }
      assert.equal((await request(`${path()}&user_id=2`)).status, 400);
      assert.equal((await request(`/documents/${id}?userId=2`, "PUT", body())).status, 400);
      assert.equal((await request(`/documents/${id}?collection=comic`, "DELETE", { collection: "comic", revision: 3 })).status, 400);
      for (const value of [{ collection: "comic", revision: 0 }, { collection: "comic", revision: "3" },
        { collection: "comic", revision: 3, userId: 2 }, { collection: "comic", revision: 3, payload: {} }]) {
        assert.equal((await request(`/documents/${id}`, "DELETE", value)).status, 400);
      }
      for (const badId of ["a".repeat(161), "bad.id", "bad:id", "bad%20id", "bad%2Fid", "bad%0A", "bad%0D"]) {
        assert.equal((await request(`/documents/${badId}?collection=comic`)).status, 400);
      }
      assert.equal((await request(`/documents/${id}`, "PUT", '{"collection":', "1", "a", true)).status, 400);
      assert.equal((await request(`/documents/${id}`, "PUT", "null", "1", "a", true)).status, 400);
      assert.equal((await request(path())).body.data.revision, 3);
    });
    await check("nested, escaped, mixed-case and embedded local URLs rejected", async () => {
      for (const uri of ["blob:fixture", "file:///private/fixture", " FILE:/fixture", "prefix Blob:fixture suffix"]) {
        assert.equal((await save(id, { ...body(3), payload: { id, nested: [{ url: uri }] } })).status, 400);
      }
      const escaped = JSON.stringify({ ...body(3), payload: { id, url: "blob:fixture" } }).replace("blob:", "\\u0062lob:");
      assert.equal((await request(`/documents/${id}`, "PUT", escaped, "1", "a", true)).status, 400);
      assert.equal((await save(id, { ...body(3), payload: { id, "file:fixture": true } })).status, 400);
      assert.equal((await request(path())).body.data.revision, 3);
    });
    await check("8 MiB exact byte boundary, multibyte and parent-parser limits", async () => {
      const largeId = crypto.randomUUID();
      const large = { ...body(0, "comic", largeId), payload: { id: largeId, text: "" } };
      const overhead = Buffer.byteLength(JSON.stringify(large));
      large.payload.text = "x".repeat(ONE_STOP_MAX_BYTES - overhead);
      assert.equal(Buffer.byteLength(JSON.stringify(large)), ONE_STOP_MAX_BYTES);
      assert.equal((await save(largeId, large)).status, 200);
      const tooBig = { ...large, revision: 1, payload: { ...large.payload, text: large.payload.text + "x" } };
      for (const node of ["a", "preparsed"]) assert.equal((await save(largeId, tooBig, "1", node)).status, 413);
      // No Content-Length: test both our parser and an already-parsed host body.
      for (const node of ["a", "preparsed"]) {
        const json = JSON.stringify(tooBig);
        const result = await new Promise<{ status?: number; cache?: string; body: string }>((resolve, reject) => {
          const req = httpRequest(`${origin}/${node}/documents/${largeId}`, {
            method: "PUT", headers: { "x-test-user": "1", "content-type": "application/json", "transfer-encoding": "chunked" },
          }, res => {
            let text = "";
            res.setEncoding("utf8");
            res.on("data", chunk => { text += chunk; });
            res.on("end", () => resolve({ status: res.statusCode, cache: res.headers["cache-control"], body: text }));
            res.on("error", reject);
          });
          req.on("error", reject);
          req.write(json.slice(0, 4096));
          req.end(json.slice(4096));
        });
        assert.equal(result.status, 413);
        assert.equal(result.cache, "no-store");
        assert.equal(JSON.parse(result.body).success, false);
      }
      assert.equal((await save(largeId, { ...large, revision: 1, payload: { id: largeId, text: "中".repeat(3 * 1024 * 1024) } })).status, 413);
      await assert.rejects(two.save(1, "comic", largeId, 1, large.title, tooBig.payload), (error: unknown) => error instanceof OneStopError && error.status === 413);
      assert.equal((await two.get(1, "comic", largeId)).revision, 1);
      await one.delete(1, "comic", largeId, 1);
    });
    await check("soft-delete CAS retains payload/PK and blocks all resurrection attempts", async () => {
      const before = await a.query("SELECT * FROM xoi_one_stop_documents WHERE user_id=1 AND collection='comic' AND document_id=$1", [id]);
      assert.equal((await request(`/documents/${id}`, "DELETE", { collection: "comic", revision: 2 })).status, 409);
      const result = await request(`/documents/${id}`, "DELETE", { collection: "comic", revision: 3 }, "1", "b");
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.data, { id, revision: 4, updatedAt: result.body.data.updatedAt, deleted: true });
      const row = (await b.query("SELECT * FROM xoi_one_stop_documents WHERE user_id=1 AND collection='comic' AND document_id=$1", [id])).rows[0];
      assert.ok(row.deleted_at);
      assert.equal(row.revision, 4);
      assert.deepEqual(row.payload, before.rows[0].payload);
      assert.equal(row.created_at, before.rows[0].created_at);
      assert.equal((await request(path())).status, 404);
      assert.equal((await save(id, body(0))).status, 409);
      assert.equal((await save(id, body(4))).status, 409);
      assert.equal((await request(`/documents/${id}`, "DELETE", { collection: "comic", revision: 4 })).status, 409);
      assert.equal((await request(path(), "GET", undefined, "2")).status, 200);
      assert.equal((await request(path(id, "comic-styles"))).status, 200);
      assert.equal((await request("/documents?collection=comic")).body.data.items.some((item: any) => item.id === id), false);
    });
    await check("simultaneous create and delete/update are atomic across nodes", async () => {
      const raceId = crypto.randomUUID();
      const creates = await Promise.all(Array.from({ length: 10 }, (_, i) => save(raceId, body(0, "comic", raceId), "1", i % 2 ? "a" : "b")));
      assert.equal(creates.filter(result => result.status === 200).length, 1);
      assert.equal(creates.filter(result => result.status === 409).length, 9);
      const race = await Promise.all([
        save(raceId, body(1, "comic", raceId), "1", "a"),
        request(`/documents/${raceId}`, "DELETE", { collection: "comic", revision: 1 }, "1", "b"),
      ]);
      assert.deepEqual(race.map(result => result.status).sort(), [200, 409]);
      const row = (await a.query("SELECT revision FROM xoi_one_stop_documents WHERE user_id=1 AND collection='comic' AND document_id=$1", [raceId])).rows[0];
      assert.equal(row.revision, 2);
    });
    await check("bounded stable pagination, defaults, collection filtering, no pruning over 200", async () => {
      const ids = Array.from({ length: 207 }, () => crypto.randomUUID()).sort();
      // Store API creates >200 documents without a user-count cap or hidden pruning.
      for (const documentId of ids) await one.save(3, "comic", documentId, 0, "page", { id: documentId });
      await a.query("UPDATE xoi_one_stop_documents SET updated_at=12345 WHERE user_id=3");
      const defaults = (await request("/documents?collection=comic", "GET", undefined, "3")).body.data;
      assert.deepEqual({ page: defaults.page, pageSize: defaults.pageSize, hasMore: defaults.hasMore }, { page: 1, pageSize: 50, hasMore: true });
      const seen: string[] = [];
      for (let page = 1; page <= 4; page++) {
        const response = await request(`/documents?collection=comic&page=${page}&pageSize=100`, "GET", undefined, "3", page % 2 ? "a" : "b");
        assert.equal(response.status, 200);
        assert.equal(response.body.data.hasMore, page < 3);
        seen.push(...response.body.data.items.map((item: any) => item.id));
      }
      assert.deepEqual(seen, ids);
      assert.deepEqual((await request("/documents?collection=comic-styles", "GET", undefined, "3")).body.data.items, []);
      assert.equal(Number((await b.query("SELECT count(*) AS n FROM xoi_one_stop_documents WHERE user_id=3")).rows[0].n), 207);
      await one.delete(3, "comic", ids[0], 1);
      const remaining = (await request("/documents?collection=comic&pageSize=100", "GET", undefined, "3")).body.data.items;
      assert.equal(remaining[0].id, ids[1]);
      assert.equal(Number((await b.query("SELECT count(*) AS n FROM xoi_one_stop_documents WHERE user_id=3")).rows[0].n), 207);
    });
    await check("friendly errors, no generation endpoints, isolated lazy route import", async () => {
      const unavailable = await request("/documents?collection=comic", "GET", undefined, "1", "unavailable");
      assert.equal(unavailable.status, 503);
      assert.equal(JSON.stringify(unavailable.body).includes("SECRET"), false);
      for (const endpoint of ["/generate", "/generation", "/documents/generate/run"]) {
        assert.equal((await request(endpoint, "POST", {})).status, 404);
      }
      await import("../src/routes/one-stop/index");
      const runtimeImports = Object.keys(require.cache).filter(file => /\/src\/(lib\/agent\/db|utils\/db|utils\/ai)\.[cm]?[jt]s$/.test(file));
      assert.deepEqual(runtimeImports, []);
    });
  } catch (error) {
    console.error(`Failed check: ${activeCheck}`);
    throw error;
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    }
    await Promise.all([a.end(), b.end()]);
    try {
      if (created) {
        if (!ownedSchema.test(schema)) throw new Error("invalid owned test schema");
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
        assert.equal((await admin.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [schema])).rowCount, 0);
      }
    } finally {
      await admin.end();
    }
  }
  console.log(JSON.stringify({ passed: checks.length, checks, temporarySchemaRemoved: true, businessDataWrites: 0, modelRequests: 0 }, null, 2));
}

main().catch(error => {
  // Never print DB errors/connection details, even when local test credentials are configured.
  console.error("一站式 PostgreSQL 验证失败：", error instanceof assert.AssertionError ? error.message : "本机隔离测试未通过（私有连接信息不输出）");
  process.exitCode = 1;
});
