/**
 * GitHub Actions Cloud Compiler Client
 * Triggers workflow_dispatch and tracks build status for real Android APK compilation.
 */

import { LATEST_WORKFLOW_YML } from './workflowTemplate';

export interface GitHubConfig {
  owner: string;
  repo: string;
  token: string;
  branch: string;
}

export interface WorkflowRun {
  id: number;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'timed_out' | null;
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface ArtifactItem {
  id: number;
  name: string;
  size_in_bytes: number;
  archive_download_url: string;
  expired: boolean;
}

const STORAGE_KEY = 'web2app_github_cloud_config';

export function getSavedGitHubConfig(): GitHubConfig {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // ignore
    }
  }
  return {
    owner: 'perdinanmoses34-hub',
    repo: 'tn.timbu',
    token: '',
    branch: 'main',
  };
}

export function saveGitHubConfig(config: Partial<GitHubConfig>): void {
  const current = getSavedGitHubConfig();
  const updated = { ...current, ...config };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

/**
 * Gets repository metadata, including default branch.
 */
export async function getRepoInfo(
  config: GitHubConfig
): Promise<{ defaultBranch?: string; error?: string }> {
  if (!config.owner || !config.repo) {
    return { error: 'Nama pemilik atau repositori belum diisi.' };
  }
  const url = `https://api.github.com/repos/${config.owner.trim()}/${config.repo.trim()}?_ts=${Date.now()}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(config.token ? { Authorization: `Bearer ${config.token.trim()}` } : {}),
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (res.ok) {
      const data = await res.json();
      return { defaultBranch: data.default_branch || 'main' };
    }
    const data = await res.json().catch(() => ({}));
    return { error: data.message || `HTTP ${res.status}` };
  } catch (err: any) {
    return { error: err?.message || 'Gagal menghubungi GitHub' };
  }
}

/**
 * Safely decodes base64 string containing UTF-8 characters.
 */
export function decodeBase64Utf8(base64: string): string {
  try {
    const clean = base64.replace(/\s/g, '');
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

/**
 * Extracts inputs declared under workflow_dispatch.inputs in a GitHub Actions YAML string.
 */
export function parseWorkflowInputsFromYaml(yamlText: string): string[] {
  const inputs: string[] = [];
  const dispatchMatch = yamlText.match(/workflow_dispatch\s*:\s*inputs\s*:([\s\S]*?)(?:\n\s{0,2}[a-zA-Z0-9_-]+\s*:|\n\s*jobs\s*:|$)/);
  if (dispatchMatch && dispatchMatch[1]) {
    const lines = dispatchMatch[1].split('\n');
    for (const line of lines) {
      const m = line.match(/^\s{4,8}([a-zA-Z0-9_-]+)\s*:/);
      if (m && m[1]) {
        const key = m[1];
        if (!['description', 'required', 'default', 'type', 'options'].includes(key)) {
          if (!inputs.includes(key)) {
            inputs.push(key);
          }
        }
      }
    }
  }
  return inputs;
}

/**
 * Authoritatively retrieves the latest SHA and content of a file in the repository,
 * bypassing all browser and edge caches. Uses both Contents API and Git Trees API fallback.
 */
export async function fetchAuthoritativeFileSha(
  config: GitHubConfig,
  branch: string,
  filePath: string
): Promise<{ sha?: string; content?: string; exists: boolean }> {
  const token = config.token.trim();
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const ts = Date.now();

  // 1. Direct Contents API with cache-buster timestamp
  try {
    const url = `https://api.github.com/repos/${config.owner.trim()}/${config.repo.trim()}/contents/${filePath}?ref=${encodeURIComponent(branch)}&_ts=${ts}`;
    const res = await fetch(url, {
      headers,
    });
    if (res.ok) {
      const data = await res.json();
      return { sha: data.sha, content: data.content, exists: true };
    }
    if (res.status === 404) {
      return { exists: false };
    }
  } catch (e) {
    console.warn('Gagal mengambil SHA lewat contents API:', e);
  }

  // 2. Direct Git Tree API lookup (checks authoritative Git object database for branch HEAD)
  try {
    const treeUrl = `https://api.github.com/repos/${config.owner.trim()}/${config.repo.trim()}/git/trees/${encodeURIComponent(branch)}?recursive=1&_ts=${ts}`;
    const treeRes = await fetch(treeUrl, {
      headers,
    });
    if (treeRes.ok) {
      const treeData = await treeRes.json();
      const match = (treeData.tree || []).find((item: any) => item.path === filePath);
      if (match && match.sha) {
        return { sha: match.sha, exists: true };
      }
    }
  } catch (e) {
    console.warn('Gagal mengambil SHA lewat git trees API:', e);
  }

  return { exists: false };
}

/**
 * Checks if the workflow file exists in the repository on a specific branch and retrieves its content.
 */
export async function getWorkflowFileFromRepo(
  config: GitHubConfig,
  branch: string
): Promise<{ exists: boolean; content?: string; sha?: string; error?: string }> {
  const path = '.github/workflows/build-apk.yml';
  const fileInfo = await fetchAuthoritativeFileSha(config, branch, path);
  if (fileInfo.exists) {
    const content = fileInfo.content ? decodeBase64Utf8(fileInfo.content) : '';
    return { exists: true, content, sha: fileInfo.sha };
  }
  return { exists: false };
}

/**
 * Checks if GitHub Actions has registered build-apk.yml and whether it is active.
 */
export async function checkWorkflowRegistration(
  config: GitHubConfig
): Promise<{ registered: boolean; id?: number; state?: string; name?: string; error?: string }> {
  const url = `https://api.github.com/repos/${config.owner.trim()}/${config.repo.trim()}/actions/workflows/build-apk.yml?_ts=${Date.now()}`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(config.token ? { Authorization: `Bearer ${config.token.trim()}` } : {}),
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (res.ok) {
      const data = await res.json();
      return { registered: true, id: data.id, state: data.state, name: data.name };
    }
    return { registered: false };
  } catch (err: any) {
    return { registered: false, error: err?.message };
  }
}

/**
 * Synchronizes the latest build-apk.yml workflow directly to the user's GitHub repository.
 * Features automatic branch detection, content comparison, and 409 SHA conflict self-healing.
 */
export async function syncWorkflowFileToRepo(
  config: GitHubConfig,
  customWorkflowYml?: string
): Promise<{ success: boolean; message: string; branchUsed?: string }> {
  if (!config.token.trim()) {
    return { success: false, message: 'Token GitHub belum diisi. Masukkan Personal Access Token Anda.' };
  }

  // 1. Auto-detect default branch if not specified or align main/master
  let targetBranch = config.branch?.trim() || '';
  const repoInfo = await getRepoInfo(config);
  if (!targetBranch) {
    targetBranch = repoInfo.defaultBranch || 'main';
  } else if (repoInfo.defaultBranch && (targetBranch === 'main' || targetBranch === 'master')) {
    targetBranch = repoInfo.defaultBranch;
  }

  const path = '.github/workflows/build-apk.yml';
  const workflowContentToSync = customWorkflowYml || LATEST_WORKFLOW_YML;

  // Base64 encode UTF-8 string safely
  const utf8Bytes = new TextEncoder().encode(workflowContentToSync);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  const base64Content = btoa(binary);

  try {
    // 2. Fetch authoritative fresh SHA and existing content
    let fileInfo = await fetchAuthoritativeFileSha(config, targetBranch, path);

    // Fallback: if not found on targetBranch and targetBranch was 'main', check 'master'
    if (!fileInfo.exists && targetBranch === 'main') {
      const masterInfo = await fetchAuthoritativeFileSha(config, 'master', path);
      if (masterInfo.exists) {
        targetBranch = 'master';
        fileInfo = masterInfo;
      }
    }

    // 3. If file already exists and content is already identical, skip commit!
    if (fileInfo.exists && fileInfo.content) {
      const existingClean = fileInfo.content.replace(/\s/g, '');
      const newClean = base64Content.replace(/\s/g, '');
      if (existingClean === newClean) {
        return {
          success: true,
          message: `Alur kerja build-apk.yml di branch "${targetBranch}" sudah mutakhir di GitHub!`,
          branchUsed: targetBranch,
        };
      }
    }

    // 4. PUT file with automatic retry loop on 409 Conflict / SHA mismatch
    const putUrl = `https://api.github.com/repos/${config.owner.trim()}/${config.repo.trim()}/contents/${path}`;
    let currentSha = fileInfo.sha;
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const putRes = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.token.trim()}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          message: 'ci: configure build-apk.yml with workflow_dispatch and Android compiler',
          content: base64Content,
          branch: targetBranch,
          ...(currentSha ? { sha: currentSha } : {}),
        }),
      });

      if (putRes.ok) {
        return {
          success: true,
          message: `Alur kerja build-apk.yml berhasil disimpan ke branch "${targetBranch}" di GitHub!`,
          branchUsed: targetBranch,
        };
      }

      if (putRes.status === 401) {
        return { success: false, message: 'Token GitHub tidak valid atau telah kedaluwarsa.' };
      }

      const errData = await putRes.json().catch(() => ({}));
      const rawMessage: string = errData.message || '';

      if (putRes.status === 403) {
        return {
          success: false,
          message:
            'Token GitHub Anda belum memiliki izin "workflow" (wajib dicentang saat membuat token di GitHub agar bisa mengelola alur kerja Action). Silakan buat token baru dengan izin "repo" dan "workflow".',
        };
      }

      // Check if error is due to SHA mismatch (409 Conflict or "does not match")
      const isShaConflict =
        putRes.status === 409 ||
        rawMessage.toLowerCase().includes('does not match') ||
        rawMessage.toLowerCase().includes('conflict');

      if (isShaConflict && attempt < maxRetries) {
        // Wait briefly for GitHub git propagation
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));

        // Refetch latest fresh SHA strictly
        const refreshed = await fetchAuthoritativeFileSha(config, targetBranch, path);
        if (refreshed.sha && refreshed.sha !== currentSha) {
          currentSha = refreshed.sha;
          continue; // Retry PUT with the fresh SHA!
        }
      }

      if (isShaConflict) {
        return {
          success: false,
          message: `Konflik versi berkas teratasi: berkas di GitHub telah diperbarui. Silakan klik tombol "Mulai Kompilasi APK" kembali atau gunakan Mode 2 (Salin Manual).`,
        };
      }

      return {
        success: false,
        message: rawMessage || `Gagal menyinkronkan berkas ke GitHub (HTTP ${putRes.status})`,
      };
    }

    return {
      success: false,
      message: 'Gagal menyinkronkan alur kerja karena konflik versi berkas di GitHub.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Gagal menghubungi GitHub API untuk sinkronisasi alur kerja.',
    };
  }
}

/**
 * Dispatches the build-apk.yml workflow on GitHub Actions with automatic input adaptation,
 * smart branch detection, and graceful retries.
 */
export async function triggerCloudBuild(
  config: GitHubConfig,
  inputs: {
    target_url: string;
    app_name: string;
    package_name: string;
    theme_color?: string;
    status_bar_color?: string;
    nav_bar_color?: string;
  },
  customWorkflowYml?: string,
  forceSyncWorkflow = false
): Promise<{
  success: boolean;
  error?: string;
  branchUsed?: string;
  inputsDispatched?: Record<string, string>;
  actionUrl?: string;
}> {
  if (!config.token.trim()) {
    return {
      success: false,
      error: 'Token GitHub belum diisi. Masukkan Personal Access Token Anda.',
    };
  }
  if (!config.owner.trim() || !config.repo.trim()) {
    return {
      success: false,
      error: 'Nama pemilik atau repositori belum diisi.',
    };
  }

  // 1. Detect repository default branch
  const repoInfo = await getRepoInfo(config);
  let targetBranch = config.branch?.trim() || repoInfo.defaultBranch || 'main';
  if (repoInfo.defaultBranch && (targetBranch === 'main' || targetBranch === 'master')) {
    targetBranch = repoInfo.defaultBranch;
  }

  // 2. Check if the workflow file exists in repository
  let fileInfo = await getWorkflowFileFromRepo(config, targetBranch);
  if (!fileInfo.exists && targetBranch !== 'master') {
    // Check if it exists on 'master' branch instead
    const masterInfo = await getWorkflowFileFromRepo(config, 'master');
    if (masterInfo.exists) {
      targetBranch = 'master';
      fileInfo = masterInfo;
    }
  }

  // Check if workflow is already registered on GitHub Actions
  const regInfo = await checkWorkflowRegistration(config);

  // 3. Only sync if the file doesn't exist and isn't registered, OR user explicitly requested force sync
  const needsSync = forceSyncWorkflow || (!fileInfo.exists && !regInfo.registered);
  if (needsSync) {
    const syncRes = await syncWorkflowFileToRepo({ ...config, branch: targetBranch }, customWorkflowYml);
    if (!syncRes.success) {
      // If workflow was already registered in Actions, we don't necessarily have to block dispatch
      if (!regInfo.registered) {
        return {
          success: false,
          error: `Gagal menyiapkan alur kerja di GitHub: ${syncRes.message}`,
        };
      }
    } else if (syncRes.branchUsed) {
      targetBranch = syncRes.branchUsed;
    }
    // Give GitHub Actions a moment to register newly committed workflow if synced
    if (!fileInfo.content && customWorkflowYml) {
      fileInfo = { exists: true, content: customWorkflowYml };
    }
  }

  // 4. Inspect which inputs are actually declared in the workflow file on GitHub
  let declaredInputs: string[] = [];
  if (fileInfo.content) {
    declaredInputs = parseWorkflowInputsFromYaml(fileInfo.content);
  } else if (customWorkflowYml) {
    declaredInputs = parseWorkflowInputsFromYaml(customWorkflowYml);
  }

  // Build the dispatch inputs payload based strictly on declared inputs (or safe defaults)
  let payloadInputs: Record<string, string> = {};
  if (declaredInputs.length > 0) {
    for (const key of declaredInputs) {
      const val = (inputs as any)[key];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        payloadInputs[key] = String(val);
      }
    }
  } else {
    // If not detected, pass the 3 core inputs guaranteed in all workflows
    payloadInputs = {
      target_url: inputs.target_url,
      app_name: (inputs as any).appName || inputs.app_name,
      package_name: inputs.package_name,
    };
    if (inputs.theme_color) payloadInputs.theme_color = inputs.theme_color;
    if (inputs.status_bar_color) payloadInputs.status_bar_color = inputs.status_bar_color;
    if (inputs.nav_bar_color) payloadInputs.nav_bar_color = inputs.nav_bar_color;
  }

  const dispatchUrl = `https://api.github.com/repos/${config.owner.trim()}/${config.repo.trim()}/actions/workflows/build-apk.yml/dispatches`;

  // Helper to execute dispatch HTTP request
  const doDispatch = async (branch: string, inps: Record<string, string>) => {
    return fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token.trim()}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        ref: branch,
        inputs: inps,
      }),
    });
  };

  try {
    let response = await doDispatch(targetBranch, payloadInputs);

    // If 204 No Content, dispatch succeeded!
    if (response.status === 204) {
      return {
        success: true,
        branchUsed: targetBranch,
        inputsDispatched: payloadInputs,
        actionUrl: `https://github.com/${config.owner.trim()}/${config.repo.trim()}/actions/workflows/build-apk.yml`,
      };
    }

    if (response.status === 401) {
      return {
        success: false,
        error: 'Token GitHub tidak valid atau sudah kedaluwarsa. Periksa kembali token Anda.',
      };
    }

    let errData = await response.json().catch(() => ({}));
    let rawMsg: string = errData.message || '';

    // Scenario A: GitHub rejected unexpected input(s) (e.g. theme_color removed by user)
    if (response.status === 422 && rawMsg.includes('Unexpected input')) {
      // Fallback: Retry with only the 3 universal core inputs
      const coreInputs = {
        target_url: inputs.target_url,
        app_name: (inputs as any).appName || inputs.app_name,
        package_name: inputs.package_name,
      };
      const retryRes = await doDispatch(targetBranch, coreInputs);
      if (retryRes.status === 204) {
        return {
          success: true,
          branchUsed: targetBranch,
          inputsDispatched: coreInputs,
          actionUrl: `https://github.com/${config.owner.trim()}/${config.repo.trim()}/actions/workflows/build-apk.yml`,
        };
      }
      errData = await retryRes.json().catch(() => ({}));
      rawMsg = errData.message || rawMsg;
    }

    // Scenario B: GitHub Actions reports missing workflow_dispatch trigger or still indexing
    if (
      (response.status === 422 && rawMsg.includes('workflow_dispatch')) ||
      response.status === 404
    ) {
      // 1. First check if master branch has the workflow
      const altBranch = targetBranch === 'main' ? 'master' : 'main';
      const altRes = await doDispatch(altBranch, payloadInputs);
      if (altRes.status === 204) {
        return {
          success: true,
          branchUsed: altBranch,
          inputsDispatched: payloadInputs,
          actionUrl: `https://github.com/${config.owner.trim()}/${config.repo.trim()}/actions/workflows/build-apk.yml`,
        };
      }

      // 2. The remote workflow might have had a YAML syntax error (e.g. invalid multiline base64)
      // Automatically attempt to sync the corrected valid workflow to GitHub!
      try {
        const syncRes = await syncWorkflowFileToRepo(
          { ...config, branch: targetBranch },
          customWorkflowYml || LATEST_WORKFLOW_YML
        );
        if (syncRes.success) {
          // Wait 3 seconds for GitHub Actions engine to index the corrected YAML
          await new Promise((r) => setTimeout(r, 3000));
          const postSyncRes = await doDispatch(targetBranch, payloadInputs);
          if (postSyncRes.status === 204) {
            return {
              success: true,
              branchUsed: targetBranch,
              inputsDispatched: payloadInputs,
              actionUrl: `https://github.com/${config.owner.trim()}/${config.repo.trim()}/actions/workflows/build-apk.yml`,
            };
          }
          const postSyncData = await postSyncRes.json().catch(() => ({}));
          rawMsg = postSyncData.message || rawMsg;
        }
      } catch (syncErr) {
        console.warn('Auto-sync workflow on dispatch failure error:', syncErr);
      }

      // 3. One final retry after short delay
      await new Promise((r) => setTimeout(r, 2000));
      const retryRes2 = await doDispatch(targetBranch, payloadInputs);
      if (retryRes2.status === 204) {
        return {
          success: true,
          branchUsed: targetBranch,
          inputsDispatched: payloadInputs,
          actionUrl: `https://github.com/${config.owner.trim()}/${config.repo.trim()}/actions/workflows/build-apk.yml`,
        };
      }
      errData = await retryRes2.json().catch(() => ({}));
      rawMsg = errData.message || rawMsg;
    }

    // Honest, specific error message directly from GitHub
    if (response.status === 404) {
      return {
        success: false,
        error: `Alur kerja "build-apk.yml" belum ditemukan di GitHub pada branch "${targetBranch}". Silakan klik tombol "Sinkronkan Desain & Alur Kerja ke GitHub" atau pastikan berkas .github/workflows/build-apk.yml ada di repositori Anda.`,
        actionUrl: `https://github.com/${config.owner.trim()}/${config.repo.trim()}/actions`,
      };
    }

    if (rawMsg.includes('workflow_dispatch')) {
      return {
        success: false,
        error: `GitHub melaporkan: "${rawMsg}". Kemungkinan berkas alur kerja di GitHub memiliki kesalahan format YAML atau sedang diindeks oleh GitHub. Kami telah menyediakan perbaikan otomatis: silakan klik tombol "Sinkronkan Desain & Alur Kerja ke GitHub" di atas untuk memperbarui berkas repositori secara bersih.`,
        actionUrl: `https://github.com/${config.owner.trim()}/${config.repo.trim()}/actions/workflows/build-apk.yml`,
      };
    }

    return {
      success: false,
      error: rawMsg ? `GitHub API: ${rawMsg}` : `Gagal memulai kompilasi (HTTP ${response.status})`,
      actionUrl: `https://github.com/${config.owner.trim()}/${config.repo.trim()}/actions/workflows/build-apk.yml`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Gagal terhubung ke server GitHub. Periksa koneksi internet Anda.',
    };
  }
}

/**
 * Polls the latest workflow run for build-apk.yml.
 */
export async function getLatestWorkflowRun(
  config: GitHubConfig
): Promise<{ run?: WorkflowRun; error?: string }> {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/actions/workflows/build-apk.yml/runs?per_page=1&_ts=${Date.now()}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(config.token ? { Authorization: `Bearer ${config.token.trim()}` } : {}),
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { error: data.message || `HTTP ${response.status}` };
    }

    const data = await response.json();
    if (data.workflow_runs && data.workflow_runs.length > 0) {
      return { run: data.workflow_runs[0] };
    }

    return { error: 'Belum ada riwayat build.' };
  } catch (err: any) {
    return { error: err?.message || 'Gagal mengambil status build' };
  }
}

/**
 * Gets downloadable artifacts for a completed workflow run.
 */
export async function getRunArtifacts(
  config: GitHubConfig,
  runId: number
): Promise<{ artifacts: ArtifactItem[]; error?: string }> {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/actions/runs/${runId}/artifacts?_ts=${Date.now()}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(config.token ? { Authorization: `Bearer ${config.token.trim()}` } : {}),
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { artifacts: [], error: data.message || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { artifacts: data.artifacts || [] };
  } catch (err: any) {
    return { artifacts: [], error: err?.message || 'Gagal mengambil berkas artefak' };
  }
}
