import TransferListener from '@/components/server/TransferListener';
import React, { useEffect, useState } from 'react';
import { NavLink, Route, Switch, useRouteMatch } from 'react-router-dom';
import NavigationBar from '@/components/NavigationBar';
import TransitionRouter from '@/TransitionRouter';
import WebsocketHandler from '@/components/server/WebsocketHandler';
import { ServerContext } from '@/state/server';
import { CSSTransition } from 'react-transition-group';
import Can from '@/components/elements/Can';
import Spinner from '@/components/elements/Spinner';
import { NotFound, ServerError } from '@/components/elements/ScreenBlock';
import { httpErrorToHuman } from '@/api/http';
import { useStoreState } from 'easy-peasy';
import InstallListener from '@/components/server/InstallListener';
import ErrorBoundary from '@/components/elements/ErrorBoundary';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons';
import { useLocation } from 'react-router';
import ConflictStateRenderer from '@/components/server/ConflictStateRenderer';
import PermissionRoute from '@/components/elements/PermissionRoute';
import routes from '@/routers/routes';
import Sidebar from '@/components/Sidebar';
import { IconProp } from '@fortawesome/fontawesome-svg-core';

function useCollapsedSections() {
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
        try {
            return JSON.parse(localStorage.getItem('sidebar-collapsed') || '{}');
        } catch {
            return {};
        }
    });

    const toggle = (section: string) => {
        setCollapsed(prev => {
            const next = { ...prev, [section]: !prev[section] };
            try {
                localStorage.setItem('sidebar-collapsed', JSON.stringify(next));
            } catch {
                // ignore
            }
            return next;
        });
    };

    return { collapsed, toggle };
}

export default () => {
    const match = useRouteMatch<{ id: string }>();
    const location = useLocation();

    const rootAdmin = useStoreState(state => state.user.data!.rootAdmin);
    const [error, setError] = useState('');

    const id = ServerContext.useStoreState(state => state.server.data?.id);
    const uuid = ServerContext.useStoreState(state => state.server.data?.uuid);
    const inConflictState = ServerContext.useStoreState(state => state.server.inConflictState);
    const serverId = ServerContext.useStoreState(state => state.server.data?.internalId);
    const getServer = ServerContext.useStoreActions(actions => actions.server.getServer);
    const clearServerState = ServerContext.useStoreActions(actions => actions.clearServerState);
    const { collapsed, toggle } = useCollapsedSections();

    const to = (value: string, url = false) => {
        if (value === '/') {
            return url ? match.url : match.path;
        }
        return `${(url ? match.url : match.path).replace(/\/*$/, '')}/${value.replace(/^\/+/, '')}`;
    };

    useEffect(
        () => () => {
            clearServerState();
        },
        [],
    );

    useEffect(() => {
        setError('');
        getServer(match.params.id).catch(error => {
            console.error(error);
            setError(httpErrorToHuman(error));
        });
        return () => {
            clearServerState();
        };
    }, [match.params.id]);

    const namedRoutes = routes.server.filter(route => !!route.name);
    const sectionOrder: string[] = [];
    const sectionMap: Record<string, typeof namedRoutes> = {};
    for (const route of namedRoutes) {
        const sec = route.section ?? 'Other';
        if (!sectionMap[sec]) {
            sectionMap[sec] = [];
            sectionOrder.push(sec);
        }
        sectionMap[sec].push(route);
    }

    const renderNavLink = (route: (typeof namedRoutes)[0]) => {
        const inner = (
            <>
                <div className={'icon'}>
                    <FontAwesomeIcon icon={route.iconProp as IconProp} />
                </div>
                {route.name}
            </>
        );

        if (route.permission) {
            return (
                <Can key={route.path} action={route.permission} matchAny>
                    <NavLink to={to(route.path, true)} exact={route.exact}>
                        {inner}
                    </NavLink>
                </Can>
            );
        }

        return (
            <NavLink key={route.path} to={to(route.path, true)} exact={route.exact}>
                {inner}
            </NavLink>
        );
    };

    return (
        <React.Fragment key={'server-router'}>
            <NavigationBar />
            {!uuid || !id ? (
                error ? (
                    <ServerError message={error} />
                ) : (
                    <Spinner size={'large'} centered />
                )
            ) : (
                <>
                    <CSSTransition timeout={150} classNames={'fade'} appear in>
                        <Sidebar>
                            {sectionOrder.map(section => {
                                const isCollapsed = !!collapsed[section];
                                return (
                                    <div key={section} className={'sidebar-section'}>
                                        <button
                                            className={'sidebar-section-header'}
                                            onClick={() => toggle(section)}
                                        >
                                            <span className={'sidebar-section-label'}>{section}</span>
                                            <span
                                                className={'sidebar-section-chevron'}
                                                style={{
                                                    transform: isCollapsed
                                                        ? 'rotate(-90deg)'
                                                        : 'rotate(0deg)',
                                                    transition: 'transform 0.2s ease-in-out',
                                                    display: 'inline-flex',
                                                }}
                                            >
                                                <FontAwesomeIcon icon={faChevronDown} />
                                            </span>
                                        </button>
                                        <div
                                            style={{
                                                overflow: 'hidden',
                                                maxHeight: isCollapsed ? 0 : '600px',
                                                opacity: isCollapsed ? 0 : 1,
                                                transition:
                                                    'max-height 0.22s ease-in-out, opacity 0.18s ease-in-out',
                                            }}
                                        >
                                            {sectionMap[section].map(renderNavLink)}
                                        </div>
                                    </div>
                                );
                            })}
                            {rootAdmin && (
                                // eslint-disable-next-line react/jsx-no-target-blank
                                <a href={`/admin/servers/view/${serverId}`} target={'_blank'}>
                                    <div className={'icon'}>
                                        <FontAwesomeIcon icon={faExternalLinkAlt} />
                                    </div>
                                    Admin
                                </a>
                            )}
                        </Sidebar>
                    </CSSTransition>
                    <InstallListener />
                    <TransferListener />
                    <WebsocketHandler />
                    {inConflictState &&
                    (!rootAdmin || (rootAdmin && !location.pathname.endsWith(`/server/${id}`))) ? (
                        <ConflictStateRenderer />
                    ) : (
                        <ErrorBoundary>
                            <TransitionRouter>
                                <Switch location={location}>
                                    {routes.server.map(({ path, permission, component: Component }) => (
                                        <PermissionRoute
                                            key={path}
                                            permission={permission}
                                            path={to(path)}
                                            exact
                                        >
                                            <Spinner.Suspense>
                                                <Component />
                                            </Spinner.Suspense>
                                        </PermissionRoute>
                                    ))}
                                    <Route path={'*'} component={NotFound} />
                                </Switch>
                            </TransitionRouter>
                        </ErrorBoundary>
                    )}
                </>
            )}
        </React.Fragment>
    );
};