# Branding & Visual Design Specification: KelpChronicle

> **Tagline:** Organic knowledge networks, rooted in Walrus.
> **Status:** Approved Direction

---

## 🌿 Core Concept & Narrative

KelpChronicle represents persistent, verifiable AI agent memory not as a cold database, but as an **organic, growing ecosystem**. Just as kelp forests grow branch by branch while remaining deeply anchored to the seabed, KelpChronicle’s memory grows node by node (incremental diffs) while remaining anchored to Sui and Walrus.

---

## 🎨 Visual Positioning: "The Kelp Forest"

The interface must reject generic, sterile AI chat designs. Instead, it should feel alive and premium, leaning into **Generative Art** and **Organic UI** paradigms:

### 1. The Knowledge Graph (Kelp Forest)
*   **Visual Representation:** The agent's memory database is rendered in a dedicated panel or interactive canvas as a 2D/3D force-directed graph styled to look like seaweed/kelp.
*   **Dynamic Growth (The Demo Wow Factor):** 
    *   When a new research run completes, new nodes (representing findings/artifacts) do not just snap into place. They "grow" out of existing nodes as budding branches.
    *   Lines connecting the nodes should bend slightly like organic tendrils rather than straight lines.
    *   Bioluminescent pulses flow from older anchored memory up to the fresh findings when they are recalled and analyzed.
*   **Interactivity:** Hovering over a kelp node reveals its Walrus blob ID, creation epoch, and semantic relevance score, styled with smooth CSS micro-interactions.

### 2. UI Theme & Aesthetics
*   **Color Palette:** Curated, deep-sea HSL tones:
    *   *Background:* Deep abyssal blue-black (`hsl(220, 30%, 5%)`).
    *   *Primary/Kelp Nodes:* Radiant seaweed greens (`hsl(145, 65%, 45%)` to `hsl(165, 75%, 35%)`).
    *   *Accent/Verifications:* Glowing bioluminescent cyans (`hsl(190, 90%, 50%)`) for "Stored on Walrus" and "Verified on-chain" badges.
*   **Styling Standards:**
    *   Apply premium Glassmorphism (semi-transparent blurred overlays with subtle green-blue borders).
    *   Modern sans-serif typography (e.g., *Outfit* or *Inter*).
    *   Micro-animations (e.g., floating animations for active nodes, gentle undulating background gradient shifts).

### 3. Key Badges & Trust Elements
*   **`Stored on Walrus`:** Styled as a glowing amber or green organic seal of permanence.
*   **`Verified on-chain`:** Anchored with a link to the Sui testnet transaction explorer for `recall::attestation::RunAttestation`.
