import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import {useSelector} from 'react-redux';

import ProductMenu from './product_menu';

jest.mock('react-redux', () => ({useSelector: jest.fn()}));
jest.mock('./product_branding', () => () => 'Mattermost licensed');
jest.mock('./product_branding_team_edition', () => () => 'Mattermost free');

describe('AI Crew Mattermost product menu', () => {
    it.each([
        [{IsLicensed: 'false'}, 'Mattermost free'],
        [{IsLicensed: 'true', SkuShortName: 'entry'}, 'Mattermost free'],
        [{IsLicensed: 'true', SkuShortName: 'enterprise'}, 'Mattermost licensed'],
    ])('preserves the license branding for %j', (license, branding) => {
        (useSelector as jest.Mock).mockReturnValue(license);
        render(<ProductMenu/>);
        expect(screen.getByText(branding as string)).toBeInTheDocument();
    });

    it('offers exactly two products with one current destination and no checks', () => {
        (useSelector as jest.Mock).mockReturnValue({IsLicensed: 'false'});
        render(<ProductMenu/>);
        fireEvent.click(screen.getByRole('button', {name: '切换应用：Mattermost'}));
        const items = screen.getAllByRole('menuitem');
        expect(items).toHaveLength(2);
        expect(screen.getByRole('menuitem', {name: 'Mattermost'})).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('menuitem', {name: 'Multica'})).toHaveAttribute('href', '/ai-crew');
        expect(screen.getByRole('menuitem', {name: 'Multica'})).not.toHaveAttribute('aria-current');
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });
});
