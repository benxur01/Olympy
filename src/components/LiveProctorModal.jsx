import React, { useState, useEffect, useRef } from 'react';
import { Icon, Modal } from '../../shared.jsx';
import { OlympyApi } from '../services/api.js';

export function LiveProctorModal({
  open,
  onClose,
  sessionId,
  studentName = 'O\'quvchi',
  olympiadTitle = 'Olimpiada',
  onDisqualify,
  onWarning,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [warningSent, setWarningSent] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const pollTimerRef = useRef(null);

  const fetchLiveFrame = async () => {
    if (!sessionId) return;
    try {
      const token = OlympyApi.getToken();
      const res = await OlympyApi.getLiveProctorFrame(sessionId, token);
      setData(res);
      setError('');
    } catch (err) {
      setError(err?.message || "Jonli videoni yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !sessionId) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      setData(null);
      setLoading(true);
      setError('');
      setWarningSent(false);
      return;
    }

    // Birinchi kadrni darrov yuklash
    fetchLiveFrame();

    // Har 1200ms da yangi kadr va audio darajasini so'rab turish
    pollTimerRef.current = setInterval(fetchLiveFrame, 1200);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      // Streamni to'xtatish signali
      try {
        const token = OlympyApi.getToken();
        OlympyApi.sendProctorSignal(sessionId, { action: 'stop_stream' }, token).catch(() => {});
      } catch {}
    };
  }, [open, sessionId]);

  const handleSendWarning = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const token = OlympyApi.getToken();
      await OlympyApi.sendProctorSignal(sessionId, {
        action: 'warning',
        payload: { message: "Nazoratchi ogohlantirishi: Iltimos, kameraga qarang va begona harakat qilmang!" }
      }, token);
      setWarningSent(true);
      setTimeout(() => setWarningSent(false), 4000);
      if (onWarning) onWarning(sessionId);
    } catch (err) {
      alert("Ogohlantirish yuborishda xatolik: " + err.message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleDisqualify = async () => {
    if (!confirm(`${studentName || 'O\'quvchi'}ni qoidabuzarlik sababli imtihondan chetlatishni tasdiqlaysizmi?`)) {
      return;
    }
    setActionBusy(true);
    try {
      const token = OlympyApi.getToken();
      await OlympyApi.reviewCheatingCase(sessionId, 'disqualify', token);
      alert("O'quvchi imtihondan chetlatildi (Disqualified).");
      if (onDisqualify) onDisqualify(sessionId);
      onClose();
    } catch (err) {
      alert("Chetlatishda xatolik: " + err.message);
    } finally {
      setActionBusy(false);
    }
  };

  if (!open) return null;

  const audioLevel = data?.audio_level || 0; // 0 to 100
  const hasLiveFrame = Boolean(data?.frame);
  const faceDetected = data?.face_detected ?? true;
  const speechDetected = data?.speech_detected ?? (audioLevel > 35);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Jonli Proktoring Nazorati"
      width="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Header Info Banner */}
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-3 border border-edge">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-text-primary truncate">{data?.student_name || studentName}</h3>
              <span className="rounded bg-accent/15 border border-accent/45 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                {data?.phone || 'Online'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-text-secondary font-medium truncate">{data?.olympiad_title || olympiadTitle}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-error/15 border border-error/45 px-2.5 py-1 text-[10px] font-bold text-error animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-error"></span>
              JONLI EFIR
            </span>
          </div>
        </div>

        {/* Video Player Display Container */}
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black border border-edge shadow-inner flex items-center justify-center">
          {loading && !hasLiveFrame && (
            <div className="flex flex-col items-center gap-2 text-white/70 text-xs font-bold">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
              <span>Kameraga ulanmoqda...</span>
            </div>
          )}

          {!loading && !hasLiveFrame && (
            <div className="flex flex-col items-center gap-2 text-center p-6 text-white/60">
              <span className="text-3xl">📷</span>
              <p className="text-xs font-bold text-white">Kamera signali kutilmoqda</p>
              <p className="text-[11px] text-white/50 max-w-xs">
                O'quvchi kamerasini yoqqan bo'lsa, bir necha soniyada video oqim shu yerda paydo bo'ladi.
              </p>
            </div>
          )}

          {hasLiveFrame && (
            <img
              src={data.frame}
              alt="Live Proctor Feed"
              className="h-full w-full object-contain"
            />
          )}

          {/* Video Overlays */}
          {hasLiveFrame && (
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <span className="rounded-md bg-black/60 backdrop-blur-md px-2 py-1 text-[10px] font-bold text-white flex items-center gap-1 border border-white/10">
                <span className="h-2 w-2 rounded-full bg-success animate-pulse"></span>
                Jonli
              </span>
              {!faceDetected && (
                <span className="rounded-md bg-error/80 backdrop-blur-md px-2 py-1 text-[10px] font-bold text-white flex items-center gap-1 border border-error">
                  ⚠️ Yuz ko'rinmayapti
                </span>
              )}
            </div>
          )}

          {/* Audio Meter Overlay (Bottom Left) */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3 rounded-xl bg-black/75 backdrop-blur-md p-2 border border-white/10 text-white">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setIsAudioMuted(!isAudioMuted)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition ${isAudioMuted ? 'bg-surface-2 text-text-secondary border-edge' : 'bg-accent text-white border-accent'}`}
                title={isAudioMuted ? 'Ovozni yoqish' : 'Ovozni o\'chirish'}
              >
                <Icon name="mic" size={13} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className="text-white/80">Mikrofon darajasi</span>
                  <span className={speechDetected ? 'text-warning font-extrabold' : 'text-white/60'}>
                    {isAudioMuted ? 'O\'chirilgan' : speechDetected ? 'Ovoz aniqlandi 🎙️' : `${Math.round(audioLevel)}%`}
                  </span>
                </div>
                {/* Visualizer Bar */}
                <div className="mt-1 h-1.5 w-36 overflow-hidden rounded-full bg-white/20">
                  <div
                    className={`h-full transition-all duration-200 ${audioLevel > 60 ? 'bg-error' : audioLevel > 30 ? 'bg-warning' : 'bg-success'}`}
                    style={{ width: `${isAudioMuted ? 0 : Math.min(100, Math.max(5, audioLevel))}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Sync Timestamp */}
            <div className="text-right text-[10px] font-mono text-white/50 shrink-0">
              {data?.updated_at ? new Date(data.updated_at).toLocaleTimeString() : 'Ulanmoqda...'}
            </div>
          </div>
        </div>

        {/* Warning Notification Toast */}
        {warningSent && (
          <div className="rounded-xl bg-success/15 border border-success/45 p-3 text-xs font-bold text-success flex items-center gap-2 animate-fadeIn">
            <Icon name="check" size={15} />
            <span>O'quvchi ekraniga ogohlantirish xabari muvaffaqiyatli yetkazildi!</span>
          </div>
        )}

        {/* Control & Moderation Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-edge">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchLiveFrame}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-edge bg-surface-1 px-3 py-2 text-xs font-bold text-text-primary hover:bg-surface-2 transition"
            >
              <Icon name="sparkles" size={13} />
              <span>Yangilash</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={actionBusy}
              onClick={handleSendWarning}
              className="inline-flex items-center gap-1.5 rounded-xl border border-warning/45 bg-warning/15 px-3 py-2 text-xs font-bold text-warning hover:bg-warning/25 transition disabled:opacity-50"
            >
              <Icon name="info" size={13} />
              <span>Ogohlantirish yuborish</span>
            </button>
            <button
              type="button"
              disabled={actionBusy}
              onClick={handleDisqualify}
              className="inline-flex items-center gap-1.5 rounded-xl border border-error/45 bg-error/15 px-3 py-2 text-xs font-bold text-error hover:bg-error/25 transition disabled:opacity-50"
            >
              <Icon name="trash" size={13} />
              <span>Chetlatish (Disqualify)</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
export default LiveProctorModal;
