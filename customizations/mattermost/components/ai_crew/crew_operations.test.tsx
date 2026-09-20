import React from 'react';
import {fireEvent, render, screen, waitFor, within} from '@testing-library/react';

import CrewOperations from './crew_operations';

type FetchCall = [RequestInfo | URL, RequestInit?];

const commandCall = (name: string, method = 'GET') => (call: FetchCall) =>
    String(call[0]).startsWith(`/api/ai-crew/commands/${name}`) && (call[1]?.method ?? 'GET') === method;

describe('CrewOperations', () => {
    beforeEach(() => {
        global.fetch = jest.fn(async (input, init) => {
            const url = String(input);
            if (url.includes('/find-user')) {
                return {ok: true, json: async () => ({data: {users: [{username: 'ada', display_name: 'Ada Lovelace'}]}})};
            }
            return {ok: true, json: async () => ({data: {ok: true, url, body: init?.body}})};
        }) as jest.Mock;
    });

    it('runs connection checks and requires a second, explicit rotation confirmation', async () => {
        render(<CrewOperations workspace='synapse-os'/>);

        fireEvent.click(screen.getByRole('button', {name: '验证连接'}));
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/ai-crew/commands/verify', expect.objectContaining({cache: 'no-store'})));

        fireEvent.click(screen.getByRole('button', {name: '轮换连接凭据'}));
        expect(screen.getByRole('alertdialog')).toHaveTextContent('确认轮换连接凭据');
        expect(global.fetch).not.toHaveBeenCalledWith('/api/ai-crew/commands/rotate', expect.anything());

        fireEvent.click(screen.getByRole('button', {name: '确认轮换'}));
        await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.some(commandCall('rotate', 'POST'))).toBe(true));
        const rotation = (global.fetch as jest.Mock).mock.calls.find(commandCall('rotate', 'POST')) as FetchCall;
        expect(JSON.parse(String(rotation[1]?.body))).toEqual({confirm: true});
    });

    it('labels ticket fetch as re-acquiring the crew ticket', async () => {
        render(<CrewOperations/>);

        fireEvent.click(screen.getByRole('button', {name: '重新领取班组票'}));

        await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.some(commandCall('fetch'))).toBe(true));
    });

    it('searches people, selects a direct-message target, and confirms the exact message before posting', async () => {
        render(<CrewOperations/>);

        fireEvent.change(screen.getByLabelText('搜索成员'), {target: {value: 'Ada'}});
        fireEvent.click(screen.getByRole('button', {name: '查找成员'}));
        expect(await screen.findByRole('button', {name: '选择私信对象：Ada Lovelace'})).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: '选择私信对象：Ada Lovelace'}));

        fireEvent.change(screen.getByLabelText('消息内容'), {target: {value: 'Build is ready'}});
        fireEvent.change(screen.getByLabelText('回复根帖子 ID'), {target: {value: 'post-41'}});
        fireEvent.click(screen.getByRole('button', {name: '预览发送'}));
        const dialog = screen.getByRole('alertdialog');
        expect(dialog).toHaveTextContent('Ada Lovelace');
        expect(dialog).toHaveTextContent('Build is ready');
        expect((global.fetch as jest.Mock).mock.calls.some(commandCall('say', 'POST'))).toBe(false);

        fireEvent.click(screen.getByRole('button', {name: '确认发送'}));
        await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.some(commandCall('say', 'POST'))).toBe(true));
        const message = (global.fetch as jest.Mock).mock.calls.find(commandCall('say', 'POST')) as FetchCall;
        expect(JSON.parse(String(message[1]?.body))).toEqual({dm: 'ada', text: 'Build is ready', root: 'post-41'});
    });

    it('uses typed read requests for summaries, posts, teams, channels, and scrubbed diagnostics', async () => {
        render(<CrewOperations workspace='synapse-os'/>);

        fireEvent.click(screen.getByRole('button', {name: '加载概览'}));
        fireEvent.click(screen.getByRole('button', {name: '加载团队'}));
        fireEvent.change(screen.getByLabelText('频道团队'), {target: {value: 'platform'}});
        fireEvent.click(screen.getByRole('button', {name: '加载频道'}));
        fireEvent.change(screen.getByLabelText('记录频道'), {target: {value: 'town-square'}});
        fireEvent.click(screen.getByRole('button', {name: '加载帖子'}));
        fireEvent.change(screen.getByLabelText('摘要团队'), {target: {value: 'platform'}});
        fireEvent.click(screen.getByLabelText('包含私信'));
        fireEvent.click(screen.getByRole('button', {name: '生成摘要'}));
        fireEvent.change(screen.getByLabelText('诊断路径'), {target: {value: '/api/v4/users/me'}});
        fireEvent.click(screen.getByRole('button', {name: '运行诊断'}));

        await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.some(commandCall('mm-get'))).toBe(true));
        expect((global.fetch as jest.Mock).mock.calls.some(commandCall('channels'))).toBe(true);
        expect((global.fetch as jest.Mock).mock.calls.some(commandCall('posts'))).toBe(true);
        const digest = (global.fetch as jest.Mock).mock.calls.find(commandCall('digest')) as FetchCall;
        expect(String(digest[0])).toContain('team=platform');
        expect(String(digest[0])).toContain('includeDm=true');
        const diagnostic = (global.fetch as jest.Mock).mock.calls.find(commandCall('mm-get')) as FetchCall;
        expect(String(diagnostic[0])).toBe('/api/ai-crew/commands/mm-get?path=%2Fapi%2Fv4%2Fusers%2Fme');
    });

    it('renders safe, readable results for every read operation', async () => {
        global.fetch = jest.fn(async (input) => {
            const url = String(input);
            const data = url.includes('/teams') ? {teams: [{name: 'platform'}]} :
                url.includes('/channels') ? {channels: [{name: 'release'}]} :
                    url.includes('/posts') ? {posts: [{id: 'post-42', message: '发布完成'}]} :
                        url.includes('/digest') ? {digest: '今日没有阻塞项'} :
                            url.includes('/find-user') ? {users: [{username: 'ada', display_name: 'Ada Lovelace'}]} :
                                {path: '/api/v4/users/me', user: {id: 'me'}};
            return {ok: true, json: async () => ({ok: true, data})};
        }) as jest.Mock;
        render(<CrewOperations/>);

        const result = () => screen.getByLabelText('最近操作结果');
        fireEvent.click(screen.getByRole('button', {name: '加载团队'}));
        await waitFor(() => expect(result()).toHaveTextContent('platform'));

        fireEvent.change(screen.getByLabelText('频道团队'), {target: {value: 'platform'}});
        fireEvent.click(screen.getByRole('button', {name: '加载频道'}));
        await waitFor(() => expect(result()).toHaveTextContent('release'));

        fireEvent.change(screen.getByLabelText('记录频道'), {target: {value: 'town-square'}});
        fireEvent.click(screen.getByRole('button', {name: '加载帖子'}));
        await waitFor(() => expect(result()).toHaveTextContent('post-42'));

        fireEvent.click(screen.getByRole('button', {name: '生成摘要'}));
        await waitFor(() => expect(result()).toHaveTextContent('今日没有阻塞项'));

        fireEvent.change(screen.getByLabelText('搜索成员'), {target: {value: 'Ada'}});
        fireEvent.click(screen.getByRole('button', {name: '查找成员'}));
        await waitFor(() => expect(result()).toHaveTextContent('Ada Lovelace'));

        fireEvent.change(screen.getByLabelText('诊断路径'), {target: {value: '/api/v4/users/me'}});
        fireEvent.click(screen.getByRole('button', {name: '运行诊断'}));
        await waitFor(() => expect(result()).toHaveTextContent('"id": "me"'));
    });

    it('shows boolean connection status while hiding token values', async () => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({data: {mm_token: true, multica_token: false, token: 'fh_u_private'}}),
        })) as jest.Mock;
        render(<CrewOperations/>);

        fireEvent.click(screen.getByRole('button', {name: '验证连接'}));

        const result = await screen.findByLabelText('最近操作结果');
        expect(result).toHaveTextContent('"mm_token": true');
        expect(result).toHaveTextContent('"multica_token": false');
        expect(result).toHaveTextContent('"token": "[已隐藏]"');
        expect(result).not.toHaveTextContent('fh_u_private');
    });

    it('clears a previous result when a later operation fails', async () => {
        let fail = false;
        global.fetch = jest.fn(async () => ({ok: !fail, json: async () => ({data: {teams: [{name: 'platform'}]}})})) as jest.Mock;
        render(<CrewOperations/>);

        fireEvent.click(screen.getByRole('button', {name: '加载团队'}));
        await waitFor(() => expect(screen.getByLabelText('最近操作结果')).toHaveTextContent('platform'));

        fail = true;
        fireEvent.click(screen.getByRole('button', {name: '加载团队'}));
        expect(await screen.findByRole('alert')).toHaveTextContent('操作未完成');
        expect(screen.queryByLabelText('最近操作结果')).not.toBeInTheDocument();
    });

    it('clears stale people results when the next search fails', async () => {
        let failSearch = false;
        global.fetch = jest.fn(async (input) => ({
            ok: !(failSearch && String(input).includes('/find-user')),
            json: async () => ({data: {users: [{username: 'ada', display_name: 'Ada Lovelace'}]}}),
        })) as jest.Mock;
        render(<CrewOperations/>);

        fireEvent.click(screen.getByRole('button', {name: '查找成员'}));
        expect(await screen.findByRole('button', {name: '选择私信对象：Ada Lovelace'})).toBeInTheDocument();

        failSearch = true;
        fireEvent.click(screen.getByRole('button', {name: '查找成员'}));
        expect(await screen.findByRole('alert')).toHaveTextContent('操作未完成');
        expect(screen.queryByRole('button', {name: '选择私信对象：Ada Lovelace'})).not.toBeInTheDocument();
    });

    it('keeps an unsuccessful login ticket in the password field', async () => {
        global.fetch = jest.fn(async () => ({ok: false, json: async () => ({})})) as jest.Mock;
        render(<CrewOperations/>);

        const ticket = screen.getByLabelText('连接票据');
        fireEvent.change(ticket, {target: {value: 'fh_u_retry_me'}});
        fireEvent.click(screen.getByRole('button', {name: '连接'}));

        expect(await screen.findByRole('alert')).toHaveTextContent('操作未完成');
        expect(ticket).toHaveValue('fh_u_retry_me');
    });

    it('lets a user clear a direct-message target and return to channel posting', async () => {
        render(<CrewOperations/>);

        fireEvent.change(screen.getByLabelText('搜索成员'), {target: {value: 'Ada'}});
        fireEvent.click(screen.getByRole('button', {name: '查找成员'}));
        fireEvent.click(await screen.findByRole('button', {name: '选择私信对象：Ada Lovelace'}));
        expect(screen.getByLabelText('消息频道')).toBeDisabled();

        fireEvent.click(screen.getByRole('button', {name: '清除私信对象'}));
        expect(screen.getByLabelText('消息频道')).toBeEnabled();
        expect(screen.queryByText('私信对象：Ada Lovelace')).not.toBeInTheDocument();
    });

    it('includes an optional team when confirming a channel message', async () => {
        render(<CrewOperations/>);

        fireEvent.change(screen.getByLabelText('消息频道'), {target: {value: 'town-square'}});
        fireEvent.change(screen.getByLabelText('消息团队'), {target: {value: 'platform'}});
        fireEvent.change(screen.getByLabelText('消息内容'), {target: {value: '请检查发布状态'}});
        fireEvent.click(screen.getByRole('button', {name: '预览发送'}));
        expect(screen.getByRole('alertdialog')).toHaveTextContent('town-square');
        fireEvent.click(screen.getByRole('button', {name: '确认发送'}));

        await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.some(commandCall('say', 'POST'))).toBe(true));
        const message = (global.fetch as jest.Mock).mock.calls.find(commandCall('say', 'POST')) as FetchCall;
        expect(JSON.parse(String(message[1]?.body))).toEqual({channel: 'town-square', text: '请检查发布状态', team: 'platform'});
    });

    it('offers every supported post query option and sends them to the typed command', async () => {
        render(<CrewOperations/>);

        fireEvent.change(screen.getByLabelText('记录频道'), {target: {value: 'town-square'}});
        fireEvent.change(screen.getByLabelText('记录团队'), {target: {value: 'platform'}});
        fireEvent.change(screen.getByLabelText('记录数量'), {target: {value: '20'}});
        fireEvent.change(screen.getByLabelText('记录页数'), {target: {value: '2'}});
        fireEvent.change(screen.getByLabelText('每页记录'), {target: {value: '10'}});
        fireEvent.click(screen.getByLabelText('包含所有记录'));
        fireEvent.click(screen.getByLabelText('包含系统消息'));
        fireEvent.click(screen.getByRole('button', {name: '加载帖子'}));

        await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.some(commandCall('posts'))).toBe(true));
        const posts = (global.fetch as jest.Mock).mock.calls.find(commandCall('posts')) as FetchCall;
        expect(String(posts[0])).toContain('channel=town-square');
        expect(String(posts[0])).toContain('team=platform');
        expect(String(posts[0])).toContain('limit=20');
        expect(String(posts[0])).toContain('pages=2');
        expect(String(posts[0])).toContain('perPage=10');
        expect(String(posts[0])).toContain('all=true');
        expect(String(posts[0])).toContain('system=true');
    });

    it('confirms channel and post deletion by target before sending the typed command', async () => {
        render(<CrewOperations/>);

        fireEvent.change(screen.getByLabelText('待删除帖子 ID'), {target: {value: 'post-42'}});
        fireEvent.click(screen.getByRole('button', {name: '删除帖子'}));
        expect(screen.getByRole('alertdialog')).toHaveTextContent('post-42');
        fireEvent.click(screen.getByRole('button', {name: '确认删除'}));
        await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.some(commandCall('post-delete', 'POST'))).toBe(true));
        const postDeletion = (global.fetch as jest.Mock).mock.calls.find(commandCall('post-delete', 'POST')) as FetchCall;
        expect(JSON.parse(String(postDeletion[1]?.body))).toEqual({postId: 'post-42', confirm: true});

        fireEvent.change(screen.getByLabelText('待删除频道'), {target: {value: 'legacy'}});
        fireEvent.change(screen.getByLabelText('待删除频道所属团队'), {target: {value: 'platform'}});
        fireEvent.click(screen.getByRole('button', {name: '删除频道'}));
        expect(screen.getByRole('alertdialog')).toHaveTextContent('legacy');
        fireEvent.click(screen.getByRole('button', {name: '确认删除'}));
        await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.some(commandCall('channel-delete', 'POST'))).toBe(true));
        const deletion = (global.fetch as jest.Mock).mock.calls.find(commandCall('channel-delete', 'POST')) as FetchCall;
        expect(JSON.parse(String(deletion[1]?.body))).toEqual({channel: 'legacy', team: 'platform', confirm: true});
    });

    it('omits blank optional team values from join and channel deletion requests', async () => {
        render(<CrewOperations/>);

        fireEvent.change(screen.getByLabelText('加入频道'), {target: {value: 'engineering'}});
        fireEvent.click(screen.getByRole('button', {name: '加入频道'}));
        fireEvent.click(screen.getByRole('button', {name: '确认执行'}));

        fireEvent.change(screen.getByLabelText('待删除频道'), {target: {value: 'legacy'}});
        fireEvent.click(screen.getByRole('button', {name: '删除频道'}));
        fireEvent.click(screen.getByRole('button', {name: '确认删除'}));

        await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.some(commandCall('channel-delete', 'POST'))).toBe(true));
        const join = (global.fetch as jest.Mock).mock.calls.find(commandCall('join', 'POST')) as FetchCall;
        const deletion = (global.fetch as jest.Mock).mock.calls.find(commandCall('channel-delete', 'POST')) as FetchCall;
        expect(JSON.parse(String(join[1]?.body))).toEqual({channel: 'engineering'});
        expect(JSON.parse(String(deletion[1]?.body))).toEqual({channel: 'legacy', confirm: true});
    });

    it('traps keyboard focus in confirmations and restores it after Escape', () => {
        render(<CrewOperations/>);
        const trigger = screen.getByRole('button', {name: '轮换连接凭据'});
        trigger.focus();
        fireEvent.click(trigger);

        const confirm = screen.getByRole('button', {name: '确认轮换'});
        const cancel = screen.getByRole('button', {name: '取消'});
        expect(confirm).toHaveFocus();
        fireEvent.keyDown(confirm, {key: 'Tab'});
        expect(cancel).toHaveFocus();
        fireEvent.keyDown(cancel, {key: 'Tab'});
        expect(confirm).toHaveFocus();
        fireEvent.keyDown(confirm, {key: 'Escape'});
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
    });

    it('traps and restores confirmation focus inside a ShadowRoot', () => {
        const host = document.createElement('div');
        const shadow = host.attachShadow({mode: 'open'});
        document.body.append(host);
        const view = within(shadow as unknown as HTMLElement);
        render(<CrewOperations/>, {container: shadow});
        const trigger = view.getByRole('button', {name: '轮换连接凭据'});
        trigger.focus();
        fireEvent.click(trigger);

        const confirm = view.getByRole('button', {name: '确认轮换'});
        const cancel = view.getByRole('button', {name: '取消'});
        expect(shadow.activeElement).toBe(confirm);
        fireEvent.keyDown(confirm, {key: 'Tab', shiftKey: true});
        expect(shadow.activeElement).toBe(cancel);
        fireEvent.keyDown(cancel, {key: 'Tab'});
        expect(shadow.activeElement).toBe(confirm);
        fireEvent.keyDown(confirm, {key: 'Tab'});
        expect(shadow.activeElement).toBe(cancel);
        fireEvent.keyDown(cancel, {key: 'Tab'});
        expect(shadow.activeElement).toBe(confirm);
        fireEvent.keyDown(confirm, {key: 'Escape'});
        expect(view.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(shadow.activeElement).toBe(trigger);
        host.remove();
    });

    it('names each join or management target before the user confirms its typed command', async () => {
        render(<CrewOperations/>);

        fireEvent.change(screen.getByLabelText('加入频道'), {target: {value: 'engineering'}});
        fireEvent.click(screen.getByRole('button', {name: '加入频道'}));
        expect(screen.getByRole('alertdialog')).toHaveTextContent('engineering');
        expect((global.fetch as jest.Mock).mock.calls.some(commandCall('join', 'POST'))).toBe(false);
        fireEvent.click(screen.getByRole('button', {name: '确认执行'}));

        fireEvent.change(screen.getByLabelText('新团队标识'), {target: {value: 'platform'}});
        fireEvent.click(screen.getByRole('button', {name: '创建团队'}));
        expect(screen.getByRole('alertdialog')).toHaveTextContent('platform');
        fireEvent.click(screen.getByRole('button', {name: '确认执行'}));

        fireEvent.change(screen.getByLabelText('新频道团队'), {target: {value: 'platform'}});
        fireEvent.change(screen.getByLabelText('新频道标识'), {target: {value: 'releases'}});
        fireEvent.click(screen.getByRole('button', {name: '创建频道'}));
        expect(screen.getByRole('alertdialog')).toHaveTextContent('platform / releases');
        fireEvent.click(screen.getByRole('button', {name: '确认执行'}));

        fireEvent.change(screen.getByLabelText('添加成员团队'), {target: {value: 'platform'}});
        fireEvent.change(screen.getByLabelText('成员用户名'), {target: {value: 'ada,grace'}});
        fireEvent.click(screen.getByRole('button', {name: '添加成员'}));
        expect(screen.getByRole('alertdialog')).toHaveTextContent('platform：ada, grace');
        fireEvent.click(screen.getByRole('button', {name: '确认执行'}));

        await waitFor(() => {
            for (const name of ['join', 'create-team', 'create-channel', 'team-add']) {
                expect((global.fetch as jest.Mock).mock.calls.some(commandCall(name, 'POST'))).toBe(true);
            }
        });
    });
});
