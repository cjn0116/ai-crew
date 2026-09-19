import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import ProductSwitcher from './product_switcher';

describe('shared product switcher', () => {
    it.each(['Mattermost', 'Multica'] as const)('offers exactly two exclusive destinations from %s', (current) => {
        render(<ProductSwitcher current={current}/>);
        const trigger = screen.getByRole('button', {name: `切换应用：${current}`});
        fireEvent.click(trigger);
        const items = screen.getAllByRole('menuitem');
        expect(items).toHaveLength(2);
        expect(items.filter((item) => item.getAttribute('aria-current') === 'page')).toHaveLength(1);
        expect(screen.getByRole('menuitem', {name: 'Mattermost'})).toHaveAttribute('href', '/');
        expect(screen.getByRole('menuitem', {name: 'Multica'})).toHaveAttribute('href', '/ai-crew');
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(document.querySelector('.icon-check')).toBeNull();
        fireEvent.click(screen.getByRole('menuitem', {name: current}));
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
    });

    it('supports keyboard navigation, Escape and outside clicks', () => {
        render(<ProductSwitcher/>);
        const trigger = screen.getByRole('button', {name: '切换应用：Mattermost'});
        fireEvent.keyDown(trigger, {key: 'ArrowDown'});
        const mattermost = screen.getByRole('menuitem', {name: 'Mattermost'});
        const multica = screen.getByRole('menuitem', {name: 'Multica'});
        expect(mattermost).toHaveFocus();
        fireEvent.keyDown(mattermost, {key: 'ArrowDown'});
        expect(multica).toHaveFocus();
        fireEvent.keyDown(multica, {key: 'Escape'});
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
        fireEvent.click(trigger);
        fireEvent.click(document.body);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
});
