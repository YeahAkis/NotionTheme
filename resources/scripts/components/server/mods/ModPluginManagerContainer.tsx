import React, { useEffect, useState } from 'react';
import tw from 'twin.macro';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import FlashMessageRender from '@/components/FlashMessageRender';
import Spinner from '@/components/elements/Spinner';
import useFlash from '@/plugins/useFlash';
import { ServerContext } from '@/state/server';
import { ModPluginFile, getModsAndPlugins } from '@/components/server/mods/getModsAndPlugins';
import ModPluginRow from '@/components/server/mods/ModPluginRow';

interface SectionProps {
    title: string;
    files: ModPluginFile[];
    serverUuid: string;
    type: 'mod' | 'plugin';
    onToggle: (file: ModPluginFile, oldPath: string) => void;
}

const Section = ({ title, files, serverUuid, type, onToggle }: SectionProps) => {
    const enabled = files.filter(f => f.enabled);
    const disabled = files.filter(f => !f.enabled);

    return (
        <div>
            <div css={tw`flex items-center justify-between mb-3`}>
                <h3 css={tw`text-lg font-semibold text-neutral-100`}>{title}</h3>
                <span css={tw`text-xs text-neutral-500`}>
                    {enabled.length} enabled · {disabled.length} disabled · {files.length} total
                </span>
            </div>
            {files.length === 0 ? (
                <p css={tw`text-sm text-neutral-400 text-center py-6`}>No {title.toLowerCase()} found.</p>
            ) : (
                <div css={tw`space-y-2`}>
                    {enabled.map(f => (
                        <ModPluginRow
                            key={f.name.replace(/\.disabled$/, '')}
                            file={f}
                            serverUuid={serverUuid}
                            type={type}
                            onToggle={onToggle}
                        />
                    ))}
                    {disabled.length > 0 && enabled.length > 0 && (
                        <div css={tw`flex items-center gap-3 my-3`}>
                            <div css={tw`flex-1 h-px bg-neutral-700`} />
                            <span css={tw`text-xs text-neutral-600 uppercase tracking-widest`}>Disabled</span>
                            <div css={tw`flex-1 h-px bg-neutral-700`} />
                        </div>
                    )}
                    {disabled.map(f => (
                        <ModPluginRow
                            key={f.name.replace(/\.disabled$/, '')}
                            file={f}
                            serverUuid={serverUuid}
                            type={type}
                            onToggle={onToggle}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default () => {
    const uuid = ServerContext.useStoreState(state => state.server.data!.uuid);
    const { clearFlashes, clearAndAddHttpError } = useFlash();

    const [loading, setLoading] = useState(true);
    const [mods, setMods] = useState<ModPluginFile[]>([]);
    const [plugins, setPlugins] = useState<ModPluginFile[]>([]);
    const [hasMods, setHasMods] = useState(false);
    const [hasPlugins, setHasPlugins] = useState(false);

    useEffect(() => {
        clearFlashes('mods');
        setLoading(true);
        getModsAndPlugins(uuid)
            .then(({ mods, plugins, hasMods, hasPlugins }) => {
                setMods(mods);
                setPlugins(plugins);
                setHasMods(hasMods);
                setHasPlugins(hasPlugins);
            })
            .catch(err => clearAndAddHttpError({ key: 'mods', error: err }))
            .finally(() => setLoading(false));
    }, [uuid]);

    const handleModToggle = (updated: ModPluginFile, oldPath: string) => {
        setMods(prev => prev.map(f => f.path === oldPath ? updated : f));
    };

    const handlePluginToggle = (updated: ModPluginFile, oldPath: string) => {
        setPlugins(prev => prev.map(f => f.path === oldPath ? updated : f));
    };

    if (loading) {
        return <Spinner size={'large'} centered />;
    }

    return (
        <ServerContentBlock title={'Mods & Plugins'}>
            <FlashMessageRender byKey={'mods'} css={tw`mb-4`} />

            {!hasMods && !hasPlugins ? (
                <div css={tw`flex flex-col items-center justify-center py-16 text-center`}>
                    <p css={tw`text-neutral-400 text-sm`}>
                        Appears your server is vanilla or has no plugins/mods installed.
                    </p>
                    <p css={tw`text-neutral-600 text-xs mt-1`}>
                        Add <span css={tw`font-mono`}>.jar</span> files to a{' '}
                        <span css={tw`font-mono`}>mods/</span> or{' '}
                        <span css={tw`font-mono`}>plugins/</span> directory to see them here.
                    </p>
                </div>
            ) : (
                <div css={tw`space-y-10`}>
                    {hasMods && (
                        <Section
                            title={'Mods'}
                            files={mods}
                            serverUuid={uuid}
                            type={'mod'}
                            onToggle={handleModToggle}
                        />
                    )}
                    {hasMods && hasPlugins && <div css={tw`border-t border-neutral-700`} />}
                    {hasPlugins && (
                        <Section
                            title={'Plugins'}
                            files={plugins}
                            serverUuid={uuid}
                            type={'plugin'}
                            onToggle={handlePluginToggle}
                        />
                    )}
                </div>
            )}
        </ServerContentBlock>
    );
};