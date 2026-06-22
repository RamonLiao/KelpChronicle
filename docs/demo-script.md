# KelpChronicle — Demo Script (5 min)

> British English. Format: **1 min slides → 3 min live demo → 1 min future vision.**
> Times are cumulative. **[SAY]** = spoken line. **[DO]** = on-screen action. **[SLIDE]** = deck cue.
> Pre-flight: frontend on `http://localhost:5190`, backend `:8788` warm, wallet ready, browser zoomed so panels are legible. Have the QR-scan phone to hand.

---

## PART 1 — Slides (0:00 → 1:00)

**[SLIDE 1 — Title: "KelpChronicle"] (0:00–0:12)**
[SAY] "Autonomous agents have a memory problem. The moment you restart one, it forgets everything. Its memory is trapped in a centralised database, and you can never *prove* it hasn't been tampered with."

**[SLIDE 2 — The three failures: Transient · Locked-in · Unverifiable] (0:12–0:30)**
[SAY] "Three failures: memory is transient — it vanishes on restart. It's locked in — trapped in a Web2 vector database. And it's unverifiable — the operator simply asks you to trust them."

**[SLIDE 3 — The fix: Walrus + Sui] (0:30–0:50)**
[SAY] "KelpChronicle fixes all three. We give an AI research agent a *persistent, portable, verifiable* memory. The memory itself lives on **Walrus**, through MemWal. Every run's content hash is anchored **on-chain on Sui**. So the memory survives the agent, moves between machines, and anyone can audit it."

**[SLIDE 4 — "We visualise that memory as a living kelp forest"] (0:50–1:00)**
[SAY] "And because abstract memory is hard to feel, we render it as a living kelp forest — every strand is a research run, every bud a finding. Let me show you."

---

## PART 2 — Live Demo (1:00 → 4:00)

### Beat 1 — The forest is real data (1:00–1:35)
[DO] Switch to `http://localhost:5190`. The kelp forest is already on screen, swaying.
[SAY] "This isn't a video or a static picture. Each strand you see is an actual research run our agent performed. Each glowing bud is a finding it recorded."
[DO] Move the mouse near the kelp — the strands sway towards the cursor.
[SAY] "It responds to me — gentle current physics — but the structure is driven entirely by the data."
[DO] Hover a trunk node → tooltip appears.
[SAY] "Hovering a run shows its Walrus blob ID and its on-chain epoch."

### Beat 2 — Run the agent live (1:35–2:25)
[DO] In the Run Console (top-left), type topic: `Sui Walrus ecosystem`. Wallet address is auto-filled as the agent.
[SAY] "I'll set the agent off on a topic. My connected wallet *is* the agent's identity."
[DO] Click **▷ Run**.
[SAY] "Right now the backend is fetching around thirty candidates from the Sui and Walrus ecosystem, diffing them against what the agent already remembers, summarising the new material, writing that memory to Walrus, and anchoring its keccak256 hash on Sui."
[DO] Wait for the result chip: `+N fresh · M known`. A new strand grows in with elastic scaling.
[SAY] "There — a new strand has grown. It tells me how many findings were genuinely fresh versus already known. The agent doesn't re-store what it already remembers — it deduplicates against Walrus."

### Beat 3 — Honest, earned verification (2:25–3:00)
[DO] Click the new trunk node → Inspector opens (right).
[SAY] "Two badges. Amber — *Stored on Walrus*. Cyan — *Verified on-chain*. These are earned, not decorative: a node only shows them if the blob and the attestation genuinely exist."
[DO] Click the **Verified on-chain ✓ ↗** link → testnet explorer opens on the attestation tx.
[SAY] "That link goes straight to Sui testnet. This is the actual transaction anchoring this memory's hash. Nothing here asks you to trust me — you can verify it yourself."

### Beat 4 — The killer move: memory survives (3:00–4:00)
[DO] In the Memory panel (bottom-left), click **Clear Local View**. The forest empties.
[SAY] "Now watch. I'll wipe the entire view. As far as this browser is concerned, the agent's memory is gone."
[DO] Click **Restore from Walrus**. The forest regrows from nothing.
[SAY] "And it's back — rebuilt entirely from Walrus. Nothing was cached locally; the only thing in local storage is my panel layout. The truth lives in Walrus and on Sui."
[DO] Pick up the phone, scan the on-screen **QR code**, show the same forest loading on mobile.
[SAY] "And because it's portable, here it is on a completely different device — same topic, same memory, no account, no sync. The agent's mind goes wherever you take it."

---

## PART 3 — Future Vision (4:00 → 5:00)

**[SLIDE 5 — "From one agent to an ecosystem of memory"] (4:00–4:30)**
[SAY] "Today this is one agent remembering one topic. The architecture is deliberately general. Because memory is a public, verifiable Walrus artifact, agents can *share* memory — one agent reads another's anchored findings and trusts them, because the hash is on-chain. Imagine a marketplace of verifiable agent memory."

**[SLIDE 6 — Roadmap: multi-tenant · access control · memory provenance] (4:30–4:55)**
[SAY] "Next: multi-tenant namespaces so many agents coexist; Seal-based access control for private memory you sell access to rather than expose; and full provenance — proving not just *what* an agent remembered, but the chain of reasoning that got it there."

**[SLIDE 7 — Close] (4:55–5:00)**
[SAY] "KelpChronicle — give your agent a memory that outlives it, travels with it, and proves itself. Thank you."

---

## Cue Card (one-glance backup)

1. Slides: amnesia → 3 failures → Walrus+Sui fix → kelp metaphor
2. Forest = real runs/findings; mouse sway
3. Run `Sui Walrus ecosystem` → strand grows → fresh vs known
4. Inspector → two earned badges → explorer link (real testnet tx)
5. Clear → Restore from Walrus → QR to phone (portability)
6. Vision: shared memory marketplace → multi-tenant + Seal + provenance

### Fallback lines (if something stalls)
- **Run is slow:** "It's doing real work here — live fetch, summarise, Walrus write, and an on-chain transaction — so give it a moment."
- **Run returns 0 fresh:** "Zero fresh is the point — the agent already remembers this topic and refuses to duplicate. That dedup happens against Walrus, not a local cache."
- **Wallet/network hiccup:** Fall back to a pre-existing strand for Beats 3–4; the Restore-from-Walrus beat works without running a new agent.
