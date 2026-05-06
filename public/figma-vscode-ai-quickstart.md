# Figma → VS Code with AI: Quick Start

There are two ways to connect Figma to VS Code. Pick one based on how you use Figma:

- **Path A — Figma in the browser** → use the **remote MCP server**. No desktop app needed. Easiest.
- **Path B — Figma desktop app** → use the **desktop MCP server**. Runs locally. Lets you point at the *currently selected* frame instead of pasting a link.

Both paths give the same end result: VS Code's AI can read your Figma file's structure (layers, variables, colors, spacing) and build code from it.

---

## Common setup (do this once, regardless of path)

1. **Verify your Figma Education plan.** Sign up at [figma.com](https://www.figma.com) with your `@uniri.hr` email, then verify at [figma.com/education](https://www.figma.com/education). Your team should show an "Education users only" banner — that confirms it's active.
2. **In VS Code**, activate Copilot Student via GitHub Education and install the **GitHub Copilot** and **GitHub Copilot Chat** extensions.

---

## Path A — Figma in the browser (remote MCP server)

### Set it up

1. In VS Code, press `Ctrl+Shift+P` → run **"MCP: Open User Configuration"**. If `mcp.json` doesn't exist, VS Code offers to create it.
2. Paste this into `mcp.json` and save:
   ```json
   {
     "inputs": [],
     "servers": {
       "figma": {
         "url": "https://mcp.figma.com/mcp",
         "type": "http"
       }
     }
   }
   ```
3. A **Start** button appears above the `figma` server entry — click it.
4. A browser window opens — click **Allow Access** to authenticate with your Figma account.

### Sanity check

Open Copilot Chat (`Ctrl+Alt+I`), switch to **Agent mode**, type `#get_design_context` — if it autocompletes, the server is connected.

### The loop (link-based)

1. In Figma (browser), right-click the frame you want to build → **Copy link to selection**.
2. In Copilot Chat (Agent mode, with a project folder open), prompt:
   > *"Get the design context for this frame and build it as a responsive HTML/CSS page in this folder: `<paste link>`"*
3. To iterate: tweak in Figma → copy the link again → *"Re-fetch context for `<paste link>` and update the page. Keep the existing structure where possible."*
4. Commit and push to GitHub from VS Code's Source Control tab.

---

## Path B — Figma desktop app (desktop MCP server)

### Set it up

1. Install the [Figma desktop app](https://www.figma.com/downloads/) and update to the latest version.
2. Open a Figma Design file. Switch to **Dev Mode** (toggle at the bottom of the toolbar, or shortcut `Shift+D`).
3. In the right inspect panel, find the **MCP server** section → click **Enable desktop MCP server**. Figma confirms it's running at `http://127.0.0.1:3845/mcp`.
4. In VS Code, press `Ctrl+Shift+P` → run **"MCP: Add Server"** → choose **HTTP** → paste `http://127.0.0.1:3845/mcp` → when asked for a Server ID, type `figma-desktop` → choose global or workspace scope.

### Sanity check

Open Copilot Chat (`Ctrl+Alt+I`), switch to **Agent mode**, type `#get_design_context` — if it autocompletes, the server is connected. If not, restart both Figma desktop and VS Code.

### The loop (selection-based)

1. In the Figma desktop app, **select the frame** you want to build.
2. In Copilot Chat (Agent mode, with a project folder open), prompt:
   > *"Get the design context for my current selection and build it as a responsive HTML/CSS page in this folder."*
3. To iterate: tweak in Figma → re-select the frame → *"Re-fetch the context and update the page. Keep the existing structure where possible."*
4. Commit and push to GitHub from VS Code's Source Control tab.

> Path B also supports the link-based workflow from Path A if you prefer.

---

## Tips (apply to both paths)

- **Name your layers.** `HeroSection`, `CTA-Button` → clean code. `Group 47` → garbage code.
- **Use Auto Layout, components, and variables in Figma.** MCP only shines when the design has real structure to extract.
- **Stay in Agent mode.** Ask mode won't call the MCP tools or write files.
- **Keep selected frames small.** Selecting a whole 50-frame canvas overwhelms the model — work one screen at a time.

## Source (apply to both paths)
- Online: [https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/#vs-code]
- Desktop:  [https://developers.figma.com/docs/figma-mcp-server/local-server-installation/]