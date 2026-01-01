import * as esbuild from 'esbuild';
import fs from 'fs/promises';
import path from 'path';

const isWatch = process.argv.includes('--watch');

async function build() {
    // 1. Clean dist directory
    await fs.rm('dist', { recursive: true, force: true });
    await fs.mkdir('dist', { recursive: true });
    await fs.mkdir('dist/extension', { recursive: true });
    await fs.mkdir('dist/userscript', { recursive: true });

    // 2. Copy static assets to dist/extension
    const assets = [
        'popup.html',
        'options.html',
        'icons',
        '_locales'
    ];

    for (const asset of assets) {
        const srcPath = path.join('src', asset);
        const destPath = path.join('dist/extension', asset);
        try {
            await fs.cp(srcPath, destPath, { recursive: true });
        } catch {
            // Ignore missing
        }
    }

    // 2b. Process Manifest
    const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
    const manifest = JSON.parse(await fs.readFile('src/manifest.json', 'utf8'));

    // Strip pre-release suffix for manifest (e.g. 1.2.0-pre3 -> 1.2.0)
    manifest.version = packageJson.version.split('-')[0];
    console.log(`ℹ️  Injecting version ${manifest.version} into manifest (original: ${packageJson.version})`);

    await fs.writeFile('dist/extension/manifest.json', JSON.stringify(manifest, null, 2));

    console.log('✅ Assets copied & Manifest generated');

    const buildMetadata = [
        `Version: ${packageJson.version}`,
        `Git Tag: ${process.env.GITHUB_REF_NAME || 'local'}`,
        `Run ID: ${process.env.GITHUB_RUN_ID || 'local'}`,
        `Repository: ${process.env.GITHUB_REPOSITORY || 'thib3113/ha-boks-webextension'}`
    ];

    if (process.env.GITHUB_RUN_ID) {
        buildMetadata.push(`Build URL: ${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`);
        if (process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME.startsWith('v')) {
            buildMetadata.push(`Release URL: ${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/releases/tag/${process.env.GITHUB_REF_NAME}`);
        }
    }

    const githubBanner = `/**
 * Boks Web Extension
 * 
 * This extension is built autonomously via GitHub Actions to ensure build integrity and transparency.
 * The source code for this specific version can be reviewed at:
 * ${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY || 'thib3113/ha-boks-webextension'}/tree/${process.env.GITHUB_REF_NAME || 'main'}
 * 
 * To verify the provenance and integrity of this build, an official GitHub Attestation 
 * and a checksums.txt file are provided in the associated release. This allows validation 
 * that the minified code corresponds exactly to the automated build from the source.
 * 
 * Permissions details:
 * - contextMenus: Add "Generate code" action to input fields.
 * - scripting & activeTab: Inject generated codes into the active page.
 * - storage: Securely store Home Assistant connection settings.
 * 
 * Privacy Policy:
 * - This extension operates locally and communicates directly with your Home Assistant instance.
 * - No data is sent to third-party servers.
 * - Credentials are stored securely in your browser's local storage.
 * 
 * Build Metadata:
${buildMetadata.map(line => ` * - ${line}`).join('\n')}
 */`;

    // 3. Bundle JS for Web Extension
    const entryPoints = [
        'src/background.ts',
        'src/popup.ts',
        'src/option.ts'
    ];

    const ctx = await esbuild.context({
        entryPoints: entryPoints,
        bundle: true,
        outdir: 'dist/extension',
        sourcemap: process.env.NODE_ENV !== 'production',
        minify: true,
        target: ['chrome100', 'firefox100'],
        format: 'esm',
        logLevel: 'info',
        banner: { js: githubBanner },
    });

    // 4. Bundle Userscript
    const localesDir = 'src/_locales';
    const availableLocales = await fs.readdir(localesDir);
    const descriptionHeaders = [];
    const nameHeaders = [];
    
    // Default name from English or fallback
    let defaultName = 'Boks Helper';
    try {
        const enMsgs = JSON.parse(await fs.readFile(path.join(localesDir, 'en', 'messages.json'), 'utf8'));
        if (enMsgs.extName && enMsgs.extName.message) {
            defaultName = enMsgs.extName.message;
        }
    } catch {
        // Ignore
    }
    
    descriptionHeaders.push(`// @description ${packageJson.description}`);

    const allMessages = {};

    for (const lang of availableLocales) {
        const msgPath = path.join(localesDir, lang, 'messages.json');
        try {
            const msgsContent = await fs.readFile(msgPath, 'utf8');
            const msgs = JSON.parse(msgsContent);
            
            // Localized Description
            if (msgs.extDescription && msgs.extDescription.message) {
                descriptionHeaders.push(`// @description:${lang} ${msgs.extDescription.message}`);
            }

            // Localized Name
            if (msgs.extName && msgs.extName.message) {
                if (lang === 'en') {
                    defaultName = msgs.extName.message; // Ensure EN is default if available
                } else {
                    nameHeaders.push(`// @name:${lang} ${msgs.extName.message}`);
                }
            }

            // Collect messages for injection
            allMessages[lang] = {};
            for (const key in msgs) {
                allMessages[lang][key] = msgs[key].message;
            }
        } catch {
            // Ignore
        }
    }

    // Filter messages based on usage in userscript.ts
    const userscriptSource = await fs.readFile('src/userscript.ts', 'utf8');
    const usedKeys = new Set();
    const regex = /\bt\(['"]([^'"]+)['"]\)/g;
    let match;
    while ((match = regex.exec(userscriptSource)) !== null) {
        usedKeys.add(match[1]);
    }

    const injectedMessages = {};
    for (const lang in allMessages) {
        injectedMessages[lang] = {};
        for (const key of usedKeys) {
            if (allMessages[lang][key]) {
                injectedMessages[lang][key] = allMessages[lang][key];
            }
        }
    }

    console.log(`ℹ️  Injected ${usedKeys.size} translation keys for ${Object.keys(injectedMessages).length} languages`);

    const parseHeader = (line) => {
        const match = line.match(/\/\/ (@\S+)\s+(.+)/);
        return match ? [match[1], match[2].trim()] : null;
    };

    const rawHeaders = [
        `// @name         ${defaultName}`,
        ...nameHeaders,
        '// @namespace    https://github.com/thib3113/ha-boks-webextension',
        `// @version      ${packageJson.version}`,
        ...descriptionHeaders,
        '// @author       Thib3113',
        '// @match        *://*/*',
        '// @icon         https://raw.githubusercontent.com/thib3113/ha-boks-webextension/main/src/icons/icon-48.png',
        '// @icon64       https://raw.githubusercontent.com/thib3113/ha-boks-webextension/main/src/icons/icon-128.png',
        '// @homepageURL  https://github.com/thib3113/ha-boks-webextension',
        '// @supportURL   https://github.com/thib3113/ha-boks-webextension/issues?q=is%3Aissue+label%3Auserscript',
        '// @updateURL    https://github.com/thib3113/ha-boks-webextension/releases/latest/download/boks.user.js',
        '// @downloadURL  https://github.com/thib3113/ha-boks-webextension/releases/latest/download/boks.user.js',
        '// @grant        GM_getValue',
        '// @grant        GM_setValue',
        '// @grant        GM_registerMenuCommand',
        '// @grant        GM_notification',
        '// @grant        GM_setClipboard',
        '// @grant        GM_xmlhttpRequest'
    ];

    const userscriptHeaders = rawHeaders.map(parseHeader).filter(Boolean);
    const maxHeaderLen = Math.max(...userscriptHeaders.map(h => h[0].length)) + 1;
    const formattedHeaders = userscriptHeaders.map(h => `// ${h[0].padEnd(maxHeaderLen)} ${h[1]}`).join('\n');

    const userscriptBanner = `// ==UserScript==
${formattedHeaders}
// ==/UserScript==
//
// Build Metadata:
// Version:      ${packageJson.version}
// Git Tag:      ${process.env.GITHUB_REF_NAME || 'local'}
// Run ID:       ${process.env.GITHUB_RUN_ID || 'local'}
// Build URL:    ${process.env.GITHUB_RUN_ID ? process.env.GITHUB_SERVER_URL + '/' + process.env.GITHUB_REPOSITORY + '/actions/runs/' + process.env.GITHUB_RUN_ID : 'local'}
${(process.env.GITHUB_RUN_ID && process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME.startsWith('v')) ? '// Release URL:  ' + process.env.GITHUB_SERVER_URL + '/' + process.env.GITHUB_REPOSITORY + '/releases/tag/' + process.env.GITHUB_REF_NAME : ''}
`;

    const ctxUserscript = await esbuild.context({
        entryPoints: ['src/userscript.ts'],
        bundle: true,
        outfile: 'dist/userscript/boks.user.js',
        sourcemap: false,
        minify: false,
        target: ['es2020'],
        format: 'iife',
        banner: {
            js: `${userscriptBanner}\nconst __MESSAGES__ = ${JSON.stringify(injectedMessages)};`
        },
        logLevel: 'info',
    });


    if (isWatch) {
        await ctx.watch();
        await ctxUserscript.watch();
        console.log('👀 Watching JS for changes...');

        const copyAssets = async () => {
             console.log('📂 Copying assets...');
             for (const asset of assets) {
                const srcPath = path.join('src', asset);
                const destPath = path.join('dist/extension', asset);
                try {
                    await fs.cp(srcPath, destPath, { recursive: true });
                } catch {
                    // Ignore
                }
            }
            const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
            const man = JSON.parse(await fs.readFile('src/manifest.json', 'utf8'));
            man.version = pkg.version;
            await fs.writeFile('dist/extension/manifest.json', JSON.stringify(man, null, 2));
            console.log('📄 Manifest updated');
        };

        const watchDir = 'src';
        fs.watch(watchDir, { recursive: true }, async (eventType, filename) => {
            if (filename) {
                if (!filename.endsWith('.js') && !filename.endsWith('.ts')) {
                     console.log(`Resource changed: ${filename}`);
                     await copyAssets();
                }
            }
        });
        console.log('👀 Watching Assets for changes...');

    } else {
        await ctx.rebuild();
        await ctxUserscript.rebuild();
        await ctx.dispose();
        await ctxUserscript.dispose();
        console.log('⚡ Build complete');
    }
}

build().catch(err => {
    console.error(err);
    process.exit(1);
});
