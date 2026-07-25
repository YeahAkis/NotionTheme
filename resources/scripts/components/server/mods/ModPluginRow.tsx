import React, { useEffect, useRef, useState } from 'react';
import tw from 'twin.macro';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle, faPuzzlePiece, faToggleOff, faToggleOn } from '@fortawesome/free-solid-svg-icons';
import { JarMetadata, extractJarMetadata } from '@/components/server/mods/jarMetadata';
import { ModPluginFile, renameFile } from '@/components/server/mods/getModsAndPlugins';
import getFileDownloadUrl from '@/api/server/files/getFileDownloadUrl';
import Spinner from '@/components/elements/Spinner';

interface Props {
    file: ModPluginFile;
    serverUuid: string;
    type: 'mod' | 'plugin';
    onToggle: (file: ModPluginFile, oldPath: string) => void;
}

const loaderColors: Record<string, string> = {
    fabric: '#b5a642',
    quilt: '#9b59b6',
    forge: '#e67e22',
    neoforge: '#e74c3c',
    plugin: '#3498db',
    unknown: '#7f8c8d',
};

const loaderLabels: Record<string, string> = {
    fabric: 'Fabric',
    quilt: 'Quilt',
    forge: 'Forge',
    neoforge: 'NeoForge',
    plugin: 'Plugin',
    unknown: '?',
};

export default ({ file, serverUuid, type, onToggle }: Props) => {
    const [meta, setMeta] = useState<JarMetadata | null>(null);
    const [metaLoading, setMetaLoading] = useState(false);
    const [metaError, setMetaError] = useState(false);
    const [toggling, setToggling] = useState(false);
    const [tooltipVisible, setTooltipVisible] = useState(false);
    const hasLoaded = useRef(false);

    useEffect(() => {
        if (hasLoaded.current) return;
        hasLoaded.current = true;
        setMetaLoading(true);

        getFileDownloadUrl(serverUuid, file.path)
            .then(url => extractJarMetadata(url))
            .then(data => {
                setMeta(data);
                setMetaLoading(false);
            })
            .catch(() => {
                setMetaError(true);
                setMetaLoading(false);
            });
    }, []);

    const handleToggle = async () => {
        if (toggling) return;
        setToggling(true);
        const oldPath = file.path;
        const dir = file.path.substring(0, file.path.lastIndexOf('/') + 1);
        const newEnabled = !file.enabled;
        const newName = newEnabled
            ? file.name.replace(/\.disabled$/, '')
            : file.name.endsWith('.disabled')
            ? file.name
            : `${file.name}.disabled`;
        const newPath = `${dir}${newName}`;
        try {
            await renameFile(serverUuid, oldPath, newPath);
            onToggle({ ...file, name: newName, path: newPath, enabled: newEnabled }, oldPath);
        } catch {
        } finally {
            setToggling(false);
        }
    };

    const displayName = metaLoading ? null : meta?.name && meta.name !== 'Unknown' ? meta.name : null;
    const baseName = file.name.replace(/\.jar(\.disabled)?$/, '');
    const loaderColor = meta ? loaderColors[meta.loader] : '#7f8c8d';
    const loaderLabel = meta ? loaderLabels[meta.loader] : '?';

    return (
        <div
            css={[
                tw`flex items-center gap-3 bg-neutral-700 rounded-lg px-4 py-3 transition-opacity`,
                !file.enabled && tw`opacity-60`,
            ]}
        >
            <div css={tw`flex-shrink-0 w-10 h-10 rounded-md overflow-hidden flex items-center justify-center bg-neutral-800`}>
                {metaLoading ? (
                    <Spinner size={'small'} />
                ) : meta?.iconDataUrl ? (
                    <img src={meta.iconDataUrl} alt={displayName ?? baseName} css={tw`w-full h-full object-cover`} />
                ) : (
                    <FontAwesomeIcon icon={faPuzzlePiece} css={tw`text-neutral-500`} />
                )}
            </div>

            <div css={tw`flex-1 min-w-0`}>
                <div css={tw`flex items-center gap-2 flex-wrap`}>
                    <span css={tw`text-sm font-medium text-neutral-100 truncate`}>
                        {displayName ?? baseName}
                    </span>
                    {meta && (
                        <span
                            css={tw`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0`}
                            style={{ backgroundColor: `${loaderColor}22`, color: loaderColor, border: `1px solid ${loaderColor}44` }}
                        >
                            {loaderLabel}
                            {meta.version ? ` ${meta.version}` : ''}
                        </span>
                    )}
                    {meta?.isClientOnly && (
                        <div css={tw`relative flex-shrink-0`}>
                            <button
                                onMouseEnter={() => setTooltipVisible(true)}
                                onMouseLeave={() => setTooltipVisible(false)}
                                onFocus={() => setTooltipVisible(true)}
                                onBlur={() => setTooltipVisible(false)}
                                css={tw`text-yellow-400 hover:text-yellow-300 transition-colors focus:outline-none`}
                            >
                                <FontAwesomeIcon icon={faExclamationTriangle} size={'sm'} />
                            </button>
                            {tooltipVisible && (
                                <div
                                    css={tw`absolute bottom-full left-1/2 mb-2 z-10 pointer-events-none`}
                                    style={{ transform: 'translateX(-50%)', width: '200px' }}
                                >
                                    <div css={tw`bg-neutral-900 border border-yellow-600 text-yellow-300 text-xs rounded px-2 py-1.5 text-center shadow-lg`}>
                                        Mod appears to be client only<br></br>recommend removing from server
                                    </div>
                                    <div css={tw`flex justify-center`}>
                                        <div
                                            style={{
                                                width: 0,
                                                height: 0,
                                                borderLeft: '5px solid transparent',
                                                borderRight: '5px solid transparent',
                                                borderTop: '5px solid #713f12',
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <p css={tw`text-xs text-neutral-500 font-mono truncate mt-0.5`}>{file.name}</p>
                {meta?.description && (
                    <p css={tw`text-xs text-neutral-400 mt-0.5 truncate`}>{meta.description}</p>
                )}
            </div>

            <button
                onClick={handleToggle}
                disabled={toggling}
                css={[
                    tw`flex-shrink-0 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded transition-colors focus:outline-none`,
                    file.enabled
                        ? tw`bg-green-900 bg-opacity-40 text-green-400 hover:bg-opacity-60`
                        : tw`bg-neutral-800 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700`,
                    toggling && tw`opacity-50 cursor-not-allowed`,
                ]}
                title={file.enabled ? 'Disable' : 'Enable'}
            >
                {toggling ? (
                    <Spinner size={'small'} />
                ) : (
                    <>
                        <FontAwesomeIcon icon={file.enabled ? faToggleOn : faToggleOff} />
                        <span>{file.enabled ? 'Enabled' : 'Disabled'}</span>
                    </>
                )}
            </button>
        </div>
    );
};