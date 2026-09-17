import {cp, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const rootImportAnchor = "const TeamController = makeAsyncComponent('TeamController', lazy(() => import('components/team_controller')));";
const aiCrewImport = "const AiCrewConsole = makeAsyncComponent('AiCrewConsole', lazy(() => import('components/ai_crew')));";
const rootRouteAnchor = `                                <LoggedInRoute
                                    path={\`/:team(\${TEAM_NAME_PATH_PATTERN})\`}
                                    component={TeamController}
                                />`;
const aiCrewRoute = `                                <LoggedInRoute
                                    path={'/ai-crew'}
                                    component={AiCrewConsole}
                                />`;
const menuAnchor = `                    {productItems}
                    <ProductMenuList`;
const menuItem = `                    {productItems}
                    <ProductMenuItem
                        destination={'/ai-crew'}
                        icon={'product-boards'}
                        text={'Multica'}
                        active={window.location.pathname.startsWith('/ai-crew')}
                        onClick={handleClick}
                        id={'product-menu-item-ai-crew'}
                    />
                    <ProductMenuList`;
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
  return injectOnce(
    withImport,
    "path={'/ai-crew'}",
    rootRouteAnchor,
    `${aiCrewRoute}\n${rootRouteAnchor}`,
    'Mattermost root route anchor not found',
  );
}

export function patchProductMenu(source) {
  return injectOnce(
    source,
    "id={'product-menu-item-ai-crew'}",
    menuAnchor,
    menuItem,
    'Mattermost product menu anchor not found',
  );
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
  const menuPath = new URL('components/global_header/left_controls/product_menu/product_menu.tsx', channels);
  const webpackPath = new URL('upstream/mattermost/webapp/channels/webpack.config.js', repoRoot);
  const overlay = new URL('customizations/mattermost/components/ai_crew/', repoRoot);
  const destination = new URL('components/ai_crew/', channels);

  await cp(overlay, destination, {recursive: true, force: true});
  await writeFile(rootPath, patchRootRoutes(await readFile(rootPath, 'utf8')));
  await writeFile(menuPath, patchProductMenu(await readFile(menuPath, 'utf8')));
  await writeFile(webpackPath, patchWebpack(await readFile(webpackPath, 'utf8')));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await applyCustomizations();
  process.stdout.write('Mattermost ai-crew customizations applied.\n');
}
