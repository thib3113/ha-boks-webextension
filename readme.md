# ha-boks Web Extension

This README is written in English first. Pour la version française: [aller à la section française](#français---français).

Short summary
This repository contains the "ha-boks" browser extension. Release artifacts available on the Releases page:
- ha-boks-extension.zip — ZIP archive (for Chrome/Chromium store upload or "Load unpacked" testing)
- firefox-ha-boks-extension.xpi — Firefox XPI package

I will publish the extension on the Chrome Web Store later — a link will be added to the Releases when available.

Important requirement
This extension requires a running "boks" installation able to generate codes. The extension expects you to configure a valid boks instance and provide the required credentials/keys (configurationKey / masterKey) so it can request/generated codes. Make sure the boks endpoint and keys are set up and kept secure (do not expose masterKey publicly).

---

## Install (for regular users)

Pick the file for your browser from the Release assets.

Chrome-like browsers (recommended)
"Chrome-like" means Chromium and popular Chromium-based browsers (examples: Google Chrome, Microsoft Edge, Brave, Opera, Vivaldi).

- For end users (recommended): install via the Chrome Web Store when the listing is available (link will be added to releases).
- For testers / advanced users now:
  1. Open the browser extensions page (e.g. chrome://extensions).
  2. Enable "Developer mode".
  3. Click "Load unpacked" and select the extension folder (use the repo's src/ or an unpacked build). This installs the extension without a CRX file.

If you attempt to install a self-hosted CRX, many Chrome-like browsers will block it. Use the Web Store or "Load unpacked" for testing.

Firefox
- Install the .xpi by drag-and-drop into about:addons or via "Install Add-on From File...".
- For temporary testing use: about:debugging → "Load Temporary Add-on…" and select the manifest or the .xpi.

ZIP archive
- The ZIP is provided for inspection or to upload to the Chrome Web Store (or other stores that request a zip). Not required for direct browser installation.

Verification (optional)
- If you care to verify release artifacts, each release contains a short "Verification" note in the release notes with commands and links. Verifying signatures is optional for regular users.

---

## How to use the extension (basic)

Precondition: a functional boks backend
- Before the extension can generate/use codes, you must point it to a working boks installation and configure its credentials (configurationKey and/or masterKey) in the extension settings (or follow the setup UI). Without a functional boks backend the extension cannot produce codes.

After installation
- The extension icon will appear in the toolbar or the browser's extension menu.
- Click the icon to open the extension popup and use the features (generate codes, etc.).
- Open the extension settings (Manage extension / Options) to enter the boks endpoint and the required keys (configurationKey / masterKey).

Security note
- Keep your configurationKey/masterKey secure. Do not publish them in public repositories or share them in plain text. Prefer storing secrets on the server and using short-lived credentials where possible.

Quick troubleshooting
- If nothing happens, verify that the boks endpoint is reachable from your machine/network and that the keys are correct.
- Toggle the extension off/on to reinitialize.
- For advanced debugging: open extension console (Inspect views in Chrome-like browsers, about:debugging / Browser Console in Firefox).

---

## Français — Français

Résumé
Ce dépôt contient l'extension "ha-boks". Les artefacts disponibles dans les Releases :
- ha-boks-extension.zip — archive ZIP (pour upload sur le Chrome Web Store ou pour "Load unpacked")
- firefox-ha-boks-extension.xpi — paquet XPI pour Firefox

Un lien vers le Chrome Web Store sera ajouté ultérieurement.

Prérequis important
L'extension nécessite une installation "boks" opérationnelle capable de générer des codes. Vous devez configurer l'URL de votre instance boks et fournir les identifiants/clefs requis (configurationKey / masterKey). Conservez ces clefs en sécurité.

Installation (utilisateur)

Navigateurs de type Chromium (Chrome-like)
- Pour les utilisateurs finaux : installez depuis le Chrome Web Store quand la fiche sera publiée.
- Pour les testeurs / utilisateurs avancés :
  1. Ouvrir la page des extensions (ex. chrome://extensions).
  2. Activer "Developer mode".
  3. Cliquer sur "Load unpacked" et sélectionner le dossier de l'extension (src/ ou dossier décompressé).

Firefox
- Installez le .xpi par glisser-déposer dans about:addons ou via "Install Add-on From File...".
- Test temporaire : about:debugging → "Load Temporary Add-on…".

Utilisation (utilisateur)

Précondition : backend boks configuré
- Configurez l'URL et les clefs (configurationKey / masterKey) dans les paramètres de l'extension.
- Après installation, cliquez sur l'icône pour générer / gérer les codes.

Support
- Ouvrez un issue sur GitHub avec les informations demandées (tag, artefact, OS/navigateur, logs, info boks).
