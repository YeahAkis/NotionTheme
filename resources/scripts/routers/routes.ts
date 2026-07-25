import { IconProp } from '@fortawesome/fontawesome-svg-core';
import React, { lazy } from 'react';
import ServerConsole from '@/components/server/console/ServerConsoleContainer';
import DatabasesContainer from '@/components/server/databases/DatabasesContainer';
import ScheduleContainer from '@/components/server/schedules/ScheduleContainer';
import UsersContainer from '@/components/server/users/UsersContainer';
import BackupContainer from '@/components/server/backups/BackupContainer';
import NetworkContainer from '@/components/server/network/NetworkContainer';
import StartupContainer from '@/components/server/startup/StartupContainer';
import FileManagerContainer from '@/components/server/files/FileManagerContainer';
import SettingsContainer from '@/components/server/settings/SettingsContainer';
import AccountOverviewContainer from '@/components/dashboard/AccountOverviewContainer';
import AccountApiContainer from '@/components/dashboard/AccountApiContainer';
import AccountSSHContainer from '@/components/dashboard/ssh/AccountSSHContainer';
import ActivityLogContainer from '@/components/dashboard/activity/ActivityLogContainer';
import ServerActivityLogContainer from '@/components/server/ServerActivityLogContainer';
import {
    faBackward,
    faClock,
    faCogs,
    faDatabase,
    faEdit,
    faFolder,
    faGlobe,
    faKey,
    faNetworkWired,
    faPaperclip,
    faPassport,
    faPlayCircle,
    faPuzzlePiece,
    faServer,
    faTerminal,
    faUser,
    faUsers,
} from '@fortawesome/free-solid-svg-icons';

const FileEditContainer = lazy(() => import('@/components/server/files/FileEditContainer'));
const ScheduleEditContainer = lazy(() => import('@/components/server/schedules/ScheduleEditContainer'));
const PlayersContainer = lazy(() => import('@/components/server/players/PlayersContainer'));
const WorldManagerContainer = lazy(() => import('@/components/server/world/WorldManagerContainer'));
const ModPluginManagerContainer = lazy(() => import('@/components/server/mods/ModPluginManagerContainer'));
const SoftwareContainer = lazy(() => import('@/components/server/software/SoftwareContainer'));

interface RouteDefinition {
    path: string;
    name: string | undefined;
    component: React.ComponentType;
    exact?: boolean;
    iconProp?: IconProp;
}

interface ServerRouteDefinition extends RouteDefinition {
    permission: string | string[] | null;
    section?: string;
}

interface Routes {
    account: RouteDefinition[];
    server: ServerRouteDefinition[];
}

export default {
    account: [
        {
            path: '/',
            name: 'Account',
            component: AccountOverviewContainer,
            exact: true,
            iconProp: faUser,
        },
        {
            path: '/api',
            name: 'API Credentials',
            component: AccountApiContainer,
            iconProp: faPassport,
        },
        {
            path: '/ssh',
            name: 'SSH Keys',
            component: AccountSSHContainer,
            iconProp: faKey,
        },
        {
            path: '/activity',
            name: 'Activity',
            component: ActivityLogContainer,
            iconProp: faPaperclip,
        },
    ],
    server: [
        {
            path: '/',
            permission: null,
            name: 'Console',
            component: ServerConsole,
            exact: true,
            iconProp: faTerminal,
            section: 'Overview',
        },
        {
            path: '/files',
            permission: 'file.*',
            name: 'Files',
            component: FileManagerContainer,
            iconProp: faFolder,
            section: 'Overview',
        },
        {
            path: '/files/:action(edit|new)',
            permission: 'file.*',
            name: undefined,
            component: FileEditContainer,
            iconProp: faEdit,
        },
        {
            path: '/databases',
            permission: 'database.*',
            name: 'Databases',
            component: DatabasesContainer,
            iconProp: faDatabase,
            section: 'Overview',
        },
        {
            path: '/schedules',
            permission: 'schedule.*',
            name: 'Schedules',
            component: ScheduleContainer,
            iconProp: faClock,
            section: 'Overview',
        },
        {
            path: '/schedules/:id',
            permission: 'schedule.*',
            name: undefined,
            component: ScheduleEditContainer,
            iconProp: faClock,
        },
        {
            path: '/backups',
            permission: 'backup.*',
            name: 'Backups',
            component: BackupContainer,
            iconProp: faBackward,
            section: 'Overview',
        },
        {
            path: '/players',
            permission: null,
            name: 'Players',
            component: PlayersContainer,
            iconProp: faUsers,
            section: 'Game',
        },
        {
            path: '/worlds',
            permission: null,
            name: 'Worlds',
            component: WorldManagerContainer,
            iconProp: faGlobe,
            section: 'Game',
        },
        {
            path: '/mods',
            permission: 'file.*',
            name: 'Mods & Plugins',
            component: ModPluginManagerContainer,
            iconProp: faPuzzlePiece,
            section: 'Game',
        },
        {
            path: '/users',
            permission: 'user.*',
            name: 'Subusers',
            component: UsersContainer,
            iconProp: faUser,
            section: 'Management',
        },
        {
            path: '/network',
            permission: 'allocation.*',
            name: 'Network',
            component: NetworkContainer,
            iconProp: faNetworkWired,
            section: 'Management',
        },
        {
            path: '/startup',
            permission: 'startup.*',
            name: 'Startup',
            component: StartupContainer,
            iconProp: faPlayCircle,
            section: 'Management',
        },
        {
            path: '/software',
            permission: 'startup.*',
            name: 'Software',
            component: SoftwareContainer,
            iconProp: faServer,
            section: 'Management',
        },
        {
            path: '/settings',
            permission: ['settings.*', 'file.sftp'],
            name: 'Settings',
            component: SettingsContainer,
            iconProp: faCogs,
            section: 'Management',
        },
        {
            path: '/activity',
            permission: 'activity.*',
            name: 'Activity',
            component: ServerActivityLogContainer,
            iconProp: faPaperclip,
            section: 'Management',
        },
    ],
} as Routes;
