// Contract tests for the acceptance-pipeline DB helpers (no real Postgres).
// db.js helpers take `clientOrPool` as a parameter, so a fake with a recording
// `query()` is enough to assert the SQL shape + params. Run: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  stageForAcceptance,
  upsertArgumentDb,
  upsertPeerreviewResponseDb,
} from "../src/db.js";

function fakePool() {
  const calls = [];
  return {
    calls,
    async query(text, params = []) {
      calls.push({ text, params });
      return { rows: [] }; // no row "inserted" → skips downstream quorum check
    },
  };
}

test("stageForAcceptance inserts into the queue (idempotent) and NOTIFYs", async () => {
  const pool = fakePool();
  await stageForAcceptance(pool, {
    userUri: "at://did:plc:user/app.ch.poltr.ballot.argument/abc",
    userCid: "bafyuser",
    did: "did:plc:user",
    kind: "argument",
    ballot: "663",
    record: { title: "T" },
  });

  assert.equal(pool.calls.length, 2);
  const insert = pool.calls[0];
  assert.match(insert.text, /INSERT INTO app_acceptance_queue/);
  assert.match(insert.text, /ON CONFLICT \(user_uri\) DO NOTHING/);
  assert.equal(insert.params[0], "at://did:plc:user/app.ch.poltr.ballot.argument/abc");
  assert.equal(insert.params[3], "argument");
  assert.equal(insert.params[4], "663");
  assert.equal(insert.params[5], JSON.stringify({ title: "T" }));

  assert.match(pool.calls[1].text, /NOTIFY acceptance_queue/);
});

test("upsertArgumentDb persists origin_uri / origin_cid from the community record", async () => {
  const pool = fakePool();
  const record = {
    $type: "app.ch.poltr.ballot.argument",
    title: "T",
    body: "B",
    type: "PRO",
    ballot: "663",
    langs: ["de-CH"],
    source: {
      $type: "app.ch.poltr.ballot.argument#sourceUser",
      authorDid: "did:plc:user",
      originUri: "at://did:plc:user/app.ch.poltr.ballot.argument/abc",
      originCid: "bafyuser",
    },
  };
  await upsertArgumentDb(pool, {
    uri: "at://did:plc:community/app.ch.poltr.ballot.argument/r",
    cid: "bafycommunity",
    did: "did:plc:community",
    rkey: "r",
    record,
  });

  const insert = pool.calls[0];
  assert.match(insert.text, /origin_uri, origin_cid/);
  assert.ok(insert.params.includes("at://did:plc:user/app.ch.poltr.ballot.argument/abc"));
  assert.ok(insert.params.includes("bafyuser"));
});

test("upsertArgumentDb leaves origin null for legacy/community-authored records", async () => {
  const pool = fakePool();
  const record = {
    $type: "app.ch.poltr.ballot.argument",
    title: "T", body: "B", type: "PRO", ballot: "663", langs: ["de-CH"],
    source: { $type: "app.ch.poltr.ballot.argument#sourceUser", authorDid: "did:plc:user" },
  };
  await upsertArgumentDb(pool, {
    uri: "at://did:plc:community/c/r", cid: "bafycommunity", did: "did:plc:community", rkey: "r", record,
  });
  const insert = pool.calls[0];
  // last two params (origin_uri, origin_cid) are null
  assert.equal(insert.params[insert.params.length - 2], null);
  assert.equal(insert.params[insert.params.length - 1], null);
});

test("upsertPeerreviewResponseDb persists origin_uri / origin_cid", async () => {
  const pool = fakePool();
  const record = {
    $type: "app.ch.poltr.peerreview.response",
    argument: "at://did:plc:community/app.ch.poltr.ballot.argument/arg",
    reviewer: "did:plc:reviewer",
    vote: "APPROVE",
    originUri: "at://did:plc:reviewer/app.ch.poltr.peerreview.response/r1",
    originCid: "bafiresp",
  };
  await upsertPeerreviewResponseDb(pool, {
    uri: "at://did:plc:community/app.ch.poltr.peerreview.response/rk",
    cid: "baficommunity",
    record,
  });
  const insert = pool.calls[0];
  assert.match(insert.text, /origin_uri, origin_cid/);
  assert.ok(insert.params.includes("at://did:plc:reviewer/app.ch.poltr.peerreview.response/r1"));
  assert.ok(insert.params.includes("bafiresp"));
});
