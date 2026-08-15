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
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [warningSent, setWarningSent] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [viewMode, setViewMode] = useState('both'); // 'both' | 'camera' | 'screen'
  const pollTimerRef = useRef(null);

  const fetchLiveFrame = async () => {
    if (!sessionId) return;
    try {
      const token = OlympyApi.getToken();
      const res = await OlympyApi.getLiveProctorFrame(sessionId, token);
      setData(res);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !sessionId) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      setData(null);
      setLoading(true);
      setWarningSent(false);
      return;
    }

    fetchLiveFrame();
    pollTimerRef.current = setInterval(fetchLiveFrame, 1200);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
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
        payload: { message: "Nazoratchi ogohlantirishi: Iltimos, test oynasidan chiqmang va kameraga qarang!" }
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
    if (!confirm(`${studentName || 'O\'quvchi'}ni qoidabuzarlik (cheating) sababli imtihondan chetlatishni tasdiqlaysizmi?`)) {
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

  const audioLevel = data?.audio_level || 0;
  const hasLiveFrame = Boolean(data?.frame);
  const hasScreenFrame = Boolean(data?.screen_frame);
  const faceDetected = data?.face_detected ?? true;
  const speechDetected = data?.speech_detected ?? (audioLevel > 35);
  const isSwitchedAway = Boolean(data?.app_switched || data?.is_in_background);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Jonli Proktoring & Ekran Nazorati"
      width="max-w-3xl"
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
              {data?.tab_escapes > 0 && (
                <span className="rounded bg-warning/15 border border-warning/45 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                  ⚠️ {data.tab_escapes} ta chiqish
                </span>
              )}
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

        {/* Real-time App/Tab Switch Alert Banner */}
        {isSwitchedAway && (
          <div className="rounded-xl bg-error/20 border-2 border-error p-3.5 text-xs text-error flex items-center justify-between gap-3 animate-pulse shadow-lg">
            <div className="flex items-center gap-3">
              <span className="text-2xl animate-bounce">🚨</span>
              <div>
                <div className="font-black text-sm uppercase tracking-wide">O'QUVCHI HOZIR TESTDAN CHIQDI!</div>
                <div className="text-[11px] text-error/90 font-semibold mt-0.5">
                  Boshqa ilova yoki saytga o'tgan. Chiqishlar soni: {data?.tab_escapes || 1} marta.
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={actionBusy}
              onClick={handleDisqualify}
              className="px-3.5 py-2 rounded-xl bg-error text-white font-black text-xs hover:bg-error/90 transition shrink-0 shadow-md"
            >
              Chetlatish ⛔
            </button>
          </div>
        )}

        {/* View Switcher Tabs (agar ham kamera, ham ekran mavjud bo'lsa) */}
        {hasScreenFrame && (
          <div className="flex items-center justify-center gap-1.5 p-1 bg-surface-2 rounded-xl border border-edge">
            <button
              type="button"
              onClick={() => setViewMode('both')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition ${viewMode === 'both' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
            >
              🔲 Kamera + Ekran
            </button>
            <button
              type="button"
              onClick={() => setViewMode('camera')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition ${viewMode === 'camera' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
            >
              📷 Faqat Kamera
            </button>
            <button
              type="button"
              onClick={() => setViewMode('screen')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition ${viewMode === 'screen' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
            >
              🖥️ Faqat Ekran
            </button>
          </div>
        )}

        {/* Video / Screen Stream Displays */}
        <div className={`grid gap-3 ${viewMode === 'both' && hasScreenFrame ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
          {/* Camera Feed */}
          {(viewMode === 'camera' || viewMode === 'both' || !hasScreenFrame) && (
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
                    O'quvchi kamerasini yoqqanda video shu yerda ko'rinadi.
                  </p>
                </div>
              )}

              {hasLiveFrame && (
                <img
                  src={data.frame}
                  alt="Live Proctor Feed"
                  className="h-full w-full object-contain transition-opacity duration-200"
                />
              )}

              {hasLiveFrame && (
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className="rounded-md bg-black/60 backdrop-blur-md px-2 py-1 text-[10px] font-bold text-white flex items-center gap-1 border border-white/10">
                    <span className="h-2 w-2 rounded-full bg-success animate-pulse"></span>
                    Kamera
                  </span>
                  {!faceDetected && (
                    <span className="rounded-md bg-error/80 backdrop-blur-md px-2 py-1 text-[10px] font-bold text-white flex items-center gap-1 border border-error">
                      ⚠️ Yuz ko'rinmayapti
                    </span>
                  )}
                </div>
              )}

              {/* Audio meter */}
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3 rounded-xl bg-black/75 backdrop-blur-md p-2 border border-white/10 text-white">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setIsAudioMuted(!isAudioMuted)}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition ${isAudioMuted ? 'bg-surface-2 text-text-secondary border-edge' : 'bg-accent text-white border-accent'}`}
                    title={isAudioMuted ? "Ovozni yoqish" : "Ovozni o'chirish"}
                  >
                    <Icon name="mic" size={13} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-[10px] font-bold">
                      <span className="text-white/80">Mikrofon</span>
                      <span className={speechDetected ? 'text-warning font-extrabold' : 'text-white/60'}>
                        {isAudioMuted ? "O'chirilgan" : speechDetected ? 'Ovoz 🎙️' : `${Math.round(audioLevel)}%`}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-28 md:w-36 overflow-hidden rounded-full bg-white/20">
                      <div
                        className={`h-full transition-all duration-200 ${audioLevel > 60 ? 'bg-error' : audioLevel > 30 ? 'bg-warning' : 'bg-success'}`}
                        style={{ width: `${isAudioMuted ? 0 : Math.min(100, Math.max(5, audioLevel))}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="text-right text-[10px] font-mono text-white/50 shrink-0">
                  {data?.updated_at ? new Date(data.updated_at).toLocaleTimeString() : '...'}
                </div>
              </div>
            </div>
          )}

          {/* Screen Share Feed */}
          {(viewMode === 'screen' || viewMode === 'both') && hasScreenFrame && (
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black border border-edge shadow-inner flex items-center justify-center">
              <img
                src={data.screen_frame}
                alt="Live Student Screen"
                className="h-full w-full object-contain transition-opacity duration-200"
              />
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <span className="rounded-md bg-accent/80 backdrop-blur-md px-2 py-1 text-[10px] font-bold text-white flex items-center gap-1 border border-accent">
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse"></span>
                  🖥️ O'quvchi Ekrani
                </span>
              </div>
            </div>
          )}
        </div>

        {warningSent && (
          <div className="rounded-xl bg-success/15 border border-success/45 p-3 text-xs font-bold text-success flex items-center gap-2 animate-fadeIn">
            <Icon name="check" size={15} />
            <span>O'quvchi ekraniga ogohlantirish xabari muvaffaqiyatli yetkazildi!</span>
          </div>
        )}

        {/* Action Buttons */}
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
              className="inline-flex items-center gap-1.5 rounded-xl border border-warning/45 bg-warning/15 px-3.5 py-2 text-xs font-bold text-warning hover:bg-warning/25 transition disabled:opacity-50"
            >
              <Icon name="info" size={13} />
              <span>Ogohlantirish yuborish</span>
            </button>
            <button
              type="button"
              disabled={actionBusy}
              onClick={handleDisqualify}
              className="inline-flex items-center gap-1.5 rounded-xl border border-error/45 bg-error/15 px-3.5 py-2 text-xs font-bold text-error hover:bg-error/25 transition disabled:opacity-50"
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
