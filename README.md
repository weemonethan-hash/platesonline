# GitHub-backed UK Licence Plates Manager

This repository contains a small static web app that lets you record UK licence plates into a GitHub repository folder named `plates/`. Each plate is stored as a JSON file (plates/AB12CDE.json). You can also flag plates and provide a reason; flagged data is saved in the same JSON file.

How it works
- The site talks directly to the GitHub REST API from the browser.
- You provide:
  - Repository owner (user or org)
  - Repository name
  - Branch name (default `main`)
  - A Personal Access Token (PAT) with repo contents permission (this is required for creating/updating files).
- When you add/update/flag a plate, the site PUTs a file into `plates/<PLATE>.json`.
- When you view the plates list, the site lists the contents of the `plates` folder and fetches each JSON file.

Files
- index.html — frontend UI.
- script.js — JavaScript that interacts with the GitHub API.
- styles.css — small styling.

Setup
1. Create or choose a repository to host the site (can be the same repo).
2. Add these files to the repository root, commit and push.
3. Enable GitHub Pages (Settings → Pages). Serve from the repository root or branch you prefer.
4. Create a Personal Access Token (PAT):
   - Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) or fine-grained tokens.
   - Token needs repository content permissions (repo scope) for the repository you will write to.
   - Copy the token (you will only see it once).
5. Open the deployed page, enter your repo owner, repo name, branch, and paste the PAT into the token field, then click "Save config".
6. Use the Add / Lookup UI to save plates or view existing ones.

JSON structure example (plates/AB12CDE.json)
{
  "plate": "AB12CDE",
  "owner": "optional owner or note",
  "notes": "any notes",
  "addedAt": "2025-10-16T12:00:00.000Z",
  "addedBy": "github-username",
  "flagged": true,
  "flagReason": "suspicious activity"
}

Security & production considerations
- Storing a PAT in the browser (localStorage) is insecure. Anyone with access to the browser can copy it.
- Alternatives:
  - Build a small server-side API that stores a token in server-side secrets and proxies requests (recommended).
  - Implement a GitHub App or OAuth flow for proper delegated permissions.
  - Use GitHub Actions triggered by an API endpoint to persist data instead of client-side writes.
- The current approach is convenient for demos and single-user setups but not production for sensitive data.

Caveats
- CORS is supported for GitHub API; the browser can call it, but token leakage is the main risk.
- This demo does minimal plate validation. Adjust the validation regex if you need stricter UK format checks.

Next steps you might want
- Add authentication via GitHub OAuth or use a small backend to keep the PAT secret.
- Add pagination and better error handling for large numbers of plates.
- Add user roles or logging of edits (current JSON stores addedAt/addedBy; you could append edit history).
- Add unit/UI tests.

If you want, I can:
- Create a pull request that adds these files to a repository you specify.
- Convert the client-side token flow to a serverless function (GitHub Actions or serverless + secret) so tokens are not exposed to users.
- Add stricter UK plate validation and an import/export feature.
