# Setting up Caddie for your own site

About fifteen minutes. Everything here is free. You need a Google account that can see your site in Search Console, Node.js 22.18 or newer (`node --version`), and Claude Code.

If you only want to see what Caddie produces, skip all of this and run `/find --sample summitplumbing.example`.

## Part 1: a Google Cloud project with the right APIs

Google requires an OAuth "client" to let an app read your Search Console data. You create one, once, in your own Google Cloud project. Nothing is billed; these APIs have no charge.

1. Go to https://console.cloud.google.com and sign in with the account that owns your Search Console property.
2. At the top, click the project picker and choose **New project**. Name it `Caddie`. Leave the organisation as it is. Click **Create**, then make sure the new project is selected in the picker.
3. In the left menu, open **APIs & Services** and then **Library**. Search for **Google Search Console API**, open it and click **Enable**.
4. Optional, for the coming `/monday` command: back in the Library, search for **Google Analytics Data API**, open it and click **Enable**. Skip this if you do not use GA4.

## Part 2: the consent screen

5. In the left menu, open **APIs & Services** and then **OAuth consent screen** (on newer consoles this is under **Google Auth Platform**, as **Branding** and **Audience**).
6. Choose **External** as the user type and click **Create**.
7. App name: `Caddie`. User support email: your address. Developer contact: your address. Leave everything else blank. Save and continue.
8. On the **Audience** or **Test users** step, click **Add users** and add your own Google address. Save.

Your app is now in "Testing" status, which is fine for one person. One consequence worth knowing: Google expires sign-ins for apps in Testing after seven days, so `/find` will ask you to run `setup.ts` again about once a week. If that gets old, go back to the consent screen and click **Publish app**. Google will show an "unverified app" warning the next time you sign in; click **Advanced** and **Go to Caddie (unsafe)** once, and the token then lasts until you revoke it. The app is yours, reading your own data, so the warning is Google being careful about apps you did not write.

## Part 3: the OAuth client

9. In the left menu, open **APIs & Services** and then **Credentials**.
10. Click **Create credentials** and choose **OAuth client ID**.
11. Application type: **Desktop app**. This matters: Caddie uses the desktop "loopback" flow and a Web application client will fail with `redirect_uri_mismatch`. Name it `Caddie desktop`. Click **Create**.
12. In the dialog that appears, click **Download JSON**.
13. Move that file to Caddie's config folder and name it `client.json`:
    - Windows: `%APPDATA%\caddie\client.json` (usually `C:\Users\<you>\AppData\Roaming\caddie\client.json`). Create the `caddie` folder if it is not there.
    - macOS and Linux: `~/.config/caddie/client.json`.

    This folder is outside any project on purpose. Caddie never writes credentials into a working directory, and the repo's `.gitignore` blocks `client*.json` and `token*.json` anyway.

## Part 4: sign in and pick your site

14. In a terminal, go to the Caddie folder (the clone, or the installed plugin folder that `/find` reports) and run `npm install` if you have not.
15. Run:

    ```
    node scripts/setup.ts
    ```

    A browser opens on Google's sign-in. Choose the account, approve **read-only** access to Search Console (and Analytics if you enabled it), and you will see "Signed in. You can close this tab." The terminal confirms how many properties the account can see and where the token was saved.

16. Run:

    ```
    node scripts/sites.ts
    ```

    It prints a numbered list of your Search Console properties. Pick one:

    ```
    node scripts/sites.ts --pick 2
    ```

    This creates `sites/<domain>/config.json` in your current folder. Open it and add your brand terms to `brandTerms` (your company name and any short forms), so the writer skips queries you already own. The other settings have sensible defaults; `thresholds.maxPages` and `thresholds.positionMax` are the ones people change.

17. In Claude Code, from the same folder:

    ```
    /find --site <domain>
    ```

Run it from the folder you want to keep the results in. Caddie writes `sites/<domain>/runs/<date>/find/` there, plus `sites/<domain>/ledger.json`, and caches Search Console pulls under `sites/<domain>/data/` so a second run the same day is instant.

## Part 5 (optional): the Gemini key for the AI answer check

The AI check asks Gemini, with Google Search grounding, the top three questions each candidate page should win, and records which sites it cites. It is the part of `/find` that tells you a competitor's definition is being quoted where yours could be.

18. Go to https://aistudio.google.com/apikey and click **Create API key**. The free tier is enough; the default model allows 1,500 grounded requests a day and Caddie caps itself at 1,000.
19. Put it in an environment variable named `GEMINI_API_KEY`:
    - Windows (PowerShell): `setx GEMINI_API_KEY "your-key"`, then open a new terminal.
    - macOS and Linux: add `export GEMINI_API_KEY="your-key"` to your shell profile, then open a new terminal.

Without the key, `/find` runs normally and the run README says the AI check was skipped.

## If something goes wrong

- **"No OAuth client file at ..."**: the JSON is not where step 13 says, or is not named `client.json`.
- **"Access blocked: Caddie has not completed the Google verification process"**: your address is not in the test users list (step 8), or you are signing in with a different account.
- **`redirect_uri_mismatch`**: the client is not a Desktop app (step 11). Create a new one of the right type.
- **"No token at ..." a week after it worked**: the Testing-status expiry from Part 2. Run `node scripts/setup.ts` again, or publish the app.
- **`sites.ts` shows no properties**: the signed-in account is not a user on the property in Search Console. Add it there, or sign in with one that is.
- **Node version error**: Caddie runs TypeScript directly, which needs Node 22.18 or newer. `node --version` to check; https://nodejs.org to update.

Built by Unfayr · unfayr.com
