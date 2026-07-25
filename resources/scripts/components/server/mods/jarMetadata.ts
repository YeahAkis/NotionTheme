import JSZip from 'jszip';

export type ModEnvironment = 'both' | 'client' | 'server';

export interface JarMetadata {
    name: string;
    version?: string;
    description?: string;
    iconDataUrl?: string;
    environment: ModEnvironment;
    loader: 'fabric' | 'quilt' | 'forge' | 'neoforge' | 'plugin' | 'unknown';
    isClientOnly: boolean;
}

function parseYamlField(yaml: string, field: string): string | undefined {
    const match = yaml.match(new RegExp(`^${field}:\\s*['"]?([^'"\\n]+)['"]?`, 'm'));
    return match?.[1]?.trim();
}

function normalizeEnvironment(env: string | undefined): ModEnvironment {
    if (!env) return 'both';
    const e = env.toLowerCase().replace(/[^a-z]/g, '');
    if (e === 'client') return 'client';
    if (e === 'server') return 'server';
    return 'both';
}

async function iconToDataUrl(zip: JSZip, iconPath: string): Promise<string | undefined> {
    try {
        const cleaned = iconPath.replace(/^\//, '');
        const file = zip.file(cleaned);
        if (!file) return undefined;
        const blob = await file.async('blob');
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve(undefined);
            reader.readAsDataURL(blob);
        });
    } catch {
        return undefined;
    }
}

function parseTomlField(toml: string, field: string): string | undefined {
    const match = toml.match(new RegExp(`^\\s*${field}\\s*=\\s*(?:"([^"\\n]*)"|'([^'\\n]*)'|([^\\n"']+))`, 'm'));
    if (!match) return undefined;
    return (match[1] ?? match[2] ?? match[3])?.trim();
}

async function parseFabric(zip: JSZip): Promise<JarMetadata | null> {
    const file = zip.file('fabric.mod.json');
    if (!file) return null;
    try {
        const json = JSON.parse(await file.async('string'));
        const env: string = json.environment ?? '*';
        const environment = normalizeEnvironment(env === '*' ? 'both' : env);
        let iconDataUrl: string | undefined;
        if (json.icon) {
            iconDataUrl = await iconToDataUrl(zip, json.icon);
        }
        return {
            name: json.name ?? json.id ?? 'Unknown',
            version: json.version,
            description: json.description,
            iconDataUrl,
            environment,
            loader: 'fabric',
            isClientOnly: environment === 'client',
        };
    } catch {
        return null;
    }
}

async function parseQuilt(zip: JSZip): Promise<JarMetadata | null> {
    const file = zip.file('quilt.mod.json');
    if (!file) return null;
    try {
        const json = JSON.parse(await file.async('string'));
        const meta = json.quilt_loader?.metadata ?? {};
        const env: string = json.environment ?? '*';
        const environment = normalizeEnvironment(env === '*' ? 'both' : env);
        let iconDataUrl: string | undefined;
        if (meta.icon) {
            iconDataUrl = await iconToDataUrl(zip, meta.icon);
        }
        return {
            name: meta.name ?? json.quilt_loader?.id ?? 'Unknown',
            version: json.quilt_loader?.version,
            description: meta.description,
            iconDataUrl,
            environment,
            loader: 'quilt',
            isClientOnly: environment === 'client',
        };
    } catch {
        return null;
    }
}

function detectForgeClientOnly(toml: string): boolean {
    const withoutDepBlocks = toml.replace(/\[\[dependencies\.[^\]]+\]\][\s\S]*?(?=\[\[|$)/g, '');
    if (/^\s*side\s*=\s*["']?CLIENT["']?/im.test(withoutDepBlocks)) return true;
    if (/^\s*clientSideOnly\s*=\s*true/im.test(withoutDepBlocks)) return true;
    return false;
}

async function parseForge(zip: JSZip): Promise<JarMetadata | null> {
    const neoFile = zip.file('META-INF/neoforge.mods.toml');
    const forgeFile = zip.file('META-INF/mods.toml');
    const file = neoFile ?? forgeFile;
    const loader = neoFile ? 'neoforge' : 'forge';
    if (!file) return null;
    try {
        const toml = await file.async('string');

        const modsBlockMatch = toml.match(/\[\[mods\]\]([\s\S]*?)(?=\[\[|$)/);
        const modsBlock = modsBlockMatch?.[1] ?? toml;

        const descMatch = modsBlock.match(/^\s*description\s*=\s*(?:"([^"\n]*)"|'([^'\n]*)'|'''([\s\S]*?)''')/m);
        const logoMatch = toml.match(/^\s*logoFile\s*=\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^\n"']+))/m);

        const isClientOnly = detectForgeClientOnly(toml);

        let iconDataUrl: string | undefined;
        const logoPath = logoMatch?.[1] ?? logoMatch?.[2] ?? logoMatch?.[3];
        if (logoPath) {
            iconDataUrl = await iconToDataUrl(zip, logoPath.trim());
        }

        return {
            name: parseTomlField(modsBlock, 'displayName') ?? 'Unknown',
            version: parseTomlField(modsBlock, 'version'),
            description: (descMatch?.[1] ?? descMatch?.[2] ?? descMatch?.[3])?.trim(),
            iconDataUrl,
            environment: isClientOnly ? 'client' : 'both',
            loader: loader as 'forge' | 'neoforge',
            isClientOnly,
        };
    } catch {
        return null;
    }
}

async function parsePlugin(zip: JSZip): Promise<JarMetadata | null> {
    const paperFile = zip.file('paper-plugin.yml');
    const spigotFile = zip.file('plugin.yml');
    const file = paperFile ?? spigotFile;
    if (!file) return null;
    try {
        const yaml = await file.async('string');
        return {
            name: parseYamlField(yaml, 'name') ?? 'Unknown',
            version: parseYamlField(yaml, 'version'),
            description: parseYamlField(yaml, 'description'),
            environment: 'server',
            loader: 'plugin',
            isClientOnly: false,
        };
    } catch {
        return null;
    }
}

export async function extractJarMetadata(downloadUrl: string): Promise<JarMetadata> {
    const response = await fetch(downloadUrl);
    const buffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);

    const fabric = await parseFabric(zip);
    if (fabric) return fabric;

    const quilt = await parseQuilt(zip);
    if (quilt) return quilt;

    const forge = await parseForge(zip);
    if (forge) return forge;

    const plugin = await parsePlugin(zip);
    if (plugin) return plugin;

    return {
        name: 'Unknown',
        environment: 'both',
        loader: 'unknown',
        isClientOnly: false,
    };
}