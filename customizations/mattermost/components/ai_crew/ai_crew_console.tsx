// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {RouteComponentProps} from 'react-router-dom';

import {CogOutlineIcon, FolderOutlineIcon, RefreshIcon} from '@mattermost/compass-icons/components';

import CrewOperations from './crew_operations';
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
    description?: string | null;
    status?: string;
    identifier?: string;
    project_id?: string;
    project?: {
        id?: string;
        title?: string;
    };
};

type IssueDescriptionProps = {
    description: string;
    expanded: boolean;
    issueLabel: string;
    onToggle: () => void;
};

const IssueDescription: React.FC<IssueDescriptionProps> = ({description, expanded, issueLabel, onToggle}) => {
    const paragraphRef = useRef<HTMLParagraphElement>(null);
    const [truncated, setTruncated] = useState(false);

    useLayoutEffect(() => {
        if (expanded || !paragraphRef.current) {
            return undefined;
        }
        const paragraph = paragraphRef.current;
        const measure = () => setTruncated(paragraph.scrollHeight > paragraph.clientHeight + 1);
        measure();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        observer?.observe(paragraph);
        window.addEventListener('resize', measure);
        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [description, expanded]);

    return <div className='AiCrewConsole__issueBody'>
        <p ref={paragraphRef} className={`AiCrewConsole__issueDescription${expanded ? ' AiCrewConsole__issueDescription--expanded' : ''}`}>{description}</p>
        {truncated && <button type='button' aria-label={`${expanded ? '收起' : '展开'} ${issueLabel} 内容`} aria-expanded={expanded} onClick={onToggle}>{expanded ? '收起内容' : '查看全文'}</button>}
    </div>;
};

type Agent = {
    id?: string;
    name?: string;
    slug?: string;
    status?: string;
};

async function getJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {headers: {accept: 'application/json'}, cache: 'no-store'});
    if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
    }
    return response.json() as Promise<T>;
}

async function postJson<T>(url: string, body: Record<string, string>): Promise<T> {
    const response = await fetch(url, {
        method: 'POST',
        headers: {'content-type': 'application/json', accept: 'application/json'},
        body: JSON.stringify(body),
    });
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
    const [view, setView] = useState<'issues' | 'agents' | 'operations'>('issues');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [agentsLoading, setAgentsLoading] = useState(false);
    const [agentsError, setAgentsError] = useState(false);
    const [agentsStale, setAgentsStale] = useState(false);
    const [creatingIssue, setCreatingIssue] = useState(false);
    const [issueTitle, setIssueTitle] = useState('');
    const [issueDescription, setIssueDescription] = useState('');
    const [issueProject, setIssueProject] = useState('');
    const [issueSubmitting, setIssueSubmitting] = useState(false);
    const [issueCreateError, setIssueCreateError] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(false);
    const [stale, setStale] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    const requestSequence = useRef(0);
    const agentsRequestSequence = useRef(0);
    const workspaceRef = useRef('');
    const settingsRef = useRef<HTMLDivElement>(null);
    const settingsButtonRef = useRef<HTMLButtonElement>(null);

    const loadWorkspace = useCallback(async (slug: string, background = false) => {
        const request = ++requestSequence.current;
        if (background) {
            setRefreshing(true);
        } else {
            setRefreshing(false);
            setLoading(true);
            setError(false);
            setStale(false);
            setLastUpdated(null);
            setSelectedProject('');
        }
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
            setStale(false);
            setError(false);
            setLastUpdated(Date.now());
        } catch {
            if (request === requestSequence.current) {
                if (background) {
                    setStale(true);
                } else {
                    setError(true);
                    setProjects([]);
                    setIssues([]);
                }
            }
        } finally {
            if (request === requestSequence.current) {
                if (background) {
                    setRefreshing(false);
                    setLoading(false);
                } else {
                    setLoading(false);
                }
            }
        }
    }, []);

    const loadAgents = useCallback(async (slug: string, background = false) => {
        const request = ++agentsRequestSequence.current;
        if (background) {
            setRefreshing(true);
        } else {
            setAgentsLoading(true);
        }
        setAgentsError(false);
        try {
            const result = await getJson<{data?: {data?: Agent[] | {agents?: Agent[]}; agents?: Agent[]}}>(`/api/ai-crew/commands/agents?workspace=${encodeURIComponent(slug)}`);
            if (request !== agentsRequestSequence.current) {
                return;
            }
            const payload = result.data?.data ?? result.data?.agents;
            setAgents(Array.isArray(payload) ? payload : payload?.agents ?? []);
            setAgentsStale(false);
            setLastUpdated(Date.now());
        } catch {
            if (request === agentsRequestSequence.current) {
                setAgentsError(true);
                setAgentsStale(true);
            }
        } finally {
            if (request === agentsRequestSequence.current) {
                if (background) {
                    setRefreshing(false);
                    setAgentsLoading(false);
                } else {
                    setAgentsLoading(false);
                }
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
            workspaceRef.current = first;
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

    useEffect(() => {
        if (!settingsOpen) {
            return undefined;
        }
        const closeOutside = (event: PointerEvent) => {
            if (!event.composedPath().includes(settingsRef.current as EventTarget)) {
                setSettingsOpen(false);
            }
        };
        document.addEventListener('pointerdown', closeOutside);
        return () => document.removeEventListener('pointerdown', closeOutside);
    }, [settingsOpen]);

    useEffect(() => {
        if (!workspace) {
            return undefined;
        }
        const refresh = () => {
            if (document.visibilityState === 'visible') {
                if (view === 'agents') {
                    void loadAgents(workspace, true);
                } else {
                    void loadWorkspace(workspace, true);
                }
            }
        };
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        const timer = window.setInterval(refresh, 60_000);
        return () => {
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh);
            window.clearInterval(timer);
        };
    }, [workspace, view, loadAgents, loadWorkspace]);

    const selectWorkspace = (slug: string) => {
        if (slug === workspace) {
            return;
        }
        agentsRequestSequence.current += 1;
        setAgents([]);
        setAgentsError(false);
        setAgentsStale(false);
        workspaceRef.current = slug;
        setWorkspace(slug);
        setIssueProject('');
        setExpandedIssueId(null);
        loadWorkspace(slug);
        if (view === 'agents') {
            void loadAgents(slug);
        }
    };

    const createIssue = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!workspace || !issueTitle.trim()) {
            return;
        }
        const createdWorkspace = workspace;
        const body: Record<string, string> = {title: issueTitle.trim(), workspace: createdWorkspace};
        if (issueDescription.trim()) {
            body.description = issueDescription.trim();
        }
        if (issueProject) {
            body.project = issueProject;
        }
        setIssueSubmitting(true);
        setIssueCreateError(false);
        try {
            await postJson('/api/ai-crew/commands/issue-new', body);
            setCreatingIssue(false);
            setIssueTitle('');
            setIssueDescription('');
            setIssueProject('');
            if (workspaceRef.current === createdWorkspace) {
                await loadWorkspace(createdWorkspace, true);
            }
        } catch {
            setIssueCreateError(true);
        } finally {
            setIssueSubmitting(false);
        }
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
                    <div className='AiCrewConsole__workspaceList'>
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
                    </div>
                    <div
                        ref={settingsRef}
                        className='AiCrewConsole__settings'
                        onKeyDown={(event) => {
                            if (event.key === 'Escape' && settingsOpen) {
                                event.preventDefault();
                                setSettingsOpen(false);
                                settingsButtonRef.current?.focus();
                            }
                        }}
                    >
                        <button
                            ref={settingsButtonRef}
                            type='button'
                            className='AiCrewConsole__settingsButton'
                            aria-label='设置'
                            aria-haspopup='menu'
                            aria-expanded={settingsOpen}
                            aria-controls={settingsOpen ? 'ai-crew-settings-menu' : undefined}
                            onClick={() => setSettingsOpen((open) => !open)}
                        ><CogOutlineIcon size={20} aria-hidden='true'/></button>
                        {settingsOpen && <div id='ai-crew-settings-menu' className='AiCrewConsole__settingsMenu' role='menu' aria-label='设置菜单'>
                            <button type='button' role='menuitem' onClick={() => { setView('operations'); setSettingsOpen(false); }}>{'班组操作'}</button>
                        </div>}
                    </div>
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
                        aria-current={view === 'issues' && !selectedProject ? 'page' : undefined}
                        onClick={() => { setView('issues'); setSelectedProject(''); }}
                    >
                        <FolderOutlineIcon size={18} aria-hidden='true'/>
                        <span>{'全部工单'}</span>
                        {!loading && <small>{issues.length}</small>}
                    </button>
                    <button
                        type='button'
                        aria-label='显示智能体'
                        aria-current={view === 'agents' ? 'page' : undefined}
                        disabled={!workspace}
                        onClick={() => { setView('agents'); void loadAgents(workspace); }}
                    ><FolderOutlineIcon size={18} aria-hidden='true'/><span>{'智能体'}</span></button>
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
                                aria-current={view === 'issues' && selectedProject === key ? 'page' : undefined}
                                onClick={() => { setView('issues'); setSelectedProject(key); }}
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
                        <h1 className='heading' title={view === 'agents' ? '智能体' : view === 'operations' ? '班组操作' : activeProject?.title ?? '全部工单'}>{view === 'agents' ? '智能体' : view === 'operations' ? '班组操作' : activeProject?.title ?? '全部工单'}</h1>
                        <span>{activeWorkspace?.workspace ?? 'Multica'}</span>
                    </div>
                    <div className='AiCrewConsole__headerActions'>
                        {lastUpdated && <span className='AiCrewConsole__updated'>{`上次更新 ${new Date(lastUpdated).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'})}`}</span>}
                        {view === 'issues' && !loading && !error && <span className='AiCrewConsole__count'>{visibleIssues.length}{' 个工单'}</span>}
                        {view === 'issues' && !loading && !error && <button type='button' className='AiCrewConsole__newIssue' aria-label='新建工单' onClick={() => setCreatingIssue(true)}>{'新建工单'}</button>}
                        <button
                            type='button'
                            className='AiCrewConsole__refresh'
                            aria-label='刷新当前小组'
                            title='刷新当前小组'
                            disabled={!workspace || loading || refreshing}
                            onClick={() => void (view === 'agents' ? loadAgents(workspace, true) : loadWorkspace(workspace, true))}
                        ><RefreshIcon size={16}/></button>
                    </div>
                </header>

                <div
                    className='AiCrewConsole__content'
                    aria-live='polite'
                    aria-label='工单内容'
                    aria-busy={view === 'agents' ? agentsLoading : loading}
                >
                    {view === 'agents' && (
                        <div className='AiCrewConsole__agents'>
                            {agentsLoading && <p role='status'>{'正在载入智能体...'}</p>}
                            {!agentsLoading && agentsError && <p role='alert'>{agentsStale && agents.length ? '刷新失败，显示上次成功获取的数据。' : '智能体载入失败'}</p>}
                            {!agentsLoading && !agentsError && agents.length === 0 && <p>{'当前小组暂无智能体'}</p>}
                            {!agentsLoading && agents.map((agent) => <article key={agent.id ?? agent.slug ?? agent.name} className='AiCrewConsole__agent'><strong>{agent.name ?? agent.slug ?? agent.id}</strong>{agent.status && <span>{agent.status}</span>}</article>)}
                        </div>
                    )}
                    {view === 'operations' && <CrewOperations workspace={workspace}/>}
                    {view === 'issues' && creatingIssue && (
                        <form className='AiCrewConsole__issueForm' onSubmit={createIssue}>
                            <label>{'工单标题'}<input aria-label='工单标题' value={issueTitle} onChange={(event) => setIssueTitle(event.target.value)} required maxLength={200}/></label>
                            <label>{'描述'}<textarea aria-label='描述' value={issueDescription} onChange={(event) => setIssueDescription(event.target.value)}/></label>
                            <label>{'项目'}<select aria-label='项目' value={issueProject} onChange={(event) => setIssueProject(event.target.value)}><option value=''>{'不指定项目'}</option>{projects.filter((project) => project.id).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
                            {issueCreateError && <p role='alert'>{'创建工单失败，请重试。'}</p>}
                            <div><button type='submit' disabled={issueSubmitting || !issueTitle.trim()}>{issueSubmitting ? '创建中...' : '创建工单'}</button><button type='button' onClick={() => setCreatingIssue(false)}>{'取消'}</button></div>
                        </form>
                    )}
                    {view === 'issues' && stale && <p className='AiCrewConsole__stale' role='alert'>{'刷新失败，显示上次成功获取的数据。'}</p>}
                    {view === 'issues' && loading && (
                        <div className='AiCrewConsole__loading'>
                            <div className='AiCrewConsole__loadingLabel' role='status'>{'正在载入...'}</div>
                            <div aria-hidden='true' className='AiCrewConsole__skeleton'>
                                {[0, 1, 2, 3, 4].map((row) => <div key={row}><i/><span/><em/></div>)}
                            </div>
                        </div>
                    )}
                    {view === 'issues' && !loading && error && (
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
                    {view === 'issues' && !loading && !error && visibleIssues.length === 0 && (
                        <div className='AiCrewConsole__state'>
                            <span className='AiCrewConsole__stateIcon' aria-hidden='true'><FolderOutlineIcon size={28}/></span>
                            <strong>{selectedProject ? '当前项目暂无工单' : '当前小组暂无工单'}</strong>
                            <p>{selectedProject ? '选择其他项目，或查看全部工单。' : '工单将在这里按项目集中展示。'}</p>
                        </div>
                    )}
                    {view === 'issues' && !loading && !error && visibleIssues.length > 0 && (
                        <div className='AiCrewConsole__list'>
                            <div className='AiCrewConsole__listHeading' aria-hidden='true'><span>{'标题与内容'}</span><span>{'状态'}</span></div>
                            {visibleIssues.map((issue, index) => {
                                const issueKey = issue.id ?? issue.identifier ?? `${issue.title}-${index}`;
                                const expanded = expandedIssueId === issueKey;
                                const description = typeof issue.description === 'string' ? issue.description.trim() : '';
                                const issueLabel = issue.identifier ?? issue.title;
                                return <article className='AiCrewConsole__row' key={issueKey}>
                                    <span className={`AiCrewConsole__issueIcon AiCrewConsole__issueIcon--${issue.status ?? 'unset'}`} aria-hidden='true'/>
                                    <div className='AiCrewConsole__rowMain'>
                                        <div className='AiCrewConsole__issueHeader'>
                                            <strong className='AiCrewConsole__issueTitle' title={issue.title}>{issue.title}</strong>
                                            {issue.identifier && <span className='AiCrewConsole__issueIdentifier'>{issue.identifier}</span>}
                                        </div>
                                        {description && <IssueDescription description={description} expanded={expanded} issueLabel={issueLabel} onToggle={() => setExpandedIssueId(expanded ? null : issueKey)}/>}
                                    </div>
                                    <span className={`AiCrewConsole__status AiCrewConsole__status--${issue.status ?? 'unset'}`}>
                                        <i aria-hidden='true'/>
                                        {statusLabel(issue.status)}
                                    </span>
                                </article>;
                            })}
                        </div>
                    )}
                </div>
            </section>
        </main>
    );
};

export default AiCrewConsole;
