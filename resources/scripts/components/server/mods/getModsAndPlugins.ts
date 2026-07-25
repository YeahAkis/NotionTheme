import http from '@/api/http';

export interface ServerFile {
    name: string;
    size: number;
    isFile: boolean;
    isSymlink: boolean;
    mimetype: string;
    createdAt: Date;
    modifiedAt: Date;
    isEditable: boolean;
}

export interface ModPluginFile {
    name: string;
    path: string;
    enabled: boolean;
}

async function listDirectory(serverUuid: string, directory: string): Promise<ServerFile[]> {
    try {
        const { data } = await http.get(`/api/client/servers/${serverUuid}/files/list`, {
            params: { directory },
        });
        return (data.data ?? []).map((item: any) => ({
            name: item.attributes.name,
            size: item.attributes.size,
            isFile: item.attributes.is_file,
            isSymlink: item.attributes.is_symlink,
            mimetype: item.attributes.mimetype,
            createdAt: new Date(item.attributes.created_at),
            modifiedAt: new Date(item.attributes.modified_at),
            isEditable: item.attributes.is_editable,
        }));
    } catch {
        return [];
    }
}

function isJarFile(name: string): boolean {
    return name.endsWith('.jar') || name.endsWith('.jar.disabled');
}

function isEnabled(name: string): boolean {
    return name.endsWith('.jar');
}

export async function getModsAndPlugins(serverUuid: string): Promise<{
    mods: ModPluginFile[];
    plugins: ModPluginFile[];
    hasMods: boolean;
    hasPlugins: boolean;
}> {
    const [modsFiles, pluginsFiles] = await Promise.all([
        listDirectory(serverUuid, '/mods'),
        listDirectory(serverUuid, '/plugins'),
    ]);

    const mods: ModPluginFile[] = modsFiles
        .filter(f => f.isFile && isJarFile(f.name))
        .map(f => ({ name: f.name, path: `/mods/${f.name}`, enabled: isEnabled(f.name) }));

    const plugins: ModPluginFile[] = pluginsFiles
        .filter(f => f.isFile && isJarFile(f.name))
        .map(f => ({ name: f.name, path: `/plugins/${f.name}`, enabled: isEnabled(f.name) }));

    return {
        mods,
        plugins,
        hasMods: mods.length > 0,
        hasPlugins: plugins.length > 0,
    };
}

export async function renameFile(serverUuid: string, fromPath: string, toPath: string): Promise<void> {
    await http.put(`/api/client/servers/${serverUuid}/files/rename`, {
        root: '/',
        files: [{ from: fromPath.replace(/^\//, ''), to: toPath.replace(/^\//, '') }],
    });
}