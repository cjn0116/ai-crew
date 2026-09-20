// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.

import React, {useEffect, useRef, useState} from 'react';

type User = {username?: string; display_name?: string; nickname?: string; email?: string};
type PendingAction = {
    command: 'rotate' | 'say' | 'join' | 'create-team' | 'create-channel' | 'team-add' | 'post-delete' | 'channel-delete';
    body: Record<string, unknown>;
    title: string;
    target: string;
    content?: string;
};

type CrewOperationsProps = {workspace?: string};

const commandUrl = (command: string, body?: Record<string, unknown>) => {
    const params = new URLSearchParams();
    Object.entries(body ?? {}).forEach(([key, value]) => {
        if (value !== undefined && value !== '' && value !== false) {
            params.set(key, String(value));
        }
    });
    const suffix = params.toString();
    return `/api/ai-crew/commands/${command}${suffix ? `?${suffix}` : ''}`;
};

const usersFrom = (result: unknown): User[] => {
    const payload = (result ?? {}) as {data?: {users?: User[]; data?: {users?: User[]}}};
    return payload.data?.users ?? payload.data?.data?.users ?? [];
};

const withoutEmptyValues = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));

const hiddenField = /token|ticket|authorization|cookie|password|secret/i;

const safeForDisplay = (value: unknown, key = ''): unknown => {
    const connectionStatus = (key === 'mm_token' || key === 'multica_token') && typeof value === 'boolean';
    if ((!connectionStatus && hiddenField.test(key)) || (typeof value === 'string' && value.startsWith('fh_u_'))) {
        return '[已隐藏]';
    }
    if (Array.isArray(value)) {
        return value.map((item) => safeForDisplay(item));
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [entryKey, safeForDisplay(entryValue, entryKey)]));
    }
    return value;
};

const resultData = (result: unknown) => result && typeof result === 'object' && 'data' in result ? (result as {data?: unknown}).data : result;

export default function CrewOperations({workspace}: CrewOperationsProps) {
    const [pending, setPending] = useState<PendingAction | null>(null);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const [people, setPeople] = useState<User[]>([]);
    const [directUser, setDirectUser] = useState<User | null>(null);
    const [result, setResult] = useState<{command: string; data: unknown} | null>(null);
    const confirmButtonRef = useRef<HTMLButtonElement>(null);
    const cancelButtonRef = useRef<HTMLButtonElement>(null);
    const openerRef = useRef<HTMLElement | null>(null);

    const run = async (command: string, method: 'GET' | 'POST' = 'GET', body?: Record<string, unknown>) => {
        setError('');
        try {
            const response = await fetch(method === 'GET' ? commandUrl(command, body) : commandUrl(command), {
                method,
                headers: method === 'POST' ? {'content-type': 'application/json', accept: 'application/json'} : {accept: 'application/json'},
                ...(method === 'GET' ? {cache: 'no-store' as RequestCache} : {body: JSON.stringify(body ?? {})}),
            });
            if (!response.ok) {
                throw new Error('request failed');
            }
            const result = await response.json();
            setNotice(`${command} 已完成`);
            setResult({command, data: safeForDisplay(resultData(result))});
            return result;
        } catch {
            setResult(null);
            setError('操作未完成，请检查输入或稍后重试。');
            return undefined;
        }
    };

    const activeElementInRoot = (source?: EventTarget | null) => {
        const root = source instanceof Node ? source.getRootNode() : document;
        return root instanceof Document || root instanceof ShadowRoot ? root.activeElement : document.activeElement;
    };
    const closeConfirmation = () => {
        setPending(null);
        openerRef.current?.focus();
    };
    const openConfirmation = (action: PendingAction, source?: EventTarget | null) => {
        const activeElement = activeElementInRoot(source);
        openerRef.current = activeElement instanceof HTMLElement ? activeElement : source instanceof HTMLElement ? source : null;
        setPending(action);
    };
    const confirmationOpener = (event: React.SyntheticEvent) => (event.nativeEvent as SubmitEvent).submitter ?? event.currentTarget;
    const confirm = () => {
        if (!pending) {
            return;
        }
        const action = pending;
        closeConfirmation();
        void run(action.command, 'POST', action.body);
    };
    const handleConfirmationKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeConfirmation();
        } else if (event.key === 'Tab') {
            event.preventDefault();
            const activeElement = activeElementInRoot(event.currentTarget);
            if (event.shiftKey) {
                if (activeElement === confirmButtonRef.current) {
                    cancelButtonRef.current?.focus();
                } else {
                    confirmButtonRef.current?.focus();
                }
            } else if (activeElement === cancelButtonRef.current) {
                confirmButtonRef.current?.focus();
            } else {
                cancelButtonRef.current?.focus();
            }
        }
    };
    useEffect(() => {
        if (pending) {
            confirmButtonRef.current?.focus();
        }
    }, [pending]);
    const formValues = (event: React.FormEvent<HTMLFormElement>): Record<string, unknown> => Object.fromEntries(new FormData(event.currentTarget).entries());

    return (
        <section className='CrewOperations' aria-label='班组操作'>
            <header className='CrewOperations__header'>
                <div><h2>{'班组操作'}</h2>{workspace && <p>{`当前工作区：${workspace}`}</p>}</div>
                {notice && <p role='status'>{notice}</p>}
                {error && <p role='alert'>{error}</p>}
            </header>

            <details open={true} className='CrewOperations__panel'>
                <summary>{'连接与诊断'}</summary>
                <div className='CrewOperations__actions'>
                    <form onSubmit={(event) => {
                        event.preventDefault();
                        const form = event.currentTarget;
                        const token = String(new FormData(form).get('token') ?? '').trim();
                        if (token) {
                            void run('login', 'POST', {token}).then((result) => {
                                if (result !== undefined) {
                                    form.reset();
                                }
                            });
                        }
                    }}>
                        <label>{'连接票据'}<input name='token' type='password' autoComplete='off'/></label>
                        <button type='submit'>{'连接'}</button>
                    </form>
                    <button type='button' onClick={() => void run('fetch')}>{'重新领取班组票'}</button>
                    <button type='button' onClick={() => void run('whoami')}>{'查看当前身份'}</button>
                    <button type='button' onClick={() => void run('verify')}>{'验证连接'}</button>
                    <button type='button' onClick={(event) => openConfirmation({command: 'rotate', body: {confirm: true}, title: '确认轮换连接凭据', target: '当前连接'}, event.currentTarget)}>{'轮换连接凭据'}</button>
                    <form onSubmit={(event) => {
                        event.preventDefault();
                        const path = String(new FormData(event.currentTarget).get('path') ?? '').trim();
                        if (path) void run('mm-get', 'GET', {path});
                    }}>
                        <label>{'诊断路径'}<input name='path' aria-label='诊断路径' placeholder='/api/v4/users/me'/></label>
                        <button type='submit'>{'运行诊断'}</button>
                    </form>
                </div>
            </details>

            <details className='CrewOperations__panel'>
                <summary>{'概览与消息记录'}</summary>
                <div className='CrewOperations__actions'>
                    <button type='button' onClick={() => void run('overview')}>{'加载概览'}</button>
                    <button type='button' onClick={() => void run('teams')}>{'加载团队'}</button>
                    <form onSubmit={(event) => { event.preventDefault(); void run('channels', 'GET', formValues(event)); }}>
                        <label>{'频道团队'}<input name='team'/></label><button type='submit'>{'加载频道'}</button>
                    </form>
                    <form onSubmit={(event) => {
                        event.preventDefault();
                        const values = formValues(event);
                        const data = new FormData(event.currentTarget);
                        values.all = Boolean(data.get('all'));
                        values.system = Boolean(data.get('system'));
                        void run('posts', 'GET', values);
                    }}>
                        <label>{'记录频道'}<input name='channel' required={true}/></label>
                        <label>{'记录团队'}<input name='team'/></label>
                        <label>{'记录数量'}<input name='limit' type='number' min='1' max='200'/></label>
                        <label>{'记录页数'}<input name='pages' type='number' min='1' max='20'/></label>
                        <label>{'每页记录'}<input name='perPage' type='number' min='1' max='200'/></label>
                        <label><input name='all' type='checkbox'/> {'包含所有记录'}</label>
                        <label><input name='system' type='checkbox'/> {'包含系统消息'}</label>
                        <button type='submit'>{'加载帖子'}</button>
                    </form>
                    <form onSubmit={(event) => { event.preventDefault(); const values = formValues(event); values.includeDm = Boolean(new FormData(event.currentTarget).get('includeDm')); void run('digest', 'GET', values); }}>
                        <label>{'摘要团队'}<input name='team'/></label>
                        <label>{'每频道数量'}<input name='perChannel' type='number' min='1' max='200'/></label>
                        <label><input name='includeDm' type='checkbox'/> {'包含私信'}</label>
                        <button type='submit'>{'生成摘要'}</button>
                    </form>
                </div>
            </details>

            <details className='CrewOperations__panel'>
                <summary>{'成员与消息'}</summary>
                <div className='CrewOperations__actions'>
                    <form onSubmit={async (event) => {
                        event.preventDefault();
                        const term = String(new FormData(event.currentTarget).get('term') ?? '').trim();
                        const result = await run('find-user', 'GET', {term});
                        setPeople(usersFrom(result));
                    }}>
                        <label>{'搜索成员'}<input name='term' aria-label='搜索成员'/></label><button type='submit'>{'查找成员'}</button>
                    </form>
                    {people.map((person) => {
                        const name = person.display_name || person.nickname || person.username || '未知成员';
                        return <button key={person.username ?? name} type='button' onClick={() => setDirectUser(person)} aria-label={`选择私信对象：${name}`}>{name}</button>;
                    })}
                    {directUser && <p>{`私信对象：${directUser.display_name || directUser.nickname || directUser.username}`}</p>}
                    <form onSubmit={(event) => {
                        event.preventDefault();
                        const values = formValues(event);
                        const text = String(values.text ?? '').trim();
                        const channel = String(values.channel ?? '').trim();
                        const team = String(values.team ?? '').trim();
                        const root = String(values.root ?? '').trim();
                        const username = directUser?.username;
                        if (!text || (!channel && !username)) return;
                        const body: Record<string, unknown> = username ? {dm: username, text} : {channel, text};
                        if (team) body.team = team;
                        if (root) body.root = root;
                        openConfirmation({command: 'say', body, title: root ? '确认回复' : '确认发送消息', target: username ? (directUser?.display_name || username) : channel, content: text}, confirmationOpener(event));
                    }}>
                        <label>{'频道'}<input name='channel' aria-label='消息频道' disabled={Boolean(directUser)}/></label>
                        <label>{'消息团队'}<input name='team' aria-label='消息团队'/></label>
                        <label>{'消息内容'}<textarea name='text' aria-label='消息内容' required={true}/></label>
                        <label>{'回复根帖子 ID'}<input name='root' aria-label='回复根帖子 ID'/></label>
                        <button type='submit'>{'预览发送'}</button>
                    </form>
                    {directUser && <button type='button' onClick={() => setDirectUser(null)}>{'清除私信对象'}</button>}
                </div>
            </details>

            <details className='CrewOperations__panel'>
                <summary>{'团队与频道管理'}</summary>
                <div className='CrewOperations__actions'>
                    <form onSubmit={(event) => {
                        event.preventDefault();
                        const values = formValues(event);
                        openConfirmation({command: 'join', body: withoutEmptyValues(values), title: '确认加入频道', target: String(values.channel ?? '')}, confirmationOpener(event));
                    }}>
                        <label>{'加入频道'}<input name='channel' aria-label='加入频道' required={true}/></label><label>{'加入频道团队'}<input name='team'/></label><button type='submit'>{'加入频道'}</button>
                    </form>
                    <form onSubmit={(event) => {
                        event.preventDefault();
                        const values = formValues(event);
                        openConfirmation({command: 'create-team', body: values, title: '确认创建团队', target: String(values.name ?? '')}, confirmationOpener(event));
                    }}>
                        <label>{'新团队标识'}<input name='name' aria-label='新团队标识' required={true}/></label><label>{'新团队名称'}<input name='display'/></label><button type='submit'>{'创建团队'}</button>
                    </form>
                    <form onSubmit={(event) => {
                        event.preventDefault();
                        const values = formValues(event);
                        values.private = Boolean(new FormData(event.currentTarget).get('private'));
                        openConfirmation({command: 'create-channel', body: values, title: '确认创建频道', target: `${String(values.team ?? '')} / ${String(values.name ?? '')}`}, confirmationOpener(event));
                    }}>
                        <label>{'新频道团队'}<input name='team' aria-label='新频道团队' required={true}/></label><label>{'新频道标识'}<input name='name' aria-label='新频道标识' required={true}/></label><label>{'新频道名称'}<input name='display'/></label><label><input name='private' type='checkbox'/> {'私有频道'}</label><button type='submit'>{'创建频道'}</button>
                    </form>
                    <form onSubmit={(event) => {
                        event.preventDefault();
                        const values = formValues(event);
                        const users = String(values.users ?? '').split(',').map((user) => user.trim()).filter(Boolean);
                        openConfirmation({command: 'team-add', body: {team: values.team, users}, title: '确认添加成员', target: `${String(values.team ?? '')}：${users.join(', ')}`}, confirmationOpener(event));
                    }}>
                        <label>{'添加成员团队'}<input name='team' aria-label='添加成员团队' required={true}/></label><label>{'成员用户名'}<input name='users' aria-label='成员用户名' required={true}/></label><button type='submit'>{'添加成员'}</button>
                    </form>
                </div>
            </details>

            <details className='CrewOperations__panel'>
                <summary>{'删除操作'}</summary>
                <div className='CrewOperations__actions'>
                    <form onSubmit={(event) => { event.preventDefault(); const postId = String(new FormData(event.currentTarget).get('postId') ?? '').trim(); if (postId) openConfirmation({command: 'post-delete', body: {postId, confirm: true}, title: '确认删除帖子', target: postId}, confirmationOpener(event)); }}>
                        <label>{'待删除帖子 ID'}<input name='postId' aria-label='待删除帖子 ID' required={true}/></label><button type='submit'>{'删除帖子'}</button>
                    </form>
                    <form onSubmit={(event) => { event.preventDefault(); const values = formValues(event); const channel = String(values.channel ?? '').trim(); if (channel) openConfirmation({command: 'channel-delete', body: {...withoutEmptyValues(values), channel, confirm: true}, title: '确认删除频道', target: channel}, confirmationOpener(event)); }}>
                        <label>{'待删除频道'}<input name='channel' aria-label='待删除频道' required={true}/></label><label>{'待删除频道所属团队'}<input name='team' aria-label='待删除频道所属团队'/></label><button type='submit'>{'删除频道'}</button>
                    </form>
                </div>
            </details>

            {result && <section className='CrewOperations__result' aria-label='最近操作结果'>
                <h3>{`${result.command} 结果`}</h3>
                <pre>{JSON.stringify(result.data, null, 2) ?? 'null'}</pre>
            </section>}

            {pending && <div className='CrewOperations__confirm' role='alertdialog' aria-modal='true' aria-label={pending.title} onKeyDown={handleConfirmationKeyDown}>
                <h3>{pending.title}</h3>
                <p>{`目标：${pending.target}`}</p>
                {pending.content && <pre>{pending.content}</pre>}
                <button ref={confirmButtonRef} type='button' onClick={confirm}>{pending.command === 'rotate' ? '确认轮换' : pending.command === 'say' ? '确认发送' : pending.command === 'post-delete' || pending.command === 'channel-delete' ? '确认删除' : '确认执行'}</button>
                <button ref={cancelButtonRef} type='button' onClick={closeConfirmation}>{'取消'}</button>
            </div>}
        </section>
    );
}
