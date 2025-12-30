const esbuild = require('esbuild');
const fs = require('fs-extra');
const path = require('path');

const isWatch = process.argv.includes('--watch');

async function build() {
    // 1. Clean dist directory
    await fs.emptyDir('dist');

    // 2. Copy static assets
    const assets = [
        // 'manifest.json', // Handled manually below to inject version
        'popup.html',
        'options.html',
        'icons',
        '_locales'
    ];

    for (const asset of assets) {
        if (await fs.pathExists(path.join('src', asset))) {
            await fs.copy(path.join('src', asset), path.join('dist', asset));
        }
    }

    // 2b. Process Manifest (Inject Version)
    const packageJson = await fs.readJson('package.json');
    const manifest = await fs.readJson('src/manifest.json');
    
    manifest.version = packageJson.version;
    console.log(`ℹ️  Injecting version ${manifest.version} into manifest`);

    await fs.writeJson('dist/manifest.json', manifest, { spaces: 2 });

    console.log('✅ Assets copied & Manifest generated');

    // 3. Bundle JS
    const entryPoints = [
        'src/background.js',
        'src/popup.js',
        'src/option.js' // Note: option.js, not options.js based on your file structure
    ];

    const ctx = await esbuild.context({
        entryPoints: entryPoints,
        bundle: true,
        outdir: 'dist',
        sourcemap: process.env.NODE_ENV !== 'production',
        minify: process.env.NODE_ENV === 'production',
        target: ['chrome100', 'firefox100'],
        format: 'esm', // Use ESM for modern extensions
        logLevel: 'info',
    });

    if (isWatch) {
        await ctx.watch();
        console.log('👀 Watching JS for changes...');

        // Simple watcher for static assets
        const assetsToWatch = [
            'src/manifest.json',
            'src/popup.html',
            'src/options.html',
            'src/icons',
            'src/_locales'
        ];

        // Helper to copy assets (reused logic)
        const copyAssets = async () => {
             console.log('📂 Copying assets...');
             for (const asset of assets) {
                if (await fs.pathExists(path.join('src', asset))) {
                    await fs.copy(path.join('src', asset), path.join('dist', asset));
                }
            }
            // Re-process manifest
            const pkg = await fs.readJson('package.json');
            const man = await fs.readJson('src/manifest.json');
            man.version = pkg.version;
            await fs.writeJson('dist/manifest.json', man, { spaces: 2 });
            console.log('📄 Manifest updated');
        };

        const watchDir = 'src';
        fs.watch(watchDir, { recursive: true }, async (eventType, filename) => {
            if (filename) {
                // Check if the changed file is an asset (not a JS file handled by esbuild)
                // This is a naive check, but sufficient for this project structure
                if (!filename.endsWith('.js')) {
                     console.log(`Resource changed: ${filename}`);
                     await copyAssets();
                }
            }
        });
        console.log('👀 Watching Assets for changes...');

    } else {
        await ctx.rebuild();
        await ctx.dispose();
        console.log('⚡ Build complete');
    }
}

build().catch(err => {
    console.error(err);
    process.exit(1);
});
