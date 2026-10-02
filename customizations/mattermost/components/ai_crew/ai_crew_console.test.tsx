// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import React from 'react';

import AiCrewConsole from './ai_crew_console';
import crewStyles from './ai_crew_styles';

const responses: Record<string, unknown> = {
    '/api/ai-crew/workspaces': {
        ok: true,
        workspaces: [
            {workspace: 'Synapse OS', slug: 'synapse-os', issue_prefix: 'SYNA'},
            {workspace: '风机研发', slug: 'wind-rd', issue_prefix: 'WIND'},
        ],
    },
    '/api/ai-crew/projects?workspace=synapse-os': {
        ok: true,
        projects: [
            {id: 'p1', title: '应用治理', status: 'in_progress', issue_count: 1},
            {id: 'p2', title: '平台体验', status: 'planned', issue_count: 1},
        ],
    },
    '/api/ai-crew/issues?workspace=synapse-os': {
        ok: true,
        issues: [
            {id: 'i1', title: '统一应用审计', status: 'open', identifier: 'SYNA-42', project: {title: '应用治理'}},
            {id: 'i2', title: '优化移动端导航', status: 'in_progress', identifier: 'SYNA-43', project: {id: 'p2', title: '平台体验'}},
        ],
    },
    '/api/ai-crew/issue-statuses?workspace=synapse-os': {ok: true, statuses: [
        {key: 'todo', name: 'Todo', category: 'unstarted'},
        {key: 'in_progress', name: 'In Progress', category: 'started'},
        {key: 'in_review', name: 'In Review', category: 'started'},
        {key: 'done', name: 'Done', category: 'done'},
        {key: 'qa', name: 'QA', category: 'started'},
    ]},
    '/api/ai-crew/projects?workspace=wind-rd': {ok: true, projects: [{id: 'p3', title: '叶片设计', status: 'in_progress', issue_count: 1}]},
    '/api/ai-crew/issues?workspace=wind-rd': {ok: true, issues: [{id: 'i3', title: '校核叶片载荷', status: 'open', identifier: 'WIND-7', project_id: 'p3'}]},
    '/api/ai-crew/issue-statuses?workspace=wind-rd': {ok: true, statuses: [
        {key: 'todo', name: 'Todo', category: 'unstarted'},
        {key: 'done', name: 'Done', category: 'done'},
    ]},
};

describe('AiCrewConsole', () => {
    beforeEach(() => {
        global.fetch = jest.fn(async (input) => ({
            ok: true,
            json: async () => responses[String(input)],
        })) as jest.Mock;
    });

    afterEach(() => jest.useRealTimers());

    it('announces loading and exposes an empty-state explanation', async () => {
        let resolveWorkspaces: (value: unknown) => void = () => {};
        global.fetch = jest.fn(() => new Promise((resolve) => { resolveWorkspaces = resolve; })) as jest.Mock;
        render(<AiCrewConsole/>);
        expect(screen.getByRole('status')).toHaveTextContent('正在载入...');
        expect(screen.getByLabelText('工单内容')).toHaveAttribute('aria-busy', 'true');
        await act(async () => {
            resolveWorkspaces({ok: true, json: async () => ({workspaces: []})});
        });
        expect(await screen.findByText('当前小组暂无工单')).toBeInTheDocument();
        expect(screen.getByText('工单将在这里按项目集中展示。')).toBeInTheDocument();
        expect(screen.getByLabelText('工单内容')).toHaveAttribute('aria-busy', 'false');
    });

    it('shows issues and filters them by project', async () => {
        render(<AiCrewConsole/>);

        expect(await screen.findByText('统一应用审计')).toBeInTheDocument();
        expect(screen.getByText('优化移动端导航')).toBeInTheDocument();
        const projectLabel = screen.getByText('项目', {selector: '.AiCrewConsole__projectLabel span'}).parentElement;
        expect(projectLabel).toHaveTextContent('项目');
        expect(projectLabel?.querySelector('small')).toBeNull();
        expect(screen.getByRole('button', {name: '筛选项目：应用治理'}).querySelector('small')).toHaveTextContent('1');

        fireEvent.click(screen.getByRole('button', {name: '筛选项目：应用治理'}));
        expect(screen.getByText('统一应用审计')).toBeInTheDocument();
        expect(screen.queryByText('优化移动端导航')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: '显示全部工单'}));
        expect(screen.getByText('优化移动端导航')).toBeInTheDocument();
    });

    it('refreshes the selected workspace and shows the newest issue without a page reload', async () => {
        let currentIssues = responses['/api/ai-crew/issues?workspace=synapse-os'];
        global.fetch = jest.fn(async (input) => ({
            ok: true,
            json: async () => String(input).includes('/issues?') ? currentIssues : responses[String(input)],
        })) as jest.Mock;
        render(<AiCrewConsole/>);
        expect(await screen.findByText('统一应用审计')).toBeInTheDocument();

        currentIssues = {issues: [{id: 'new', title: '刚更新的工单', status: 'todo', identifier: 'SYNA-99'}]};
        fireEvent.click(screen.getByRole('button', {name: '刷新当前小组'}));

        expect(await screen.findByText('刚更新的工单')).toBeInTheDocument();
        expect(screen.queryByText('统一应用审计')).not.toBeInTheDocument();
        expect(screen.getByText('SYNA-99')).toBeInTheDocument();
        expect(screen.getByText(/上次更新/)).toBeInTheDocument();
    });

    it('refreshes when the page becomes visible and preserves the current project filter', async () => {
        let currentIssues = responses['/api/ai-crew/issues?workspace=synapse-os'];
        global.fetch = jest.fn(async (input) => ({
            ok: true,
            json: async () => String(input).includes('/issues?') ? currentIssues : responses[String(input)],
        })) as jest.Mock;
        render(<AiCrewConsole/>);
        fireEvent.click(await screen.findByRole('button', {name: '筛选项目：应用治理'}));

        currentIssues = {issues: [{id: 'new', title: '项目新工单', project: {title: '应用治理'}}]};
        fireEvent(window, new Event('focus'));

        expect(await screen.findByText('项目新工单')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: '筛选项目：应用治理'})).toHaveAttribute('aria-current', 'page');
    });

    it('polls the active workspace while the page remains open', async () => {
        jest.useFakeTimers();
        let currentIssues = responses['/api/ai-crew/issues?workspace=synapse-os'];
        global.fetch = jest.fn(async (input) => ({
            ok: true,
            json: async () => String(input).includes('/issues?') ? currentIssues : responses[String(input)],
        })) as jest.Mock;
        render(<AiCrewConsole/>);
        await act(async () => { await Promise.resolve(); });
        expect(screen.getByText('统一应用审计')).toBeInTheDocument();

        currentIssues = {issues: [{id: 'fresh', title: '定时同步的工单', status: 'todo'}]};
        await act(async () => {
            jest.advanceTimersByTime(60_000);
        });

        expect(screen.getByText('定时同步的工单')).toBeInTheDocument();
    });

    it('allows refresh in the new workspace after an earlier refresh remains pending', async () => {
        render(<AiCrewConsole/>);
        await screen.findByText('统一应用审计');
        global.fetch = jest.fn((input) => String(input).includes('synapse-os') ? new Promise(() => {}) : Promise.resolve({
            ok: true,
            json: async () => responses[String(input)],
        })) as jest.Mock;

        fireEvent.click(screen.getByRole('button', {name: '刷新当前小组'}));
        fireEvent.click(screen.getByRole('button', {name: '切换到小组：风机研发'}));

        expect(await screen.findByText('校核叶片载荷')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: '刷新当前小组'})).toBeEnabled();
    });

    it('finishes foreground loading when a focus refresh supersedes it', async () => {
        const projectResolvers: Array<(value: unknown) => void> = [];
        const issueResolvers: Array<(value: unknown) => void> = [];
        global.fetch = jest.fn((input) => {
            const url = String(input);
            if (url === '/api/ai-crew/workspaces') {
                return Promise.resolve({ok: true, json: async () => responses[url]});
            }
            if (url.includes('/projects?workspace=synapse-os')) {
                return new Promise((resolve) => projectResolvers.push((data) => resolve({ok: true, json: async () => data})));
            }
            if (url.includes('/issues?workspace=synapse-os')) {
                return new Promise((resolve) => issueResolvers.push((data) => resolve({ok: true, json: async () => data})));
            }
            return Promise.resolve({ok: true, json: async () => responses[url]});
        }) as jest.Mock;
        render(<AiCrewConsole/>);
        await waitFor(() => expect(projectResolvers).toHaveLength(1));

        fireEvent(window, new Event('focus'));
        await waitFor(() => expect(projectResolvers).toHaveLength(2));
        await act(async () => {
            projectResolvers[1]({projects: [{id: 'fresh', title: '最新项目'}]});
            issueResolvers[1]({issues: [{id: 'fresh', title: '焦点刷新工单', project_id: 'fresh'}]});
        });

        expect(await screen.findByText('焦点刷新工单')).toBeInTheDocument();
        expect(screen.getByLabelText('工单内容')).toHaveAttribute('aria-busy', 'false');
    });

    it('keeps the last good issue list visible when refresh fails', async () => {
        let failIssues = false;
        global.fetch = jest.fn(async (input) => ({
            ok: !(failIssues && String(input).includes('/issues?')),
            status: 502,
            json: async () => responses[String(input)],
        })) as jest.Mock;
        render(<AiCrewConsole/>);
        expect(await screen.findByText('统一应用审计')).toBeInTheDocument();

        failIssues = true;
        fireEvent.click(screen.getByRole('button', {name: '刷新当前小组'}));

        expect(await screen.findByText(/显示上次成功获取的数据/)).toBeInTheDocument();
        expect(screen.getByText('统一应用审计')).toBeInTheDocument();
    });

    it('lists agents for the selected workspace', async () => {
        global.fetch = jest.fn(async (input) => ({
            ok: true,
            json: async () => String(input).includes('/commands/agents?') ? {
                ok: true,
                command: 'agents',
                data: {ok: true, workspace: 'synapse-os', data: [{id: 'a1', name: '巡检助手', status: 'active'}]},
            } : responses[String(input)],
        })) as jest.Mock;
        render(<AiCrewConsole/>);
        await screen.findByText('统一应用审计');
        fireEvent.click(screen.getByRole('button', {name: '显示智能体'}));

        expect(await screen.findByText('巡检助手')).toBeInTheDocument();
        expect(global.fetch).toHaveBeenCalledWith('/api/ai-crew/commands/agents?workspace=synapse-os', expect.anything());
    });

    it('finishes the first agents load when a focus refresh supersedes it', async () => {
        const agentResolvers: Array<(value: unknown) => void> = [];
        global.fetch = jest.fn((input) => {
            const url = String(input);
            if (url.includes('/commands/agents?')) {
                return new Promise((resolve) => agentResolvers.push((data) => resolve({ok: true, json: async () => data})));
            }
            return Promise.resolve({ok: true, json: async () => responses[url]});
        }) as jest.Mock;
        render(<AiCrewConsole/>);
        await screen.findByText('统一应用审计');
        fireEvent.click(screen.getByRole('button', {name: '显示智能体'}));
        await waitFor(() => expect(agentResolvers).toHaveLength(1));

        fireEvent(window, new Event('focus'));
        await waitFor(() => expect(agentResolvers).toHaveLength(2));
        await act(async () => {
            agentResolvers[1]({data: {data: [{id: 'fresh', name: '焦点刷新智能体'}]}});
        });

        expect(await screen.findByText('焦点刷新智能体')).toBeInTheDocument();
        expect(screen.getByLabelText('工单内容')).toHaveAttribute('aria-busy', 'false');
    });

    it('does not show agents from the previous workspace when the new workspace agent request fails', async () => {
        global.fetch = jest.fn(async (input) => {
            const url = String(input);
            if (url.includes('/commands/agents?workspace=wind-rd')) {
                return {ok: false, status: 502, json: async () => ({})};
            }
            if (url.includes('/commands/agents?')) {
                return {ok: true, json: async () => ({data: {data: [{id: 'a1', name: 'Synapse 智能体'}]}})};
            }
            return {ok: true, json: async () => responses[url]};
        }) as jest.Mock;
        render(<AiCrewConsole/>);
        await screen.findByText('统一应用审计');
        fireEvent.click(screen.getByRole('button', {name: '显示智能体'}));
        expect(await screen.findByText('Synapse 智能体')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: '切换到小组：风机研发'}));

        expect(await screen.findByRole('alert')).toHaveTextContent('智能体载入失败');
        expect(screen.queryByText('Synapse 智能体')).not.toBeInTheDocument();
    });

    it('clears agents when switching workspaces outside the agents view before a later agent request fails', async () => {
        global.fetch = jest.fn(async (input) => {
            const url = String(input);
            if (url.includes('/commands/agents?workspace=wind-rd')) {
                return {ok: false, status: 502, json: async () => ({})};
            }
            if (url.includes('/commands/agents?')) {
                return {ok: true, json: async () => ({data: {data: [{id: 'a1', name: 'Synapse 智能体'}]}})};
            }
            return {ok: true, json: async () => responses[url]};
        }) as jest.Mock;
        render(<AiCrewConsole/>);
        await screen.findByText('统一应用审计');
        fireEvent.click(screen.getByRole('button', {name: '显示智能体'}));
        expect(await screen.findByText('Synapse 智能体')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: '显示全部工单'}));
        fireEvent.click(screen.getByRole('button', {name: '切换到小组：风机研发'}));
        expect(await screen.findByText('校核叶片载荷')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: '显示智能体'}));

        expect(await screen.findByRole('alert')).toHaveTextContent('智能体载入失败');
        expect(screen.queryByText('Synapse 智能体')).not.toBeInTheDocument();
    });

    it('opens capability operations from the settings menu at the end of the workspace rail', async () => {
        render(<AiCrewConsole/>);

        await screen.findByText('统一应用审计');
        const workspaceRail = screen.getByRole('navigation', {name: '小组'});
        const settings = within(workspaceRail).getByRole('button', {name: '设置'});
        expect(settings.parentElement).toBe(workspaceRail.lastElementChild);
        expect(screen.queryByRole('button', {name: '显示班组操作'})).not.toBeInTheDocument();
        fireEvent.click(settings);
        expect(settings).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(screen.getByRole('menuitem', {name: '班组操作'}));

        expect(screen.getByRole('heading', {name: '班组操作', level: 1})).toBeInTheDocument();
        expect(screen.getByText('当前工作区：synapse-os')).toBeInTheDocument();
        expect(screen.getByRole('region', {name: '班组操作'})).toBeInTheDocument();
        expect(settings).toHaveAttribute('aria-expanded', 'false');
    });

    it('closes the settings menu with Escape', async () => {
        render(<AiCrewConsole/>);
        await screen.findByText('统一应用审计');
        const settings = screen.getByRole('button', {name: '设置'});
        fireEvent.click(settings);
        expect(screen.getByRole('menuitem', {name: '班组操作'})).toBeInTheDocument();
        fireEvent.keyDown(settings, {key: 'Escape'});
        expect(screen.queryByRole('menuitem', {name: '班组操作'})).not.toBeInTheDocument();
        expect(settings).toHaveFocus();
    });

    it('keeps agents from the currently selected workspace when older requests finish last', async () => {
        const pending = new Map<string, (value: unknown) => void>();
        global.fetch = jest.fn((input) => {
            const url = String(input);
            if (url.includes('/commands/agents?')) {
                return new Promise((resolve) => pending.set(url, (value) => resolve({ok: true, json: async () => value})));
            }
            return Promise.resolve({ok: true, json: async () => responses[url]});
        }) as jest.Mock;
        render(<AiCrewConsole/>);
        await screen.findByText('统一应用审计');
        fireEvent.click(screen.getByRole('button', {name: '显示智能体'}));
        fireEvent.click(screen.getByRole('button', {name: '切换到小组：风机研发'}));
        expect(pending.has('/api/ai-crew/commands/agents?workspace=wind-rd')).toBe(true);

        await act(async () => {
            pending.get('/api/ai-crew/commands/agents?workspace=wind-rd')?.({data: {data: [{id: 'new', name: '新小组智能体'}]}});
        });
        expect(await screen.findByText('新小组智能体')).toBeInTheDocument();
        await act(async () => {
            pending.get('/api/ai-crew/commands/agents?workspace=synapse-os')?.({data: {data: [{id: 'old', name: '旧小组智能体'}]}});
        });
        expect(screen.getByText('新小组智能体')).toBeInTheDocument();
        expect(screen.queryByText('旧小组智能体')).not.toBeInTheDocument();
    });

    it('creates an issue and reloads the current workspace', async () => {
        let latestIssues = responses['/api/ai-crew/issues?workspace=synapse-os'];
        const requestBodies: unknown[] = [];
        global.fetch = jest.fn(async (input, options) => {
            if (String(input) === '/api/ai-crew/commands/issue-new') {
                requestBodies.push(JSON.parse(String(options?.body)));
                latestIssues = {issues: [{id: 'new', title: '验证工单同步', status: 'todo', identifier: 'SYNA-99'}]};
                return {ok: true, json: async () => ({ok: true, command: 'issue-new', data: {ok: true}})};
            }
            return {ok: true, json: async () => String(input).includes('/issues?') ? latestIssues : responses[String(input)]};
        }) as jest.Mock;
        render(<AiCrewConsole/>);
        fireEvent.click(await screen.findByRole('button', {name: '新建工单'}));
        fireEvent.change(screen.getByRole('textbox', {name: '工单标题'}), {target: {value: '验证工单同步'}});
        fireEvent.click(screen.getByRole('button', {name: '创建工单'}));

        expect(await screen.findByText('验证工单同步')).toBeInTheDocument();
        expect(requestBodies).toEqual([{title: '验证工单同步', workspace: 'synapse-os'}]);
    });

    it('does not reload an old workspace after issue creation finishes following a workspace switch', async () => {
        let resolveCreate: (value: unknown) => void = () => {};
        global.fetch = jest.fn((input) => {
            const url = String(input);
            if (url === '/api/ai-crew/commands/issue-new') {
                return new Promise((resolve) => { resolveCreate = (data) => resolve({ok: true, json: async () => data}); });
            }
            return Promise.resolve({ok: true, json: async () => responses[url]});
        }) as jest.Mock;
        render(<AiCrewConsole/>);
        fireEvent.click(await screen.findByRole('button', {name: '新建工单'}));
        fireEvent.change(screen.getByRole('textbox', {name: '工单标题'}), {target: {value: '只属于 Synapse 的工单'}});
        fireEvent.click(screen.getByRole('button', {name: '创建工单'}));
        fireEvent.click(screen.getByRole('button', {name: '切换到小组：风机研发'}));
        expect(await screen.findByText('校核叶片载荷')).toBeInTheDocument();

        await act(async () => { resolveCreate({ok: true, data: {ok: true}}); });

        await waitFor(() => expect(screen.getByText('校核叶片载荷')).toBeInTheDocument());
        expect(screen.queryByText('统一应用审计')).not.toBeInTheDocument();
        expect((global.fetch as jest.Mock).mock.calls.filter(([url]) => String(url) === '/api/ai-crew/projects?workspace=synapse-os')).toHaveLength(1);
    });

    it('resets the issue project selection when changing workspaces', async () => {
        const requestBodies: unknown[] = [];
        global.fetch = jest.fn(async (input, options) => {
            if (String(input) === '/api/ai-crew/commands/issue-new') {
                requestBodies.push(JSON.parse(String(options?.body)));
                return {ok: true, json: async () => ({ok: true})};
            }
            return {ok: true, json: async () => responses[String(input)]};
        }) as jest.Mock;
        render(<AiCrewConsole/>);
        fireEvent.click(await screen.findByRole('button', {name: '新建工单'}));
        fireEvent.change(screen.getByRole('combobox', {name: '项目'}), {target: {value: 'p1'}});
        fireEvent.click(screen.getByRole('button', {name: '切换到小组：风机研发'}));

        expect(await screen.findByText('校核叶片载荷')).toBeInTheDocument();
        expect(screen.getByRole('combobox', {name: '项目'})).toHaveValue('');
        fireEvent.change(screen.getByRole('textbox', {name: '工单标题'}), {target: {value: '新小组工单'}});
        fireEvent.click(screen.getByRole('button', {name: '创建工单'}));
        await waitFor(() => expect(requestBodies).toEqual([{title: '新小组工单', workspace: 'wind-rd'}]));
    });

    it('refreshes the agents view through focus, manual refresh, and the interval', async () => {
        jest.useFakeTimers();
        let agentName = '初始智能体';
        global.fetch = jest.fn(async (input) => ({
            ok: true,
            json: async () => String(input).includes('/commands/agents?') ? {ok: true, command: 'agents', data: {ok: true, workspace: 'synapse-os', data: [{id: agentName, name: agentName}]}} : responses[String(input)],
        })) as jest.Mock;
        render(<AiCrewConsole/>);
        await screen.findByText('统一应用审计');
        fireEvent.click(await screen.findByRole('button', {name: '显示智能体'}));
        expect(await screen.findByText('初始智能体')).toBeInTheDocument();

        agentName = '焦点智能体';
        fireEvent(window, new Event('focus'));
        expect(await screen.findByText('焦点智能体')).toBeInTheDocument();

        agentName = '手动智能体';
        fireEvent.click(screen.getByRole('button', {name: '刷新当前小组'}));
        expect(await screen.findByText('手动智能体')).toBeInTheDocument();

        agentName = '定时智能体';
        await act(async () => { jest.advanceTimersByTime(60_000); });
        expect(screen.getByText('定时智能体')).toBeInTheDocument();
    });

    it('keeps the agent list visible with a stale state when a refresh fails', async () => {
        let failAgents = false;
        global.fetch = jest.fn(async (input) => ({
            ok: !(failAgents && String(input).includes('/commands/agents?')),
            json: async () => String(input).includes('/commands/agents?') ? {ok: true, command: 'agents', data: {ok: true, workspace: 'synapse-os', data: [{id: 'a1', name: '巡检助手'}]}} : responses[String(input)],
        })) as jest.Mock;
        render(<AiCrewConsole/>);
        await screen.findByText('统一应用审计');
        fireEvent.click(await screen.findByRole('button', {name: '显示智能体'}));
        expect(await screen.findByText('巡检助手')).toBeInTheDocument();

        failAgents = true;
        fireEvent.click(screen.getByRole('button', {name: '刷新当前小组'}));

        expect(await screen.findByText('刷新失败，显示上次成功获取的数据。')).toBeInTheDocument();
        expect(screen.getByText('巡检助手')).toBeInTheDocument();
    });

    it('labels the status values used by live Multica issues', async () => {
        global.fetch = jest.fn(async (input) => ({
            ok: true,
            json: async () => String(input).includes('/issues?') ? {issues: [
                {id: 'todo', title: '待办测试', status: 'todo'},
                {id: 'review', title: '审核测试', status: 'in_review'},
                {id: 'done', title: '完成测试', status: 'done'},
            ]} : responses[String(input)],
        })) as jest.Mock;
        render(<AiCrewConsole/>);
        expect(await screen.findByText('待办测试')).toBeInTheDocument();
        expect((screen.getByRole('combobox', {name: '修改 待办测试 状态'}) as HTMLSelectElement).selectedOptions[0]).toHaveTextContent('Todo');
        expect((screen.getByRole('combobox', {name: '修改 审核测试 状态'}) as HTMLSelectElement).selectedOptions[0]).toHaveTextContent('In Review');
        expect((screen.getByRole('combobox', {name: '修改 完成测试 状态'}) as HTMLSelectElement).selectedOptions[0]).toHaveTextContent('Done');
    });

    it('uses an English status label even if the catalog name is localized', async () => {
        global.fetch = jest.fn(async (input) => ({
            ok: true,
            json: async () => String(input).includes('/issue-statuses?workspace=synapse-os') ?
                {statuses: [{key: 'in_progress', name: '进行中', category: 'started'}, {key: 'qa', name: 'QA', category: 'started'}]} :
                responses[String(input)],
        })) as jest.Mock;
        render(<AiCrewConsole/>);

        const control = await screen.findByRole('combobox', {name: '修改 SYNA-43 状态'});
        expect((control as HTMLSelectElement).selectedOptions[0]).toHaveTextContent('In Progress');
        fireEvent.change(control, {target: {value: 'qa'}});
        expect(screen.queryByRole('alertdialog', {name: '确认修改工单状态'})).not.toBeInTheDocument();
    });

    it('saves a selected status without opening a confirmation dialog', async () => {
        render(<AiCrewConsole/>);
        const control = await screen.findByRole('combobox', {name: '修改 SYNA-43 状态'});

        fireEvent.change(control, {target: {value: 'qa'}});

        await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.some(([input, init]) => String(input) === '/api/ai-crew/issues/i2/status' && init?.method === 'PUT')).toBe(true));
        expect(screen.queryByRole('alertdialog', {name: '确认修改工单状态'})).not.toBeInTheDocument();
        expect(control).toHaveValue('in_progress');
    });

    it('writes the selected status and reloads only the active workspace', async () => {
        let latestIssues = responses['/api/ai-crew/issues?workspace=synapse-os'];
        global.fetch = jest.fn(async (input, init) => {
            if (init?.method === 'PUT') {
                latestIssues = {issues: [{id: 'i2', title: '优化移动端导航', status: 'qa', identifier: 'SYNA-43'}]};
                return {ok: true, json: async () => ({ok: true})};
            }
            return {ok: true, json: async () => String(input).includes('/issues?workspace=synapse-os') ? latestIssues : responses[String(input)]};
        }) as jest.Mock;
        render(<AiCrewConsole/>);
        fireEvent.change(await screen.findByRole('combobox', {name: '修改 SYNA-43 状态'}), {target: {value: 'qa'}});

        await waitFor(() => expect(screen.getByRole('combobox', {name: '修改 SYNA-43 状态'})).toHaveValue('qa'));
        expect(screen.queryByRole('alertdialog', {name: '确认修改工单状态'})).not.toBeInTheDocument();
        const writes = (global.fetch as jest.Mock).mock.calls.filter(([, init]) => init?.method === 'PUT');
        expect(writes).toHaveLength(1);
        expect(writes[0][0]).toBe('/api/ai-crew/issues/i2/status');
        expect(JSON.parse(writes[0][1].body)).toEqual({workspace: 'synapse-os', status: 'qa', confirm: true});
    });

    it('retains the old status and offers a retry when updating fails', async () => {
        global.fetch = jest.fn(async (input, init) => init?.method === 'PUT' ?
            {ok: false, status: 502, json: async () => ({})} :
            {ok: true, json: async () => responses[String(input)]}) as jest.Mock;
        render(<AiCrewConsole/>);
        const control = await screen.findByRole('combobox', {name: '修改 SYNA-43 状态'});
        fireEvent.change(control, {target: {value: 'qa'}});

        expect(await screen.findByText('修改工单状态失败，请重试。')).toBeInTheDocument();
        expect(control).toHaveValue('in_progress');
        expect(control).toBeEnabled();
        expect(screen.queryByRole('alertdialog', {name: '确认修改工单状态'})).not.toBeInTheDocument();
    });

    it('does not offer edits when the workspace status catalog is unavailable', async () => {
        global.fetch = jest.fn(async (input) => String(input).includes('/issue-statuses?') ?
            {ok: false, status: 502, json: async () => ({})} :
            {ok: true, json: async () => responses[String(input)]}) as jest.Mock;
        render(<AiCrewConsole/>);

        expect(await screen.findByText('优化移动端导航')).toBeInTheDocument();
        expect(screen.queryByRole('combobox', {name: '修改 SYNA-43 状态'})).not.toBeInTheDocument();
        expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    it('offers the first catalog status for an issue with no status', async () => {
        global.fetch = jest.fn(async (input) => ({
            ok: true,
            json: async () => String(input).includes('/issues?workspace=synapse-os') ? {issues: [{id: 'unset', title: '未分类工单', identifier: 'SYNA-44'}]} : responses[String(input)],
        })) as jest.Mock;
        render(<AiCrewConsole/>);
        const control = await screen.findByRole('combobox', {name: '修改 SYNA-44 状态'});
        expect(control).toHaveValue('');
        expect((control as HTMLSelectElement).selectedOptions[0]).toHaveTextContent('Not set');
        fireEvent.change(control, {target: {value: 'todo'}});
        await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.some(([input, init]) => input === '/api/ai-crew/issues/unset/status' && init?.method === 'PUT')).toBe(true));
        expect(screen.queryByRole('alertdialog', {name: '确认修改工单状态'})).not.toBeInTheDocument();
    });

    it('does not reload an old workspace after its status write finishes', async () => {
        let finishWrite: (response: unknown) => void = () => {};
        global.fetch = jest.fn((input, init) => init?.method === 'PUT' ?
            new Promise((resolve) => { finishWrite = resolve; }) :
            Promise.resolve({ok: true, json: async () => responses[String(input)]})) as jest.Mock;
        render(<AiCrewConsole/>);
        fireEvent.change(await screen.findByRole('combobox', {name: '修改 SYNA-43 状态'}), {target: {value: 'qa'}});
        fireEvent.click(screen.getByRole('button', {name: '切换到小组：风机研发'}));
        expect(await screen.findByRole('combobox', {name: '修改 WIND-7 状态'})).toBeEnabled();
        await act(async () => { finishWrite({ok: true, json: async () => ({ok: true})}); });

        expect(await screen.findByText('校核叶片载荷')).toBeInTheDocument();
        expect((global.fetch as jest.Mock).mock.calls.filter(([input]) => String(input).includes('/issues?workspace=wind-rd'))).toHaveLength(1);
    });

    it('separates issue titles from content and expands long descriptions', async () => {
        const scrollHeight = jest.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function (this: Element) {
            return this.textContent?.includes('第二段是完整工单说明') ? 54 : 18;
        });
        const clientHeight = jest.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(36);
        global.fetch = jest.fn(async (input) => ({
            ok: true,
            json: async () => String(input).includes('/issues?') ? {issues: [
                {id: 'with-content', title: '独立标题', description: '第一段内容。\n第二段是完整工单说明。\n第三段继续。', status: 'todo', identifier: 'SYNA-42'},
                {id: 'short-content', title: '短内容工单', description: '短内容。', status: 'todo', identifier: 'SYNA-44'},
                {id: 'without-content', title: '无内容工单', description: '', status: 'done', identifier: 'SYNA-43'},
            ]} : responses[String(input)],
        })) as jest.Mock;
        render(<AiCrewConsole/>);
        const title = await screen.findByText('独立标题');
        expect(title.tagName).toBe('STRONG');
        expect(screen.getByText(/第一段内容。/).textContent).toBe('第一段内容。\n第二段是完整工单说明。\n第三段继续。');
        const expand = screen.getByRole('button', {name: '展开 SYNA-42 内容'});
        expect(expand).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(expand);
        expect(expand).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('button', {name: '收起 SYNA-42 内容'})).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: /SYNA-44 内容/})).not.toBeInTheDocument();
        expect(screen.queryByRole('button', {name: /SYNA-43 内容/})).not.toBeInTheDocument();
        scrollHeight.mockRestore();
        clientHeight.mockRestore();
    });

    it('compiles distinct green, blue, and yellow issue status colors', () => {
        expect(crewStyles).toMatch(/\.AiCrewConsole__status--done[^{}]*\{[^{}]*color:\s*#237a4b/);
        expect(crewStyles).toMatch(/\.AiCrewConsole__status--todo[^{}]*\{[^{}]*color:\s*#1d63a6/);
        expect(crewStyles).toMatch(/\.AiCrewConsole__status--in_review[^{}]*\{[^{}]*color:\s*#7a5800/);
        expect(crewStyles).toMatch(/\.AiCrewConsole__issueIcon--done[^{}]*\{[^{}]*background:\s*#49b97a/);
        expect(crewStyles).toMatch(/\.AiCrewConsole__issueIcon--todo[^{}]*\{[^{}]*background:\s*#79b8f3/);
        expect(crewStyles).toMatch(/\.AiCrewConsole__issueIcon--in_review[^{}]*\{[^{}]*background:\s*#ffd35a/);
    });

    it('renders the status selector as text until hover or keyboard focus', () => {
        expect(crewStyles).toMatch(/\.AiCrewConsole__statusSelect\s*\{[^{}]*border:\s*1px solid transparent/);
        expect(crewStyles).toMatch(/\.AiCrewConsole__statusSelect:hover/);
        expect(crewStyles).toMatch(/\.AiCrewConsole__statusSelect:focus-visible/);
    });

    it('does not match missing project IDs to unrelated or unassigned issues', async () => {
        global.fetch = jest.fn(async (input) => ({
            ok: true,
            json: async () => String(input).includes('/projects?') ? {projects: [{title: '无编号项目'}]} :
                String(input).includes('/issues?') ? {issues: [
                    {id: 'match', title: '所属工单', project: {title: '无编号项目'}},
                    {id: 'other', title: '其他项目工单', project: {title: '其他项目'}},
                    {id: 'none', title: '未分配工单'},
                ]} : responses[String(input)],
        })) as jest.Mock;
        render(<AiCrewConsole/>);
        fireEvent.click(await screen.findByRole('button', {name: '筛选项目：无编号项目'}));
        expect(screen.getByText('所属工单')).toBeInTheDocument();
        expect(screen.queryByText('其他项目工单')).not.toBeInTheDocument();
        expect(screen.queryByText('未分配工单')).not.toBeInTheDocument();
    });

    it('switches workspaces from the left navigation and resets the project filter', async () => {
        render(<AiCrewConsole/>);

        expect(await screen.findByText('统一应用审计')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: '筛选项目：应用治理'}));
        fireEvent.click(screen.getByRole('button', {name: '切换到小组：风机研发'}));

        expect(await screen.findByText('校核叶片载荷')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: '显示全部工单'})).toHaveAttribute('aria-current', 'page');
        expect(global.fetch).toHaveBeenCalledWith('/api/ai-crew/projects?workspace=wind-rd', expect.anything());
        expect(global.fetch).toHaveBeenCalledWith('/api/ai-crew/issues?workspace=wind-rd', expect.anything());
    });

    it('switches products through the two-option dropdown', async () => {
        render(<AiCrewConsole/>);

        expect(await screen.findByText('统一应用审计')).toBeInTheDocument();
        expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: '切换应用：Multica'}));
        expect(screen.getAllByRole('menuitem')).toHaveLength(2);
        expect(screen.getByRole('menuitem', {name: 'Mattermost'})).toHaveAttribute('href', '/');
        expect(screen.getByRole('menuitem', {name: 'Multica'})).toHaveAttribute('aria-current', 'page');
        expect(screen.queryByRole('menuitemcheckbox')).not.toBeInTheDocument();
    });

    it('keeps the latest workspace results when requests finish out of order', async () => {
        render(<AiCrewConsole/>);
        expect(await screen.findByText('统一应用审计')).toBeInTheDocument();

        const pending = new Map<string, jest.Mock>();
        global.fetch = jest.fn((input) => new Promise((resolve) => {
            pending.set(String(input), jest.fn((data) => resolve({ok: true, json: async () => data})));
        })) as jest.Mock;

        fireEvent.click(screen.getByRole('button', {name: '切换到小组：风机研发'}));
        fireEvent.click(screen.getByRole('button', {name: '切换到小组：Synapse OS'}));

        await act(async () => {
            pending.get('/api/ai-crew/projects?workspace=synapse-os')?.({projects: [{id: 'latest', title: '最新项目'}]});
            pending.get('/api/ai-crew/issues?workspace=synapse-os')?.({issues: [{id: 'latest', title: '最新小组工单', project_id: 'latest'}]});
        });
        expect(await screen.findByText('最新小组工单')).toBeInTheDocument();

        await act(async () => {
            pending.get('/api/ai-crew/projects?workspace=wind-rd')?.({projects: [{id: 'stale', title: '过期项目'}]});
            pending.get('/api/ai-crew/issues?workspace=wind-rd')?.({issues: [{id: 'stale', title: '过期小组工单', project_id: 'stale'}]});
        });
        expect(screen.getByText('最新小组工单')).toBeInTheDocument();
        expect(screen.queryByText('过期小组工单')).not.toBeInTheDocument();
    });

    it('keeps loading visible when the initial request overlaps a workspace switch', async () => {
        const pending = new Map<string, jest.Mock>();
        global.fetch = jest.fn((input) => {
            if (String(input) === '/api/ai-crew/workspaces') {
                return Promise.resolve({ok: true, json: async () => responses['/api/ai-crew/workspaces']});
            }
            return new Promise((resolve) => {
                pending.set(String(input), jest.fn((data) => resolve({ok: true, json: async () => data})));
            });
        }) as jest.Mock;

        render(<AiCrewConsole/>);
        fireEvent.click(await screen.findByRole('button', {name: '切换到小组：风机研发'}));

        await act(async () => {
            pending.get('/api/ai-crew/projects?workspace=synapse-os')?.({projects: [{id: 'stale', title: '过期项目'}]});
            pending.get('/api/ai-crew/issues?workspace=synapse-os')?.({issues: [{id: 'stale', title: '过期小组工单'}]});
        });
        expect(screen.getByText('正在载入...')).toBeInTheDocument();

        await act(async () => {
            pending.get('/api/ai-crew/projects?workspace=wind-rd')?.({projects: [{id: 'latest', title: '叶片设计'}]});
            pending.get('/api/ai-crew/issues?workspace=wind-rd')?.({issues: [{id: 'latest', title: '校核叶片载荷', project_id: 'latest'}]});
        });
        expect(await screen.findByText('校核叶片载荷')).toBeInTheDocument();
    });

    it('ignores a stale workspace-list error after switching groups', async () => {
        render(<AiCrewConsole/>);
        expect(await screen.findByText('统一应用审计')).toBeInTheDocument();

        global.fetch = jest.fn(async () => ({ok: false, json: async () => ({})})) as jest.Mock;
        fireEvent.click(screen.getByRole('button', {name: '切换到小组：风机研发'}));
        expect(await screen.findByText('暂时无法载入 Multica 数据')).toBeInTheDocument();

        const pending = new Map<string, jest.Mock>();
        global.fetch = jest.fn((input) => new Promise((resolve) => {
            pending.set(String(input), jest.fn((response) => resolve(response)));
        })) as jest.Mock;
        fireEvent.click(screen.getByRole('button', {name: '重试'}));
        fireEvent.click(screen.getByRole('button', {name: '切换到小组：Synapse OS'}));

        await act(async () => {
            pending.get('/api/ai-crew/workspaces')?.({ok: false, json: async () => ({})});
        });
        expect(screen.getByText('正在载入...')).toBeInTheDocument();
        expect(screen.queryByText('暂时无法载入 Multica 数据')).not.toBeInTheDocument();

        await act(async () => {
            pending.get('/api/ai-crew/projects?workspace=synapse-os')?.({ok: true, json: async () => ({projects: [{id: 'latest', title: '最新项目'}]})});
            pending.get('/api/ai-crew/issues?workspace=synapse-os')?.({ok: true, json: async () => ({issues: [{id: 'latest', title: '最新小组工单', project_id: 'latest'}]})});
        });
        expect(await screen.findByText('最新小组工单')).toBeInTheDocument();
    });

    it('shows a retry action when loading fails', async () => {
        global.fetch = jest.fn(async () => ({ok: false, json: async () => ({})})) as jest.Mock;
        render(<AiCrewConsole/>);

        expect(await screen.findByText('暂时无法载入 Multica 数据')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: '重试'}));
        await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    });
});
