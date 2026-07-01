#!/usr/bin/env python3
import json, collections
SP = "/tmp/claude-0/-var-projects-poltr/fe7325ac-4885-432b-9bb0-c73ab107a88a/scratchpad"

llm = {r["_uri"]: r for r in json.load(open(f"{SP}/ballot2_llm.json"))}
dup = {}
for line in open(f"{SP}/ballot2_dup.tsv"):
    line = line.rstrip("\n")
    if not line: continue
    uri, typ, sim, title = line.split("|", 3)
    dup[uri] = {"type": typ, "max_sim": float(sim), "title": title}

uris = list(dup.keys())
N = len(uris)
print(f"# Ballot 2 (rkey 663.1) — {N} User-Argumente\n")

cnt = collections.Counter()
per_arg_fails = {}
fail_lists = collections.defaultdict(list)
topic_dist = collections.Counter()
stance_hint = []

for uri in uris:
    r = llm.get(uri, {})
    title = dup[uri]["title"]
    fails = []
    # 1 Stimmigkeit
    sev = r.get("severity")
    if sev == "warn":
        fails.append("Stimmigkeit"); fail_lists["Stimmigkeit"].append((title, dup[uri]["type"], r.get("reads_as")))
    elif sev == "hint":
        stance_hint.append((title, dup[uri]["type"]))
    # 2 Umgangston
    if r.get("tone") == "harsh":
        fails.append("Umgangston"); fail_lists["Umgangston"].append((title, dup[uri]["type"]))
    # 3 Thematik (off-topic)
    if r.get("on_topic") is False:
        fails.append("Thematik"); fail_lists["Thematik"].append((title, dup[uri]["type"]))
    # 4 Kein Duplikat
    if dup[uri]["max_sim"] >= 0.66:
        fails.append("Kein Duplikat"); fail_lists["Kein Duplikat"].append((title, dup[uri]["type"], dup[uri]["max_sim"]))
    # topic placement
    tp = r.get("topic")
    if tp: topic_dist[tp] += 1
    per_arg_fails[uri] = fails
    cnt[len(fails)] += 1

print("## Pro Kriterium beanstandet (⚠ warn-Level)\n")
print("| Kriterium | beanstandet | Anteil |")
print("|---|---|---|")
for k in ["Stimmigkeit", "Umgangston", "Thematik", "Kein Duplikat"]:
    n = len(fail_lists[k])
    print(f"| {k} | {n} | {100*n/N:.0f}% |")
print(f"\nZusätzlich Stimmigkeit *Hinweis* (kein klares Argument, sev=hint, nicht-blockierend): **{len(stance_hint)}**")

print("\n## Verteilung: Anzahl beanstandeter Kriterien je Argument\n")
print("| # Kriterien ⚠ | Argumente | Anteil |")
print("|---|---|---|")
for k in range(0, 5):
    print(f"| {k} | {cnt[k]} | {100*cnt[k]/N:.0f}% |")
clean = cnt[0]
print(f"\n**{clean}/{N} ({100*clean/N:.0f}%) bestehen alle vier ohne Beanstandung.** "
      f"**{N-clean} ({100*(N-clean)/N:.0f}%) hätten mind. eine Beanstandung.**")

print("\n## Thematik-Zuordnung (Hauptthema / ANDERES)\n")
print("| Hauptthema | Argumente |")
print("|---|---|")
for t, n in topic_dist.most_common():
    print(f"| {t} | {n} |")

print("\n## Detail — beanstandete Argumente\n")
for k in ["Stimmigkeit", "Umgangston", "Thematik", "Kein Duplikat"]:
    print(f"### {k} ({len(fail_lists[k])})")
    for item in fail_lists[k]:
        print(f"- {item}")
    print()
print("### Stimmigkeit-Hinweise (sev=hint)")
for item in stance_hint:
    print(f"- {item}")
