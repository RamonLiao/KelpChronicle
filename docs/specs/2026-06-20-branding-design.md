# Branding & Visual Design Specification: KelpChronicle

> **Tagline:** Organic knowledge networks, rooted in Walrus.
> **Visual Style:** Botanical Deep-Sea Chronicle (Herbarium)

---

## 🌿 Core Concept: "Herbarium, Not Radioactive"

KelpChronicle adopts a vintage deep-sea research archive aesthetic. The design rejects cheap cyberpunk neon glows in favor of muted, organic matte colors for structured elements, reserving active glowing light source effects ("earned glow") strictly for verified blockchain state changes and active current runs.

---

## 🎨 Palette & Design Tokens

*   **Abyss (Background):** `#020B0E` — Solid, deep navy-black with zero neon glow.
*   **Deep-Teal (Card Fill):** `#071E22` — Muted, dark ocean teal for panels and sidebars.
*   **Kelp Green (Passive Stems/Leaves):** `#5C8F74` — Subdued, desaturated green representing historical memory nodes.
*   **Herb (Secondary Text/Labels):** `#9AB2A2` — Pale grayish-green for non-active metadata.
*   **Amber (Walrus Trust Glow):** `#EBB352` — Soft, warm gold glow reserved exclusively for the `Stored on Walrus` status.
*   **Cyan-Spark (Sui Verification Glow):** `#4DE5F7` — High-contrast cyan glow reserved for `Verified on-chain` status and the `Node-Fresh` (current session) node.

---

## 📐 Component Guidelines

### 1. The Earned Glow Rule (只有信任時刻與本次 Fresh 發光)
*   **Active/Fresh Items:** The node representing the *current* research run (`Node-Fresh`) is the only node on the kelp branch that emits a soft cyan-spark shadow blur.
*   **Historical Items:** All prior nodes (`Node 01` through `Node 14` etc.) must be rendered in matte gray or muted kelp green, indicating they are archival specimens.
*   **Verification Badges:**
    *   `✦ Stored on Walrus` glows with a soft amber-gold shadow.
    *   `✓ Verified on-chain` glows with a soft cyan-blue shadow.
    *   All other badges (e.g. `Pending Indexing`, `Node Offline`) remain matte gray with low-contrast borders.

### 2. Typography
*   **Titles & Project Name ("KelpChronicle"):** Classic, high-editorial serif typography (e.g. *Playfair Display*, *Garamond*, or *Lora* in italic/regular mix) to convey the feel of an archival catalog.
*   **Telemetry & Ledger Numbers:** Clean monospace font (e.g. *Spline Sans Mono*, *Fira Code*) for hashes, epoch numbers, and blob IDs.

### 3. Canvas Data Graph (Botanical Specimen)
*   **Illustration style:** Nodes are arranged along a branching seaweed graphic rather than a generic network.
*   **HTML5 Canvas Implementation:**
    *   Draw the kelp stem using a custom bezier path.
    *   Render nodes as circle path attachments.
    *   Use `ctx.shadowBlur = 10` only when drawing the `Node-Fresh` circle.

---

## 🌊 Animation & Micro-interactions (深海動力學與生動化設計)

為使畫面不顯死板，動畫設計應模擬真實深海流體與生物螢光特性，兼顧「有機感」與「數據動態」：

### 1. 洋流擺動模擬 (Fluid Current Sway & Mouse Interactive Influence)
*   **基礎洋流動態**：整株海藻（Kelp Stem）不可靜止。應使用正弦波函數（`Math.sin(time + offset)`）微幅擾動貝茲曲線的控制點（Control Points），模擬海流中的微幅左右搖曳。
*   **延遲傳導 (Lagged Propagation)**：越靠近頂端的葉片與節點，其擺動相位（Phase）越落後根部，形成類似真實海藻波動的「波浪傳導」視覺。
*   **滑鼠力場微幅搖擺 (Subtle Mouse Sway)**：滑鼠游標 $(x_m, y_m)$ 僅代表微弱的局部洋流，游標本身保持系統預設樣式（不附加發光或粒子特效）。
    1.  當游標移近時，僅對半徑 120px 內的海藻控制點與節點施加高度阻尼的微幅偏移動力（`offset = (1 - distance/120) * 0.15 * max_offset`）。
    2.  海藻枝椏僅會產生極輕微的柔和擺動（Sway），避免海藻或節點偏離游標過大，確保使用者移近時節點位置穩定、易於精準 Hover 及點擊 (Click)。

### 2. 有機孢子分裂與生長 (Bioluminescent Budding)
*   **生長動畫**：當 Agent 偵測到新 Delta 數據時：
    1.  **分枝伸展**：新連線（Tendril）使用 SVG `stroke-dashoffset` 或 Canvas 線段插值，從舊節點平滑「長出」並彎曲延伸。
    2.  **節點綻放**：新節點由 `scale(0)` 緩慢膨脹至 `scale(1)`，並搭配彈性緩動曲線（`cubic-bezier(0.34, 1.56, 0.64, 1)`），使其有如孢子成熟綻放。
    3.  **螢光轉移**：伴隨一發短暫的強光脈衝（Pulse），新節點點亮為 `cyan-spark`，而舊節點的螢光則平滑淡化（Fade to matte kelp green）。

### 3. 記憶取回脈衝 (Memory Retrieval Pulse)
*   **流光效果**：當執行 `recall` 記憶查詢時，一絲亮藍色光點（Light Pulse）會沿著海藻的主幹（Stem Path）從根部向上「流動」至目標節點，視覺化數據的傳輸與召回過程。

### 4. 浮游碎屑背景 (Abyssal Marine Snow)
*   **環境動態**：背景 Abyss 內隨機產生極低透明度（`opacity: 0.1`）、大小不一的發光粒子（模擬深海海洋雪），以極慢的速度向上漂移並隨機淡出，打破大面積黑底的單調感。

