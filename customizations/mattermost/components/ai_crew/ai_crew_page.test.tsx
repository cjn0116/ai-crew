import React from 'react';
import {fireEvent, render, within} from '@testing-library/react';

import AiCrewPage from './ai_crew_page';

describe('Multica page isolation', () => {
    it('renders content and styles inside its own shadow root', async () => {
        global.fetch = jest.fn(async () => ({ok: true, json: async () => ({workspaces: []})})) as jest.Mock;
        const {container, unmount} = render(<AiCrewPage/>);
        const host = container.querySelector('[data-testid="multica-page"]')!;
        const shadow = host.shadowRoot!;
        const page = within(shadow as unknown as HTMLElement);

        expect(await page.findByText('当前小组暂无工单')).toBeInTheDocument();
        fireEvent.click(page.getByRole('button', {name: '切换应用：Multica'}));
        expect(page.getByRole('menuitem', {name: 'Mattermost'})).toHaveAttribute('href', '/');
        expect(page.getAllByRole('menuitem')).toHaveLength(2);
        expect(container.querySelector('.AiCrewConsole')).toBeNull();
        expect(shadow.querySelector('style')?.textContent).toContain('--multica-surface');
        expect(shadow.querySelector('style')?.textContent).toContain('--crew-switcher-bg: var(--multica-card)');
        unmount();
        expect(container.children).toHaveLength(0);
    });
});
