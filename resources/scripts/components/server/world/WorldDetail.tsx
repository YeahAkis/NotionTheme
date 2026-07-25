import React, { useCallback, useRef, useState } from 'react';
import tw from 'twin.macro';
import { WorldInfo } from '@/components/server/world/WorldManagerContainer';
import { ServerContext } from '@/state/server';
import decompressFiles from '@/api/server/files/decompressFiles';
import deleteFiles from '@/api/server/files/deleteFiles';
import getFileUploadUrl from '@/api/server/files/getFileUploadUrl';
import createDirectory from '@/api/server/files/createDirectory';
import axios from 'axios';
import DatapackCard from '@/components/server/world/DatapackCard';

interface Props {
    world: WorldInfo;
    serverUuid: string;
    onNavigate: (path: string) => void;
    onRefresh: () => void;
    onDelete: () => void;
}

export default ({ world, serverUuid, onNavigate, onRefresh, onDelete }: Props) => {
    const { connected, instance } = ServerContext.useStoreState(state => state.socket);

    const [busy, setBusy] = useState(false);
    const [busyMsg, setBusyMsg] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const parentDir = world.path.includes('/')
        ? world.path.substring(0, world.path.lastIndexOf('/')) || '.'
        : '.';
    const datapacksPath = `${world.path}/datapacks`;

    const sendCommand = (cmd: string) => {
        if (connected && instance) instance.send('send command', cmd);
    };

    const run = async (msg: string, fn: () => Promise<void>) => {
        setBusy(true);
        setBusyMsg(msg);
        setError(null);
        try {
            await fn();
            onRefresh();
        } catch (e: any) {
            setError(e?.message || 'Operation failed');
        } finally {
            setBusy(false);
            setBusyMsg('');
        }
    };

    const handleConvertToZip = () =>
        run('Compressing…', async () => {
            const zipName = world.name.replace(/\.(zip|tar\.gz)$/, '') + '.zip';
            sendCommand(`zip -r ${zipName} ${world.name}`);
            await new Promise(r => setTimeout(r, 3000));
        });

    const handleExtract = () =>
        run('Extracting…', async () => {
            await decompressFiles(serverUuid, parentDir, world.name);
        });

    const handleDelete = () => {
        if (!confirm(`Delete world "${world.name}"? This cannot be undone.`)) return;
        run('Deleting…', async () => {
            await deleteFiles(serverUuid, parentDir, [world.name]);
            onDelete();
        });
    };

    const handleUploadDatapack = useCallback(
        async (files: FileList) => {
            setBusy(true);
            setBusyMsg('Uploading…');
            setError(null);
            try {
                try {
                    await createDirectory(serverUuid, world.path, 'datapacks');
                } catch {
                    // already exists
                }
                const uploadUrl = await getFileUploadUrl(serverUuid);
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const formData = new FormData();
                    formData.append('files', file, file.name);
                    await axios.post(uploadUrl, formData, {
                        params: { directory: datapacksPath },
                        headers: { 'Content-Type': 'multipart/form-data' },
                    });
                }
                onRefresh();
            } catch (e: any) {
                setError(e?.message || 'Upload failed');
            } finally {
                setBusy(false);
                setBusyMsg('');
            }
        },
        [serverUuid, world.path, datapacksPath],
    );

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length > 0) {
                handleUploadDatapack(e.dataTransfer.files);
            }
        },
        [handleUploadDatapack],
    );

    return (
        <div css={tw`rounded overflow-hidden border border-neutral-700`}>
            {/* World header */}
            <div css={tw`px-4 py-4 bg-neutral-800 border-b border-neutral-700`}>
                {/* Name + badges */}
                <div css={tw`flex items-center gap-2 flex-wrap`}>
                    <h3 css={tw`text-base font-semibold text-neutral-100`}>
                        {world.levelName || world.name}
                    </h3>
                    {world.hardcore && (
                        <span css={tw`text-xs px-1.5 rounded-sm bg-red-900 text-red-400 border border-red-800`}>
                            Hardcore
                        </span>
                    )}
                    {world.isZip && (
                        <span css={tw`text-xs px-1.5 rounded-sm bg-yellow-900 text-yellow-400 border border-yellow-800`}>
                            ZIP
                        </span>
                    )}
                </div>

                {/* Metadata — wraps naturally on narrow screens */}
                <div css={tw`flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5`}>
                    <span css={tw`text-xs font-mono text-neutral-500`}>
                        path: <span css={tw`text-neutral-400`}>{world.path}</span>
                    </span>
                    {world.version && (
                        <span css={tw`text-xs font-mono text-neutral-500`}>
                            mc: <span css={tw`text-neutral-400`}>{world.version}</span>
                        </span>
                    )}
                    {world.seed && (
                        <span css={tw`text-xs font-mono text-neutral-500`}>
                            seed: <span css={tw`text-neutral-400`}>{world.seed}</span>
                        </span>
                    )}
                    {world.sizeBytes && (
                        <span css={tw`text-xs font-mono text-neutral-500`}>
                            size: <span css={tw`text-neutral-400`}>{(world.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
                        </span>
                    )}
                </div>

                {/* Actions row — scrollable on very small screens */}
                <div css={tw`flex items-center gap-2 mt-3 flex-wrap`}>
                    <button
                        onClick={() => onNavigate(world.path)}
                        css={tw`px-3 py-1.5 text-xs rounded bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-neutral-300 transition-colors`}
                    >
                        Open folder
                    </button>
                    {world.isZip ? (
                        <button
                            onClick={handleExtract}
                            disabled={busy}
                            css={tw`px-3 py-1.5 text-xs rounded bg-purple-700 hover:bg-purple-600 text-white transition-colors disabled:opacity-40`}
                        >
                            Extract
                        </button>
                    ) : (
                        <button
                            onClick={handleConvertToZip}
                            disabled={busy}
                            css={tw`px-3 py-1.5 text-xs rounded bg-purple-700 hover:bg-purple-600 text-white transition-colors disabled:opacity-40`}
                        >
                            Compress to zip
                        </button>
                    )}
                    <button
                        onClick={handleDelete}
                        disabled={busy}
                        css={tw`px-3 py-1.5 text-xs rounded bg-red-800 hover:bg-red-700 text-white transition-colors disabled:opacity-40`}
                    >
                        Delete
                    </button>
                </div>

                {busy && <p css={tw`text-xs text-purple-400 animate-pulse mt-2`}>{busyMsg}</p>}
                {error && <p css={tw`text-xs text-red-400 mt-2`}>{error}</p>}
            </div>

            {/* Datapacks section */}
            {!world.isZip && (
                <>
                    <div css={tw`px-4 py-3 bg-neutral-800 border-b border-neutral-700`}>
                        <div css={tw`flex items-center justify-between flex-wrap gap-2`}>
                            <div css={tw`flex items-center gap-2`}>
                                <span css={tw`text-sm font-medium text-neutral-200`}>Datapacks</span>
                                <span css={tw`text-xs font-mono px-1.5 rounded-sm bg-neutral-700 text-neutral-400`}>
                                    {world.datapacks.length}
                                </span>
                            </div>
                            <div css={tw`flex gap-2`}>
                            <button
                                onClick={() => onNavigate(datapacksPath)}
                                css={tw`px-3 py-1.5 text-xs rounded bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-neutral-300 transition-colors`}
                            >
                                Open folder
                            </button>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={busy}
                                css={tw`px-3 py-1.5 text-xs rounded bg-purple-700 hover:bg-purple-600 text-white transition-colors disabled:opacity-40`}
                            >
                                Upload
                            </button>
                            <input
                                ref={fileInputRef}
                                type={'file'}
                                multiple
                                accept={'.zip,.jar'}
                                css={tw`hidden`}
                                onChange={e => e.target.files && handleUploadDatapack(e.target.files)}
                            />
                        </div>
                        </div>
                    </div>

                    <div
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={onDrop}
                        css={[
                            tw`p-4 transition-colors`,
                            dragOver ? tw`bg-purple-900 bg-opacity-10` : tw`bg-neutral-800 bg-opacity-40`,
                        ]}
                    >
                        {world.datapacks.length === 0 ? (
                            <div css={tw`flex flex-col items-center justify-center py-10 border border-dashed border-neutral-700 rounded`}>
                                <p css={tw`text-sm text-neutral-500`}>No datapacks installed</p>
                                <p css={tw`text-xs text-neutral-600 mt-1`}>Drop a .zip or .jar here to upload</p>
                            </div>
                        ) : (
                            <div css={tw`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2`}>
                                {world.datapacks.map(dp => (
                                    <DatapackCard
                                        key={dp.path}
                                        datapack={dp}
                                        serverUuid={serverUuid}
                                        worldPath={world.path}
                                        onNavigate={onNavigate}
                                        onRefresh={onRefresh}
                                    />
                                ))}
                                {dragOver && (
                                    <div css={tw`flex items-center justify-center border border-dashed border-purple-600 rounded text-purple-400 text-xs p-4`}>
                                        Drop to upload
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}

            {world.isZip && (
                <div css={tw`px-5 py-8 text-center bg-neutral-800 bg-opacity-40`}>
                    <p css={tw`text-neutral-500 text-sm`}>
                        Extract this archive to manage datapacks.
                    </p>
                    <button
                        onClick={handleExtract}
                        disabled={busy}
                        css={tw`mt-3 px-4 py-2 text-sm rounded bg-purple-700 hover:bg-purple-600 text-white transition-colors disabled:opacity-40`}
                    >
                        Extract to folder
                    </button>
                </div>
            )}
        </div>
    );
};