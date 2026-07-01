#!/usr/bin/env python3
"""Run the LLM precheck (stance/tone/topic) over all user arguments of ballot 663.1.
Concurrent, incremental, resumable."""
import json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
import psycopg2

PGURL = os.environ["PGURL"]
CALC = "http://localhost:3005/api/review/stance"
BALLOT = "663.1"
LANG = "de-CH"
SP = "/tmp/claude-0/-var-projects-poltr/fe7325ac-4885-432b-9bb0-c73ab107a88a/scratchpad"
OUT = f"{SP}/ballot2_llm.json"

conn = psycopg2.connect(PGURL)
cur = conn.cursor()
cur.execute("""
  SELECT uri, title, body, type FROM app_arguments
  WHERE ballot_rkey=%s AND deleted=false AND source_type='user'
  ORDER BY created_at
""", (BALLOT,))
rows = cur.fetchall()

done = {}
if os.path.exists(OUT):
    try:
        for r in json.load(open(OUT)):
            if r.get("status") == "ok":
                done[r["_uri"]] = r
    except Exception:
        pass
print(f"{len(rows)} args, {len(done)} already done", file=sys.stderr)

def call(row):
    uri, title, body, typ = row
    if uri in done:
        return done[uri]
    payload = json.dumps({"ballot_rkey": BALLOT, "lang": LANG,
                          "title": title, "body": body, "type": typ}).encode()
    obj = {"status": "unavailable"}
    for attempt in range(4):
        try:
            req = urllib.request.Request(CALC, data=payload,
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                obj = json.loads(r.read())
            break
        except Exception as e:
            print(f"  retry {attempt} {title[:30]}: {e}", file=sys.stderr)
            time.sleep(2 * (attempt + 1))
    obj["_uri"] = uri; obj["_title"] = title; obj["_declared"] = typ
    return obj

results = {}
n = 0
with ThreadPoolExecutor(max_workers=6) as ex:
    futs = {ex.submit(call, row): row[0] for row in rows}
    for fut in as_completed(futs):
        obj = fut.result()
        results[obj["_uri"]] = obj
        n += 1
        sev = obj.get("severity"); tone = obj.get("tone"); ot = obj.get("on_topic")
        print(f"  [{n}/{len(rows)}] {obj['_declared']:6} sev={sev} tone={tone} "
              f"on_topic={ot} topic={obj.get('topic')!r} :: {obj['_title'][:35]}", file=sys.stderr)
        # incremental save
        json.dump(list(results.values()), open(OUT, "w"), ensure_ascii=False, indent=2)

print(f"DONE wrote {OUT} ({len(results)})", file=sys.stderr)
