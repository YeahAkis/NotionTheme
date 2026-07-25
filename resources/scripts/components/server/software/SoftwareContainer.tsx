import React, { useEffect, useState } from 'react';
import tw from 'twin.macro';
import { ServerContext } from '@/state/server';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import FlashMessageRender from '@/components/FlashMessageRender';
import Spinner from '@/components/elements/Spinner';
import TitledGreyBox from '@/components/elements/TitledGreyBox';
import Select from '@/components/elements/Select';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import useFlash from '@/plugins/useFlash';
import { usePermissions } from '@/plugins/usePermissions';
import getSoftware from '@/api/server/software/getSoftware';
import getSoftwareVersions from '@/api/server/software/getSoftwareVersions';
import changeSoftware from '@/api/server/software/changeSoftware';
import { SoftwareOption } from '@/api/server/software/types';

const CATEGORY_LABELS: Record<string, string> = {
    server: 'Server Software',
    proxy: 'Proxy Software',
};

const SoftwareContainer = () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const { addError, clearFlashes } = useFlash();
    const [canChange] = usePermissions(['startup.software']);

    const [loading, setLoading] = useState(true);
    const [enabled, setEnabled] = useState(true);
    const [options, setOptions] = useState<SoftwareOption[]>([]);
    const [currentEggId, setCurrentEggId] = useState<number | null>(null);

    const [selectedSoftware, setSelectedSoftware] = useState<string>('');
    const [minecraftVersions, setMinecraftVersions] = useState<string[]>([]);
    const [selectedMcVersion, setSelectedMcVersion] = useState<string>('');
    const [loaderVersions, setLoaderVersions] = useState<(string | number)[]>([]);
    const [selectedLoaderVersion, setSelectedLoaderVersion] = useState<string>('');

    const [versionsLoading, setVersionsLoading] = useState(false);
    const [buildsLoading, setBuildsLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);

    // Initial load: which software options exist for this panel.
    useEffect(() => {
        clearFlashes('software');
        getSoftware(uuid)
            .then((data) => {
                setEnabled(data.enabled);
                setOptions(data.software);
                setCurrentEggId(data.currentEggId);
                if (data.software.length > 0) {
                    setSelectedSoftware(data.software[0].key);
                }
            })
            .catch((error) => {
                console.error(error);
                addError({ key: 'software', message: 'Could not load software options.' });
            })
            .then(() => setLoading(false));
    }, []);

    // When the selected software changes, load its Minecraft version list.
    useEffect(() => {
        if (!selectedSoftware) return;

        setMinecraftVersions([]);
        setSelectedMcVersion('');
        setLoaderVersions([]);
        setSelectedLoaderVersion('');
        setVersionsLoading(true);
        clearFlashes('software');

        getSoftwareVersions(uuid, selectedSoftware)
            .then((data) => {
                setMinecraftVersions(data.minecraftVersions);
                setLoaderVersions(data.loaderVersions);
                if (data.minecraftVersions.length > 0) {
                    setSelectedMcVersion(data.minecraftVersions[0]);
                }
            })
            .catch((error) => {
                console.error(error);
                addError({ key: 'software', message: 'Could not load versions for this software.' });
            })
            .then(() => setVersionsLoading(false));
    }, [selectedSoftware]);

    // Loaders that are per-Minecraft-version (Paper/Purpur builds, Forge, NeoForge)
    // need a second fetch once a Minecraft version is chosen. Fabric's loader list
    // is independent of the game version and is already loaded above.
    const needsVersionScopedLoader = ['paper', 'velocity', 'purpur', 'forge', 'neoforge'].includes(selectedSoftware);

    useEffect(() => {
        if (!selectedSoftware || !selectedMcVersion || !needsVersionScopedLoader) return;

        setLoaderVersions([]);
        setSelectedLoaderVersion('');
        setBuildsLoading(true);

        getSoftwareVersions(uuid, selectedSoftware, selectedMcVersion)
            .then((data) => {
                setLoaderVersions(data.loaderVersions);
                if (data.loaderVersions.length > 0) {
                    setSelectedLoaderVersion(String(data.loaderVersions[0]));
                }
            })
            .catch((error) => {
                console.error(error);
                addError({ key: 'software', message: 'Could not load build/loader versions for this version.' });
            })
            .then(() => setBuildsLoading(false));
    }, [selectedMcVersion]);

    // Fabric's loader list loads once alongside the game versions; just default-select it.
    useEffect(() => {
        if (selectedSoftware === 'fabric' && loaderVersions.length > 0 && !selectedLoaderVersion) {
            setSelectedLoaderVersion(String(loaderVersions[0]));
        }
    }, [loaderVersions, selectedSoftware]);

    const doApply = () => {
        setConfirmOpen(false);
        setApplying(true);
        clearFlashes('software');

        changeSoftware(uuid, selectedSoftware, selectedMcVersion, selectedLoaderVersion || null)
            .then(() => {
                // Refresh which software is "current" now that the egg has changed.
                return getSoftware(uuid);
            })
            .then((data) => {
                setOptions(data.software);
                setCurrentEggId(data.currentEggId);
            })
            .catch((error) => {
                console.error(error);
                addError({ key: 'software', message: 'Could not change server software. See console for details.' });
            })
            .then(() => setApplying(false));
    };

    const selectedOption = options.find((o) => o.key === selectedSoftware);
    const hasLoaderStep = loaderVersions.length > 0;
    const canSubmit = !!selectedSoftware && !!selectedMcVersion && (!hasLoaderStep || !!selectedLoaderVersion);

    if (loading) {
        return <Spinner centered size={Spinner.Size.LARGE} />;
    }

    return (
        <ServerContentBlock title={'Server Software'}>
            <FlashMessageRender byKey={'software'} css={tw`mb-4`} />

            {!enabled ? (
                <TitledGreyBox title={'Software Selector'}>
                    <p css={tw`text-sm text-neutral-300`}>
                        The software selector has been disabled by the panel administrator.
                    </p>
                </TitledGreyBox>
            ) : options.length === 0 ? (
                <TitledGreyBox title={'Software Selector'}>
                    <p css={tw`text-sm text-neutral-300`}>
                        No server software has been configured for this panel yet. Ask an administrator to set up{' '}
                        <code css={tw`bg-neutral-900 rounded px-1`}>config/mc_software.php</code>.
                    </p>
                </TitledGreyBox>
            ) : (
                <div css={tw`relative`}>
                    <SpinnerOverlay visible={applying} size={Spinner.Size.LARGE} />

                    <Dialog.Confirm
                        open={confirmOpen}
                        onClose={() => setConfirmOpen(false)}
                        title={'Change server software?'}
                        confirm={'Yes, delete everything and reinstall'}
                        onConfirmed={doApply}
                    >
                        This will switch this server to <strong>{selectedOption?.label}</strong> {selectedMcVersion}{' '}
                        {selectedLoaderVersion && `(${selectedLoaderVersion})`} and{' '}
                        <strong>permanently delete all files currently on this server</strong>, then reinstall from
                        scratch. This cannot be undone. Make a backup first if you want to keep anything.
                    </Dialog.Confirm>

                    <TitledGreyBox title={'Software Selector'}>
                        <p css={tw`text-sm text-neutral-300 mb-4`}>
                            Choose the server software and version you want this server to run. Applying a change will{' '}
                            <strong>delete all files</strong> on this server and reinstall it from scratch.
                        </p>

                        <div css={tw`grid gap-4 md:grid-cols-3`}>
                            <div>
                                <label css={tw`block text-xs uppercase text-neutral-400 mb-1`}>Software</label>
                                <Select
                                    value={selectedSoftware}
                                    disabled={!canChange}
                                    onChange={(e) => setSelectedSoftware(e.target.value)}
                                >
                                    {Object.keys(CATEGORY_LABELS).map((category) => {
                                        const items = options.filter((o) => o.category === category);
                                        if (items.length === 0) return null;
                                        return (
                                            <optgroup key={category} label={CATEGORY_LABELS[category]}>
                                                {items.map((o) => (
                                                    <option key={o.key} value={o.key}>
                                                        {o.label}
                                                        {o.isCurrent ? ' (current)' : ''}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        );
                                    })}
                                </Select>
                            </div>

                            <div>
                                <label css={tw`block text-xs uppercase text-neutral-400 mb-1`}>Minecraft Version</label>
                                {versionsLoading ? (
                                    <div css={tw`flex items-center h-11`}>
                                        <Spinner size={Spinner.Size.SMALL} />
                                    </div>
                                ) : (
                                    <Select
                                        value={selectedMcVersion}
                                        disabled={!canChange || minecraftVersions.length === 0}
                                        onChange={(e) => setSelectedMcVersion(e.target.value)}
                                    >
                                        {minecraftVersions.length === 0 && <option value=''>Unavailable</option>}
                                        {minecraftVersions.map((v) => (
                                            <option key={v} value={v}>
                                                {v}
                                            </option>
                                        ))}
                                    </Select>
                                )}
                            </div>

                            <div>
                                <label css={tw`block text-xs uppercase text-neutral-400 mb-1`}>
                                    {selectedSoftware === 'vanilla'
                                        ? 'Build'
                                        : ['forge', 'neoforge', 'fabric'].includes(selectedSoftware)
                                        ? 'Loader Version'
                                        : 'Build'}
                                </label>
                                {buildsLoading ? (
                                    <div css={tw`flex items-center h-11`}>
                                        <Spinner size={Spinner.Size.SMALL} />
                                    </div>
                                ) : hasLoaderStep ? (
                                    <Select
                                        value={selectedLoaderVersion}
                                        disabled={!canChange}
                                        onChange={(e) => setSelectedLoaderVersion(e.target.value)}
                                    >
                                        {loaderVersions.map((v) => (
                                            <option key={v} value={v}>
                                                {v}
                                            </option>
                                        ))}
                                    </Select>
                                ) : (
                                    <Select disabled value=''>
                                        <option value=''>N/A</option>
                                    </Select>
                                )}
                            </div>
                        </div>

                        <div css={tw`flex justify-end mt-6`}>
                            {!canChange ? (
                                <p css={tw`text-xs text-neutral-400`}>
                                    You do not have permission to change this server&apos;s software.
                                </p>
                            ) : (
                                <Button.Danger disabled={!canSubmit || applying} onClick={() => setConfirmOpen(true)}>
                                    Apply &amp; Reinstall
                                </Button.Danger>
                            )}
                        </div>
                    </TitledGreyBox>

                    {currentEggId !== null && (
                        <p css={tw`text-xs text-neutral-500 mt-4`}>
                            This server is currently running:{' '}
                            <strong>{options.find((o) => o.isCurrent)?.label ?? 'an unrecognized software'}</strong>
                        </p>
                    )}
                </div>
            )}
        </ServerContentBlock>
    );
};

export default SoftwareContainer;
