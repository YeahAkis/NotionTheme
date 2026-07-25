import React, { useEffect, useState } from 'react';
import { httpErrorToHuman } from '@/api/http';
import { CSSTransition } from 'react-transition-group';
import Spinner from '@/components/elements/Spinner';
import FileObjectRow from '@/components/server/files/FileObjectRow';
import FileManagerBreadcrumbs from '@/components/server/files/FileManagerBreadcrumbs';
import { FileObject } from '@/api/server/files/loadDirectory';
import NewDirectoryButton from '@/components/server/files/NewDirectoryButton';
import { NavLink, useLocation } from 'react-router-dom';
import Can from '@/components/elements/Can';
import { ServerError } from '@/components/elements/ScreenBlock';
import tw from 'twin.macro';
import { Button } from '@/components/elements/button/index';
import { ServerContext } from '@/state/server';
import useFileManagerSwr from '@/plugins/useFileManagerSwr';
import FileManagerStatus from '@/components/server/files/FileManagerStatus';
import MassActionsBar from '@/components/server/files/MassActionsBar';
import UploadButton from '@/components/server/files/UploadButton';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import { useStoreActions } from '@/state/hooks';
import ErrorBoundary from '@/components/elements/ErrorBoundary';
import { FileActionCheckbox } from '@/components/server/files/SelectFileCheckbox';
import { hashToPath } from '@/helpers';
import style from './style.module.css';

type SortField = 'name' | 'size' | 'modified';
type SortDir = 'asc' | 'desc';

interface SortState {
    field: SortField;
    dir: SortDir;
}

function sortFiles(files: FileObject[], sort: SortState): FileObject[] {
    const seen = new Set<string>();
    const unique = files.filter(f => {
        if (seen.has(f.name)) return false;
        seen.add(f.name);
        return true;
    });

    return [...unique].sort((a, b) => {
        if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;

        let cmp = 0;
        if (sort.field === 'name') {
            cmp = a.name.localeCompare(b.name);
        } else if (sort.field === 'size') {
            cmp = a.size - b.size;
        } else if (sort.field === 'modified') {
            cmp = a.modifiedAt.getTime() - b.modifiedAt.getTime();
        }

        return sort.dir === 'asc' ? cmp : -cmp;
    });
}

const ColHeader = ({
    field,
    label,
    current,
    onClick,
    css: cssProp,
}: {
    field: SortField;
    label: string;
    current: SortState;
    onClick: (field: SortField) => void;
    css?: any;
}) => {
    const active = current.field === field;
    const arrow = active ? (current.dir === 'asc' ? ' ↑' : ' ↓') : '';
    return (
        <button
            onClick={() => onClick(field)}
            css={cssProp}
            style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: '0.7rem',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: active ? '#a78bfa' : 'rgba(255,255,255,0.25)',
                transition: 'color 0.15s',
                userSelect: 'none',
                whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
                if (!active)
                    (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)';
            }}
            onMouseLeave={e => {
                if (!active)
                    (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.25)';
            }}
        >
            {label}
            {arrow}
        </button>
    );
};

export default () => {
    const id = ServerContext.useStoreState(state => state.server.data!.id);
    const { hash } = useLocation();
    const { data: files, error, mutate } = useFileManagerSwr();
    const directory = ServerContext.useStoreState(state => state.files.directory);
    const clearFlashes = useStoreActions(actions => actions.flashes.clearFlashes);
    const setDirectory = ServerContext.useStoreActions(actions => actions.files.setDirectory);
    const setSelectedFiles = ServerContext.useStoreActions(actions => actions.files.setSelectedFiles);
    const selectedFilesLength = ServerContext.useStoreState(
        state => state.files.selectedFiles.length,
    );

    const [sort, setSort] = useState<SortState>(() => {
        try {
            const saved = localStorage.getItem('file-manager-sort');
            return saved ? JSON.parse(saved) : { field: 'name', dir: 'asc' };
        } catch {
            return { field: 'name', dir: 'asc' };
        }
    });

    const handleSort = (field: SortField) => {
        setSort(prev => {
            const next: SortState =
                prev.field === field
                    ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                    : { field, dir: 'asc' };
            try {
                localStorage.setItem('file-manager-sort', JSON.stringify(next));
            } catch {
                // ignore
            }
            return next;
        });
    };

    useEffect(() => {
        clearFlashes('files');
        setSelectedFiles([]);
        setDirectory(hashToPath(hash));
    }, [hash]);

    useEffect(() => {
        mutate();
    }, [directory]);

    const onSelectAllClick = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedFiles(e.currentTarget.checked ? files?.map(file => file.name) || [] : []);
    };

    if (error) {
        return <ServerError message={httpErrorToHuman(error)} onRetry={() => mutate()} />;
    }

    const sorted = files ? sortFiles(files.slice(0, 250), sort) : [];

    return (
        <ServerContentBlock title={'File Manager'} showFlashKey={'files'}>
            <ErrorBoundary>
                <div className={'flex flex-wrap-reverse md:flex-nowrap mb-4'}>
                    <FileManagerBreadcrumbs
                        renderLeft={
                            <FileActionCheckbox
                                type={'checkbox'}
                                css={tw`mx-4`}
                                checked={
                                    selectedFilesLength ===
                                    (files?.length === 0 ? -1 : files?.length)
                                }
                                onChange={onSelectAllClick}
                            />
                        }
                    />
                    <Can action={'file.create'}>
                        <div className={style.manager_actions}>
                            <FileManagerStatus />
                            <NewDirectoryButton />
                            <UploadButton />
                            <NavLink to={`/server/${id}/files/new${window.location.hash}`}>
                                <Button>New File</Button>
                            </NavLink>
                        </div>
                    </Can>
                </div>
            </ErrorBoundary>

            {!files ? (
                <Spinner size={'large'} centered />
            ) : (
                <>
                    {!files.length ? (
                        <p css={tw`text-sm text-neutral-400 text-center`}>
                            This directory seems to be empty.
                        </p>
                    ) : (
                        <CSSTransition classNames={'fade'} timeout={150} appear in>
                            <div>
                                <div css={tw`flex items-center text-neutral-400 mb-px px-4 py-1`}>
                                    <div css={tw`w-8 flex-shrink-0`} />
                                    <div css={tw`flex-none ml-6 mr-4 w-4`} />
                                    <div css={tw`flex-1 overflow-hidden`}>
                                        <ColHeader
                                            field={'name'}
                                            label={'Name'}
                                            current={sort}
                                            onClick={handleSort}
                                        />
                                    </div>
                                    <div css={tw`w-1/6 text-right mr-4 hidden sm:flex justify-end`}>
                                        <ColHeader
                                            field={'size'}
                                            label={'Size'}
                                            current={sort}
                                            onClick={handleSort}
                                        />
                                    </div>
                                    <div css={tw`w-1/5 text-right mr-4 hidden md:flex justify-end`}>
                                        <ColHeader
                                            field={'modified'}
                                            label={'Modified'}
                                            current={sort}
                                            onClick={handleSort}
                                        />
                                    </div>
                                    <div css={tw`w-6 flex-shrink-0`} />
                                </div>

                                {files.length > 250 && (
                                    <div css={tw`rounded bg-yellow-400 mb-px p-3`}>
                                        <p css={tw`text-yellow-900 text-sm text-center`}>
                                            This directory is too large to display in the browser,
                                            limiting the output to the first 250 files.
                                        </p>
                                    </div>
                                )}

                                {sorted.map(file => (
                                    <FileObjectRow key={file.key} file={file} />
                                ))}
                                <MassActionsBar />
                            </div>
                        </CSSTransition>
                    )}
                </>
            )}
        </ServerContentBlock>
    );
};