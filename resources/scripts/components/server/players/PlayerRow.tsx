import React from 'react';
import tw from 'twin.macro';
import { motion } from 'framer-motion';
import { PlayerInfo } from '@/components/server/players/PlayersContainer';

interface Props {
    player: PlayerInfo;
    layout: 'list' | 'grid2' | 'grid3';
    dimmed?: boolean;
    onSelect: () => void;
    onToggleOp: () => void;
    onToggleWhitelist: () => void;
    onToggleBan: () => void;
}

const Badge = ({ label, color }: { label: string; color: 'purple' | 'red' | 'green' }) => {
    const colorMap = {
        purple: tw`bg-purple-900 text-purple-200 border border-purple-700`,
        red: tw`bg-red-900 text-red-200 border border-red-700`,
        green: tw`bg-green-900 text-green-200 border border-green-700`,
    };
    return (
        <span css={[tw`text-xs px-2 py-0.5 rounded-full font-medium`, colorMap[color]]}>
            {label}
        </span>
    );
};

const ListRow = ({
    player,
    onSelect,
    onToggleOp,
    onToggleWhitelist,
    onToggleBan,
}: Omit<Props, 'layout' | 'dimmed'>) => (
    <>
        <div css={tw`relative flex-shrink-0`}>
            <img
                src={`https://mc-heads.net/avatar/${player.uuidDashed}/40`}
                alt={player.name}
                css={tw`w-9 h-9 sm:w-10 sm:h-10 rounded`}
                onError={e => {
                    (e.target as HTMLImageElement).src = 'https://mc-heads.net/avatar/steve/40';
                }}
            />
            {player.online && (
                <span
                    css={tw`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-gray-800`}
                    title={'Online'}
                />
            )}
        </div>
        <div css={tw`flex-1 min-w-0`}>
            <div css={tw`flex flex-wrap items-center gap-1.5`}>
                <span css={tw`text-neutral-100 font-medium text-sm truncate`}>{player.name}</span>
                {player.online && <Badge label={'Online'} color={'green'} />}
                {player.op && <Badge label={'Op'} color={'purple'} />}
                {player.banned && <Badge label={'Banned'} color={'red'} />}
                {player.whitelisted && <Badge label={'Whitelisted'} color={'green'} />}
            </div>
            <p css={tw`text-xs text-neutral-500 font-mono truncate hidden sm:block`}>
                {player.uuidDashed}
            </p>
        </div>
        <div css={tw`flex items-center gap-1.5 flex-shrink-0`}>
            <button
                onClick={e => {
                    e.stopPropagation();
                    onToggleOp();
                }}
                css={[
                    tw`hidden sm:flex px-2.5 py-1.5 text-xs font-medium rounded transition-colors items-center`,
                    player.op
                        ? tw`bg-purple-700 hover:bg-purple-600 text-purple-100`
                        : tw`bg-gray-700 hover:bg-gray-600 text-neutral-300`,
                ]}
            >
                {player.op ? 'Deop' : 'Op'}
            </button>
            <button
                onClick={e => {
                    e.stopPropagation();
                    onToggleBan();
                }}
                css={[
                    tw`hidden sm:flex px-2.5 py-1.5 text-xs font-medium rounded transition-colors items-center`,
                    player.banned
                        ? tw`bg-red-700 hover:bg-red-600 text-red-100`
                        : tw`bg-gray-700 hover:bg-gray-600 text-neutral-300`,
                ]}
            >
                {player.banned ? 'Pardon' : 'Ban'}
            </button>
            <button
                onClick={e => {
                    e.stopPropagation();
                    onToggleWhitelist();
                }}
                css={[
                    tw`hidden sm:flex px-2.5 py-1.5 text-xs font-medium rounded transition-colors items-center`,
                    player.whitelisted
                        ? tw`bg-green-700 hover:bg-green-600 text-green-100`
                        : tw`bg-gray-700 hover:bg-gray-600 text-neutral-300`,
                ]}
            >
                {player.whitelisted ? 'Unwhitelist' : 'Whitelist'}
            </button>
            <button
                onClick={onSelect}
                css={tw`px-2.5 py-1.5 text-xs font-medium rounded bg-gray-700 hover:bg-gray-600 text-purple-300 hover:text-purple-200 transition-colors`}
            >
                <span css={tw`hidden sm:inline`}>Details →</span>
                <span css={tw`sm:hidden`}>→</span>
            </button>
        </div>
    </>
);

const CardBody = ({
    player,
    compact,
    onSelect,
    onToggleOp,
    onToggleWhitelist,
    onToggleBan,
}: Omit<Props, 'layout' | 'dimmed'> & { compact: boolean }) => (
    <div css={tw`flex flex-col items-center text-center`}>
        <div css={tw`relative mb-3`}>
            <img
                src={`https://mc-heads.net/avatar/${player.uuidDashed}/${compact ? 56 : 72}`}
                alt={player.name}
                style={{ width: compact ? 56 : 72, height: compact ? 56 : 72, borderRadius: 8 }}
                css={tw`rounded-lg`}
                onError={e => {
                    (e.target as HTMLImageElement).src = `https://mc-heads.net/avatar/steve/${compact ? 56 : 72}`;
                }}
            />
            {player.online && (
                <span
                    css={tw`absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-gray-800`}
                    title={'Online'}
                />
            )}
        </div>
        <p css={tw`text-neutral-100 font-semibold text-sm truncate w-full px-1`}>{player.name}</p>
        <p
            css={tw`text-neutral-600 font-mono truncate w-full px-1 mt-0.5`}
            style={{ fontSize: '0.6rem' }}
        >
            {player.uuidDashed}
        </p>
        <div css={tw`flex flex-wrap justify-center gap-1 mt-2`}>
            {player.online && <Badge label={'Online'} color={'green'} />}
            {player.op && <Badge label={'Op'} color={'purple'} />}
            {player.banned && <Badge label={'Banned'} color={'red'} />}
            {player.whitelisted && <Badge label={'Whitelisted'} color={'green'} />}
        </div>
        <div css={tw`flex flex-wrap justify-center gap-1.5 mt-3 w-full`}>
            <button
                onClick={e => {
                    e.stopPropagation();
                    onToggleOp();
                }}
                css={[
                    tw`px-2.5 py-1 text-xs font-medium rounded transition-colors`,
                    player.op
                        ? tw`bg-purple-700 hover:bg-purple-600 text-purple-100`
                        : tw`bg-gray-700 hover:bg-gray-600 text-neutral-300`,
                ]}
            >
                {player.op ? 'Deop' : 'Op'}
            </button>
            <button
                onClick={e => {
                    e.stopPropagation();
                    onToggleBan();
                }}
                css={[
                    tw`px-2.5 py-1 text-xs font-medium rounded transition-colors`,
                    player.banned
                        ? tw`bg-red-700 hover:bg-red-600 text-red-100`
                        : tw`bg-gray-700 hover:bg-gray-600 text-neutral-300`,
                ]}
            >
                {player.banned ? 'Pardon' : 'Ban'}
            </button>
            <button
                onClick={e => {
                    e.stopPropagation();
                    onToggleWhitelist();
                }}
                css={[
                    tw`px-2.5 py-1 text-xs font-medium rounded transition-colors`,
                    player.whitelisted
                        ? tw`bg-green-700 hover:bg-green-600 text-green-100`
                        : tw`bg-gray-700 hover:bg-gray-600 text-neutral-300`,
                ]}
            >
                {player.whitelisted ? 'Unwhitelist' : 'Whitelist'}
            </button>
            <button
                onClick={onSelect}
                css={tw`px-2.5 py-1 text-xs font-medium rounded bg-gray-700 hover:bg-gray-600 text-purple-300 hover:text-purple-200 transition-colors`}
            >
                Details →
            </button>
        </div>
    </div>
);

export default ({
    player,
    layout,
    dimmed,
    onSelect,
    onToggleOp,
    onToggleWhitelist,
    onToggleBan,
}: Props) => {
    const isCard = layout === 'grid2' || layout === 'grid3';
    return (
        <motion.div
            layout
            layoutId={player.uuid}
            animate={{ opacity: dimmed ? 0.35 : 1 }}
            transition={{
                layout: { duration: 0.3, ease: 'easeInOut' },
                opacity: { duration: 0.25 },
            }}
            style={{ filter: dimmed ? 'saturate(0.4)' : undefined }}
            css={[
                tw`bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors`,
                isCard ? tw`p-4` : tw`flex items-center gap-3 px-3 py-3 sm:px-4`,
            ]}
        >
            {isCard ? (
                <CardBody
                    player={player}
                    compact={layout === 'grid3'}
                    onSelect={onSelect}
                    onToggleOp={onToggleOp}
                    onToggleWhitelist={onToggleWhitelist}
                    onToggleBan={onToggleBan}
                />
            ) : (
                <ListRow
                    player={player}
                    onSelect={onSelect}
                    onToggleOp={onToggleOp}
                    onToggleWhitelist={onToggleWhitelist}
                    onToggleBan={onToggleBan}
                />
            )}
        </motion.div>
    );
};