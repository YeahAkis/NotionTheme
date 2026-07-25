import React, { useEffect, useState } from 'react';
import tw from 'twin.macro';
import { PlayerInfo } from '@/components/server/players/PlayersContainer';
import getFileContents from '@/api/server/files/getFileContents';
import getFileDownloadUrl from '@/api/server/files/getFileDownloadUrl';
import Spinner from '@/components/elements/Spinner';
import { fetchAndParseNbt } from '@/components/server/nbtUtils';

interface PlayerData {
    health?: number;
    maxHealth?: number;
    foodLevel?: number;
    xpLevel?: number;
    score?: number;
    gameMode?: number;
    posX?: number;
    posY?: number;
    posZ?: number;
    dimension?: string;
    inventory?: InventorySlot[];
    statsCustom?: Record<string, number>;
    statsMined?: Record<string, number>;
    statsKilled?: Record<string, number>;
}

interface InventorySlot {
    slot: number;
    id: string;
    count: number;
}

const GAME_MODES: Record<number, string> = {
    0: 'Survival',
    1: 'Creative',
    2: 'Adventure',
    3: 'Spectator',
};
const DIMENSIONS: Record<string, string> = {
    'minecraft:overworld': 'Overworld',
    'minecraft:the_nether': 'Nether',
    'minecraft:the_end': 'The End',
};

function friendlyId(id: string): string {
    return id
        .replace('minecraft:', '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

function formatTime(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

async function parsePlayerDat(serverUuid: string, uuidDashed: string): Promise<Partial<PlayerData>> {
    const path = `world/playerdata/${uuidDashed}.dat`;
    const url = await getFileDownloadUrl(serverUuid, path);
    const parsed = await fetchAndParseNbt(url);
    const root = parsed.value;

    const posList: any[] = root['Pos']?.value?.value ?? [];
    const posX = posList[0];
    const posY = posList[1];
    const posZ = posList[2];

    const health = root['Health']?.value as number | undefined;

    let maxHealth: number | undefined;
    const attrs: any[] = root['Attributes']?.value?.value ?? [];
    for (const attr of attrs) {
        if (attr?.Name?.value === 'minecraft:generic.max_health') {
            maxHealth = attr.Base?.value as number | undefined;
            break;
        }
    }

    const invList: any[] = root['Inventory']?.value?.value ?? [];
    const inventory: InventorySlot[] = invList
        .map(item => ({
            slot: (item?.Slot?.value as number) ?? -1,
            id: (item?.id?.value as string) ?? 'minecraft:air',
            count: (item?.Count?.value as number) ?? 1,
        }))
        .filter(item => item.id !== 'minecraft:air' && item.slot >= 0)
        .sort((a, b) => a.slot - b.slot);

    const dimension = root['Dimension']?.value as string | undefined;
    const foodLevel = root['foodLevel']?.value as number | undefined;
    const xpLevel = root['XpLevel']?.value as number | undefined;
    const score = root['Score']?.value as number | undefined;
    const gameMode = root['playerGameType']?.value as number | undefined;

    return { health, maxHealth, foodLevel, xpLevel, score, gameMode, posX, posY, posZ, dimension, inventory };
}

async function loadStats(serverUuid: string, uuidDashed: string): Promise<Partial<PlayerData>> {
    try {
        const raw = await getFileContents(serverUuid, `world/stats/${uuidDashed}.json`);
        const stats = JSON.parse(raw);
        const s = stats.stats || {};
        return {
            statsCustom: s['minecraft:custom'] || {},
            statsMined: s['minecraft:mined'] || {},
            statsKilled: s['minecraft:killed'] || {},
        };
    } catch {
        return {};
    }
}

// ---- Sub-components (defined before export default) ----

const Badge = ({ label, color }: { label: string; color: 'purple' | 'red' | 'green' }) => {
    const map = {
        purple: tw`bg-purple-800 text-purple-200`,
        red: tw`bg-red-800 text-red-200`,
        green: tw`bg-green-800 text-green-200`,
    };
    return (
        <span css={[tw`text-xs px-2 py-0.5 rounded-full font-medium`, map[color]]}>{label}</span>
    );
};

const ActionButton = ({
    children,
    active,
    activeColor,
    onClick,
}: {
    children: React.ReactNode;
    active: boolean;
    activeColor: 'purple' | 'red' | 'green';
    onClick: () => void;
}) => {
    const activeMap = {
        purple: tw`bg-purple-700 hover:bg-purple-600 text-purple-100`,
        red: tw`bg-red-700 hover:bg-red-600 text-red-100`,
        green: tw`bg-green-700 hover:bg-green-600 text-green-100`,
    };
    return (
        <button
            onClick={onClick}
            css={[
                tw`px-3 py-1.5 text-sm font-medium rounded transition-colors`,
                active ? activeMap[activeColor] : tw`bg-neutral-700 hover:bg-neutral-600 text-neutral-300`,
            ]}
        >
            {children}
        </button>
    );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
        <h3 css={tw`text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3`}>{title}</h3>
        {children}
    </div>
);

const StatCard = ({ label, value }: { label: string; value: string }) => (
    <div css={tw`bg-neutral-800 rounded-lg px-4 py-3`}>
        <p css={tw`text-xs text-neutral-500 uppercase tracking-wider`}>{label}</p>
        <p css={tw`text-lg font-semibold text-neutral-100 mt-0.5`}>{value}</p>
    </div>
);

const BarStat = ({
    label,
    value,
    pct,
    color,
}: {
    label: string;
    value: string;
    pct: number | null;
    color: 'red' | 'yellow' | 'green';
}) => {
    const barColor = {
        red: tw`bg-red-500`,
        yellow: tw`bg-yellow-500`,
        green: tw`bg-green-500`,
    }[color];
    return (
        <div>
            <div css={tw`flex justify-between text-sm mb-1`}>
                <span css={tw`text-neutral-400`}>{label}</span>
                <span css={tw`text-neutral-200 font-mono`}>{value}</span>
            </div>
            <div css={tw`h-2 bg-neutral-700 rounded-full overflow-hidden`}>
                {pct !== null && pct !== undefined && (
                    <div
                        css={[tw`h-full rounded-full transition-all`, barColor]}
                        style={{ width: `${pct}%` }}
                    />
                )}
            </div>
        </div>
    );
};

// ---- Main component ----

interface Props {
    player: PlayerInfo;
    serverUuid: string;
    onClose: () => void;
    onToggleOp: () => void;
    onToggleWhitelist: () => void;
    onToggleBan: () => void;
}

export default ({
    player,
    serverUuid,
    onClose,
    onToggleOp,
    onToggleWhitelist,
    onToggleBan,
}: Props) => {
    const [data, setData] = useState<PlayerData | null>(null);
    const [loading, setLoading] = useState(true);
    const [nbtError, setNbtError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        setNbtError(null);
        Promise.all([
            parsePlayerDat(serverUuid, player.uuidDashed).catch(e => {
                setNbtError(e?.message || 'Failed to read .dat file');
                return {} as Partial<PlayerData>;
            }),
            loadStats(serverUuid, player.uuidDashed),
        ]).then(([nbtData, statsData]) => {
            setData({ ...nbtData, ...statsData });
            setLoading(false);
        });
    }, [player.uuid]);

    const playTimeMinutes =
        data?.statsCustom?.['minecraft:play_time'] !== undefined &&
        data?.statsCustom?.['minecraft:play_time'] !== null
            ? Math.floor(data.statsCustom['minecraft:play_time'] / 20 / 60)
            : null;
    const deaths = data?.statsCustom?.['minecraft:deaths'] ?? null;
    const jumps = data?.statsCustom?.['minecraft:jump'] ?? null;
    const distWalked =
        data?.statsCustom?.['minecraft:walk_one_cm'] !== undefined &&
        data?.statsCustom?.['minecraft:walk_one_cm'] !== null
            ? Math.floor(data.statsCustom['minecraft:walk_one_cm'] / 100)
            : null;

    const topMined = data?.statsMined
        ? Object.entries(data.statsMined)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
        : [];
    const topKilled = data?.statsKilled
        ? Object.entries(data.statsKilled)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
        : [];

    const healthPct =
        data?.health !== null &&
        data?.health !== undefined &&
        data?.maxHealth !== null &&
        data?.maxHealth !== undefined
            ? Math.min(100, (data.health / data.maxHealth) * 100)
            : data?.health !== null && data?.health !== undefined
            ? Math.min(100, (data.health / 20) * 100)
            : null;

    const foodPct =
        data?.foodLevel !== null && data?.foodLevel !== undefined
            ? Math.min(100, (data.foodLevel / 20) * 100)
            : null;

    return (
        <>
            <div css={tw`fixed inset-0 bg-black bg-opacity-70 z-40`} onClick={onClose} />
            <div
                css={tw`fixed inset-x-0 bottom-0 z-50 flex items-center justify-center p-4`}
                style={{ top: '3.5rem' }}
                onClick={onClose}
            >
                <div
                    css={tw`bg-neutral-900 border border-neutral-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl`}
                    onClick={e => e.stopPropagation()}
                >
                    <div css={tw`flex items-center gap-4 p-6 border-b border-neutral-700`}>
                        <div css={tw`relative flex-shrink-0`}>
                            <img
                                src={`https://mc-heads.net/avatar/${player.uuidDashed}/64`}
                                alt={player.name}
                                css={tw`w-16 h-16 rounded-lg`}
                                onError={e => {
                                    (e.target as HTMLImageElement).src =
                                        'https://mc-heads.net/avatar/steve/64';
                                }}
                            />
                            {player.online && (
                                <span
                                    css={tw`absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-neutral-900`}
                                />
                            )}
                        </div>
                        <div css={tw`flex-1 min-w-0`}>
                            <h2 css={tw`text-xl font-semibold text-neutral-100`}>{player.name}</h2>
                            <p css={tw`text-xs text-neutral-500 font-mono`}>{player.uuidDashed}</p>
                            <div css={tw`flex flex-wrap gap-1.5 mt-2`}>
                                {player.online && <Badge label={'Online'} color={'green'} />}
                                {player.op && <Badge label={'Op'} color={'purple'} />}
                                {player.banned && <Badge label={'Banned'} color={'red'} />}
                                {player.whitelisted && <Badge label={'Whitelisted'} color={'green'} />}
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            css={tw`text-neutral-400 hover:text-neutral-200 text-2xl leading-none self-start`}
                        >
                            ×
                        </button>
                    </div>

                    <div css={tw`flex gap-2 px-6 pt-4 flex-wrap`}>
                        <ActionButton active={player.op} activeColor={'purple'} onClick={onToggleOp}>
                            {player.op ? 'Remove Op' : 'Add Op'}
                        </ActionButton>
                        <ActionButton active={player.banned} activeColor={'red'} onClick={onToggleBan}>
                            {player.banned ? 'Pardon' : 'Ban'}
                        </ActionButton>
                        <ActionButton
                            active={player.whitelisted}
                            activeColor={'green'}
                            onClick={onToggleWhitelist}
                        >
                            {player.whitelisted ? 'Remove from Whitelist' : 'Add to Whitelist'}
                        </ActionButton>
                    </div>

                    <div css={tw`p-6 space-y-6`}>
                        {loading ? (
                            <Spinner size={'large'} centered />
                        ) : (
                            <>
                                {nbtError && (
                                    <div css={tw`bg-yellow-900 bg-opacity-30 border border-yellow-700 rounded px-3 py-2 text-yellow-300 text-sm`}>
                                        Could not read .dat file: {nbtError}
                                    </div>
                                )}

                                {!nbtError && (
                                    <>
                                        <Section title={'Status'}>
                                            <div css={tw`grid grid-cols-2 sm:grid-cols-3 gap-3`}>
                                                <StatCard
                                                    label={'Game Mode'}
                                                    value={
                                                        data?.gameMode !== null &&
                                                        data?.gameMode !== undefined
                                                            ? GAME_MODES[data.gameMode] ??
                                                              String(data.gameMode)
                                                            : '—'
                                                    }
                                                />
                                                <StatCard
                                                    label={'XP Level'}
                                                    value={
                                                        data?.xpLevel !== null &&
                                                        data?.xpLevel !== undefined
                                                            ? String(data.xpLevel)
                                                            : '—'
                                                    }
                                                />
                                                <StatCard
                                                    label={'Score'}
                                                    value={
                                                        data?.score !== null &&
                                                        data?.score !== undefined
                                                            ? data.score.toLocaleString()
                                                            : '—'
                                                    }
                                                />
                                            </div>
                                        </Section>

                                        <Section title={'Health & Hunger'}>
                                            <div css={tw`space-y-3`}>
                                                <BarStat
                                                    label={'Health'}
                                                    value={
                                                        data?.health !== null &&
                                                        data?.health !== undefined
                                                            ? `${data.health.toFixed(1)} / ${data?.maxHealth?.toFixed(1) ?? 20}`
                                                            : '—'
                                                    }
                                                    pct={healthPct}
                                                    color={'red'}
                                                />
                                                <BarStat
                                                    label={'Hunger'}
                                                    value={
                                                        data?.foodLevel !== null &&
                                                        data?.foodLevel !== undefined
                                                            ? `${data.foodLevel} / 20`
                                                            : '—'
                                                    }
                                                    pct={foodPct}
                                                    color={'yellow'}
                                                />
                                            </div>
                                        </Section>

                                        {(data?.posX !== null &&
                                            data?.posX !== undefined) ||
                                        data?.dimension ? (
                                            <Section title={'Location'}>
                                                <div css={tw`bg-neutral-800 rounded-lg px-4 py-3 font-mono text-sm space-y-1`}>
                                                    {data?.dimension && (
                                                        <p css={tw`text-neutral-400`}>
                                                            <span css={tw`text-neutral-500`}>
                                                                Dimension{' '}
                                                            </span>
                                                            <span css={tw`text-neutral-200`}>
                                                                {DIMENSIONS[data.dimension] ??
                                                                    data.dimension}
                                                            </span>
                                                        </p>
                                                    )}
                                                    {data?.posX !== null &&
                                                        data?.posX !== undefined && (
                                                            <p css={tw`text-neutral-400`}>
                                                                <span css={tw`text-red-400`}>X </span>
                                                                <span css={tw`text-neutral-200`}>
                                                                    {data.posX.toFixed(1)}
                                                                </span>
                                                                <span css={tw`text-green-400 ml-3`}>
                                                                    Y{' '}
                                                                </span>
                                                                <span css={tw`text-neutral-200`}>
                                                                    {data?.posY?.toFixed(1)}
                                                                </span>
                                                                <span css={tw`text-blue-400 ml-3`}>
                                                                    Z{' '}
                                                                </span>
                                                                <span css={tw`text-neutral-200`}>
                                                                    {data?.posZ?.toFixed(1)}
                                                                </span>
                                                            </p>
                                                        )}
                                                </div>
                                            </Section>
                                        ) : null}

                                        {data?.inventory && data.inventory.length > 0 && (
                                            <Section
                                                title={`Inventory (${data.inventory.length} items)`}
                                            >
                                                <div css={tw`space-y-1`}>
                                                    {data.inventory.map(item => (
                                                        <div
                                                            key={item.slot}
                                                            css={tw`flex items-center justify-between bg-neutral-800 rounded px-3 py-1.5`}
                                                        >
                                                            <span css={tw`text-sm text-neutral-300`}>
                                                                {friendlyId(item.id)}
                                                            </span>
                                                            <div css={tw`flex items-center gap-3`}>
                                                                <span css={tw`text-xs text-neutral-500 font-mono`}>
                                                                    slot {item.slot}
                                                                </span>
                                                                <span css={tw`text-sm font-mono text-neutral-400`}>
                                                                    ×{item.count}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </Section>
                                        )}
                                    </>
                                )}

                                <Section title={'Statistics'}>
                                    <div css={tw`grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4`}>
                                        <StatCard
                                            label={'Play Time'}
                                            value={
                                                playTimeMinutes !== null &&
                                                playTimeMinutes !== undefined
                                                    ? formatTime(playTimeMinutes)
                                                    : '—'
                                            }
                                        />
                                        <StatCard
                                            label={'Deaths'}
                                            value={
                                                deaths !== null && deaths !== undefined
                                                    ? String(deaths)
                                                    : '—'
                                            }
                                        />
                                        <StatCard
                                            label={'Jumps'}
                                            value={
                                                jumps !== null && jumps !== undefined
                                                    ? String(jumps)
                                                    : '—'
                                            }
                                        />
                                        <StatCard
                                            label={'Walked'}
                                            value={
                                                distWalked !== null && distWalked !== undefined
                                                    ? `${distWalked.toLocaleString()}m`
                                                    : '—'
                                            }
                                        />
                                    </div>

                                    {topMined.length > 0 && (
                                        <div css={tw`mb-4`}>
                                            <p css={tw`text-xs text-neutral-500 uppercase tracking-wider mb-2`}>
                                                Top Blocks Mined
                                            </p>
                                            <div css={tw`space-y-1`}>
                                                {topMined.map(([id, count]) => (
                                                    <div
                                                        key={id}
                                                        css={tw`flex justify-between bg-neutral-800 rounded px-3 py-1.5`}
                                                    >
                                                        <span css={tw`text-sm text-neutral-300`}>
                                                            {friendlyId(id)}
                                                        </span>
                                                        <span css={tw`text-sm font-mono text-neutral-400`}>
                                                            {(count as number).toLocaleString()}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {topKilled.length > 0 && (
                                        <div>
                                            <p css={tw`text-xs text-neutral-500 uppercase tracking-wider mb-2`}>
                                                Top Mobs Killed
                                            </p>
                                            <div css={tw`space-y-1`}>
                                                {topKilled.map(([id, count]) => (
                                                    <div
                                                        key={id}
                                                        css={tw`flex justify-between bg-neutral-800 rounded px-3 py-1.5`}
                                                    >
                                                        <span css={tw`text-sm text-neutral-300`}>
                                                            {friendlyId(id)}
                                                        </span>
                                                        <span css={tw`text-sm font-mono text-neutral-400`}>
                                                            {(count as number).toLocaleString()}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {(playTimeMinutes === null || playTimeMinutes === undefined) &&
                                        topMined.length === 0 &&
                                        topKilled.length === 0 && (
                                            <p css={tw`text-neutral-500 text-sm text-center py-2`}>
                                                No stats file found for this player yet.
                                            </p>
                                        )}
                                </Section>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};