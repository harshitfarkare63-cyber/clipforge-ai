/**
 * ClipForge AI — In-memory project store
 * Replace with a real DB (SQLite/PostgreSQL) for production
 */

const { v4: uuidv4 } = require('uuid');

const projects = new Map();

function createProject({ title, url, videoInfo, userId = 'anonymous' }) {
    const id = uuidv4();
    const project = {
        id,
        userId,
        title: title || videoInfo?.title || 'Untitled Project',
        url,
        videoInfo,
        status: 'queued',
        progress: 0,
        progressMsg: 'Queued...',
        videoPath: null,
        clips: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    projects.set(id, project);
    return project;
}

function getProject(id) {
    return projects.get(id) || null;
}

function getAllProjects(userId) {
    return [...projects.values()]
        .filter(p => !userId || p.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function updateProject(id, updates) {
    const project = projects.get(id);
    if (!project) return null;
    const updated = { ...project, ...updates, updatedAt: new Date().toISOString() };
    projects.set(id, updated);
    return updated;
}

function addClipToProject(projectId, clip) {
    const project = projects.get(projectId);
    if (!project) return null;
    const newClip = {
        id: clip.id || uuidv4(),
        ...clip,
        createdAt: new Date().toISOString(),
    };
    project.clips.push(newClip);
    project.updatedAt = new Date().toISOString();
    projects.set(projectId, project);
    return newClip;
}

function updateClip(projectId, clipId, updates) {
    const project = projects.get(projectId);
    if (!project) return null;
    const idx = project.clips.findIndex(c => c.id === clipId);
    if (idx === -1) return null;
    project.clips[idx] = { ...project.clips[idx], ...updates };
    project.updatedAt = new Date().toISOString();
    projects.set(projectId, project);
    return project.clips[idx];
}

function deleteClip(projectId, clipId) {
    const project = projects.get(projectId);
    if (!project) return false;
    project.clips = project.clips.filter(c => c.id !== clipId);
    project.updatedAt = new Date().toISOString();
    projects.set(projectId, project);
    return true;
}

module.exports = {
    createProject, getProject, getAllProjects,
    updateProject, addClipToProject, updateClip, deleteClip,
};
