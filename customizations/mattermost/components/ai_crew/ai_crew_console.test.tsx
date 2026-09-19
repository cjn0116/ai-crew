// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import React from 'react';

import AiCrewConsole from './ai_crew_console';

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
    '/api/ai-crew/projects?workspace=wind-rd': {ok: true, projects: [{id: 'p3', title: '叶片设计', status: 'in_progress', issue_count: 1}]},
    '/api/ai-crew/issues?workspace=wind-rd': {ok: true, issues: [{id: 'i3', title: '校核叶片载荷', status: 'open', identifier: 'WIND-7', project_id: 'p3'}]},
};

describe('AiCrewConsole', () => {
    beforeEach(() => {
        global.fetch = jest.fn(async (input) => ({
            ok: true,
            json: async () => responses[String(input)],
        })) as jest.Mock;
    });

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

        fireEvent.click(screen.getByRole('button', {name: '筛选项目：应用治理'}));
        expect(screen.getByText('统一应用审计')).toBeInTheDocument();
        expect(screen.queryByText('优化移动端导航')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: '显示全部工单'}));
        expect(screen.getByText('优化移动端导航')).toBeInTheDocument();
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
        expect(screen.getByText('待处理')).toBeInTheDocument();
        expect(screen.getByText('审核中')).toBeInTheDocument();
        expect(screen.getByText('已完成')).toBeInTheDocument();
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
