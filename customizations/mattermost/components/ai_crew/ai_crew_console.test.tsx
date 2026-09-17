import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';

import AiCrewConsole from './ai_crew_console';

const responses: Record<string, unknown> = {
    '/api/ai-crew/workspaces': {ok: true, workspaces: [{workspace: 'Synapse OS', slug: 'synapse-os', issue_prefix: 'SYNA'}]},
    '/api/ai-crew/projects?workspace=synapse-os': {ok: true, projects: [{id: 'p1', title: '应用治理', status: 'in_progress', issue_count: 7}]},
    '/api/ai-crew/issues?workspace=synapse-os': {ok: true, issues: [{id: 'i1', title: '统一应用审计', status: 'open', identifier: 'SYNA-42'}]},
};

describe('AiCrewConsole', () => {
    beforeEach(() => {
        global.fetch = jest.fn(async (input) => ({
            ok: true,
            json: async () => responses[String(input)],
        })) as jest.Mock;
    });

    it('loads projects and switches to issues', async () => {
        render(<AiCrewConsole/>);

        expect(await screen.findByText('应用治理')).toBeInTheDocument();
        expect(screen.getByText('7 个工单')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', {name: '工单'}));
        expect(await screen.findByText('统一应用审计')).toBeInTheDocument();
        expect(screen.getByText('SYNA-42')).toBeInTheDocument();
    });

    it('shows a retry action when loading fails', async () => {
        global.fetch = jest.fn(async () => ({ok: false, json: async () => ({})})) as jest.Mock;
        render(<AiCrewConsole/>);

        expect(await screen.findByText('暂时无法载入 Multica 数据')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: '重试'}));
        await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    });
});
