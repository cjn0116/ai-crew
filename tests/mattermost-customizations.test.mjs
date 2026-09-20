import assert from 'node:assert/strict';
import test from 'node:test';

import * as customizations from '../scripts/apply-mattermost-customizations.mjs';

const {patchProductMenu, patchRootRoutes, patchWebpack} = customizations;

test('adds the ai-crew route exactly once', () => {
  const source = [
    "const TeamController = makeAsyncComponent('TeamController', lazy(() => import('components/team_controller')));",
    "                    <Route\n                        path={'/error'}\n                        component={ErrorPage}\n                    />",
    "                                <LoggedInRoute\n                                    path={`/:team(${TEAM_NAME_PATH_PATTERN})`}\n                                    component={TeamController}\n                                />",
  ].join('\n');

  const once = patchRootRoutes(source);
  const twice = patchRootRoutes(once);
  assert.equal(once, twice);
  assert.match(once, /AiCrewConsole/);
  assert.ok(once.indexOf("path={'/ai-crew'}") < once.indexOf("path={'/error'}"));
  assert.match(once, /path=\{'\/ai-crew'\}/);
});

test('installs the shared two-product switcher idempotently', () => {
  const source = "                    {productItems}\n                    <ProductMenuList";
  const once = patchProductMenu(source);
  assert.equal(patchProductMenu(once), once);
  assert.match(once, /components\/ai_crew\/product_switcher/);
  assert.doesNotMatch(once, /ProductMenuList|CheckIcon/);
});

test('rejects an unknown Mattermost source shape', () => {
  assert.throws(() => patchRootRoutes('changed upstream'), /Mattermost root .* anchor not found/);
  assert.throws(() => patchProductMenu('changed upstream'), /Mattermost product menu anchor not found/);
});

test('adds an explicit image optimization bypass exactly once', () => {
  const source = `                use: [
                    {
                        loader: 'image-webpack-loader',
                        options: {},
                    },
                ],`;
  const once = patchWebpack(source);
  assert.equal(patchWebpack(once), once);
  assert.match(once, /AI_CREW_SKIP_IMAGE_OPTIMIZATION/);
});

test('moves an existing embedded Multica route outside the Mattermost shell', () => {
  const source = [
    "const TeamController = makeAsyncComponent('TeamController', lazy(() => import('components/team_controller')));",
    "                    <Route\n                        path={'/error'}\n                        component={ErrorPage}\n                    />",
    "<GlobalHeader/>",
    "                                <LoggedInRoute\n                                    path={'/ai-crew'}\n                                    component={AiCrewConsole}\n                                />",
  ].join('\n');
  const patched = patchRootRoutes(source);
  assert.ok(patched.indexOf("path={'/ai-crew'}") < patched.indexOf('<GlobalHeader/>'));
  assert.equal((patched.match(/path=\{'\/ai-crew'\}/g) ?? []).length, 1);
    assert.equal(patchRootRoutes(patched), patched);
});

test('removes unsupported native routes while preserving chat and ai-crew routes', () => {
  const source = [
    "const AdminConsole = makeAsyncComponent('AdminConsole', lazy(() => import('components/admin_console')));",
    "const TeamController = makeAsyncComponent('TeamController', lazy(() => import('components/team_controller')));",
    "                    <Route\n                        path={'/error'}\n                        component={ErrorPage}\n                    />",
    "                    <Route\n                        path={'/admin_console'}\n                    >\n                        <Switch>\n                            <LoggedInRoute\n                                path={'/admin_console'}\n                                component={AdminConsole}\n                            />\n                            <RootRedirect/>\n                        </Switch>\n                    </Route>",
    "                    <Redirect\n                        from={'/_redirect/integrations/:subpath*'}\n                        to={`/${this.props.permalinkRedirectTeamName}/integrations/:subpath*`}\n                    />",
    'const Pluggable = makeAsyncPluggableComponent();',
    "                                {this.props.products?.filter((product) => Boolean(product.publicComponent)).map((product) => (",
    "                                {this.props.products?.map((product) => (",
    "                                {this.props.plugins?.map((plugin) => (",
    "    const TEAM_CONTROLLER_PATH_PATTERN = new RegExp(`^/(?!admin_console)([a-z0-9\\\\-_]+)/(channels|messages|threads|drafts|integrations|emoji|${SCHEDULED_POST_URL_SUFFIX})(/.*)?$`);",
  ].join('\n');

  const once = patchRootRoutes(source);
  assert.equal(patchRootRoutes(once), once);
  assert.doesNotMatch(once, /AdminConsole|\/admin_console|\/integrations/);
  assert.match(once, /path=\{'\/ai-crew'\}/);
  assert.match(once, /channels\|messages\|threads\|drafts\|emoji/);
  assert.match(once, /filter\(isAiCrewSupportedPlugin\)/);
  assert.match(once, /products\?\.filter\(\(product\) => Boolean\(product\.publicComponent\)\)\.filter\(isAiCrewSupportedPlugin\)\.map/);
});

test('removes team-scoped integrations and plugin routes while retaining channel routing', () => {
  const source = [
    "import {Route, Switch, useHistory, useParams} from 'react-router-dom';",
    "import {makeAsyncComponent, makeAsyncPluggableComponent} from 'components/async_load';",
    "const BackstageController = makeAsyncComponent('BackstageController', lazy(() => import('components/backstage')));",
    'const Pluggable = makeAsyncPluggableComponent();',
    '    return (',
    '        <Switch>',
    '            <Route',
    '                path={`/:team(${TEAM_NAME_PATH_PATTERN})/integrations`}',
    '                component={BackstageController}',
    '            />',
    '            <Route',
    '                path={`/:team(${TEAM_NAME_PATH_PATTERN})/emoji`}',
    '                component={BackstageController}',
    '            />',
    '            {props.plugins?.map((plugin) => (',
    '                <Route',
    '                    key={plugin.id}',
    '                    path={`/:team(${TEAM_NAME_PATH_PATTERN})/` + (plugin as any).route}',
    '                    render={() => (',
    '                        <Pluggable',
    "                            pluggableName={'NeedsTeamComponent'}",
    '                            pluggableId={plugin.id}',
    "                            css={{gridArea: 'center'}}",
    '                        />',
    '                    )}',
    '                />',
    '            ))}',
    '            <ChannelController shouldRenderCenterChannel={initialChannelsLoaded && teamLoaded}/>',
    '        </Switch>',
    '    );',
  ].join('\n');

  const once = customizations.patchTeamController(source);
  assert.equal(customizations.patchTeamController(once), once);
  assert.match(once, /ChannelController/);
  assert.doesNotMatch(once, /integrations|emoji|props\.plugins|BackstageController|Pluggable/);
});

test('keeps team and member actions while removing unsupported sidebar team menu entries', () => {
  const source = [
    "import TeamSettingsModal from 'components/team_settings_modal';",
    "import TeamMembersModal from 'components/team_members_modal';",
    "import InvitationModal from 'components/invitation_modal';",
    "import {getMainMenuPluginComponents} from 'selectors/plugins';",
    "import {getCloudSubscription, getSubscriptionProduct} from 'mattermost-redux/selectors/entities/cloud';",
    'export default function SidebarTeamMenu(props: Props) {',
    '    return (',
    '        <Menu.Container',
    "            menuButton={{id: 'sidebarTeamMenuButton'}}",
    '        >',
    '            <InvitePeopleMenuItem/>',
    '            <TeamSettingsMenuItem/>',
    '            <ManageViewMembersMenuItem/>',
    '            <ManageGroupsMenuItem teamID={props.currentTeam.id}/>',
    '            <LeaveTeamMenuItem/>',
    '            <JoinAnotherTeamMenuItem/>',
    '            <CreateTeamMenuItem isCloud={isCloud}/>',
    '            <LearnAboutTeamsMenuItem/>',
    '            <PluginMenuItems/>',
    '        </Menu.Container>',
    '    );',
    '}',
  ].join('\n');

  const once = customizations.patchSidebarTeamMenu(source);
  assert.equal(customizations.patchSidebarTeamMenu(once), once);
  assert.match(once, /InvitePeopleMenuItem|ManageViewMembersMenuItem|JoinAnotherTeamMenuItem|CreateTeamMenuItem/);
  assert.doesNotMatch(once, /TeamSettings|ManageGroups|LeaveTeam|LearnAboutTeams|PluginMenuItems|getCloudSubscription/);
});

test('keeps message controls while removing cloud and account settings from global controls', () => {
  const source = [
    "import UserAccountMenu from 'components/user_account_menu';",
    "import AtMentionsButton from './at_mentions_button/at_mentions_button';",
    "import PlanUpgradeButton from './plan_upgrade_button';",
    "import SavedPostsButton from './saved_posts_button/saved_posts_button';",
    "import SettingsButton from './settings_button';",
    'const RightControls = ({productId = null}: Props): JSX.Element => {',
    '    return (',
    "        <RightControlsContainer id={'RightControlsContainer'}>",
    '            <PlanUpgradeButton/>',
    '            <AtMentionsButton/>',
    '            <SavedPostsButton/>',
    '            <SettingsButton/>',
    '            <UserAccountMenu/>',
    '        </RightControlsContainer>',
    '    );',
    '};',
  ].join('\n');

  assert.equal(typeof customizations.patchRightControls, 'function');
  const once = customizations.patchRightControls(source);
  assert.equal(customizations.patchRightControls(once), once);
  assert.match(once, /AtMentionsButton|SavedPostsButton/);
  assert.doesNotMatch(once, /PlanUpgradeButton|SettingsButton|UserAccountMenu/);
});

test('removes the plugin app bar that exposes calls, playbooks, and marketplace', () => {
  const source = [
    "import AppBarMarketplace from './app_bar_marketplace';",
    'export default function AppBar() {',
    '    const coreProductsPluginIds = [suitePluginIds.focalboard, suitePluginIds.playbooks];',
    '    return <AppBarMarketplace/>;',
    '}',
  ].join('\n');

  assert.equal(typeof customizations.patchAppBar, 'function');
  const once = customizations.patchAppBar(source);
  assert.equal(customizations.patchAppBar(once), once);
  assert.doesNotMatch(once, /AppBarMarketplace|playbooks|calls/);
  assert.match(once, /return null/);
});

test('removes the post-actions marketplace and plugin menu without changing core post controls', () => {
  const source = [
    "import {Constants, Locations, ModalIdentifiers} from 'utils/constants';",
    "import * as PostUtils from 'utils/post_utils';",
    "import MarketplaceModal from 'components/plugin_marketplace/marketplace_modal';",
    "import Pluggable from 'plugins/pluggable';",
    "import ActionsMenuEmptyPopover from './actions_menu_empty_popover';",
    'export class ActionMenuClass extends React.PureComponent<Props, State> {',
    '    handleOpenMarketplace = (): void => {',
    '        this.props.actions.openModal({dialogType: MarketplaceModal});',
    '    };',
    '    render(): React.ReactNode {',
    "        const marketplace = <Menu.ItemAction text={'App Marketplace'}/>;",
    '        const plugins = <Pluggable/>;',
    '        return <ActionsMenuEmptyPopover onOpenMarketplace={this.handleOpenMarketplace}/>;',
    '    }',
    '}',
    '',
    'export default injectIntl(ActionMenuClass);',
  ].join('\n');

  const once = customizations.patchPostActionsMenu(source);
  assert.equal(customizations.patchPostActionsMenu(once), once);
  assert.match(once, /return null/);
  assert.doesNotMatch(once, /App Marketplace|Pluggable|ActionsMenuEmptyPopover|ModalIdentifiers|PostUtils|handleOpenMarketplace/);
});

test('removes call and plugin header buttons while retaining channel text and member controls', () => {
  const source = [
    "import CallButton from 'plugins/call_button';",
    "import ChannelHeaderPlug from 'plugins/channel_header_plug';",
    "import ChannelHeaderText from './channel_header_text';",
    "import ChannelInfoButton from './channel_info_button';",
    '                    <ChannelHeaderText/>',
    '                    <ChannelHeaderPlug channel={channel} channelMember={channelMember}/>',
    '                    <CallButton/>',
    '                    <ChannelInfoButton channel={channel}/>',
  ].join('\n');

  const once = customizations.patchChannelHeader(source);
  assert.equal(customizations.patchChannelHeader(once), once);
  assert.match(once, /ChannelHeaderText|ChannelInfoButton/);
  assert.doesNotMatch(once, /CallButton|ChannelHeaderPlug/);
});

test('removes mobile channel plugin and app buttons while retaining the mobile header shell', () => {
  const source = [
    "import {getChannelMobileHeaderPluginButtons} from 'selectors/plugins';",
    "import {makeAppBindingsSelector} from 'mattermost-redux/selectors/entities/apps';",
    'const MobileChannelHeaderPlugins = (props: Props): JSX.Element => {',
    '    const plugins = getChannelMobileHeaderPluginButtons;',
    '    const bindings = makeAppBindingsSelector;',
    '    return <button onClick={plugins}>{bindings}</button>;',
    '};',
    'export {MobileChannelHeaderPlugins as RawMobileChannelHeaderPlug};',
    'export default memo(MobileChannelHeaderPlugins);',
  ].join('\n');

  const once = customizations.patchMobileChannelHeaderPlugins(source);
  assert.equal(customizations.patchMobileChannelHeaderPlugins(once), once);
  assert.match(once, /return null/);
  assert.doesNotMatch(once, /getChannelMobileHeaderPluginButtons|makeAppBindingsSelector|onClick/);
});

test('removes playbook and self-profile settings entry points while retaining channel and direct-message actions', () => {
  const centerSource = [
    "const PlaybookRunner = makeAsyncComponent('PlaybookRunner', lazy(() => import('components/channel_layout/playbook_runner')));",
    '                    <Route path={`/:team(${TEAM_NAME_PATH_PATTERN})/:path(channels|messages)`} component={ChannelIdentifierRouter}/>',
    '                    <Route path={`/:team(${TEAM_NAME_PATH_PATTERN})/_playbooks/:playbookId(${ID_PATH_PATTERN})/run`}>',
    '                        <PlaybookRunner/>',
    '                    </Route>',
  ].join('\n');
  const profileSource = [
    "import UserSettingsModal from 'components/user_settings/modal';",
    'const ProfilePopoverSelfUserRow = ({handleShowDirectChannel}: Props) => {',
    '    const handleEditAccountSettings = () => openModal({dialogType: UserSettingsModal});',
    '    return <><button onClick={handleEditAccountSettings}>Edit Profile</button><button onClick={handleShowDirectChannel}>Send yourself a message</button></>;',
    '};',
    'export default ProfilePopoverSelfUserRow;',
  ].join('\n');

  const centerOnce = customizations.patchCenterChannel(centerSource);
  const profileOnce = customizations.patchProfilePopoverSelfUserRow(profileSource);
  assert.equal(customizations.patchCenterChannel(centerOnce), centerOnce);
  assert.equal(customizations.patchProfilePopoverSelfUserRow(profileOnce), profileOnce);
  assert.match(centerOnce, /ChannelIdentifierRouter/);
  assert.doesNotMatch(centerOnce, /PlaybookRunner|_playbooks/);
  assert.doesNotMatch(centerOnce, /^\/\/ AI Crew/m);
  assert.match(profileOnce, /handleShowDirectChannel|Send yourself a message/);
  assert.doesNotMatch(profileOnce, /UserSettingsModal|Edit Profile|handleEditAccountSettings/);
});

test('removes profile call buttons while retaining messages and adding members to channels', () => {
  const source = [
    "import ProfilePopoverAddToChannel from 'components/profile_popover/profile_popover_add_to_channel';",
    "import ProfilePopoverCallButtonWrapper from 'components/profile_popover/profile_popover_call_button_wrapper';",
    'const ProfilePopoverOtherUserRow = ({handleShowDirectChannel}: Props) => {',
    '    return <><button onClick={handleShowDirectChannel}>Message</button><ProfilePopoverAddToChannel/><ProfilePopoverCallButtonWrapper userId={user.id}/></>;',
    '};',
    'export default ProfilePopoverOtherUserRow;',
  ].join('\n');

  const once = customizations.patchProfilePopoverOtherUserRow(source);
  assert.equal(customizations.patchProfilePopoverOtherUserRow(once), once);
  assert.match(once, /handleShowDirectChannel|ProfilePopoverAddToChannel/);
  assert.doesNotMatch(once, /ProfilePopoverCallButtonWrapper/);
});

test('removes direct post action plugins while preserving reactions and the core post menu', () => {
  const source = [
    "import {usePluginVisibilityInSharedChannel} from 'components/common/hooks/usePluginVisibilityInSharedChannel';",
    "import PostReaction from 'components/post_view/post_reaction';",
    "import DotMenu from 'components/dot_menu';",
    'const PostOptions = (props: Props): JSX.Element => {',
    '    let pluginItems: ReactNode = null;',
    '    const pluginItemsVisible = usePluginVisibilityInSharedChannel(post.channel_id);',
    '    pluginItems = props.pluginActions?.map((item) => <Component post={props.post}/>);',
    '    const dotMenu = <DotMenu post={props.post}/>;',
    '    const reaction = <PostReaction postId={props.post.id}/>;',
    '    return <>{pluginItems}{dotMenu}{reaction}</>;',
    '};',
  ].join('\n');

  const once = customizations.patchPostOptions(source);
  assert.equal(customizations.patchPostOptions(once), once);
  assert.match(once, /DotMenu|PostReaction/);
  assert.doesNotMatch(once, /usePluginVisibilityInSharedChannel|pluginItemsVisible|\.map\(\(item\)/);
});

test('removes the sidebar user-settings shortcut while preserving unrelated sidebar shortcuts', () => {
  const source = [
    "const UserSettingsModal = makeAsyncComponent('UserSettingsModal', lazy(() => import('components/user_settings/modal')));",
    "const NewChannelModal = makeAsyncComponent('NewChannelModal', lazy(() => import('components/new_channel_modal')));",
    '        if (isKeyPressed(event, Constants.KeyCodes.B)) {',
    '            this.props.actions.openModal({dialogType: NewChannelModal});',
    '        } else if (isKeyPressed(event, Constants.KeyCodes.A) && event.shiftKey) {',
    '            this.props.actions.openModal({modalId: ModalIdentifiers.USER_SETTINGS, dialogType: UserSettingsModal});',
    '        }',
  ].join('\n');

  const once = customizations.patchSidebarSettingsShortcut(source);
  assert.equal(customizations.patchSidebarSettingsShortcut(once), once);
  assert.match(once, /NewChannelModal|KeyCodes\.B/);
  assert.doesNotMatch(once, /UserSettingsModal|USER_SETTINGS|KeyCodes\.A/);
});
