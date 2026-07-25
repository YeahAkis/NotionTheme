import React, { useCallback, useEffect, useState } from 'react';
import TitledGreyBox from '@/components/elements/TitledGreyBox';
import tw from 'twin.macro';
import VariableBox from '@/components/server/startup/VariableBox';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import getServerStartup from '@/api/swr/getServerStartup';
import Spinner from '@/components/elements/Spinner';
import { ServerError } from '@/components/elements/ScreenBlock';
import { httpErrorToHuman } from '@/api/http';
import { ServerContext } from '@/state/server';
import { useDeepCompareEffect } from '@/plugins/useDeepCompareEffect';
import Select from '@/components/elements/Select';
import isEqual from 'react-fast-compare';
import Input from '@/components/elements/Input';
import setSelectedDockerImage from '@/api/server/setSelectedDockerImage';
import InputSpinner from '@/components/elements/InputSpinner';
import useFlash from '@/plugins/useFlash';

function tokenizeInvocation(raw: string): React.ReactNode[] {
    const tokens = raw.split(/(\s+)/);
    const nodes: React.ReactNode[] = [];

    let i = 0;
    for (const token of tokens) {
        if (/^\s+$/.test(token)) {
            if (token.includes('\n')) {
                nodes.push(<br key={`br-${i}`} />);
            } else {
                nodes.push(<span key={`ws-${i}`}>{token}</span>);
            }
            i++;
            continue;
        }

        if (token === '\\') {
            nodes.push(
                <span key={`cont-${i}`} style={{ color: '#6b7280' }}>
                    {token}
                </span>
            );
            i++;
            continue;
        }

        if (token.startsWith('-XX:+') || token.startsWith('-XX:-')) {
            const flag = token.startsWith('-XX:+');
            const prefix = flag ? '-XX:+' : '-XX:-';
            nodes.push(
                <span key={`xx-${i}`}>
                    <span style={{ color: '#9ca3af' }}>-XX:</span>
                    <span style={{ color: flag ? '#34d399' : '#f87171' }}>{flag ? '+' : '-'}</span>
                    <span style={{ color: '#e5e7eb' }}>{token.slice(prefix.length)}</span>
                </span>
            );
            i++;
            continue;
        }

        if (token.startsWith('-XX:') && token.includes('=')) {
            const eq = token.indexOf('=');
            const key = token.slice(0, eq);
            const val = token.slice(eq + 1);
            const numVal = /^\d+[gmkGMK]?$/.test(val);
            nodes.push(
                <span key={`xxkv-${i}`}>
                    <span style={{ color: '#9ca3af' }}>{key}</span>
                    <span style={{ color: '#6b7280' }}>=</span>
                    <span style={{ color: numVal ? '#60a5fa' : '#fbbf24' }}>{val}</span>
                </span>
            );
            i++;
            continue;
        }

        if (token.startsWith('-D') && token.includes('=')) {
            const eq = token.indexOf('=');
            const key = token.slice(0, eq);
            const val = token.slice(eq + 1);
            nodes.push(
                <span key={`d-${i}`}>
                    <span style={{ color: '#c084fc' }}>{key}</span>
                    <span style={{ color: '#6b7280' }}>=</span>
                    <span style={{ color: '#fbbf24' }}>{val}</span>
                </span>
            );
            i++;
            continue;
        }

        if (/^-Xm[sx]\w+$/.test(token)) {
            nodes.push(
                <span key={`xm-${i}`}>
                    <span style={{ color: '#9ca3af' }}>{token.slice(0, 4)}</span>
                    <span style={{ color: '#60a5fa' }}>{token.slice(4)}</span>
                </span>
            );
            i++;
            continue;
        }

        if (token.startsWith('-X') || token.startsWith('-D')) {
            nodes.push(
                <span key={`xflag-${i}`} style={{ color: '#c084fc' }}>
                    {token}
                </span>
            );
            i++;
            continue;
        }

        if (token.startsWith('$')) {
            nodes.push(
                <span key={`var-${i}`} style={{ color: '#fbbf24' }}>
                    {token}
                </span>
            );
            i++;
            continue;
        }

        if (/^(&&|\|\||;)$/.test(token)) {
            nodes.push(
                <span key={`op-${i}`} style={{ color: '#f87171' }}>
                    {token}
                </span>
            );
            i++;
            continue;
        }

        if (/^-jar$/.test(token)) {
            nodes.push(
                <span key={`jar-${i}`} style={{ color: '#9ca3af' }}>
                    {token}
                </span>
            );
            i++;
            continue;
        }

        if (/\.jar$/.test(token) || /\.xml$/.test(token) || /\.txt["']?$/.test(token) || /^@/.test(token)) {
            nodes.push(
                <span key={`file-${i}`} style={{ color: '#fbbf24' }}>
                    {token}
                </span>
            );
            i++;
            continue;
        }

        if (/^(java|printf)$/.test(token)) {
            nodes.push(
                <span key={`cmd-${i}`} style={{ color: '#34d399' }}>
                    {token}
                </span>
            );
            i++;
            continue;
        }

        if (/^(true|false)$/i.test(token)) {
            nodes.push(
                <span key={`bool-${i}`} style={{ color: /^true$/i.test(token) ? '#34d399' : '#f87171' }}>
                    {token}
                </span>
            );
            i++;
            continue;
        }

        nodes.push(<span key={`tok-${i}`} style={{ color: '#e5e7eb' }}>{token}</span>);
        i++;
    }

    return nodes;
}

function formatInvocationLines(raw: string): React.ReactNode {
    const segments = raw.split(/(\\)/);
    const result: React.ReactNode[] = [];
    let lineTokens: string[] = [];
    let i = 0;

    for (const seg of segments) {
        if (seg === '\\') {
            result.push(
                <span key={`line-${i}`} style={{ display: 'block' }}>
                    {tokenizeInvocation(lineTokens.join(''))}
                    <span style={{ color: '#4b5563' }}> \</span>
                </span>
            );
            lineTokens = [];
            i++;
        } else {
            lineTokens.push(seg);
        }
    }
    if (lineTokens.length > 0) {
        result.push(
            <span key={`line-last`} style={{ display: 'block' }}>
                {tokenizeInvocation(lineTokens.join(''))}
            </span>
        );
    }
    return <>{result}</>;
}

const CommandModal = ({ invocation, onClose }: { invocation: string; onClose: () => void }) => (
    <>
        <div css={tw`fixed inset-0 bg-black bg-opacity-70 z-40`} onClick={onClose} />
        <div
            css={tw`fixed inset-x-0 bottom-0 z-50 flex items-center justify-center p-4`}
            style={{ top: '3.5rem' }}
            onClick={onClose}
        >
            <div
                css={tw`bg-neutral-900 border border-neutral-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl`}
                onClick={e => e.stopPropagation()}
            >
                <div css={tw`flex items-center justify-between px-6 py-4 border-b border-neutral-700`}>
                    <h2 css={tw`text-lg font-semibold text-neutral-100`}>Startup Command</h2>
                    <button
                        onClick={onClose}
                        css={tw`text-neutral-400 hover:text-neutral-200 text-2xl leading-none`}
                    >
                        ×
                    </button>
                </div>
                <div css={tw`overflow-y-auto p-6`}>
                    <pre
                        css={tw`font-mono text-sm bg-neutral-800 rounded-lg p-4 leading-6`}
                        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                    >
                        {formatInvocationLines(invocation)}
                    </pre>
                </div>
            </div>
        </div>
    </>
);

const StartupContainer = () => {
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const { clearFlashes, clearAndAddHttpError } = useFlash();

    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const variables = ServerContext.useStoreState(
        ({ server }) => ({
            variables: server.data!.variables,
            invocation: server.data!.invocation,
            dockerImage: server.data!.dockerImage,
        }),
        isEqual
    );

    const { data, error, isValidating, mutate } = getServerStartup(uuid, {
        ...variables,
        dockerImages: { [variables.dockerImage]: variables.dockerImage },
    });

    const setServerFromState = ServerContext.useStoreActions((actions) => actions.server.setServerFromState);
    const isCustomImage =
        data &&
        !Object.values(data.dockerImages)
            .map((v) => v.toLowerCase())
            .includes(variables.dockerImage.toLowerCase());

    useEffect(() => {
        mutate();
    }, []);

    useDeepCompareEffect(() => {
        if (!data) return;

        setServerFromState((s) => ({
            ...s,
            invocation: data.invocation,
            variables: data.variables,
        }));
    }, [data]);

    const updateSelectedDockerImage = useCallback(
        (v: React.ChangeEvent<HTMLSelectElement>) => {
            setLoading(true);
            clearFlashes('startup:image');

            const image = v.currentTarget.value;
            setSelectedDockerImage(uuid, image)
                .then(() => setServerFromState((s) => ({ ...s, dockerImage: image })))
                .catch((error) => {
                    console.error(error);
                    clearAndAddHttpError({ key: 'startup:image', error });
                })
                .then(() => setLoading(false));
        },
        [uuid]
    );

    return !data ? (
        !error || (error && isValidating) ? (
            <Spinner centered size={Spinner.Size.LARGE} />
        ) : (
            <ServerError title={'Oops!'} message={httpErrorToHuman(error)} onRetry={() => mutate()} />
        )
    ) : (
        <ServerContentBlock title={'Startup Settings'} showFlashKey={'startup:image'}>
            {modalOpen && (
                <CommandModal invocation={data.invocation} onClose={() => setModalOpen(false)} />
            )}
            <div css={tw`md:flex`}>
                <TitledGreyBox title={'Startup Command'} css={tw`flex-1 min-w-0`}>
                    <div css={tw`px-1 py-2`}>
                        <div
                            css={tw`font-mono bg-neutral-900 rounded py-2 px-4 overflow-auto max-w-full`}
                            style={{ maxHeight: '12rem' }}
                        >
                            <pre
                                css={tw`text-sm leading-6 m-0`}
                                style={{ whiteSpace: 'pre', minWidth: 'max-content' }}
                            >
                                {formatInvocationLines(data.invocation)}
                            </pre>
                        </div>
                        <div css={tw`flex justify-end mt-2`}>
                            <button
                                onClick={() => setModalOpen(true)}
                                css={tw`text-xs text-neutral-400 hover:text-neutral-200 transition-colors`}
                            >
                                Expand ↗
                            </button>
                        </div>
                    </div>
                </TitledGreyBox>
                <TitledGreyBox title={'Docker Image'} css={tw`flex-1 lg:flex-none lg:w-1/3 mt-8 md:mt-0 md:ml-10`}>
                    {Object.keys(data.dockerImages).length > 1 && !isCustomImage ? (
                        <>
                            <InputSpinner visible={loading}>
                                <Select
                                    disabled={Object.keys(data.dockerImages).length < 2}
                                    onChange={updateSelectedDockerImage}
                                    defaultValue={variables.dockerImage}
                                >
                                    {Object.keys(data.dockerImages).map((key) => (
                                        <option key={data.dockerImages[key]} value={data.dockerImages[key]}>
                                            {key}
                                        </option>
                                    ))}
                                </Select>
                            </InputSpinner>
                            <p css={tw`text-xs text-neutral-300 mt-2`}>
                                This is an advanced feature allowing you to select a Docker image to use when running
                                this server instance.
                            </p>
                        </>
                    ) : (
                        <>
                            <Input disabled readOnly value={variables.dockerImage} />
                            {isCustomImage && (
                                <p css={tw`text-xs text-neutral-300 mt-2`}>
                                    This {"server's"} Docker image has been manually set by an administrator and cannot
                                    be changed through this UI.
                                </p>
                            )}
                        </>
                    )}
                </TitledGreyBox>
            </div>
            <h3 css={tw`mt-8 mb-2 text-2xl`}>Variables</h3>
            <div css={tw`grid gap-8 md:grid-cols-2`}>
                {data.variables.map((variable) => (
                    <VariableBox key={variable.envVariable} variable={variable} />
                ))}
            </div>
        </ServerContentBlock>
    );
};

export default StartupContainer;