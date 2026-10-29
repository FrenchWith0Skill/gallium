# Publishing Gallium on GitHub (open source, with Ko-fi)

## 1. Ko-fi page

Create your page on ko-fi.com (current link: `ko-fi.com/galliumpc`). `docs/images/avatar.png` can be used as the
profile picture.

## 2. Project links

The links are already set (GitHub `FrenchWith0Skill/gallium`, Ko-fi `galliumpc`). To change them later, one command
updates the README, GitHub's "Sponsor" button and the app:

```bash
node tools/set-links.js --github owner/gallium --kofi kofi-name --name "Your name"
```

In the app, the **"♥ Support Gallium"** button (sidebar and Settings) opens the Ko-fi page, and **"Source code on
GitHub"** appears in Settings → About. Only Ko-fi, Buy Me a Coffee, Liberapay, PayPal.me and GitHub Sponsors links are
accepted for the support button.

## 3. Create the repository and push the code

1. On github.com: **New repository** → name `gallium`, **Public**, no README or license (the project already has them).
2. In the project folder:

   ```bash
   git init
   git add .
   git commit -m "Gallium 1.0.0"
   git branch -M main
   git remote add origin https://github.com/FrenchWith0Skill/gallium.git
   git push -u origin main
   ```

   `node_modules/` and `dist/` are not uploaded (see `.gitignore`).

## 4. Publish the downloadable release

1. Rebuild the app:

   ```bash
   npm run dist
   ```

2. On GitHub: **Releases → Draft a new release** → tag `v1.0.0`, title "Gallium 1.0.0", then attach
   `dist/Gallium-Setup-1.0.0.exe` and `dist/Gallium-Portable-1.0.0.exe`.
3. Before publishing: test both files on another PC and scan them on virustotal.com (an unsigned app that asks for
   administrator rights can worry some antivirus software; a VirusTotal link in the release notes reassures users).

## 5. Polish the repository page

- **Settings → General → Social preview**: upload `docs/images/social-preview.png` (shown when the link is shared).
- **About** (gear icon on the right of the repository): short description and *topics* such as `windows`, `diagnostic`,
  `pc-optimization`, `hardware`, `electron`, `gaming`.
- `.github/FUNDING.yml` automatically shows the **Sponsor** button linking to Ko-fi.

## Screenshots and privacy

The screenshots in `docs/images/` were taken on the author's PC: they show the machine model and a few open
applications. Replace them if you prefer (Gallium generated them from its own pages).
