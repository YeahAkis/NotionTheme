import React, { useState } from 'react';
import tw from 'twin.macro';
import { DatapackInfo } from '@/components/server/world/WorldManagerContainer';
import { ServerContext } from '@/state/server';
import decompressFiles from '@/api/server/files/decompressFiles';
import deleteFiles from '@/api/server/files/deleteFiles';

export default ({
    datapack,
    serverUuid,
    worldPath,
    onNavigate,
    onRefresh,
}: {
    datapack: DatapackInfo;
    serverUuid: string;
    worldPath: string;
    onNavigate: (path: string) => void;
    onRefresh: () => void;
}) => {
    const { connected, instance } = ServerContext.useStoreState(state => state.socket);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const datapacksPath = `${worldPath}/datapacks`;

    const sendCommand = (cmd: string) => {
        if (connected && instance) instance.send('send command', cmd);
    };

    const run = async (fn: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            await fn();
            onRefresh();
        } catch (e: any) {
            setError(e?.message || 'Operation failed');
        } finally {
            setBusy(false);
        }
    };

    const handleExtract = () =>
        run(async () => {
            await decompressFiles(serverUuid, datapacksPath, datapack.name);
        });

    const handleConvertToZip = () =>
        run(async () => {
            // compressFiles always produces .tar.gz — use the zip binary via console instead
            const zipName = datapack.name.replace(/\.(zip|tar\.gz|jar)$/, '') + '.zip';
            sendCommand(`cd ${datapacksPath} && zip -r ${zipName} ${datapack.name} && rm -rf ${datapack.name}`);
            // Wait for the command to complete before refreshing
            await new Promise(r => setTimeout(r, 3000));
        });

    const handleDelete = () => {
        if (!confirm(`Delete datapack "${datapack.name}"?`)) return;
        run(async () => {
            await deleteFiles(serverUuid, datapacksPath, [datapack.name]);
        });
    };

    return (
        <div
            css={[
                tw`rounded border border-neutral-700 bg-neutral-800 flex flex-col transition-opacity`,
                busy && tw`opacity-50 pointer-events-none`,
            ]}
        >
            {/* Header */}
            <div css={tw`flex items-center gap-3 px-3 py-3 border-b border-neutral-700`}>
                {datapack.hasPng && datapack.pngUrl ? (
                    <img
                        src={datapack.pngUrl}
                        alt={datapack.name}
                        css={tw`w-9 h-9 rounded flex-shrink-0`}
                        style={{ imageRendering: 'pixelated' }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                ) : (
                    <div css={tw`w-9 h-9 rounded flex-shrink-0 bg-neutral-700 flex items-center justify-center`}>
                        <span css={tw`text-xs font-bold text-neutral-500`}>DP</span>
                    </div>
                )}
                <div css={tw`min-w-0 flex-1`}>
                    <p css={tw`text-sm font-medium text-neutral-100 truncate`}>{datapack.name}</p>
                    <div css={tw`flex items-center gap-2 mt-0.5`}>
                        {datapack.isZip && (
                            <span css={tw`text-xs px-1 rounded-sm bg-yellow-900 text-yellow-400`}>zip</span>
                        )}
                        {datapack.packFormat !== null && datapack.packFormat !== undefined && (
                            <span css={tw`text-xs font-mono text-neutral-500`}>fmt:{datapack.packFormat}</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Description */}
            {datapack.description && (
                <div css={tw`px-3 py-2 flex-1`}>
                    <p
                        css={tw`text-xs text-neutral-400 leading-relaxed`}
                        style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                        }}
                    >
                        {datapack.description}
                    </p>
                </div>
            )}

            {error && (
                <p css={tw`px-3 py-1 text-xs text-red-400`}>{error}</p>
            )}

            {/* Actions */}
            <div css={tw`flex flex-wrap gap-1.5 px-3 py-2.5 border-t border-neutral-700 mt-auto`}>
                {!datapack.isZip && (
                    <button
                        onClick={() => onNavigate(datapack.path)}
                        disabled={busy}
                        css={tw`px-2.5 py-1 text-xs rounded bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-neutral-300 transition-colors disabled:opacity-40`}
                    >
                        Open
                    </button>
                )}
                {datapack.isZip ? (
                    <button
                        onClick={handleExtract}
                        disabled={busy}
                        css={tw`px-2.5 py-1 text-xs rounded bg-purple-700 hover:bg-purple-600 text-white transition-colors disabled:opacity-40`}
                    >
                        Extract
                    </button>
                ) : (
                    <button
                        onClick={handleConvertToZip}
                        disabled={busy}
                        css={tw`px-2.5 py-1 text-xs rounded bg-purple-700 hover:bg-purple-600 text-white transition-colors disabled:opacity-40`}
                    >
                        To zip
                    </button>
                )}
                <button
                    onClick={handleDelete}
                    disabled={busy}
                    css={tw`px-2.5 py-1 text-xs rounded bg-red-800 hover:bg-red-700 text-white transition-colors disabled:opacity-40 ml-auto`}
                >
                    Remove
                </button>
            </div>
        </div>
    );
};