import React, { useCallback, useEffect, useState } from 'react';
import tw from 'twin.macro';
import { ServerContext } from '@/state/server';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import Spinner from '@/components/elements/Spinner';
import loadDirectory from '@/api/server/files/loadDirectory';
import getFileContents from '@/api/server/files/getFileContents';
import getFileDownloadUrl from '@/api/server/files/getFileDownloadUrl';
import { fetchAndParseNbt, nbtLongToString } from '@/components/server/nbtUtils';
import WorldDetail from '@/components/server/world/WorldDetail';
import { useHistory } from 'react-router-dom';

export interface WorldInfo {
    name: string;
    path: string;
    isZip: boolean;
    levelName?: string;
    version?: string;
    hardcore?: boolean;
    seed?: string;
    sizeBytes?: number;
    datapacks: DatapackInfo[];
}

export interface DatapackInfo {
    name: string;
    path: string;
    isZip: boolean;
    description?: string;
    packFormat?: number;
    hasPng: boolean;
    pngUrl?: string;
}

export async function loadDatapacks(uuid: string, worldPath: string): Promise<DatapackInfo[]> {
    const datapacksPath = `${worldPath}/datapacks`;
    try {
        const entries = await loadDirectory(uuid, datapacksPath);
        const packs: DatapackInfo[] = [];

        await Promise.all(
            entries.map(async entry => {
                const isZip =
                    entry.isFile &&
                    (entry.name.endsWith('.zip') || entry.name.endsWith('.jar'));
                const packPath = `${datapacksPath}/${entry.name}`;

                let description: string | undefined;
                let packFormat: number | undefined;
                let hasPng = false;
                let pngUrl: string | undefined;

                if (!isZip) {
                    try {
                        const meta = JSON.parse(
                            await getFileContents(uuid, `${packPath}/pack.mcmeta`),
                        );
                        description = meta?.pack?.description;
                        packFormat = meta?.pack?.pack_format;
                    } catch {
                        // no mcmeta
                    }
                    try {
                        const files = await loadDirectory(uuid, packPath);
                        hasPng = files.some(f => f.name === 'pack.png');
                        if (hasPng) {
                            pngUrl = await getFileDownloadUrl(uuid, `${packPath}/pack.png`);
                        }
                    } catch {
                        // ignore
                    }
                } else {
                    description = 'zip — extract to view details';
                }

                packs.push({
                    name: entry.name,
                    path: packPath,
                    isZip,
                    description,
                    packFormat,
                    hasPng,
                    pngUrl,
                });
            }),
        );

        return packs.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
        return [];
    }
}

async function loadWorldInfo(
    uuid: string,
    folderName: string,
    root: string,
): Promise<WorldInfo | null> {
    const worldPath = root === '.' ? folderName : `${root}/${folderName}`;
    const levelDatPath = `${worldPath}/level.dat`;

    let levelName: string | undefined;
    let version: string | undefined;
    let hardcore: boolean | undefined;
    let seed: string | undefined;

    try {
        const url = await getFileDownloadUrl(uuid, levelDatPath);
        const parsed = await fetchAndParseNbt(url);
        const data = parsed.value?.Data?.value;
        if (data) {
            levelName = data.LevelName?.value;
            hardcore = data.hardcore?.value === 1;
            version = data.Version?.value?.Name?.value;
            // TAG_Long is returned by the `nbt` lib as [high32, low32] — use the shared helper
            const rawSeed = data.RandomSeed?.value ?? data.WorldGenSettings?.value?.seed?.value;
            if (rawSeed !== undefined && rawSeed !== null) {
                seed = nbtLongToString(rawSeed);
            }
        }
    } catch {
        // level.dat unreadable
    }

    const datapacks = await loadDatapacks(uuid, worldPath);

    return {
        name: folderName,
        path: worldPath,
        isZip: false,
        levelName,
        version,
        hardcore,
        seed,
        datapacks,
    };
}

async function findWorlds(uuid: string): Promise<WorldInfo[]> {
    const entries = await loadDirectory(uuid, '/');
    const worlds: WorldInfo[] = [];

    await Promise.all(
        entries.map(async entry => {
            if (entry.isFile && entry.name.endsWith('.zip')) {
                worlds.push({
                    name: entry.name,
                    path: entry.name,
                    isZip: true,
                    sizeBytes: entry.size,
                    datapacks: [],
                });
                return;
            }
            if (!entry.isFile) {
                try {
                    const sub = await loadDirectory(uuid, entry.name);
                    if (sub.some(f => f.name === 'level.dat')) {
                        const info = await loadWorldInfo(uuid, entry.name, '.');
                        if (info) worlds.push(info);
                    }
                } catch {
                    // skip
                }
            }
        }),
    );

    return worlds.sort((a, b) => a.name.localeCompare(b.name));
}

export default () => {
    const uuid = ServerContext.useStoreState(state => state.server.data!.uuid);
    const id = ServerContext.useStoreState(state => state.server.data!.id);
    const history = useHistory();

    const [worlds, setWorlds] = useState<WorldInfo[]>([]);
    const [selected, setSelected] = useState<WorldInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const found = await findWorlds(uuid);
            setWorlds(found);
            if (found.length > 0 && !selected) {
                setSelected(found[0]);
            }
        } catch (e: any) {
            setError(e?.message || 'Failed to scan for worlds');
        } finally {
            setLoading(false);
        }
    }, [uuid]);

    useEffect(() => {
        load();
    }, []);

    const handleRefresh = useCallback(async () => {
        const found = await findWorlds(uuid).catch(() => [] as WorldInfo[]);
        setWorlds(found);
        if (selected) {
            const updated = found.find(w => w.name === selected.name);
            setSelected(updated ?? found[0] ?? null);
        } else if (found.length > 0) {
            setSelected(found[0]);
        }
    }, [uuid, selected]);

    const navigateTo = (path: string) => {
        history.push(`/server/${id}/files#${encodeURIComponent(path)}`);
    };

    return (
        <ServerContentBlock title={'World Manager'}>
            {/* Page header */}
            <div css={tw`flex items-center justify-between mb-6`}>
                <div>
                    <h2 css={tw`text-xl font-semibold text-neutral-100`}>World Manager</h2>
                    <p css={tw`text-sm text-neutral-400 mt-0.5`}>
                        Manage worlds and datapacks on this server
                    </p>
                </div>
                <button
                    onClick={load}
                    css={tw`px-3 py-1.5 text-sm rounded bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-neutral-300 transition-colors`}
                >
                    Refresh
                </button>
            </div>

            {loading ? (
                <Spinner size={'large'} centered />
            ) : error ? (
                <p css={tw`text-red-400 text-sm py-8 text-center`}>{error}</p>
            ) : worlds.length === 0 ? (
                <p css={tw`text-neutral-500 text-sm py-12 text-center`}>
                    No worlds found in the server root.
                </p>
            ) : (
                <div css={tw`flex flex-col gap-4`}>
                    {/* World selector — horizontal scrollable tabs */}
                    <div css={tw`rounded overflow-hidden border border-neutral-700`}>
                        <div css={tw`px-3 py-2 bg-neutral-800 border-b border-neutral-700`}>
                            <span css={tw`text-xs uppercase tracking-widest text-neutral-500 font-medium`}>
                                Worlds ({worlds.length})
                            </span>
                        </div>
                        <div css={tw`flex overflow-x-auto bg-neutral-800 bg-opacity-40`} style={{ scrollbarWidth: 'none' }}>
                            {worlds.map(world => (
                                <button
                                    key={world.path}
                                    onClick={() => setSelected(world)}
                                    css={[
                                        tw`flex-shrink-0 text-left px-4 py-3 border-r border-neutral-700 transition-colors`,
                                        selected?.name === world.name
                                            ? tw`bg-purple-600 bg-opacity-20 border-b-2 border-b-purple-500`
                                            : tw`hover:bg-neutral-700 border-b-2 border-b-transparent`,
                                    ]}
                                >
                                    <p css={[
                                        tw`text-sm font-medium whitespace-nowrap`,
                                        selected?.name === world.name ? tw`text-neutral-100` : tw`text-neutral-300`,
                                    ]}>
                                        {world.levelName || world.name}
                                    </p>
                                    <div css={tw`flex items-center gap-1.5 mt-0.5`}>
                                        {world.version && (
                                            <span css={tw`text-xs text-neutral-500 whitespace-nowrap`}>{world.version}</span>
                                        )}
                                        {world.isZip && (
                                            <span css={tw`text-xs px-1 rounded-sm bg-yellow-900 text-yellow-400`}>zip</span>
                                        )}
                                        {world.hardcore && (
                                            <span css={tw`text-xs px-1 rounded-sm bg-red-900 text-red-400`}>hc</span>
                                        )}
                                        {!world.isZip && (
                                            <span css={tw`text-xs text-neutral-600 whitespace-nowrap`}>{world.datapacks.length} dp</span>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Detail — full width below tabs */}
                    <div css={tw`min-w-0`}>
                        {selected ? (
                            <WorldDetail
                                key={selected.path}
                                world={selected}
                                serverUuid={uuid}
                                onNavigate={navigateTo}
                                onRefresh={handleRefresh}
                                onDelete={() => {
                                    setSelected(null);
                                    handleRefresh();
                                }}
                            />
                        ) : (
                            <p css={tw`text-neutral-600 text-sm py-16 text-center`}>
                                Select a world from the list.
                            </p>
                        )}
                    </div>
                </div>
            )}
        </ServerContentBlock>
    );
};