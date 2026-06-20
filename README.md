# KelpChronicle 🌿

> **Sui Overflow 2026** · Walrus Track (Project 07)
> **Tagline:** Organic knowledge networks, rooted in Walrus.

KelpChronicle is a Sui/Walrus-native autonomous research agent with persistent, verifiable memory. It continuously monitors and analyses the Walrus/Sui ecosystem, organically growing its knowledge network over time without relying on platform-locked or centralised databases.

---

## 🎯 The Pain Point

Autonomous AI agents typically suffer from statelessness or platform lock-in. Their memory is:
1. **Transient:** Session state is lost when the agent is terminated or moved.
2. **Centralised & Siloed:** Relying on proprietary vector databases locked behind Web2 APIs.
3. **Unverifiable:** Operators cannot prove that the agent's memory has not been tampered with or poisoned.

## 💡 The Solution: KelpChronicle

KelpChronicle solves agent amnesia by leveraging **Walrus** as a persistent, verifiable memory layer (via MemWal) and **Sui** as an immutable integrity anchor.

### Key Capabilities:
- **Organic Memory Growth:** On each run, the agent recalls past memory, fetches new ecosystem data, and computes the delta. It only analyses and summarises new information, appending findings to its organic knowledge tree.
- **Verifiable Memory (Sui + Walrus):** Research reports are saved as structured, versioned artifacts on Walrus. The Keccak256 hash of each run's canonical JSON is anchored on-chain via a custom, immutable `recall::attestation` Move contract.
- **Zero Platform Lock-In:** Because memory resides on Walrus, the agent's state is completely portable. An operator can shut down the backend, boot it on a different machine, and instantly restore the agent's entire memory history from Walrus.
- **Visual "Kelp Forest" Interface:** The agent's knowledge graph is visualised as an organic, growing seaweed network. New research sessions bloom dynamically, offering judges and operators a clear, interactive way to debug and explore agent memory.

---

## 🗺️ Project Layout

- [`move/`](file:///Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_Sui_Overflow/Tracks/3-Walrus/07-recall/move) — The `recall::attestation` Move package for on-chain integrity.
- [`backend/`](file:///Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_Sui_Overflow/Tracks/3-Walrus/07-recall/backend) — The Node/tsx agent loop, fetcher, diff engine, and MemWal integration.
- [`frontend/`](file:///Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_Sui_Overflow/Tracks/3-Walrus/07-recall/frontend) — The React dashboard featuring the chat console, memory sidebar, and the "Kelp Forest" knowledge graph.
- [`docs/`](file:///Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_Sui_Overflow/Tracks/3-Walrus/07-recall/docs) — Design specifications, plans, and branding guidelines.

---

## 🚀 Running the Project

### Prerequisites
- Node.js (v18+) & `npm`
- Sui CLI & a configured testnet wallet
- MemWal account and delegate key registered on the MemWal playground

### Quick Start
1. **Move Contract:** Build and deploy `recall::attestation` to Sui Testnet:
   ```bash
   cd move
   sui move build
   sui move test
   ```
2. **Backend Setup:** Set up your environment variables (`.env`) with your keys, then start the agent server:
   ```bash
   cd backend
   npm install
   npm run dev
   ```
3. **Frontend Dashboard:** Start the local interface:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
