import React, {useEffect, useRef, useState} from 'react';

import glyphMap, {ProductsIcon} from '@mattermost/compass-icons/components';

import './product_switcher.scss';

const products = [
    {name: 'Mattermost', href: '/', Icon: glyphMap['product-channels']},
    {name: 'Multica', href: '/ai-crew', Icon: glyphMap['product-boards']},
];

export default function ProductSwitcher({current = 'Mattermost', branding}: {current?: 'Mattermost' | 'Multica'; branding?: React.ReactNode}) {
    const [open, setOpen] = useState(false);
    const container = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const items = useRef<Array<HTMLAnchorElement | null>>([]);

    useEffect(() => {
        if (!open) {
            return undefined;
        }
        items.current[current === 'Multica' ? 1 : 0]?.focus();
        const closeOutside = (event: MouseEvent) => {
            if (container.current && !event.composedPath().includes(container.current)) {
                setOpen(false);
            }
        };
        document.addEventListener('click', closeOutside);
        return () => document.removeEventListener('click', closeOutside);
    }, [open, current]);

    return (
        <div className='CrewProductSwitcher' ref={container}>
            <button
                ref={trigger}
                type='button'
                className='CrewProductSwitcher__trigger'
                aria-label={`切换应用：${current}`}
                aria-haspopup='menu'
                aria-expanded={open}
                aria-controls='crew-product-menu'
                onClick={() => setOpen(!open)}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        setOpen(true);
                    }
                }}
            >
                <ProductsIcon size={20}/>
                {branding ?? <strong>{current}</strong>}
            </button>
            {open && (
                <div
                    id='crew-product-menu'
                    className='CrewProductSwitcher__menu'
                    role='menu'
                    aria-label='应用切换'
                    onBlur={(event) => {
                        if (!container.current?.contains(event.relatedTarget as Node | null)) {
                            setOpen(false);
                        }
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                            event.preventDefault();
                            setOpen(false);
                            trigger.current?.focus();
                        }
                    }}
                >
                    {products.map(({name, href, Icon}, index) => (
                        <a
                            key={name}
                            ref={(element) => { items.current[index] = element; }}
                            href={href}
                            role='menuitem'
                            tabIndex={-1}
                            aria-current={current === name ? 'page' : undefined}
                            onClick={(event) => {
                                if (current === name) {
                                    event.preventDefault();
                                    trigger.current?.focus();
                                }
                                setOpen(false);
                            }}
                            onKeyDown={(event) => {
                                if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                                    event.preventDefault();
                                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
                                    items.current[next]?.focus();
                                }
                            }}
                        >
                            <Icon size={24}/>
                            <span>{name}</span>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}
