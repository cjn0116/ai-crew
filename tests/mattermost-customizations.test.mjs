import assert from 'node:assert/strict';
import test from 'node:test';

import {patchProductMenu, patchRootRoutes, patchWebpack} from '../scripts/apply-mattermost-customizations.mjs';

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
