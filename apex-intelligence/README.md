# APEX Intelligence UI

This is the canonical web interface for Personal Trade Assistant. It consumes
the root Node API through same-origin `/api` routes and contains no server-side
credentials or mock API server.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Start the root API on port 3000.
3. Run the UI:
   `npm run dev`

Create a production bundle with `npm run build`. AI and broker credentials are
configured only in the root backend environment.
