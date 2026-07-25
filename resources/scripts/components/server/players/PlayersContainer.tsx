import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ServerContext } from '@/state/server';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import Spinner from '@/components/elements/Spinner';
import { SocketEvent } from '@/components/server/events';
import useWebsocketEvent from '@/plugins/useWebsocketEvent';
import getFileContents from '@/api/server/files/getFileContents';
import loadDirectory from '@/api/server/files/loadDirectory';
import PlayerRow from '@/components/server/players/PlayerRow';
import PlayerDetailModal from '@/components/server/players/PlayerDetailModal';
import tw from 'twin.macro';
import { AnimatePresence } from 'framer-motion';

export interface PlayerInfo {
    uuid: string;
    uuidDashed: string;
    name: string;
    online: boolean;
    op: boolean;
    banned: boolean;
    whitelisted: boolean;
}

function dashUuid(raw: string): string {
    if (raw.includes('-')) return raw;
    return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function stripUuid(dashed: string): string {
    return dashed.replace(/-/g, '');
}

type FilterMode = 'all' | 'online' | 'op' | 'banned' | 'whitelisted';

export default () => {
    const uuid = ServerContext.useStoreState(state => state.server.data!.uuid);
    const { connected, instance } = ServerContext.useStoreState(state => state.socket);

    const [players, setPlayers] = useState<PlayerInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<FilterMode>('all');
    const [search, setSearch] = useState('');
    const [selectedPlayer, setSelectedPlayer] = useState<PlayerInfo | null>(null);
    const [layout, setLayout] = useState<'list' | 'grid2' | 'grid3'>(() => {
        try {
            return (localStorage.getItem('players-layout') as any) || 'list';
        } catch {
            return 'list';
        }
    });

    const cycleLayout = (l: 'list' | 'grid2' | 'grid3') => {
        setLayout(l);
        try {
            localStorage.setItem('players-layout', l);
        } catch {
            // ignore
        }
    };

    const pendingListUuids = useRef(false);
    const needsOnlineCheck = useRef(false);
    const trySendRef = useRef<() => void>(() => undefined);

    const parseListUuids = useCallback((line: string) => {
        if (!pendingListUuids.current) return;
        if (!line.includes('players online:')) return;
        pendingListUuids.current = false;

        const colonIdx = line.indexOf('players online:');
        const after = line.slice(colonIdx + 'players online:'.length).trim();

        const uuids = new Set<string>();
        if (after) {
            for (const entry of after.split(',').map(s => s.trim())) {
                const match = entry.match(/\(([a-f0-9-]+)\)/i);
                if (match) uuids.add(stripUuid(match[1]));
            }
        }

        setPlayers(prev => prev.map(p => ({ ...p, online: uuids.has(p.uuid) })));
    }, []);

    useWebsocketEvent(SocketEvent.CONSOLE_OUTPUT, parseListUuids);

    const sendCommand = useCallback(
        (cmd: string) => {
            if (connected && instance) {
                instance.send('send command', cmd);
            }
        },
        [connected, instance],
    );

    const loadPlayers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const files = await loadDirectory(uuid, 'world/playerdata');
            const datFiles = files.filter(
                f => f.name.endsWith('.dat') && !f.name.endsWith('_old.dat') && f.isFile,
            );

            const tryFetch = (path: string): Promise<string | null> =>
                getFileContents(uuid, path).catch(() => null);

            const [opsRaw, bannedRaw, whitelistRaw, cacheRaw] = await Promise.all([
                tryFetch('ops.json'),
                tryFetch('banned-players.json'),
                tryFetch('whitelist.json'),
                tryFetch('usercache.json'),
            ]);

            const parseJsonUuids = (raw: string | null): Set<string> => {
                if (!raw) return new Set();
                try {
                    return new Set((JSON.parse(raw) as any[]).map(e => stripUuid(e.uuid || '')));
                } catch {
                    return new Set();
                }
            };

            const opUuids = parseJsonUuids(opsRaw);
            const bannedUuids = parseJsonUuids(bannedRaw);
            const whitelistUuids = parseJsonUuids(whitelistRaw);

            const nameMap = new Map<string, string>();
            if (cacheRaw) {
                try {
                    (JSON.parse(cacheRaw) as any[]).forEach(e => {
                        if (e.uuid && e.name) nameMap.set(stripUuid(e.uuid), e.name);
                    });
                } catch {
                    // ignore
                }
            }

            const parsed: PlayerInfo[] = datFiles.map(f => {
                const raw = f.name.replace('.dat', '');
                const dashed = dashUuid(raw);
                const stripped = stripUuid(dashed);
                return {
                    uuid: stripped,
                    uuidDashed: dashed,
                    name: nameMap.get(stripped) || `${dashed.slice(0, 8)}...`,
                    online: false,
                    op: opUuids.has(stripped),
                    banned: bannedUuids.has(stripped),
                    whitelisted: whitelistUuids.has(stripped),
                };
            });

            parsed.sort((a, b) => a.name.localeCompare(b.name));
            setPlayers(parsed);
        } catch (e: any) {
            setError(e?.message || 'Failed to load player data.');
        } finally {
            setLoading(false);
            needsOnlineCheck.current = true;
            trySendRef.current();
        }
    }, [uuid]);

    useEffect(() => {
        loadPlayers();
    }, []);

    const trySendListUuids = useCallback(() => {
        if (connected && instance && needsOnlineCheck.current && !pendingListUuids.current) {
            needsOnlineCheck.current = false;
            pendingListUuids.current = true;
            instance.send('send command', 'list uuids');
        }
    }, [connected, instance]);

    useEffect(() => {
        trySendRef.current = trySendListUuids;
    });

    useEffect(() => {
        trySendListUuids();
    }, [trySendListUuids]);

    const handleToggleOp = useCallback(
        (player: PlayerInfo) => {
            sendCommand(player.op ? `deop ${player.name}` : `op ${player.name}`);
            setPlayers(prev => prev.map(p => (p.uuid === player.uuid ? { ...p, op: !p.op } : p)));
            setSelectedPlayer(prev =>
                prev?.uuid === player.uuid ? { ...prev, op: !prev.op } : prev,
            );
        },
        [sendCommand],
    );

    const handleToggleWhitelist = useCallback(
        (player: PlayerInfo) => {
            sendCommand(
                player.whitelisted
                    ? `whitelist remove ${player.name}`
                    : `whitelist add ${player.name}`,
            );
            setPlayers(prev =>
                prev.map(p =>
                    p.uuid === player.uuid ? { ...p, whitelisted: !p.whitelisted } : p,
                ),
            );
            setSelectedPlayer(prev =>
                prev?.uuid === player.uuid ? { ...prev, whitelisted: !prev.whitelisted } : prev,
            );
        },
        [sendCommand],
    );

    const handleToggleBan = useCallback(
        (player: PlayerInfo) => {
            sendCommand(player.banned ? `pardon ${player.name}` : `ban ${player.name}`);
            setPlayers(prev =>
                prev.map(p => (p.uuid === player.uuid ? { ...p, banned: !p.banned } : p)),
            );
            setSelectedPlayer(prev =>
                prev?.uuid === player.uuid ? { ...prev, banned: !prev.banned } : prev,
            );
        },
        [sendCommand],
    );

    const matchesFilter = (p: PlayerInfo) => {
        if (filter === 'all') return true;
        if (filter === 'online') return p.online;
        if (filter === 'op') return p.op;
        if (filter === 'banned') return p.banned;
        if (filter === 'whitelisted') return p.whitelisted;
        return true;
    };

    const sorted = [...players].sort((a, b) => {
        const aMatch = matchesFilter(a);
        const bMatch = matchesFilter(b);
        if (aMatch !== bMatch) return aMatch ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    const filtered = sorted.filter(p =>
        search ? p.name.toLowerCase().includes(search.toLowerCase()) : true,
    );

    const onlineCount = players.filter(p => p.online).length;

    return (
        <ServerContentBlock title={'Players'}>
            <div css={tw`flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3`}>
                <div>
                    <h2 css={tw`text-2xl font-semibold text-neutral-100`}>Player Manager</h2>
                    <p css={tw`text-sm text-neutral-400`}>Manage players currently known to the server.</p>
                </div>
                <div css={tw`flex items-center gap-3`}>
                    <span css={tw`text-sm text-neutral-400`}>
                        Online <span css={tw`text-green-400 font-semibold`}>{onlineCount}</span>
                    </span>
                    <div css={tw`flex bg-neutral-800 border border-neutral-700 rounded-lg p-0.5`}>
                        {(
                            [
                                { key: 'list', icon: '≡' },
                                { key: 'grid2', icon: '⊞' },
                                { key: 'grid3', icon: '⊟' },
                            ] as const
                        ).map(({ key, icon }) => (
                            <button
                                key={key}
                                onClick={() => cycleLayout(key)}
                                css={[
                                    tw`w-7 h-7 flex items-center justify-center text-sm rounded-md transition-colors`,
                                    layout === key
                                        ? tw`bg-purple-700 text-white`
                                        : tw`text-neutral-400 hover:text-neutral-200`,
                                ]}
                            >
                                {icon}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => {
                            void loadPlayers();
                        }}
                        css={tw`px-3 py-1.5 text-sm bg-neutral-700 hover:bg-neutral-600 text-neutral-100 rounded transition-colors`}
                    >
                        Refresh
                    </button>
                </div>
            </div>

            <div css={tw`flex flex-col sm:flex-row gap-3 mb-5`}>
                <div css={tw`flex gap-2 flex-wrap`}>
                    {(['all', 'online', 'op', 'banned', 'whitelisted'] as FilterMode[]).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            css={[
                                tw`px-3 py-1 rounded-full text-xs font-medium transition-colors`,
                                filter === f
                                    ? tw`bg-purple-600 text-white`
                                    : tw`bg-neutral-700 text-neutral-300 hover:bg-neutral-600`,
                            ]}
                        >
                            {f === 'all' ? '● All' : f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>
                <input
                    type={'text'}
                    placeholder={'Search...'}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    css={tw`ml-auto bg-neutral-800 border border-neutral-600 rounded px-3 py-1.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 w-full sm:w-44`}
                />
            </div>

            {loading ? (
                <Spinner size={'large'} centered />
            ) : error ? (
                <div css={tw`text-center py-10`}>
                    <p css={tw`text-red-400 font-medium mb-1`}>Failed to load players</p>
                    <p css={tw`text-neutral-400 text-sm mb-4`}>{error}</p>
                    <button
                        onClick={() => {
                            void loadPlayers();
                        }}
                        css={tw`px-4 py-2 bg-neutral-700 hover:bg-neutral-600 rounded text-sm text-neutral-100 transition-colors`}
                    >
                        Retry
                    </button>
                </div>
            ) : filtered.length === 0 ? (
                <p css={tw`text-center text-neutral-400 py-10 text-sm`}>No players found.</p>
            ) : (
                <AnimatePresence>
                    <div
                        css={
                            layout === 'list'
                                ? tw`flex flex-col gap-2`
                                : layout === 'grid2'
                                ? tw`grid grid-cols-1 sm:grid-cols-2 gap-2`
                                : tw`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2`
                        }
                    >
                        {filtered.map(player => (
                            <PlayerRow
                                key={player.uuid}
                                player={player}
                                layout={layout}
                                dimmed={filter !== 'all' && !matchesFilter(player)}
                                onSelect={() => setSelectedPlayer(player)}
                                onToggleOp={() => handleToggleOp(player)}
                                onToggleWhitelist={() => handleToggleWhitelist(player)}
                                onToggleBan={() => handleToggleBan(player)}
                            />
                        ))}
                    </div>
                </AnimatePresence>
            )}

            {selectedPlayer && (
                <PlayerDetailModal
                    player={selectedPlayer}
                    serverUuid={uuid}
                    onClose={() => setSelectedPlayer(null)}
                    onToggleOp={() => handleToggleOp(selectedPlayer)}
                    onToggleWhitelist={() => handleToggleWhitelist(selectedPlayer)}
                    onToggleBan={() => handleToggleBan(selectedPlayer)}
                />
            )}
        </ServerContentBlock>
    );
};