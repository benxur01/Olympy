// pages/Profile.jsx

const ProfilePage = ({ user, onNavigate, embedded }) => {
  const store = useStore();
  const [tab, setTab] = React.useState('results');
  const [isPublic, setIsPublic] = React.useState(false);

  // Live attempts and derived results
  const myAttempts = user ? store.attempts.filter(a => a.userId === user.id).slice().sort((a,b) => (b.submittedAt||'').localeCompare(a.submittedAt||'')) : [];
  const myResults = myAttempts.map(a => {
    const o = store.olympiads.find(x => x.id === a.olympiadId);
    return {
      id: a.id, attempt: a,
      olympiad: o?.title || 'Olimpiada', subject: o?.subject || '—',
      score: a.score, rank: a.rank,
      date: (a.submittedAt || '').slice(0,10),
      correct: a.correctCount, wrong: a.wrongCount,
    };
  });

  const avgScore = myResults.length > 0 ? Math.round(myResults.reduce((s, r) => s + (r.score || 0), 0) / myResults.length * 10) / 10 : 0;
  const bestRank = myResults.length > 0 ? Math.min(...myResults.map(r => r.rank || 999).filter(r => r < 999)) : null;

  const achievements = [
    bestRank === 1 && { icon:'🥇', title:"1-o'rin", desc:"Eng yuqori natija", color:'from-amber-500/20 to-orange-500/10 border-amber-500/20' },
    bestRank === 3 && { icon:'🥉', title:"3-o'rin", desc:'Top 3 natija', color:'from-amber-700/20 to-orange-800/10 border-amber-700/20' },
    myResults.length >= 3 && { icon:'⭐', title:`${myResults.length} ta olimpiada`, desc:'Faol ishtirokchi', color:'from-indigo-500/20 to-purple-500/10 border-indigo-500/20' },
    avgScore >= 90 && { icon:'🎯', title:'90%+ natija', desc:"O'rtacha ball yuqori", color:'from-emerald-500/20 to-teal-500/10 border-emerald-500/20' },
  ].filter(Boolean);

  const content = (
    <div className="p-6 space-y-6 animate-in">
      {/* Profile hero */}
      <div className="glass-strong rounded-3xl p-6 relative overflow-hidden">
        <div className="hero-glow" style={{ background:'#6366f1', top:'-60%', left:'40%', opacity:0.08 }} />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-5">
          <div className="relative">
            <Avatar name={user?.name || 'Ali Valiyev'} size={80} gradient="from-indigo-500 to-purple-600" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 gradient-bg rounded-full flex items-center justify-center">
              <span className="text-white text-xs">✓</span>
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-black text-white">{user?.name || 'Ali Valiyev'}</h2>
              {!isPublic && <span className="chip badge-active text-xs">A'zo</span>}
            </div>
            {!isPublic && <div className="text-white/40 text-sm mt-0.5">{(user?.phone || '+998901234567').replace(/(\+998\d{2})\d{3}(\d{4})/, '$1 *** $2')}</div>}
            <div className="flex flex-wrap gap-3 mt-3">
              <div className="flex items-center gap-1.5 text-sm text-white/50"><Icon name="building" size={14} />{(() => {
                const cid = user?.roles?.student?.centerId || user?.roles?.teacher?.centerId || user?.roles?.manager?.centerId;
                return store.centers.find(c => c.id === cid)?.name || 'Markazsiz';
              })()}</div>
              <div className="flex items-center gap-1.5 text-sm text-white/50"><Icon name="clock" size={14} />{user?.joined ? `${user.joined} dan` : '—'}</div>
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              <div className="glass rounded-xl px-3 py-1.5 text-center"><div className="text-lg font-black text-white">{myResults.length}</div><div className="text-xs text-white/40">Olimpiada</div></div>
              <div className="glass rounded-xl px-3 py-1.5 text-center"><div className="text-lg font-black gradient-text">{bestRank ? `#${bestRank}` : '—'}</div><div className="text-xs text-white/40">Eng yaxshi</div></div>
              <div className="glass rounded-xl px-3 py-1.5 text-center"><div className="text-lg font-black text-white">{avgScore || '—'}{avgScore ? '%' : ''}</div><div className="text-xs text-white/40">O'rtacha</div></div>
              <div className="glass rounded-xl px-3 py-1.5 text-center"><div className="text-lg font-black text-white">{achievements.length}</div><div className="text-xs text-white/40">Yutuqlar</div></div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {!isPublic && (
              <button className="btn-ghost text-xs px-4 py-2 rounded-xl flex items-center gap-1.5"><Icon name="edit" size={13} /> Tahrirlash</button>
            )}
            <button onClick={() => setIsPublic(!isPublic)} className="btn-ghost text-xs px-4 py-2 rounded-xl flex items-center gap-1.5">
              <Icon name="eye" size={13} /> {isPublic ? 'Shaxsiy ko\'rish' : 'Ommaviy ko\'rish'}
            </button>
          </div>
        </div>
      </div>

      {/* Achievements */}
      <div>
        <h3 className="font-bold text-white mb-3">Yutuqlar</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {achievements.map((a,i) => (
            <div key={i} className={`glass rounded-2xl p-4 text-center card-hover border bg-gradient-to-br ${a.color}`}>
              <div className="text-3xl mb-2">{a.icon}</div>
              <div className="text-sm font-bold text-white">{a.title}</div>
              <div className="text-xs text-white/40">{a.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Best subjects */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="glass rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">Fanlar bo'yicha</h3>
          <div className="space-y-3">
            {[
              { s:'Tarix', pct:91, color:'#f59e0b' },
              { s:'Informatika', pct:87, color:'#6366f1' },
              { s:'Biologiya', pct:72, color:'#22c55e' },
            ].map((x,i) => (
              <div key={i}>
                <div className="flex justify-between mb-1"><span className="text-sm text-white/70">{x.s}</span><span className="text-sm font-bold text-white">{x.pct}%</span></div>
                <div className="progress-bar h-2"><div className="progress-fill" style={{width:`${x.pct}%`,background:x.color}}/></div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">Natijalar dinamikasi</h3>
          <BarChart data={[
            {label:'1-oy',value:72},{label:'2-oy',value:81},{label:'3-oy',value:87},
            {label:'4-oy',value:83},{label:'5-oy',value:91},
          ]} />
        </div>
      </div>

      {/* Tabs */}
      <div className="nav-tabs flex">
        {['results','olympiads','certificates'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`nav-tab ${tab===t?'active':''}`}>
            {t==='results'?'Natijalar':t==='olympiads'?"Olimpiadalar":'Sertifikatlar'}
          </button>
        ))}
      </div>

      {tab === 'results' && (
        <div className="space-y-3">
          {myResults.length === 0 && <div className="text-center text-white/40 text-sm py-6 glass rounded-2xl">Hali natijalar yo'q</div>}
          {myResults.map(r => (
            <div key={r.id} className="glass rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-white/5"
              onClick={() => onNavigate && onNavigate('results', { ...r.attempt, olympiad: store.olympiads.find(o => o.id === r.attempt.olympiadId) })}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black flex-shrink-0 ${r.rank===1?'bg-amber-500/20 text-amber-400':'bg-indigo-500/15 text-indigo-400'}`}>#{r.rank || '—'}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white truncate">{r.olympiad}</div>
                <div className="flex items-center gap-2 mt-0.5"><SubjectBadge subject={r.subject} /><span className="text-xs text-white/30">{r.date}</span></div>
              </div>
              <div className="text-right">
                <div className="text-xl font-black text-white">{r.score}<span className="text-white/30 text-sm">/100</span></div>
                <div className="text-xs text-emerald-400">{r.correct} to'g'ri</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'olympiads' && (
        <div className="space-y-3">
          {(() => {
            const cid = user?.roles?.student?.centerId;
            const list = cid ? store.olympiads.filter(o => o.centerId === cid).slice(0,5) : store.olympiads.slice(0,3);
            if (list.length === 0) return <div className="text-center text-white/40 text-sm py-6 glass rounded-2xl">Olimpiadalar yo'q</div>;
            return list.map(o => (
              <div key={o.id} className="glass rounded-2xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center text-white flex-shrink-0">🏆</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white truncate">{o.title}</div>
                  <div className="flex items-center gap-2 mt-0.5"><SubjectBadge subject={o.subject} /><span className="text-xs text-white/30">{o.startDate || o.date}</span></div>
                </div>
                <Badge status={statusLabel(o.status)} />
              </div>
            ));
          })()}
        </div>
      )}

      {tab === 'certificates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { title:"1-o'rin Sertifikati", olympiad:'Tarix Bellashuvi', date:'2026-04-05' },
            { title:'Faol Ishtirokchi', olympiad:'Informatika Olimpiadasi', date:'2026-04-28' },
          ].map((c,i) => (
            <div key={i} className="glass rounded-2xl p-5 border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
              <div className="text-3xl mb-3">🏅</div>
              <div className="font-bold text-white mb-1">{c.title}</div>
              <div className="text-sm text-white/50 mb-1">{c.olympiad}</div>
              <div className="text-xs text-white/30 mb-4">{c.date}</div>
              <button className="btn-ghost text-xs px-4 py-2 rounded-xl flex items-center gap-1.5"><Icon name="copy" size={13} /> Yuklab olish</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return content;
};

Object.assign(window, { ProfilePage });
