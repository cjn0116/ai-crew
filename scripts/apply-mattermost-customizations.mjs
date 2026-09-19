import {cp, readFile, rm, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const rootImportAnchor = "const TeamController = makeAsyncComponent('TeamController', lazy(() => import('components/team_controller')));";
const aiCrewImport = "const AiCrewConsole = makeAsyncComponent('AiCrewConsole', lazy(() => import('components/ai_crew')));";
const rootRouteAnchor = `                    <Route
                        path={'/error'}
                        component={ErrorPage}
                    />`;
const aiCrewRoute = `                    <LoggedInRoute
                        path={'/ai-crew'}
                        component={AiCrewConsole}
                    />`;
const sharedProductMenu = `// AI Crew: shared two-product menu, matching the Mattermost switcher.
import React from 'react';
import {useSelector} from 'react-redux';
import {getLicense} from 'mattermost-redux/selectors/entities/general';
import {LicenseSkus} from 'utils/constants';
import ProductSwitcher from 'components/ai_crew/product_switcher';
import ProductBranding from './product_branding';
import ProductBrandingFreeEdition from './product_branding_team_edition';

export default function ProductMenu() {
    const license = useSelector(getLicense);
    const free = license.IsLicensed === 'false' || license.SkuShortName === LicenseSkus.Entry;
    return <ProductSwitcher branding={free ? <ProductBrandingFreeEdition/> : <ProductBranding/>}/>;
}
`;
const imageLoaderAnchor = `                use: [
                    {
                        loader: 'image-webpack-loader',
                        options: {},
                    },
                ],`;
const conditionalImageLoader = `                use: process.env.AI_CREW_SKIP_IMAGE_OPTIMIZATION === '1' ? [] : [
                    {
                        loader: 'image-webpack-loader',
                        options: {},
                    },
                ],`;
const rootRestrictedRouteMarker = 'const isAiCrewSupportedPlugin = ({pluginId}: {pluginId: string}) => !aiCrewUnsupportedPluginIds.has(pluginId);';
const legacyRootSupportedPluginFilter = 'const isAiCrewSupportedPlugin = ({pluginId}) => !aiCrewUnsupportedPluginIds.has(pluginId);';
const rootAdminImport = "const AdminConsole = makeAsyncComponent('AdminConsole', lazy(() => import('components/admin_console')));";
const rootAdminRoute = `                    <Route
                        path={'/admin_console'}
                    >
                        <Switch>
                            <LoggedInRoute
                                path={'/admin_console'}
                                component={AdminConsole}
                            />
                            <RootRedirect/>
                        </Switch>
                    </Route>`;
const rootIntegrationsRedirect = `                    <Redirect
                        from={'/_redirect/integrations/:subpath*'}
                        to={\`/\${this.props.permalinkRedirectTeamName}/integrations/:subpath*\`}
                    />`;
const rootProductsAnchor = '                                {this.props.products?.map((product) => (';
const rootPublicProductsAnchor = '                                {this.props.products?.filter((product) => Boolean(product.publicComponent)).map((product) => (';
const rootRestrictedPublicProducts = '                                {this.props.products?.filter((product) => Boolean(product.publicComponent)).filter(isAiCrewSupportedPlugin).map((product) => (';
const rootPluginsAnchor = '                                {this.props.plugins?.map((plugin) => (';
const rootPluginAnchor = 'const Pluggable = makeAsyncPluggableComponent();';
const rootTeamControllerIntegrationsAnchor = '(channels|messages|threads|drafts|integrations|emoji|${SCHEDULED_POST_URL_SUFFIX})';
const rootSupportedPluginFilter = `const aiCrewUnsupportedPluginIds = new Set(['playbooks', 'focalboard', 'com.mattermost.calls']);
const isAiCrewSupportedPlugin = ({pluginId}: {pluginId: string}) => !aiCrewUnsupportedPluginIds.has(pluginId);`;
const teamControllerRouterImport = "import {Route, Switch, useHistory, useParams} from 'react-router-dom';";
const teamControllerAsyncImport = "import {makeAsyncComponent, makeAsyncPluggableComponent} from 'components/async_load';";
const teamControllerBackstageImport = "const BackstageController = makeAsyncComponent('BackstageController', lazy(() => import('components/backstage')));";
const teamControllerPluggable = 'const Pluggable = makeAsyncPluggableComponent();';
const teamControllerUnsupportedRoutes = `            <Route
                path={\`/:team(\${TEAM_NAME_PATH_PATTERN})/integrations\`}
                component={BackstageController}
            />
            <Route
                path={\`/:team(\${TEAM_NAME_PATH_PATTERN})/emoji\`}
                component={BackstageController}
            />
            {props.plugins?.map((plugin) => (
                <Route
                    key={plugin.id}
                    path={\`/:team(\${TEAM_NAME_PATH_PATTERN})/\` + (plugin as any).route}
                    render={() => (
                        <Pluggable
                            pluggableName={'NeedsTeamComponent'}
                            pluggableId={plugin.id}
                            css={{gridArea: 'center'}}
                        />
                    )}
                />
            ))}
`;
const teamControllerRestrictedRouteMarker = '{/* AI Crew: team, channel and direct-message routes only. */}';
const trimmedSidebarTeamMenu = `// AI Crew: team and member actions supported by ai-crew.
import React, {useCallback} from 'react';
import {FormattedMessage} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {useHistory} from 'react-router-dom';

import {
    AccountMultipleOutlineIcon,
    AccountMultiplePlusOutlineIcon,
    MessagePlusOutlineIcon,
    PlusIcon,
} from '@mattermost/compass-icons/components';
import type {Team} from '@mattermost/types/teams';

import {Permissions} from 'mattermost-redux/constants';
import {haveICurrentTeamPermission} from 'mattermost-redux/selectors/entities/roles';
import {haveISystemPermission} from 'mattermost-redux/selectors/entities/roles_helpers';

import {openModal} from 'actions/views/modals';

import InvitationModal from 'components/invitation_modal';
import * as Menu from 'components/menu';
import TeamMembersModal from 'components/team_members_modal';

import {ModalIdentifiers} from 'utils/constants';

import type {GlobalState} from 'types/store';

interface Props {
    currentTeam: Team;
}

export default function SidebarTeamMenu(props: Props) {
    const havePermissionToCreateTeam = useSelector((state: GlobalState) => haveISystemPermission(state, {permission: Permissions.CREATE_TEAM}));
    const havePermissionToAddUserToTeam = useSelector((state: GlobalState) => haveICurrentTeamPermission(state, Permissions.ADD_USER_TO_TEAM));
    const tooltipText = props.currentTeam.description ? props.currentTeam.description : props.currentTeam.display_name;

    return (
        <Menu.Container
            menuButton={{
                id: 'sidebarTeamMenuButton',
                class: 'btn btn-sm btn-quaternary btn-inverted',
                children: (
                    <>
                        <span>{props.currentTeam.display_name}</span>
                        <i className='icon icon-chevron-down'/>
                    </>
                ),
            }}
            menuButtonTooltip={{
                text: tooltipText,
            }}
            menu={{
                id: 'sidebarTeamMenu',
            }}
        >
            {havePermissionToAddUserToTeam && <InvitePeopleMenuItem/>}
            <ManageViewMembersMenuItem/>
            <Menu.Separator/>
            <JoinAnotherTeamMenuItem/>
            {havePermissionToCreateTeam && <CreateTeamMenuItem/>}
        </Menu.Container>
    );
}

function InvitePeopleMenuItem(props: Menu.FirstMenuItemProps) {
    const dispatch = useDispatch();

    const handleClick = useCallback(() => {
        dispatch(openModal({
            modalId: ModalIdentifiers.INVITATION,
            dialogType: InvitationModal,
            dialogProps: {
                focusOriginElement: 'sidebarTeamMenuButton',
            },
        }));
    }, [dispatch]);

    return (
        <Menu.Item
            onClick={handleClick}
            leadingElement={<AccountMultiplePlusOutlineIcon size={18} aria-hidden='true'/>}
            labels={<FormattedMessage id='sidebarLeft.teamMenu.invitePeopleMenuItem.primaryLabel' defaultMessage='Invite people'/>}
            aria-haspopup='dialog'
            {...props}
        />
    );
}

function ManageViewMembersMenuItem(props: Menu.FirstMenuItemProps) {
    const dispatch = useDispatch();

    const handleClick = useCallback(() => {
        dispatch(openModal({
            modalId: ModalIdentifiers.TEAM_MEMBERS,
            dialogType: TeamMembersModal,
            dialogProps: {
                focusOriginElement: 'sidebarTeamMenuButton',
            },
        }));
    }, [dispatch]);

    return (
        <Menu.Item
            leadingElement={<AccountMultipleOutlineIcon size={18} aria-hidden='true'/>}
            onClick={handleClick}
            labels={<FormattedMessage id='sidebarLeft.teamMenu.viewMembersMenuItem.primaryLabel' defaultMessage='View members'/>}
            aria-haspopup='dialog'
            {...props}
        />
    );
}

function JoinAnotherTeamMenuItem() {
    const history = useHistory();
    const handleClick = useCallback(() => history.push('/select_team'), [history]);

    return (
        <Menu.Item
            leadingElement={<MessagePlusOutlineIcon size={18} aria-hidden='true'/>}
            onClick={handleClick}
            labels={<FormattedMessage id='sidebarLeft.teamMenu.joinAnotherTeamMenuItem.primaryLabel' defaultMessage='Join another team'/>}
        />
    );
}

function CreateTeamMenuItem() {
    const history = useHistory();
    const handleClick = useCallback(() => history.push('/create_team'), [history]);

    return (
        <Menu.Item
            leadingElement={<PlusIcon size={18} aria-hidden='true'/>}
            onClick={handleClick}
            labels={<FormattedMessage id='sidebarLeft.teamMenu.createTeamMenuItem.primaryLabel' defaultMessage='Create a team'/>}
        />
    );
}
`;
const trimmedRightControls = `// AI Crew: preserve only native message navigation controls.
import React from 'react';
import styled from 'styled-components';

import type {ProductIdentifier} from '@mattermost/types/products';

import {isChannels} from 'utils/products';

import AtMentionsButton from './at_mentions_button/at_mentions_button';
import SavedPostsButton from './saved_posts_button/saved_posts_button';

const RightControlsContainer = styled.div\`
    display: flex;
    align-items: center;
    height: 40px;
    flex-shrink: 0;
    position: relative;
    flex-basis: 30%;
    justify-content: flex-end;

    > * + * {
        margin-left: 8px;
    }
\`;

export type Props = {
    productId?: ProductIdentifier;
}

const RightControls = ({productId = null}: Props): JSX.Element => {
    return (
        <RightControlsContainer id={'RightControlsContainer'}>
            {isChannels(productId) && (
                <>
                    <AtMentionsButton/>
                    <SavedPostsButton/>
                </>
            )}
        </RightControlsContainer>
    );
};

export default RightControls;
`;
const trimmedAppBar = `// AI Crew: hide plugin-only app bar entry points.
export default function AppBar() {
    return null;
}
`;
const postActionsMenuMarker = '// AI Crew: post actions are unavailable.';
const legacyPostActionsMenuMarker = '// AI Crew: plugins, apps, and marketplace are unavailable from post actions.';
const channelHeaderRestrictedMarker = '{/* AI Crew: plugin and call controls are unavailable in channel headers. */}';
const mobileChannelHeaderPluginsMarker = '// AI Crew: plugin and app buttons are unavailable in mobile channel headers.';
const centerChannelPlaybooksMarker = '{/* AI Crew: playbook runner route is unavailable. */}';
const legacyCenterChannelPlaybooksMarker = '// AI Crew: playbook runner route is unavailable.';
const profilePopoverOtherUserRowMarker = '{/* AI Crew: calls are unavailable from profile popovers. */}';
const postOptionsPluginActionsMarker = '// AI Crew: plugin post actions are unavailable.';
const sidebarSettingsShortcutMarker = '// AI Crew: native user settings shortcut is unavailable.';
const trimmedPostActionsMenu = `// AI Crew: post actions are unavailable.
import React from 'react';
import type {IntlShape} from 'react-intl';
import {injectIntl} from 'react-intl';

import type {AppBinding} from '@mattermost/types/apps';
import type {Post} from '@mattermost/types/posts';

import type {ActionResult} from 'mattermost-redux/types/actions';

import {Locations} from 'utils/constants';

import type {ModalData} from 'types/actions';
import type {HandleBindingClick, OpenAppsModal, PostEphemeralCallResponseForPost} from 'types/apps';
import type {PostDropdownMenuAction, PostDropdownMenuItemComponent} from 'types/store/plugins';

export const PLUGGABLE_COMPONENT = 'PostDropdownMenuItem';

export type Props = {
    appBindings: AppBinding[] | null;
    appsEnabled: boolean;
    handleDropdownOpened: (open: boolean) => void;
    intl: IntlShape;
    isMenuOpen: boolean;
    isSysAdmin: boolean;
    location?: 'CENTER' | 'RHS_ROOT' | 'RHS_COMMENT' | 'SEARCH' | string;
    pluginMenuItems?: PostDropdownMenuAction[];
    post: Post;
    teamId: string;
    canOpenMarketplace: boolean;
    pluginMenuItemComponents: PostDropdownMenuItemComponent[];
    actions: {
        openModal: <P>(modalData: ModalData<P>) => void;
        postEphemeralCallResponseForPost: PostEphemeralCallResponseForPost;
        handleBindingClick: HandleBindingClick;
        openAppsModal: OpenAppsModal;
        fetchBindings: (channelId: string, teamId: string) => Promise<ActionResult<AppBinding[]>>;
    };
}

export class ActionMenuClass extends React.PureComponent<Props> {
    public static defaultProps: Partial<Props> = {
        appBindings: [],
        location: Locations.CENTER,
        pluginMenuItems: [],
    };

    render(): null {
        return null;
    }
}

export default injectIntl(ActionMenuClass);
`;
const trimmedMobileChannelHeaderPlugins = `// AI Crew: plugin and app buttons are unavailable in mobile channel headers.
import React, {memo} from 'react';

import type {Channel} from '@mattermost/types/channels';

type Props = {
    channel: Channel;
    isDropdown: boolean;
}

const MobileChannelHeaderPlugins = (_props: Props): null => {
    return null;
};

export {MobileChannelHeaderPlugins as RawMobileChannelHeaderPlug};

export default memo(MobileChannelHeaderPlugins);
`;
const trimmedProfilePopoverSelfUserRow = `// AI Crew: retain self-DM access without native account settings.
import React from 'react';
import {FormattedMessage, useIntl} from 'react-intl';

import WithTooltip from 'components/with_tooltip';

type Props = {
    userId: string;
    currentUserId: string;
    haveOverrideProp: boolean;
    hide?: () => void;
    returnFocus: () => void;
    handleCloseModals: () => void;
    handleShowDirectChannel: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const ProfilePopoverSelfUserRow = ({
    userId,
    currentUserId,
    haveOverrideProp,
    handleShowDirectChannel,
}: Props) => {
    const {formatMessage} = useIntl();

    if (userId !== currentUserId || haveOverrideProp) {
        return null;
    }

    return (
        <div className='user-popover__bottom-row-container'>
            <WithTooltip
                title={formatMessage({id: 'user_profile.send.dm.yourself', defaultMessage: 'Send yourself a message'})}
            >
                <button
                    type='button'
                    className='btn btn-icon btn-sm'
                    onClick={handleShowDirectChannel}
                    aria-label={formatMessage({id: 'user_profile.send.dm.yourself', defaultMessage: 'Send yourself a message'})}
                >
                    <i className='icon icon-send' aria-hidden='true'/>
                    <FormattedMessage id='user_profile.send.dm.yourself' defaultMessage='Send yourself a message'/>
                </button>
            </WithTooltip>
        </div>
    );
};

export default ProfilePopoverSelfUserRow;
`;

function injectOnce(source, marker, anchor, replacement, errorMessage) {
  if (source.includes(marker)) {
    return source;
  }
  if (!source.includes(anchor)) {
    throw new Error(errorMessage);
  }
  return source.replace(anchor, replacement);
}

export function patchRootRoutes(source) {
  const withImport = injectOnce(
    source,
    aiCrewImport,
    rootImportAnchor,
    `${aiCrewImport}\n${rootImportAnchor}`,
    'Mattermost root import anchor not found',
  );
  // Migrate the old nested route as well as supporting a pristine upstream.
  const withoutRoute = withImport.replace(/^[ \t]*<LoggedInRoute\s+path=\{'\/ai-crew'\}\s+component=\{AiCrewConsole\}\s*\/>\n?/gm, '');
  const withRoute = injectOnce(
    withoutRoute,
    "path={'/ai-crew'}",
    rootRouteAnchor,
    `${aiCrewRoute}\n${rootRouteAnchor}`,
    'Mattermost root route anchor not found',
  );
  return patchUnsupportedRootRoutes(withRoute);
}

function patchUnsupportedRootRoutes(source) {
  const anchors = [
    rootAdminImport,
    rootAdminRoute,
    rootIntegrationsRedirect,
    rootProductsAnchor,
    rootPluginsAnchor,
    rootPluginAnchor,
    rootTeamControllerIntegrationsAnchor,
  ];
  if (!anchors.some((anchor) => source.includes(anchor))) {
    return source;
  }

  let patched = source;
  if (!patched.includes(rootRestrictedRouteMarker)) {
    if (patched.includes(legacyRootSupportedPluginFilter)) {
      patched = patched.replace(legacyRootSupportedPluginFilter, rootRestrictedRouteMarker);
    } else {
      for (const anchor of anchors) {
        if (!patched.includes(anchor)) {
          throw new Error('Mattermost unsupported route anchor not found');
        }
      }
      patched = patched
        .replace(rootAdminImport, '')
        .replace(rootAdminRoute, '')
        .replace(rootIntegrationsRedirect, '')
        .replace(rootPluginAnchor, `${rootPluginAnchor}\n${rootSupportedPluginFilter}`)
        .replace(rootProductsAnchor, '                                {this.props.products?.filter(isAiCrewSupportedPlugin).map((product) => (')
        .replace(rootPluginsAnchor, '                                {this.props.plugins?.filter(isAiCrewSupportedPlugin).map((plugin) => (')
        .replace(rootTeamControllerIntegrationsAnchor, '(channels|messages|threads|drafts|emoji|${SCHEDULED_POST_URL_SUFFIX})');
    }
  }

  if (patched.includes(rootRestrictedPublicProducts)) {
    return patched;
  }
  if (!patched.includes(rootPublicProductsAnchor)) {
    throw new Error('Mattermost public product route anchor not found');
  }
  return patched.replace(rootPublicProductsAnchor, rootRestrictedPublicProducts);
}

export function patchTeamController(source) {
  if (source.includes(teamControllerRestrictedRouteMarker)) {
    return source;
  }
  for (const anchor of [
    teamControllerRouterImport,
    teamControllerAsyncImport,
    teamControllerBackstageImport,
    teamControllerPluggable,
    teamControllerUnsupportedRoutes,
  ]) {
    if (!source.includes(anchor)) {
      throw new Error('Mattermost team controller anchor not found');
    }
  }
  return source
    .replace(teamControllerRouterImport, "import {Switch, useHistory, useParams} from 'react-router-dom';")
    .replace(teamControllerAsyncImport, "import {makeAsyncComponent} from 'components/async_load';")
    .replace(`${teamControllerBackstageImport}\n`, '')
    .replace(`${teamControllerPluggable}\n`, '')
    .replace(teamControllerUnsupportedRoutes, `            ${teamControllerRestrictedRouteMarker}\n`);
}

export function patchSidebarTeamMenu(source) {
  if (source.includes('// AI Crew: team and member actions supported by ai-crew.')) {
    return source;
  }
  for (const anchor of [
    'export default function SidebarTeamMenu(props: Props)',
    'TeamSettingsMenuItem',
    'ManageViewMembersMenuItem',
    'PluginMenuItems',
    "import TeamMembersModal from 'components/team_members_modal';",
  ]) {
    if (!source.includes(anchor)) {
      throw new Error('Mattermost sidebar team menu anchor not found');
    }
  }
  return trimmedSidebarTeamMenu;
}

export function patchProductMenu(source) {
  if (!source.includes('components/ai_crew/product_switcher') && !source.includes('<ProductMenuList')) {
    throw new Error('Mattermost product menu anchor not found');
  }
  return sharedProductMenu;
}

export function patchRightControls(source) {
  if (source.includes('// AI Crew: preserve only native message navigation controls.')) {
    return source;
  }
  for (const anchor of [
    "import PlanUpgradeButton from './plan_upgrade_button';",
    "import SettingsButton from './settings_button';",
    "import UserAccountMenu from 'components/user_account_menu';",
    "import AtMentionsButton from './at_mentions_button/at_mentions_button';",
    "import SavedPostsButton from './saved_posts_button/saved_posts_button';",
    'const RightControls = ({productId = null}: Props): JSX.Element => {',
  ]) {
    if (!source.includes(anchor)) {
      throw new Error('Mattermost right controls anchor not found');
    }
  }
  return trimmedRightControls;
}

export function patchAppBar(source) {
  if (source.includes('// AI Crew: hide plugin-only app bar entry points.')) {
    return source;
  }
  for (const anchor of [
    "import AppBarMarketplace from './app_bar_marketplace';",
    "const coreProductsPluginIds = [suitePluginIds.focalboard, suitePluginIds.playbooks];",
    'export default function AppBar() {',
  ]) {
    if (!source.includes(anchor)) {
      throw new Error('Mattermost app bar anchor not found');
    }
  }
  return trimmedAppBar;
}

export function patchPostActionsMenu(source) {
  if (source.includes(postActionsMenuMarker)) {
    return source;
  }
  if (source.includes(legacyPostActionsMenuMarker)) {
    return trimmedPostActionsMenu;
  }
  for (const anchor of [
    "import MarketplaceModal from 'components/plugin_marketplace/marketplace_modal';",
    "import Pluggable from 'plugins/pluggable';",
    "import ActionsMenuEmptyPopover from './actions_menu_empty_popover';",
    '    handleOpenMarketplace = (): void => {',
    'export default injectIntl(ActionMenuClass);',
  ]) {
    if (!source.includes(anchor)) {
      throw new Error('Mattermost post actions menu anchor not found');
    }
  }
  return trimmedPostActionsMenu;
}

export function patchChannelHeader(source) {
  if (source.includes(channelHeaderRestrictedMarker)) {
    return source;
  }
  for (const anchor of [
    "import CallButton from 'plugins/call_button';",
    "import ChannelHeaderPlug from 'plugins/channel_header_plug';",
    '<CallButton/>',
    '<ChannelHeaderPlug',
  ]) {
    if (!source.includes(anchor)) {
      throw new Error('Mattermost channel header anchor not found');
    }
  }

  const fullPluginBlock = `                    {(!channel.shared || this.props.sharedChannelsPluginsEnabled) && (
                        <>
                            <ChannelHeaderPlug
                                channel={channel}
                                channelMember={channelMember}
                            />
                            <CallButton/>
                        </>
                    )}
`;
  let patched = source
    .replace("import CallButton from 'plugins/call_button';\n", '')
    .replace("import ChannelHeaderPlug from 'plugins/channel_header_plug';\n", '');
  if (patched.includes(fullPluginBlock)) {
    patched = patched.replace(fullPluginBlock, `                    ${channelHeaderRestrictedMarker}\n`);
  } else {
    patched = patched
      .replace(/\s*<ChannelHeaderPlug[\s\S]*?\/>\n/, '\n')
      .replace(/\s*<CallButton\/>\n/, `\n                    ${channelHeaderRestrictedMarker}\n`);
  }
  return patched;
}

export function patchMobileChannelHeaderPlugins(source) {
  if (source.includes(mobileChannelHeaderPluginsMarker)) {
    return source;
  }
  for (const anchor of [
    'const MobileChannelHeaderPlugins =',
    'getChannelMobileHeaderPluginButtons',
    'makeAppBindingsSelector',
    'export default memo(MobileChannelHeaderPlugins);',
  ]) {
    if (!source.includes(anchor)) {
      throw new Error('Mattermost mobile channel header plugins anchor not found');
    }
  }
  return trimmedMobileChannelHeaderPlugins;
}

export function patchCenterChannel(source) {
  if (source.includes(centerChannelPlaybooksMarker)) {
    return source;
  }
  if (source.includes(legacyCenterChannelPlaybooksMarker)) {
    return source.replace(legacyCenterChannelPlaybooksMarker, centerChannelPlaybooksMarker);
  }
  const playbookImport = "const PlaybookRunner = makeAsyncComponent('PlaybookRunner', lazy(() => import('components/channel_layout/playbook_runner')));";
  if (!source.includes(playbookImport) || !source.includes('/_playbooks/:playbookId')) {
    throw new Error('Mattermost center channel playbook anchor not found');
  }
  const withoutRoute = source.replace(/^[ \t]*<Route\s+path=\{`\/:team\(\$\{TEAM_NAME_PATH_PATTERN\}\)\/_playbooks\/:playbookId\(\$\{ID_PATH_PATTERN\}\)\/run`\}\s*>\s*<PlaybookRunner\/>\s*<\/Route>\s*$/m, centerChannelPlaybooksMarker);
  if (withoutRoute === source) {
    throw new Error('Mattermost center channel playbook route anchor not found');
  }
  return withoutRoute.replace(`${playbookImport}\n`, '');
}

export function patchProfilePopoverOtherUserRow(source) {
  if (source.includes(profilePopoverOtherUserRowMarker)) {
    return source;
  }
  for (const anchor of [
    "import ProfilePopoverCallButtonWrapper from 'components/profile_popover/profile_popover_call_button_wrapper';",
    '<ProfilePopoverCallButtonWrapper',
    'handleShowDirectChannel',
    'ProfilePopoverAddToChannel',
  ]) {
    if (!source.includes(anchor)) {
      throw new Error('Mattermost other profile popover anchor not found');
    }
  }
  const withoutCallButton = source
    .replace("import ProfilePopoverCallButtonWrapper from 'components/profile_popover/profile_popover_call_button_wrapper';\n", '')
    .replace(/\s*<ProfilePopoverCallButtonWrapper[\s\S]*?\/>/, `\n                ${profilePopoverOtherUserRowMarker}`);
  if (withoutCallButton === source) {
    throw new Error('Mattermost other profile call button anchor not found');
  }
  return withoutCallButton;
}

export function patchPostOptions(source) {
  if (source.includes(postOptionsPluginActionsMarker)) {
    return source;
  }
  for (const anchor of [
    "import {usePluginVisibilityInSharedChannel} from 'components/common/hooks/usePluginVisibilityInSharedChannel';",
    '    let pluginItems: ReactNode = null;',
    '    const dotMenu =',
  ]) {
    if (!source.includes(anchor)) {
      throw new Error('Mattermost post options plugin action anchor not found');
    }
  }
  const start = source.indexOf('    let pluginItems: ReactNode = null;');
  const end = source.indexOf('    const dotMenu =', start);
  if (end === -1) {
    throw new Error('Mattermost post options plugin action block not found');
  }
  return `${source.slice(0, start)}    const pluginItems: ReactNode = null; ${postOptionsPluginActionsMarker}\n\n${source.slice(end)}`
    .replace("import {usePluginVisibilityInSharedChannel} from 'components/common/hooks/usePluginVisibilityInSharedChannel';\n", '');
}

export function patchSidebarSettingsShortcut(source) {
  if (source.includes(sidebarSettingsShortcutMarker)) {
    return source;
  }
  const settingsImport = "const UserSettingsModal = makeAsyncComponent('UserSettingsModal', lazy(() => import('components/user_settings/modal')));";
  const shortcut = /^([ \t]*)} else if \(isKeyPressed\(event, Constants\.KeyCodes\.A\) && event\.shiftKey\) \{[\s\S]*?^\1}/m;
  if (!source.includes(settingsImport) || !shortcut.test(source)) {
    throw new Error('Mattermost sidebar settings shortcut anchor not found');
  }
  const patched = source
    .replace(`${settingsImport}\n`, '')
    .replace(shortcut, `$1}\n$1${sidebarSettingsShortcutMarker}`);
  if (patched === source) {
    throw new Error('Mattermost sidebar settings shortcut block not found');
  }
  return patched;
}

export function patchProfilePopoverSelfUserRow(source) {
  if (source.includes('// AI Crew: retain self-DM access without native account settings.')) {
    return source;
  }
  for (const anchor of [
    "import UserSettingsModal from 'components/user_settings/modal';",
    'const ProfilePopoverSelfUserRow =',
    'handleEditAccountSettings',
    'handleShowDirectChannel',
  ]) {
    if (!source.includes(anchor)) {
      throw new Error('Mattermost self profile popover anchor not found');
    }
  }
  return trimmedProfilePopoverSelfUserRow;
}

export function patchWebpack(source) {
  return injectOnce(
    source,
    'AI_CREW_SKIP_IMAGE_OPTIMIZATION',
    imageLoaderAnchor,
    conditionalImageLoader,
    'Mattermost image loader anchor not found',
  );
}

export async function applyCustomizations(repoRoot = new URL('../', import.meta.url)) {
  const channels = new URL('upstream/mattermost/webapp/channels/src/', repoRoot);
  const rootPath = new URL('components/root/root.tsx', channels);
  const teamControllerPath = new URL('components/team_controller/team_controller.tsx', channels);
  const sidebarTeamMenuPath = new URL('components/sidebar/sidebar_header/sidebar_team_menu.tsx', channels);
  const postActionsMenuPath = new URL('components/actions_menu/actions_menu.tsx', channels);
  const channelHeaderPath = new URL('components/channel_header/channel_header.tsx', channels);
  const mobileChannelHeaderPluginsPath = new URL('components/channel_header_menu/menu_items/mobile_channel_header_plugins.tsx', channels);
  const centerChannelPath = new URL('components/channel_layout/center_channel/center_channel.tsx', channels);
  const profilePopoverSelfUserRowPath = new URL('components/profile_popover/profile_popover_self_user_row.tsx', channels);
  const profilePopoverOtherUserRowPath = new URL('components/profile_popover/profile_popover_other_user_row.tsx', channels);
  const postOptionsPath = new URL('components/post/post_options.tsx', channels);
  const sidebarPath = new URL('components/sidebar/sidebar.tsx', channels);
  const menuPath = new URL('components/global_header/left_controls/product_menu/product_menu.tsx', channels);
  const rightControlsPath = new URL('components/global_header/right_controls/right_controls.tsx', channels);
  const appBarPath = new URL('components/app_bar/app_bar.tsx', channels);
  const webpackPath = new URL('upstream/mattermost/webapp/channels/webpack.config.js', repoRoot);
  const overlay = new URL('customizations/mattermost/components/ai_crew/', repoRoot);
  const destination = new URL('components/ai_crew/', channels);

  await cp(overlay, destination, {recursive: true, force: true});
  // Compile CSS to a string for the shadow root, never the document stylesheet.
  const require = createRequire(new URL('upstream/mattermost/webapp/package.json', repoRoot));
  const sass = require('sass');
  const {css} = sass.compile(fileURLToPath(new URL('ai_crew_console.scss', overlay)), {
    loadPaths: [fileURLToPath(channels), fileURLToPath(new URL('sass/', channels))],
  });
  await writeFile(new URL('ai_crew_styles.ts', destination), `// Generated by apply-mattermost-customizations.mjs.\nexport default ${JSON.stringify(css)};\n`);
  await writeFile(rootPath, patchRootRoutes(await readFile(rootPath, 'utf8')));
  await writeFile(teamControllerPath, patchTeamController(await readFile(teamControllerPath, 'utf8')));
  await writeFile(sidebarTeamMenuPath, patchSidebarTeamMenu(await readFile(sidebarTeamMenuPath, 'utf8')));
  await writeFile(postActionsMenuPath, patchPostActionsMenu(await readFile(postActionsMenuPath, 'utf8')));
  await writeFile(channelHeaderPath, patchChannelHeader(await readFile(channelHeaderPath, 'utf8')));
  await writeFile(mobileChannelHeaderPluginsPath, patchMobileChannelHeaderPlugins(await readFile(mobileChannelHeaderPluginsPath, 'utf8')));
  await writeFile(centerChannelPath, patchCenterChannel(await readFile(centerChannelPath, 'utf8')));
  await writeFile(profilePopoverSelfUserRowPath, patchProfilePopoverSelfUserRow(await readFile(profilePopoverSelfUserRowPath, 'utf8')));
  await writeFile(profilePopoverOtherUserRowPath, patchProfilePopoverOtherUserRow(await readFile(profilePopoverOtherUserRowPath, 'utf8')));
  await writeFile(postOptionsPath, patchPostOptions(await readFile(postOptionsPath, 'utf8')));
  await writeFile(sidebarPath, patchSidebarSettingsShortcut(await readFile(sidebarPath, 'utf8')));
  await writeFile(menuPath, patchProductMenu(await readFile(menuPath, 'utf8')));
  await writeFile(rightControlsPath, patchRightControls(await readFile(rightControlsPath, 'utf8')));
  await writeFile(appBarPath, patchAppBar(await readFile(appBarPath, 'utf8')));
  await cp(
    new URL('customizations/mattermost/tests/product_menu.test.tsx', repoRoot),
    new URL('components/global_header/left_controls/product_menu/product_menu.test.tsx', channels),
  );
  // The replacement menu has behavioral assertions instead of upstream snapshots.
  await rm(new URL('components/global_header/left_controls/product_menu/__snapshots__/product_menu.test.tsx.snap', channels), {force: true});
  await writeFile(webpackPath, patchWebpack(await readFile(webpackPath, 'utf8')));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await applyCustomizations();
  process.stdout.write('Mattermost ai-crew customizations applied.\n');
}
