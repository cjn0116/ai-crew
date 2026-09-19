// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {RouteComponentProps} from 'react-router-dom';

import {FolderOutlineIcon, RefreshIcon} from '@mattermost/compass-icons/components';

import ProductSwitcher from './product_switcher';

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
    project_id?: string;
    project?: {
        id?: string;
        title?: string;
    };
};

async function getJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {headers: {accept: 'application/json'}});
    if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
    }
    return response.json() as Promise<T>;
}

const statusLabel = (status?: string) => ({
    in_progress: '进行中',
    todo: '待处理',
    in_review: '审核中',
    done: '已完成',
    planned: '已规划',
    open: '待处理',
    closed: '已关闭',
}[status ?? ''] ?? status ?? '未设置');

const projectKey = (project: Project) => project.id ?? project.title;
const issueMatchesProject = (issue: Issue, project: Project) => {
    const issueProjectId = issue.project_id || issue.project?.id;
    if (project.id && issueProjectId) {
        return project.id === issueProjectId;
    }
    return Boolean(project.title && issue.project?.title === project.title);
};
const workspaceMark = (workspace: Workspace) => workspace.issue_prefix?.slice(0, 2) ?? workspace.workspace.slice(0, 2);

const AiCrewConsole: React.FC<Partial<RouteComponentProps>> = () => {
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [workspace, setWorkspace] = useState('');
    const [projects, setProjects] = useState<Project[]>([]);
    const [issues, setIssues] = useState<Issue[]>([]);
    const [selectedProject, setSelectedProject] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const requestSequence = useRef(0);

    const loadWorkspace = useCallback(async (slug: string) => {
        const request = ++requestSequence.current;
        setLoading(true);
        setError(false);
        setSelectedProject('');
        try {
            const [projectData, issueData] = await Promise.all([
                getJson<{projects?: Project[]}>(`/api/ai-crew/projects?workspace=${encodeURIComponent(slug)}`),
                getJson<{issues?: Issue[]}>(`/api/ai-crew/issues?workspace=${encodeURIComponent(slug)}`),
            ]);
            if (request !== requestSequence.current) {
                return;
            }
            setProjects(projectData.projects ?? []);
            setIssues(issueData.issues ?? []);
        } catch {
            if (request === requestSequence.current) {
                setError(true);
                setProjects([]);
                setIssues([]);
            }
        } finally {
            if (request === requestSequence.current) {
                setLoading(false);
            }
        }
    }, []);

    const loadWorkspaces = useCallback(async () => {
        const request = ++requestSequence.current;
        setLoading(true);
        setError(false);
        try {
            const data = await getJson<{workspaces: Workspace[]}>('/api/ai-crew/workspaces');
            if (request !== requestSequence.current) {
                return;
            }
            setWorkspaces(data.workspaces);
            const first = data.workspaces[0]?.slug ?? '';
            setWorkspace(first);
            if (first) {
                await loadWorkspace(first);
            } else {
                setProjects([]);
                setIssues([]);
                setLoading(false);
            }
        } catch {
            if (request === requestSequence.current) {
                setError(true);
                setLoading(false);
            }
        }
    }, [loadWorkspace]);

    useEffect(() => {
        loadWorkspaces();
    }, []);

    const selectWorkspace = (slug: string) => {
        if (slug === workspace) {
            return;
        }
        setWorkspace(slug);
        loadWorkspace(slug);
    };

    const activeWorkspace = workspaces.find((item) => item.slug === workspace);
    const activeProject = projects.find((item) => projectKey(item) === selectedProject);
    const visibleIssues = useMemo(() => (activeProject ?
        issues.filter((issue) => issueMatchesProject(issue, activeProject)) :
        issues), [activeProject, issues]);

    return (
        <main className='AiCrewConsole'>
            <nav className='AiCrewConsole__productBar' aria-label='应用切换'>
                <ProductSwitcher current='Multica'/>
            </nav>
            <aside
                className='AiCrewConsole__sidebar'
                aria-label='Multica 筛选'
            >
                <nav
                    className='AiCrewConsole__workspaceRail'
                    aria-label='小组'
                >
                    {workspaces.map((item) => (
                        <button
                            key={item.slug}
                            className={`TeamIcon TeamIcon__sm${workspace === item.slug ? ' active' : ''}`}
                            type='button'
                            aria-label={`切换到小组：${item.workspace}`}
                            aria-current={workspace === item.slug ? 'page' : undefined}
                            title={item.workspace}
                            onClick={() => selectWorkspace(item.slug)}
                        >
                            <span className='TeamIcon__content'><span className='TeamIcon__initials TeamIcon__initials__sm'>{workspaceMark(item)}</span></span>
                        </button>
                    ))}
                </nav>

                <nav
                    className='AiCrewConsole__projectNav'
                    aria-label='项目'
                >
                    <div className='AiCrewConsole__projectHeading sidebarHeaderContainer'>
                        <strong title={activeWorkspace?.workspace}>{activeWorkspace?.workspace ?? '小组'}</strong>
                    </div>
                    <button
                        type='button'
                        aria-label='显示全部工单'
                        aria-current={selectedProject ? undefined : 'page'}
                        onClick={() => setSelectedProject('')}
                    >
                        <FolderOutlineIcon size={18} aria-hidden='true'/>
                        <span>{'全部工单'}</span>
                        {!loading && <small>{issues.length}</small>}
                    </button>
                    <div className='AiCrewConsole__projectLabel'><span>{'项目'}</span>{!loading && <small>{projects.length}</small>}</div>
                    {!loading && !error && projects.length === 0 && <p className='AiCrewConsole__navHint'>{'暂无项目'}</p>}
                    {projects.map((project) => {
                        const key = projectKey(project);
                        return (
                            <button
                                key={key}
                                type='button'
                                aria-label={`筛选项目：${project.title}`}
                                title={project.title}
                                aria-current={selectedProject === key ? 'page' : undefined}
                                onClick={() => setSelectedProject(key)}
                            >
                                <FolderOutlineIcon size={16} aria-hidden='true'/>
                                <span>{project.title}</span>
                                <small>{project.issue_count ?? issues.filter((issue) => issueMatchesProject(issue, project)).length}</small>
                            </button>
                        );
                    })}
                </nav>
            </aside>

            <section className='AiCrewConsole__main'>
                <header className='AiCrewConsole__header channel-header'>
                    <div className='AiCrewConsole__heading'>
                        <FolderOutlineIcon size={20} aria-hidden='true'/>
                        <h1 className='heading' title={activeProject?.title ?? '全部工单'}>{activeProject?.title ?? '全部工单'}</h1>
                        <span>{activeWorkspace?.workspace ?? 'Multica'}</span>
                    </div>
                    {!loading && !error && <span className='AiCrewConsole__count'>{visibleIssues.length}{' 个工单'}</span>}
                </header>

                <div
                    className='AiCrewConsole__content'
                    aria-live='polite'
                    aria-label='工单内容'
                    aria-busy={loading}
                >
                    {loading && (
                        <div className='AiCrewConsole__loading'>
                            <div className='AiCrewConsole__loadingLabel' role='status'>{'正在载入...'}</div>
                            <div aria-hidden='true' className='AiCrewConsole__skeleton'>
                                {[0, 1, 2, 3, 4].map((row) => <div key={row}><i/><span/><em/></div>)}
                            </div>
                        </div>
                    )}
                    {!loading && error && (
                        <div className='AiCrewConsole__state AiCrewConsole__state--error'>
                            <span className='AiCrewConsole__stateIcon' aria-hidden='true'><RefreshIcon size={28}/></span>
                            <strong>{'暂时无法载入 Multica 数据'}</strong>
                            <p>{'请稍后重试，或切换到其他小组。'}</p>
                            <button
                                aria-label='重试'
                                title='重试'
                                onClick={() => loadWorkspaces()}
                            ><RefreshIcon size={16}/><span>{'重新加载'}</span></button>
                        </div>
                    )}
                    {!loading && !error && visibleIssues.length === 0 && (
                        <div className='AiCrewConsole__state'>
                            <span className='AiCrewConsole__stateIcon' aria-hidden='true'><FolderOutlineIcon size={28}/></span>
                            <strong>{selectedProject ? '当前项目暂无工单' : '当前小组暂无工单'}</strong>
                            <p>{selectedProject ? '选择其他项目，或查看全部工单。' : '工单将在这里按项目集中展示。'}</p>
                        </div>
                    )}
                    {!loading && !error && visibleIssues.length > 0 && (
                        <div className='AiCrewConsole__list'>
                            <div className='AiCrewConsole__listHeading' aria-hidden='true'><span>{'工单'}</span><span>{'状态'}</span></div>
                            {visibleIssues.map((issue, index) => (
                                <article
                                    className='AiCrewConsole__row'
                                    key={issue.id ?? `${issue.title}-${index}`}
                                >
                                    <span className={`AiCrewConsole__issueIcon AiCrewConsole__issueIcon--${issue.status ?? 'unset'}`} aria-hidden='true'/>
                                    <div className='AiCrewConsole__rowMain'>
                                        <span className='AiCrewConsole__issueTitle' title={issue.title}>{issue.title}</span>
                                        {issue.identifier && <span>{issue.identifier}</span>}
                                    </div>
                                    <span className={`AiCrewConsole__status AiCrewConsole__status--${issue.status ?? 'unset'}`}>
                                        <i aria-hidden='true'/>
                                        {statusLabel(issue.status)}
                                    </span>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </section>
        </main>
    );
};

export default AiCrewConsole;
