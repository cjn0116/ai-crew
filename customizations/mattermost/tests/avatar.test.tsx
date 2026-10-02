// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent, render, screen} from '@testing-library/react';
import {shallow} from 'enzyme';
import React from 'react';
import {IntlProvider} from 'react-intl';

import Avatar from './avatar';

describe('components/widgets/users/Avatar', () => {
    test('shows a readable username mark when a profile image fails', () => {
        render(
            <IntlProvider locale='en'>
                <Avatar
                    url='/api/v4/users/ada/image'
                    username='ada'
                    size='md'
                />
            </IntlProvider>,
        );

        fireEvent.error(screen.getByRole('img', {name: 'ada profile image'}));

        expect(screen.getByRole('img', {name: 'ada profile image'})).toHaveAttribute('data-content', 'A');
        expect(screen.getByRole('img', {name: 'ada profile image'}).tagName).toBe('DIV');
    });

    test.each([
        ['xl-custom-GM', '72px'],
        ['xl-custom-DM', '96px'],
    ] as const)('keeps the %s mark visible at %s', (size, dimension) => {
        render(
            <IntlProvider locale='en'>
                <Avatar
                    url='/api/v4/users/ada/image'
                    username='ada'
                    size={size}
                />
            </IntlProvider>,
        );

        fireEvent.error(screen.getByRole('img', {name: 'ada profile image'}));

        expect(screen.getByRole('img', {name: 'ada profile image'})).toHaveStyle({width: dimension, height: dimension});
    });

    test('should match the snapshot', () => {
        const wrapper = shallow(
            <Avatar
                url='test-url'
                username='test-username'
                size='xl'
            />,
        );
        expect(wrapper).toMatchSnapshot();
    });

    test('should match the snapshot only with url', () => {
        const wrapper = shallow(
            <Avatar url='test-url'/>,
        );
        expect(wrapper).toMatchSnapshot();
    });

    test('should match the snapshot only plain text', () => {
        const wrapper = shallow(
            <Avatar text='SA'/>,
        );
        expect(wrapper).toMatchSnapshot();
    });
});
