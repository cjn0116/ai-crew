// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React, {memo, forwardRef, useState} from 'react';
import type {HTMLAttributes, RefObject} from 'react';
import {useIntl} from 'react-intl';

import './avatar.scss';

export type TAvatarSizeToken = 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xl-custom-GM' | 'xl-custom-DM' | 'xxl' | 'inherit';

export const getAvatarWidth = (size: TAvatarSizeToken) => {
    switch (size) {
    case 'xxs':
        return '16px';
    case 'xs':
        return '20px';
    case 'sm':
        return '24px';
    case 'md':
        return '32px';
    case 'lg':
        return '36px';
    case 'xl':
        return '50px';
    case 'xl-custom-GM':
        return '72px';
    case 'xl-custom-DM':
        return '96px';
    case 'xxl':
        return '128px';
    }
    return 'inherit';
};

type Props = {
    url?: string;
    username?: string;
    size?: TAvatarSizeToken;
    text?: string;

    /**
     * Override the default alt text for the image.
     *
     * If this Avatar is accompanied in the DOM by the user's name, this should be set to the empty string to prevent
     * screen readers from repeating the user's name multiple times.
     */
    alt?: string;
};

type Attrs = HTMLAttributes<HTMLElement>;

const Avatar = forwardRef<HTMLElement, Props & Attrs>(({
    url,
    username,
    size = 'md',
    text,
    alt,
    ...attrs
}, ref) => {
    const {formatMessage} = useIntl();
    const [failedUrl, setFailedUrl] = useState<string>();

    const classes = classNames(`Avatar Avatar-${size}`, attrs.className);

    if (text) {
        return (
            <div
                {...attrs}
                ref={ref as RefObject<HTMLDivElement>}
                className={classNames(classes, 'Avatar-plain')}
                data-content={text}
            />
        );
    }

    const description = alt ?? formatMessage({id: 'avatar.alt', defaultMessage: '{username} profile image'}, {
        username: username || 'user',
    });

    if (!url || failedUrl === url) {
        const customSize = size === 'xl-custom-GM' || size === 'xl-custom-DM';
        return (
            <div
                {...attrs}
                ref={ref as RefObject<HTMLDivElement>}
                className={classNames(classes, 'Avatar-plain', 'Avatar-fallback')}
                style={customSize ? {width: getAvatarWidth(size), minWidth: getAvatarWidth(size), height: getAvatarWidth(size), ...attrs.style} : attrs.style}
                role='img'
                aria-label={description}
                data-content={Array.from(username?.trim() || '')[0]?.toLocaleUpperCase() || '?'}
            />
        );
    }

    return (
        <img
            {...attrs}
            ref={ref as RefObject<HTMLImageElement>}
            className={classes}
            alt={description}
            src={url}
            loading='lazy'
            onError={() => setFailedUrl(url)}
        />
    );
});

Avatar.displayName = 'Avatar';

export default memo(Avatar);
