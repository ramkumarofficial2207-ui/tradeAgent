# ApexScan AI — Dev Tasks & References

This file contains links and assets for the **ApexScan AI** terminal overhaul. Use this inside your IDE to quickly navigate all plans, visual mockups, and execution blueprints.

---

## 📑 1. Core Documentation & Design Blueprints

- **UI/UX Development Master Plan**: Detailed frontend guidelines, layout properties, and component-by-component design checklists.
  - [Open Development Plan](file:///C:/Users/RAM/.gemini/antigravity/brain/7e751f4d-e3b8-4ab1-8edf-11f99cafe146/ui_ux_development_master_plan.md)
- **SaaS Commercialization Blueprint**: Technical spec explaining the "Why" behind the layout, risk math equations, and SaaS monetization strategy.
  - [Open Commercial Blueprint](file:///C:/Users/RAM/.gemini/antigravity/brain/7e751f4d-e3b8-4ab1-8edf-11f99cafe146/ui_ux_commercial_blueprint.md)
- **UI Design System & Styling Guide**: Main token sheet listing HSL colors, active hex codes, and font choices (Space Grotesk, Inter, JetBrains Mono).
  - [Open UI Design System](file:///C:/Users/RAM/.gemini/antigravity/brain/7e751f4d-e3b8-4ab1-8edf-11f99cafe146/ui_design.md)

---

## 🎨 2. Visual Identity & Mockups

### Scanner Logo Design
![ApexScan AI Logo](file:///C:/Users/RAM/.gemini/antigravity/brain/7e751f4d-e3b8-4ab1-8edf-11f99cafe146/apex_agent_scanner_logo_1784317708718.jpg)

### Full Terminal Dashboard Mockup
![ApexScan AI Full Dashboard](file:///C:/Users/RAM/.gemini/antigravity/brain/7e751f4d-e3b8-4ab1-8edf-11f99cafe146/apexscan_full_dashboard_1784318125656.jpg)

---

## 🛠️ 3. Execution Commands Quick-Sheet

If you need to rebuild the assets and serving ports manually inside the IDE:

1. **Unbind ports**:
   ```powershell
   Stop-Process -Name node -Force -ErrorAction SilentlyContinue
   ```
2. **Re-compile production bundle**:
   ```bash
   cd apex-intelligence
   npm run build
   ```
3. **Boot servers concurrently**:
   ```bash
   cd ..
   npm run dev
   ```
