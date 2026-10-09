# Setting up Caddie for your own site

**The easy way:** open Claude Code and say "Run my site example.com through the entire Caddie process". Caddie walks you through every step below, one at a time, opens each page for you, installs the file you download, and checks each step before the next. This page is the same steps as a checklist, for anyone who prefers to do it by hand or wants to know what the guided setup does.

About fifteen minutes, all free, once. You need a Google account that can see your site in Search Console, Node.js 22.18 or newer (`node --version`; https://nodejs.org, the LTS version), and Claude Code. Results go to `Documents/Caddie` unless you set `CADDIE_HOME`.

If you only want to see what Caddie produces, skip all of this and run `/caddie --sample summitplumbing.example`.

At any point, `node scripts/doctor.ts --site example.com` (from the Caddie folder) prints what is set up and the next step.

## 1. A Google Cloud project with the right APIs

Sign in to Google with the account that can see your site in Search Console. Nothing here is billed.

1. https://console.cloud.google.com/projectcreate: name it `Caddie`, click **Create**, and make sure Caddie is the project selected at the top of the page.
2. https://console.cloud.google.com/apis/library/searchconsole.googleapis.com: click **Enable**.
3. https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com and https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com: click **Enable** on each. These let Caddie find your GA4 property itself and count leads in the weekly memo. Skip them if you do not use GA4.

## 2. The consent screen

4. https://console.cloud.google.com/auth/overview: click **Get started**. App name `Caddie`, support email yours, audience **External**, contact email yours, tick the agreement, **Create**.
5. https://console.cloud.google.com/auth/audience: under Publishing status, click **Publish app**, then **Confirm**.

   Why publish: an app left in Testing has its sign-ins expire every seven days. Published, Google shows an "unverified app" warning when you sign in; click **Advanced**, **Go to Caddie (unsafe)**, **Continue**. The app is yours, reading your own data with read-only access.

## 3. The OAuth client

6. https://console.cloud.google.com/auth/clients/create: application type **Desktop app**, name `Caddie`, **Create**, then **Download JSON** in the box that appears. It must be Desktop app; a Web application client fails with `redirect_uri_mismatch`.
7. Install it:

   ```
   node scripts/setup.ts --install-client
   ```

   It finds the newest `client_secret*.json` in your Downloads folder and copies it to Caddie's settings folder (`%APPDATA%\caddie` on Windows, `~/.config/caddie` elsewhere; `CADDIE_CONFIG_DIR` overrides). Pass a path if the file is elsewhere: `--install-client <file>`. Credentials never go in a project folder.

## 4. Sign in and pick your site

8. `node scripts/setup.ts` opens Google's sign-in. Choose the account, get past the unverified-app screen as above, approve **read-only** access, and you will see "Signed in."
9. From your results folder: `node <caddie>/scripts/sites.ts --url example.com` matches what you typed to your Search Console property (a domain property wins over a URL-prefix one) and creates `sites/<domain>/config.json`.
10. Tell Caddie about the business. The guided run drafts this from your site with `scripts/profile.ts` and asks you to confirm. By hand, fill in `config.json`:
    - `brandTerms`: your company name and short forms, so Caddie skips searches you already win.
    - `notes`: facts your pages cannot show, one sentence each. A location you sold, a service you stopped, a brand you dropped. Caddie will propose retiring those pages, not building them up.
    - `market`: `topics` (five or six phrases your customers search), `competitors` (domains), `audience` (one line). `/gaps` uses these.
11. GA4: `node <caddie>/scripts/setup.ts --ga4-from-site <domain>` reads your home page for the GA4 tag, or matches your site's address when the tag loads through Tag Manager, and saves the property ID.

## 5. Optional: the AI answer check

12. https://aistudio.google.com/apikey: **Create API key**, choose **Create a new project**. A new project has no billing attached, which keeps it on the free tier: 500 requests a day on the default model; Caddie caps itself at 150.
13. `node scripts/setup.ts --gemini-key <key>` saves it in Caddie's settings folder. `GEMINI_API_KEY` still works and wins if set. `--gemini-skip` tells the guided run not to offer it again.

Citations, meaning which sites Gemini drew on, are a paid-tier feature: Google does not offer Grounding with Google Search on the free tier. To turn them on, in AI Studio on the key's row click **Activate billing** ($5 prepayment minimum), then set `"mode": "grounded"` under `ai` in `config.json`. Google includes 5,000 grounded searches a month; a run's tokens cost a few cents.

If Gemini answers with HTTP 402 "prepayment credits are depleted", the key's project has a billing account with no credit. At https://console.cloud.google.com/billing/projects find the project, three-dot menu, **Disable billing**. The key keeps working on the free tier.

## 6. Run it

In Claude Code, from your results folder: `/caddie example.com`, or say the sentence. Each command also runs on its own: `/find --site <domain>`, `/gaps --site <domain>`, `/monday --site <domain>`.

## If something goes wrong

- **"Access blocked: Caddie has not completed the Google verification process"**: the app is still in Testing and your account is not a test user. Publish it (step 5) and sign in again.
- **`redirect_uri_mismatch`**: the client is not a Desktop app (step 6). Create one that is.
- **"invalid_grant" or "expired or revoked"**: run `node scripts/setup.ts` again.
- **"has not been used in project ... or it is disabled"**: enable that API (steps 2 and 3) and wait a minute.
- **No properties after signing in**: the account is not a user on the Search Console property. Add it in Search Console (Settings, Users and permissions), or sign in with one that is.
- **Node version error**: Caddie runs TypeScript directly, which needs Node 22.18 or newer.

Built by Unfayr · unfayr.com
