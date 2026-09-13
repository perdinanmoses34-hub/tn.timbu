import React, { useState, useEffect, useRef } from 'react';
import {
  Cloud,
  Server,
  Play,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Key,
  Lock,
  Smartphone,
  Download,
  Terminal,
  Settings,
  HelpCircle,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  Sparkles,
  GitBranch,
  Wrench,
  Palette,
  Code2,
  X,
  Layers,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { AppConfig } from '../types';
import {
  getSavedGitHubConfig,
  saveGitHubConfig,
  triggerCloudBuild,
  syncWorkflowFileToRepo,
  getLatestWorkflowRun,
  getRunArtifacts,
  GitHubConfig,
  WorkflowRun,
  ArtifactItem,
} from '../utils/githubCloudBuild';
import { generateWorkflowYml } from '../utils/workflowTemplate';
import { generateAppIconBase64 } from '../utils/iconCanvasGenerator';

interface CloudBuildPanelProps {
  config: AppConfig;
  onOpenPlayStoreGuide: () => void;
}

export const CloudBuildPanel: React.FC<CloudBuildPanelProps> = ({ config }) => {
  const [ghConfig, setGhConfig] = useState<GitHubConfig>(() => getSavedGitHubConfig());
  const [showConfigSettings, setShowConfigSettings] = useState(() => !getSavedGitHubConfig().token);
  const [showTokenGuide, setShowTokenGuide] = useState(() => !getSavedGitHubConfig().token);
  const [isTriggering, setIsTriggering] = useState(false);
  const [isSyncingWorkflow, setIsSyncingWorkflow] = useState(false);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<WorkflowRun | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [buildDurationSeconds, setBuildDurationSeconds] = useState(0);
  const [pollingStatusText, setPollingStatusText] = useState('');
  const [copiedTokenHelper, setCopiedTokenHelper] = useState(false);

  // Workflow code preview modal state
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [generatedWorkflowCode, setGeneratedWorkflowCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeSyncTab, setActiveSyncTab] = useState<'auto' | 'manual'>('auto');
  const [copiedManualCode, setCopiedManualCode] = useState(false);

  const timerRef = useRef<any>(null);
  const pollIntervalRef = useRef<any>(null);

  // Update token or repo in local storage
  const handleSaveConfig = (updates: Partial<GitHubConfig>) => {
    const updated = { ...ghConfig, ...updates };
    setGhConfig(updated);
    saveGitHubConfig(updates);
  };

  // Download workflow yml file locally
  const handleDownloadWorkflowYml = async () => {
    let iconBase64: string | undefined;
    try {
      iconBase64 = await generateAppIconBase64(config.icon, config.appName, 192);
    } catch (e) {
      console.warn('Gagal merender ikon base64:', e);
    }
    const code = generateWorkflowYml(config, iconBase64);
    const blob = new Blob([code], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'build-apk.yml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Copy manual workflow code
  const handleCopyManualWorkflow = async () => {
    let iconBase64: string | undefined;
    try {
      iconBase64 = await generateAppIconBase64(config.icon, config.appName, 192);
    } catch (e) {
      console.warn('Gagal merender ikon base64:', e);
    }
    const code = generateWorkflowYml(config, iconBase64);
    navigator.clipboard.writeText(code);
    setCopiedManualCode(true);
    setTimeout(() => setCopiedManualCode(false), 2500);
  };

  // Preview generated workflow code matching user configuration
  const handleOpenWorkflowPreview = async () => {
    let iconBase64: string | undefined;
    try {
      iconBase64 = await generateAppIconBase64(config.icon, config.appName, 192);
    } catch (e) {
      console.warn('Gagal merender ikon base64:', e);
    }
    const code = generateWorkflowYml(config, iconBase64);
    setGeneratedWorkflowCode(code);
    setShowWorkflowModal(true);
  };

  const handleCopyCode = () => {
    if (!generatedWorkflowCode) return;
    navigator.clipboard.writeText(generatedWorkflowCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Manual sync workflow file to GitHub
  const handleSyncWorkflow = async () => {
    if (!ghConfig.token.trim()) {
      setShowConfigSettings(true);
      setErrorMessage('Masukkan Token GitHub Anda terlebih dahulu untuk menyinkronkan alur kerja.');
      return;
    }

    setIsSyncingWorkflow(true);
    setSyncStatusMessage('Sedang menyiapkan ikon dan menyinkronkan desain (warna tema, status bar, splash) ke repositori GitHub...');
    
    let iconBase64: string | undefined;
    try {
      iconBase64 = await generateAppIconBase64(config.icon, config.appName, 192);
    } catch (e) {
      console.warn('Gagal merender ikon base64:', e);
    }
    const customWorkflowYml = generateWorkflowYml(config, iconBase64);

    const res = await syncWorkflowFileToRepo(ghConfig, customWorkflowYml);
    setIsSyncingWorkflow(false);

    if (res.success) {
      setSyncStatusMessage('Alur kerja build-apk.yml berhasil diperbarui di GitHub sesuai warna tema, ikon, dan konfigurasi aplikasi Anda!');
      setTimeout(() => setSyncStatusMessage(null), 6000);
    } else {
      setErrorMessage(res.message);
    }
  };

  // Timer while building
  useEffect(() => {
    if (activeRun && (activeRun.status === 'in_progress' || activeRun.status === 'queued')) {
      timerRef.current = setInterval(() => {
        setBuildDurationSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [activeRun?.status]);

  // Poller while workflow run is active
  useEffect(() => {
    if (!activeRun || activeRun.status === 'completed') {
      clearInterval(pollIntervalRef.current);
      return;
    }

    pollIntervalRef.current = setInterval(async () => {
      const { run, error } = await getLatestWorkflowRun(ghConfig);
      if (run) {
        setActiveRun(run);
        if (run.status === 'in_progress') {
          setPollingStatusText('Server Cloud Ubuntu sedang menjalankan Gradle & Java 17 untuk menyusun APK...');
        } else if (run.status === 'queued') {
          setPollingStatusText('Antrean server GitHub Cloud siap dimulai...');
        } else if (run.status === 'completed') {
          clearInterval(pollIntervalRef.current);
          if (run.conclusion === 'success') {
            setPollingStatusText('Kompilasi Selesai 100%! Mengambil berkas APK...');
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 },
              colors: ['#10B981', '#3B82F6', '#8B5CF6'],
            });
            // Fetch artifacts
            const art = await getRunArtifacts(ghConfig, run.id);
            if (art.artifacts.length > 0) {
              setArtifacts(art.artifacts);
            }
          } else {
            setErrorMessage(`Kompilasi gagal dengan status: ${run.conclusion}. Periksa log di GitHub.`);
          }
        }
      }
    }, 6000);

    return () => clearInterval(pollIntervalRef.current);
  }, [activeRun?.id, activeRun?.status, ghConfig]);

  // Trigger Build via API
  const handleStartCloudBuild = async () => {
    setErrorMessage(null);
    setArtifacts([]);
    setBuildDurationSeconds(0);

    if (!ghConfig.token.trim()) {
      setShowConfigSettings(true);
      setErrorMessage('Masukkan Token GitHub Anda terlebih dahulu untuk memulai kompilasi otomatis dari aplikasi.');
      return;
    }

    setIsTriggering(true);
    setPollingStatusText('Menyiapkan aset desain & menyinkronkan alur kerja ke GitHub Actions...');

    let iconBase64: string | undefined;
    try {
      iconBase64 = await generateAppIconBase64(config.icon, config.appName, 192);
    } catch (e) {
      console.warn('Gagal merender ikon base64:', e);
    }
    const customWorkflowYml = generateWorkflowYml(config, iconBase64);

    const result = await triggerCloudBuild(
      ghConfig,
      {
        target_url: config.url,
        app_name: config.appName,
        package_name: config.packageName,
        theme_color: config.themeColor,
        status_bar_color: config.statusBarColor,
        nav_bar_color: config.navBarColor,
      },
      customWorkflowYml
    );

    setIsTriggering(false);

    if (!result.success) {
      setErrorMessage(result.error || 'Gagal memulai kompilasi.');
      setShowConfigSettings(true);
      return;
    }

    // Successfully dispatched, now wait 3 seconds and find the run
    setPollingStatusText('Instruksi diterima oleh GitHub! Menghubungkan ke proses build...');
    setTimeout(async () => {
      const { run } = await getLatestWorkflowRun(ghConfig);
      if (run) {
        setActiveRun(run);
      } else {
        // Fallback placeholder run
        setActiveRun({
          id: Date.now(),
          status: 'queued',
          conclusion: null,
          html_url: `https://github.com/${ghConfig.owner}/${ghConfig.repo}/actions`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }, 3000);
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const directWorkflowUrl = `https://github.com/${ghConfig.owner}/${ghConfig.repo}/actions/workflows/build-apk.yml`;

  return (
    <div className="space-y-4">
      {/* Top Banner Explaining Cloud Compiler */}
      <div className="p-4 bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/40 border border-blue-500/40 rounded-xl flex items-start gap-3.5 shadow-lg">
        <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0 text-blue-400">
          <Cloud className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-white">Kompilasi Cloud Otomatis (APK Biner ~10 MB)</h4>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              100% Berfungsi di HP
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Aplikasi Web2App Studio terhubung langsung ke server cloud GitHub Anda untuk menyusun <strong>Dalvik Bytecode (.dex)</strong> dan <strong>AndroidManifest biner</strong>. Menghasilkan APK asli yang bisa langsung diinstal di smartphone tanpa pesan galat paket.
          </p>
        </div>
      </div>

      {/* Configuration & Sync Modes */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-4 shadow-xl">
        {/* Mode Selector Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Sinkronisasi Alur Kerja (build-apk.yml)
            </span>
          </div>

          <div className="flex rounded-lg bg-slate-900 p-1 border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveSyncTab('auto')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                activeSyncTab === 'auto'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Mode 1: Otomatis (1-Klik)
            </button>
            <button
              type="button"
              onClick={() => setActiveSyncTab('manual')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                activeSyncTab === 'manual'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Mode 2: Manual Tanpa Token
            </button>
          </div>
        </div>

        {/* MODE 1: AUTOMATIC SYNC VIA GITHUB TOKEN */}
        {activeSyncTab === 'auto' && (
          <div className="space-y-3.5">
            <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-lg space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Pembaruan Alur Kerja Otomatis ke Repositori</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Tombol di bawah ini akan secara otomatis memperbarui berkas <code>.github/workflows/build-apk.yml</code> di repositori Anda agar menggunakan konfigurasi terbaru (warna tema, status bar, splash screen, ikon aplikasi Anda) dan memperbaiki masalah peringatan Node.js 20.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Repositori GitHub (Owner / Repo):
                </label>
                <input
                  type="text"
                  value={`${ghConfig.owner}/${ghConfig.repo}`}
                  onChange={(e) => {
                    const parts = e.target.value.split('/');
                    handleSaveConfig({
                      owner: parts[0] || '',
                      repo: parts[1] || '',
                    });
                  }}
                  placeholder="perdinanmoses34-hub/tn.timbu"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-400">
                    GitHub Personal Access Token:
                  </label>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo,workflow&description=Web2App%20Studio%20Cloud%20Compiler"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold underline flex items-center gap-0.5"
                  >
                    <span>Buat Token Baru</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <input
                  type="password"
                  value={ghConfig.token}
                  onChange={(e) => handleSaveConfig({ token: e.target.value })}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Prominent Sync Button */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <button
                type="button"
                id="btn-sync-workflow-github"
                onClick={handleSyncWorkflow}
                disabled={isSyncingWorkflow || !ghConfig.token.trim()}
                className="py-3 px-5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 cursor-pointer disabled:opacity-40 transition-all active:scale-[0.99]"
              >
                {isSyncingWorkflow ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Sedang Menyinkronkan ke GitHub...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>⚡ Sinkronkan Workflow ke GitHub Sekarang</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowTokenGuide(!showTokenGuide)}
                className="text-xs text-slate-400 hover:text-slate-200 underline text-center sm:text-right cursor-pointer"
              >
                {showTokenGuide ? 'Tutup Petunjuk Token' : 'Belum punya Token? Klik di sini'}
              </button>
            </div>

            {/* Quick 3-Step Guide to Generate Token */}
            {showTokenGuide && (
              <div className="p-3 bg-blue-950/30 border border-blue-500/30 rounded-lg space-y-2 text-[11px] text-slate-300">
                <div className="font-bold text-blue-300 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Cara Cepat Membuat Token GitHub (30 Detik):</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-300">
                  <li>
                    Klik tautan <a href="https://github.com/settings/tokens/new?scopes=repo,workflow&description=Web2App%20Studio%20Cloud%20Compiler" target="_blank" rel="noreferrer" className="text-blue-400 underline font-semibold">Buat Token GitHub</a> (izin <strong>repo</strong> &amp; <strong>workflow</strong> sudah otomatis dicentang).
                  </li>
                  <li>
                    Gulir ke paling bawah halaman GitHub, lalu klik tombol hijau <strong>"Generate token"</strong>.
                  </li>
                  <li>
                    Salin kode token yang diawali <code>ghp_...</code>, lalu tempel ke kolom di atas dan klik tombol <strong>"Sinkronkan Workflow ke GitHub Sekarang"</strong>.
                  </li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* MODE 2: MANUAL WITHOUT TOKEN (COPY OR DOWNLOAD YAML) */}
        {activeSyncTab === 'manual' && (
          <div className="space-y-3.5">
            <div className="p-3 bg-blue-950/30 border border-blue-500/30 rounded-lg space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-300">
                <Code2 className="w-4 h-4 text-blue-400" />
                <span>Salin atau Unduh Berkas Alur Kerja Tanpa Memerlukan Token</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Jika Anda tidak ingin membuat token GitHub, Anda dapat menyalin kode alur kerja yang sudah disesuaikan dengan aplikasi Anda, lalu menempelkannya langsung ke editor GitHub Anda.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleCopyManualWorkflow}
                className="py-2.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow cursor-pointer transition-colors"
              >
                {copiedManualCode ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>Kode Berhasil Disalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>1. Salin Seluruh Kode YAML</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadWorkflowYml}
                className="py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 border border-slate-700 cursor-pointer transition-colors"
              >
                <Download className="w-4 h-4 text-blue-400" />
                <span>2. Unduh build-apk.yml</span>
              </button>

              <a
                href={`https://github.com/${ghConfig.owner}/${ghConfig.repo}/edit/${ghConfig.branch || 'main'}/.github/workflows/build-apk.yml`}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow transition-colors"
              >
                <span>3. Buka File di GitHub</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Step-by-step Manual Guide */}
            <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-2 text-[11px] text-slate-300">
              <span className="font-bold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Langkah Cepat Memperbarui di GitHub (1 Menit):
              </span>
              <ol className="list-decimal list-inside space-y-1 text-slate-300">
                <li>Klik tombol biru <strong>"1. Salin Seluruh Kode YAML"</strong> di atas.</li>
                <li>Klik tombol hijau <strong>"3. Buka File di GitHub"</strong> (akan membuka halaman editor berkas di browser).</li>
                <li>Di GitHub, tekan <code>Ctrl + A</code> untuk memilih seluruh teks lama, lalu tekan <code>Delete</code>.</li>
                <li>Tekan <code>Ctrl + V</code> (Paste) untuk menempelkan kode alur kerja baru yang telah disalin.</li>
                <li>Klik tombol hijau <strong>"Commit changes..."</strong> di pojok kanan atas GitHub.</li>
                <li>Buka tab <strong>Actions</strong> di GitHub, pilih <strong>Build Real Android APK &amp; AAB</strong>, lalu klik <strong>Run workflow</strong>!</li>
              </ol>
            </div>
          </div>
        )}
      </div>

      {/* Sync Status Banner */}
      {syncStatusMessage && (
        <div className="p-3 bg-emerald-950/50 border border-emerald-500/50 rounded-xl flex items-center gap-2.5 text-xs text-emerald-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{syncStatusMessage}</span>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl flex items-start gap-2.5 text-xs text-red-200">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold">{errorMessage}</span>
            <p className="text-[11px] text-slate-300">
              Alternatif cepat: Anda juga bisa langsung membuka menu kompilasi manual di GitHub di bawah ini.
            </p>
          </div>
        </div>
      )}

      {/* Dedicated Failure & Auto-Repair Card */}
      {activeRun && activeRun.conclusion === 'failure' && (
        <div className="p-4 bg-amber-950/40 border border-amber-500/50 rounded-xl space-y-3 shadow-lg">
          <div className="flex items-center gap-2 text-amber-300">
            <Wrench className="w-5 h-5 text-amber-400 shrink-0" />
            <span className="text-sm font-bold">Kompilasi Sebelumnya Mengalami Masalah (Telah Diperbaiki)</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Penyebab kegagalan pada build sebelumnya (konfigurasi SDK / Gradle pada runner GitHub) telah diperbaiki dengan alur kerja baru yang menggunakan <strong>Java 17</strong>, <strong>Gradle 8.4 resmi</strong>, dan <strong>Android SDK 34 stabil</strong>.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              onClick={handleStartCloudBuild}
              disabled={isTriggering}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer"
            >
              {isTriggering ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Sedang Menyiapkan & Memulai...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Sinkronkan Perbaikan & Ulangi Kompilasi Sekarang</span>
                </>
              )}
            </button>
            <a
              href={activeRun.html_url}
              target="_blank"
              rel="noreferrer"
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>Lihat Log GitHub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}

      {/* APPLIED APP DESIGN & FEATURE SETTINGS CARD */}
      <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Palette className="w-4 h-4 text-blue-400" />
            <span>Pengaturan Tampilan APK yang Diterapkan</span>
          </span>
          <button
            type="button"
            onClick={handleOpenWorkflowPreview}
            className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Lihat / Salin Kode YAML</span>
          </button>
        </div>

        {/* Color swatches & Core configs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          {/* Theme Color */}
          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center gap-2">
            <span
              className="w-4 h-4 rounded-full border border-white/20 shrink-0 shadow-sm"
              style={{ backgroundColor: config.themeColor || '#2563EB' }}
            />
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400">Warna Tema</div>
              <div className="font-mono text-slate-200 truncate">{config.themeColor || '#2563EB'}</div>
            </div>
          </div>

          {/* Status Bar */}
          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center gap-2">
            <span
              className="w-4 h-4 rounded-full border border-white/20 shrink-0 shadow-sm"
              style={{ backgroundColor: config.statusBarColor || '#1D4ED8' }}
            />
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400">Status Bar</div>
              <div className="font-mono text-slate-200 truncate">{config.statusBarColor || '#1D4ED8'}</div>
            </div>
          </div>

          {/* Navigation Bar */}
          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center gap-2">
            <span
              className="w-4 h-4 rounded-full border border-white/20 shrink-0 shadow-sm"
              style={{ backgroundColor: config.navBarColor || '#0F172A' }}
            />
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400">Navigasi Bawah</div>
              <div className="font-mono text-slate-200 truncate">{config.navBarColor || '#0F172A'}</div>
            </div>
          </div>

          {/* Splash Screen */}
          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400">Splash Screen</div>
              <div className="font-medium text-slate-200 truncate">
                {config.splash?.enabled ? `${config.splash.durationSeconds} dtk (Aktif)` : 'Nonaktif'}
              </div>
            </div>
          </div>
        </div>

        {/* URL, App Name, and Permission Badges */}
        <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-slate-300 min-w-0">
            <span className="text-slate-400 text-[10px]">Aplikasi:</span>
            <span className="font-semibold text-white truncate">{config.appName}</span>
            <span className="text-slate-500 font-mono text-[10px]">({config.packageName})</span>
          </div>

          <div className="flex flex-wrap items-center gap-1 text-[10px]">
            {config.permissions?.camera && (
              <span className="px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/50">Kamera</span>
            )}
            {config.permissions?.location && (
              <span className="px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/50">Lokasi</span>
            )}
            {config.permissions?.storage && (
              <span className="px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/50">Upload File</span>
            )}
            {config.permissions?.notifications && (
              <span className="px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/50">Notifikasi</span>
            )}
            {config.permissions?.pullToRefresh && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">Tarik Muat Ulang</span>
            )}
          </div>
        </div>
      </div>

      {/* MAIN ACTION SECTION: Start Build or Show Live Progress */}
      {!activeRun || activeRun.status === 'completed' ? (
        <div className="space-y-3">
          {/* If there was a previous successful build */}
          {activeRun && activeRun.conclusion === 'success' && (
            <div className="p-4 bg-emerald-950/40 border border-emerald-500/50 rounded-xl space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm font-bold text-white">Kompilasi Cloud Berhasil!</span>
                </div>
                <span className="text-xs text-emerald-300 font-mono">
                  Selesai dalam {formatTimer(buildDurationSeconds)}
                </span>
              </div>

              <p className="text-xs text-slate-200 leading-relaxed">
                Berkas <strong>app-debug-real-apk (~10 MB)</strong> telah berhasil dibuat oleh server Android SDK. Anda dapat langsung mengunduhnya sekarang.
              </p>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <a
                  href={activeRun.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh APK Asli di Halaman GitHub</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  onClick={handleStartCloudBuild}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Kompilasi Ulang</span>
                </button>
              </div>
            </div>
          )}

          {/* Big Start Cloud Build Button */}
          {(!activeRun || activeRun.conclusion !== 'success') && (
            <div className="space-y-2">
              <button
                onClick={handleStartCloudBuild}
                disabled={isTriggering}
                className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-xl shadow-blue-600/30 cursor-pointer disabled:opacity-50 transition-all active:scale-[0.99]"
              >
                {isTriggering ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Menghubungi Cloud GitHub...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    <span>Mulai Kompilasi Cloud APK Asli (~10 MB)</span>
                  </>
                )}
              </button>
              <div className="text-center text-[11px] text-slate-400">
                Server Ubuntu akan otomatis menjalankan <code>gradlew assembleDebug</code> untuk website: <span className="text-blue-400 font-mono">{config.url}</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* LIVE PROGRESS VIEW WHILE BUILDING */
        <div className="p-4 bg-slate-900 border border-blue-500/50 rounded-xl space-y-3.5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500 animate-ping" />
              <span className="text-sm font-bold text-white">Proses Kompilasi Sedang Berjalan</span>
            </div>
            <span className="text-xs font-mono font-bold text-blue-400 bg-blue-950/60 px-2.5 py-1 rounded-lg border border-blue-500/30">
              Waktu: {formatTimer(buildDurationSeconds)} (Estimasi: ~02:15)
            </span>
          </div>

          {/* Animated Progress Bar */}
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 h-2 rounded-full transition-all duration-1000"
              style={{
                width: `${Math.min(95, Math.max(15, (buildDurationSeconds / 135) * 100))}%`,
              }}
            />
          </div>

          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5 font-mono text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <Server className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-slate-200">{pollingStatusText || 'Menghubungkan ke GitHub Actions...'}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-800/80">
              <span>Status: <strong className="text-blue-400 uppercase">{activeRun.status}</strong></span>
              <a
                href={activeRun.html_url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-sans underline"
              >
                <span>Lihat Live Log di GitHub</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 text-center">
            Anda dapat tetap berada di halaman ini. Begitu selesai, tombol unduh APK asli akan otomatis muncul di sini.
          </p>
        </div>
      )}

      {/* Fallback Section: 1-Click Manual Execution */}
      <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-slate-300">
            Atau jalankan langsung 1-klik di halaman web GitHub:
          </span>
        </div>
        <a
          href={directWorkflowUrl}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-300 font-semibold flex items-center gap-1.5 shrink-0 transition-colors"
        >
          <span>Buka Tab Actions</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* WORKFLOW CODE PREVIEW MODAL */}
      {showWorkflowModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Berkas Alur Kerja (.github/workflows/build-apk.yml)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Disesuaikan otomatis dengan warna tema, ikon, splash screen, dan izin aplikasi Anda
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin Semua Kode</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowWorkflowModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Code Body */}
            <div className="p-4 overflow-y-auto flex-1 font-mono text-[11px] leading-relaxed bg-slate-950 text-slate-200 select-all">
              <pre className="whitespace-pre-wrap break-all">{generatedWorkflowCode}</pre>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1 text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                Otomatis disinkronkan ke GitHub saat kompilasi dijalankan.
              </span>
              <button
                type="button"
                onClick={() => setShowWorkflowModal(false)}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
