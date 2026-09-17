import {FolderOutlineIcon, RefreshIcon} from '@mattermost/compass-icons/components';
import React, {useCallback, useEffect, useState} from 'react';
import type {RouteComponentProps} from 'react-router-dom';

import './ai_crew_console.scss';

type Workspace = {
    workspace: string;
    slug: string;
    issue_prefix?: string;
};

type Project = {
    id?: string;
    title: string;
    status?: string;
    issue_count?: number;
};

type Issue = {
    id?: string;
    title: string;
    status?: string;
    identifier?: string;
};

type View = 'projects' | 'issues';

async function getJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {headers: {accept: 'application/json'}});
    if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
    }
    return response.json() as Promise<T>;
}

const statusLabel = (status?: string) => ({
    in_progress: '进行中',
    planned: '已规划',
    open: '待处理',
    closed: '已关闭',
}[status ?? ''] ?? status ?? '未设置');

const AiCrewConsole = (_props: Partial<RouteComponentProps>): JSX.Element => {
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [workspace, setWorkspace] = useState('');
    const [view, setView] = useState<View>('projects');
    const [items, setItems] = useState<Array<Project | Issue>>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const loadItems = useCallback(async (slug: string, nextView: View) => {
        setLoading(true);
        setError(false);
        try {
            const data = await getJson<{projects?: Project[]; issues?: Issue[]}>(
                `/api/ai-crew/${nextView}?workspace=${encodeURIComponent(slug)}`,
            );
            setItems(data[nextView] ?? []);
        } catch {
            setError(true);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const loadWorkspaces = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const data = await getJson<{workspaces: Workspace[]}>('/api/ai-crew/workspaces');
            setWorkspaces(data.workspaces);
            const first = data.workspaces[0]?.slug ?? '';
            setWorkspace(first);
            if (first) {
                await loadItems(first, view);
            } else {
                setItems([]);
            }
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [loadItems, view]);

    useEffect(() => {
        void loadWorkspaces();
    }, []);

    const selectView = (nextView: View) => {
        setView(nextView);
        if (workspace) {
            void loadItems(workspace, nextView);
        }
    };

    const selectWorkspace = (slug: string) => {
        setWorkspace(slug);
        void loadItems(slug, view);
    };

    return (
        <main className='AiCrewConsole'>
            <header className='AiCrewConsole__header'>
                <div>
                    <h1>Multica</h1>
                    <span>项目与工单</span>
                </div>
                <label>
                    <span className='sr-only'>工作区</span>
                    <select
                        aria-label='工作区'
                        value={workspace}
                        onChange={(event) => selectWorkspace(event.target.value)}
                    >
                        {workspaces.map((item) => (
                            <option key={item.slug} value={item.slug}>{item.workspace}</option>
                        ))}
                    </select>
                </label>
            </header>

            <div className='AiCrewConsole__tabs' role='tablist' aria-label='Multica 视图'>
                <button role='tab' aria-selected={view === 'projects'} onClick={() => selectView('projects')}>项目</button>
                <button role='tab' aria-selected={view === 'issues'} onClick={() => selectView('issues')}>工单</button>
            </div>

            <section className='AiCrewConsole__content' aria-live='polite'>
                {loading && <div className='AiCrewConsole__state'>正在载入...</div>}
                {!loading && error && (
                    <div className='AiCrewConsole__state AiCrewConsole__state--error'>
                        <strong>暂时无法载入 Multica 数据</strong>
                        <button aria-label='重试' title='重试' onClick={() => void loadWorkspaces()}><RefreshIcon size={18}/></button>
                    </div>
                )}
                {!loading && !error && items.length === 0 && <div className='AiCrewConsole__state'>当前工作区暂无{view === 'projects' ? '项目' : '工单'}</div>}
                {!loading && !error && items.length > 0 && (
                    <div className='AiCrewConsole__list'>
                        {items.map((item, index) => (
                            <article className='AiCrewConsole__row' key={item.id ?? `${item.title}-${index}`}>
                                <FolderOutlineIcon size={20}/>
                                <div className='AiCrewConsole__rowMain'>
                                    <strong>{item.title}</strong>
                                    {'identifier' in item && item.identifier && <span>{item.identifier}</span>}
                                </div>
                                {'issue_count' in item && <span>{item.issue_count ?? 0} 个工单</span>}
                                <span className={`AiCrewConsole__status AiCrewConsole__status--${item.status ?? 'unset'}`}>
                                    {statusLabel(item.status)}
                                </span>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
};

export default AiCrewConsole;
