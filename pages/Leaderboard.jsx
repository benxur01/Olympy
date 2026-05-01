// pages/Leaderboard.jsx

// Demo seed for visual richness — combined with live store attempts at runtime
const LEADERBOARD_SEED = [
  { rank:1, name:'Malika Toshmatova', center:'Leader Academy', subject:'Ingliz tili', score:96, time:'18:22', badge:'🥇', city:'Toshkent' },
  { rank:2, name:'Jasur Normatov', center:'ProSkill Academy', subject:'Matematika', score:94, time:'21:05', badge:'🥈', city:'Toshkent' },
  { rank:3, name:'Ali Valiyev', center:'Brilliant Education', subject:'Informatika', score:91, time:'24:18', badge:'🥉', city:'Samarqand' },
  { rank:4, name:'Nilufar Karimova', center:'IT Park Academy', subject:'Kimyo', score:89, time:'26:40', badge:'', city:'Toshkent' },
  { rank:5, name:'Sherzod Tursunov', center:'Najot Ta\'lim', subject:'Fizika', score:87, time:'28:11', badge:'', city:'Buxoro' },
  { rank:6, name:'Kamola Hasanova', center:'Leader Academy', subject:'Biologiya', score:85, time:'29:30', badge:'', city:'Toshkent' },
  { rank:7, name:'Otabek Mirzayev', center:'ProSkill Academy', subject:'Tarix', score:83, time:'31:00', badge:'', city:'Toshkent' },
  { rank:8, name:'Zulfiya Yusupova', center:'Brilliant Education', subject:'Ingliz tili', score:81, time:'32:15', badge:'', city:'Samarqand' },
  { rank:9, name:'Bobur Xolmatov', center:'IT Park Academy', subject:'Geografiya', score:79, time:'33:45', badge:'', city:'Toshkent' },
  { rank:10, name:'Eldor Raximov', center:'Najot Ta\'lim', subject:'Matematika', score:77, time:'35:00', badge:'', city:'Buxoro' },
];

const LeaderboardPage = ({ onNavigate, embedded }) => {
  const store = useStore();
  const [filterSubject, setFilterSubject] = React.useState('');
  const [filterCity, setFilterCity] = React.useState('');
  const [activeTab, setActiveTab] = React.useState('all');

  // Build live entries from attempts in the store, then merge with demo seed
  const liveEntries = store.attempts.map(a => {
    const u = store.users.find(x => x.id === a.userId);
    const o = store.olympiads.find(x => x.id === a.olympiadId);
    const c = o ? store.centers.find(x => x.id === o.centerId) : null;
    return {
      key: a.id,
      name: u?.name || 'Foydalanuvchi',
      center: c?.name || '—',
      subject: o?.subject || '—',
      score: a.score,
      time: formatTime(a.timeSpent || 0),
      city: c?.city || '—',
      _live: true,
    };
  });

  const merged = [...liveEntries, ...LEADERBOARD_SEED.map(d => ({ ...d, key: 's' + d.rank }))]
    .sort((a, b) => b.score - a.score)
    .map((d, i) => ({ ...d, rank: i + 1, badge: i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '' }));

  const subjects = [...new Set(merged.map(d => d.subject))].filter(Boolean);
  const cities = [...new Set(merged.map(d => d.city))].filter(Boolean);

  const filtered = merged.filter(d =>
    (!filterSubject || d.subject === filterSubject) &&
    (!filterCity || d.city === filterCity)
  );
  const top3 = filtered.slice(0, 3);
  const rest = filtered.slice(3);

  const content = (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-white">Reyting jadvali</h2>
          <p className="text-white/40 text-sm">Matematik Olimpiada · May 2026</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select className="input-field py-2 w-auto text-sm" value={filterSubject} onChange={e => setFilterSubject(e.target.value)}>
            <option value="">Barcha fanlar</option>
            {subjects.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="input-field py-2 w-auto text-sm" value={filterCity} onChange={e => setFilterCity(e.target.value)}>
            <option value="">Barcha shaharlar</option>
            {cities.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="nav-tabs flex gap-1">
        {['all','center','subject'].map(t => (
          <button key={t} onClick={() => setActiveTab(t)} className={`nav-tab ${activeTab===t?'active':''}`}>
            {t==='all'?'Umumiy':t==='center'?"O'quv markaz":'Fan'}
          </button>
        ))}
      </div>

      {/* Top 3 podium */}
      <div className="grid grid-cols-3 gap-3">
        {[top3[1], top3[0], top3[2]].filter(Boolean).map((p, i) => {
          const isFirst = i === 1;
          const cls = isFirst ? 'leaderboard-gold' : i === 0 ? 'leaderboard-silver' : 'leaderboard-bronze';
          return (
            <div key={p.key || p.rank} className={`rounded-2xl p-4 text-center card-hover ${cls} ${isFirst ? 'mt-0' : 'mt-6'}`}>
              <div className="text-3xl mb-1">{p.badge}</div>
              <Avatar name={p.name} size={isFirst?48:40} gradient={isFirst?'from-amber-400 to-orange-500':'from-indigo-500 to-purple-600'} />
              <div className="text-sm font-bold text-white mt-2 truncate">{p.name.split(' ')[0]}</div>
              <div className="text-xs text-white/40 truncate mb-2">{p.center}</div>
              <div className={`text-2xl font-black ${isFirst?'text-amber-400':i===0?'text-slate-300':'text-amber-600'}`}>{p.score}</div>
              <SubjectBadge subject={p.subject} />
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 border-b border-white/5 text-xs text-white/40 font-medium">
          <div className="col-span-1">#</div>
          <div className="col-span-3">O'quvchi</div>
          <div className="col-span-3">O'quv markaz</div>
          <div className="col-span-2">Fan</div>
          <div className="col-span-1 text-right">Ball</div>
          <div className="col-span-1 text-right">Vaqt</div>
          <div className="col-span-1"></div>
        </div>
        {rest.map((p, i) => (
          <div key={p.key || p.rank} className="table-row grid grid-cols-12 gap-2 px-4 py-3.5 items-center">
            <div className="col-span-1">
              <div className="w-8 h-8 rounded-xl glass flex items-center justify-center text-sm font-bold text-white/50">
                {p.rank}
              </div>
            </div>
            <div className="col-span-3 flex items-center gap-2 min-w-0">
              <Avatar name={p.name} size={32} />
              <div className="min-w-0">
                <div className="text-sm font-medium text-white truncate">{p.name}</div>
                <div className="text-xs text-white/30 truncate md:hidden">{p.center}</div>
              </div>
            </div>
            <div className="col-span-3 hidden md:flex items-center">
              <span className="text-sm text-white/50 truncate">{p.center}</span>
            </div>
            <div className="col-span-2 hidden md:block"><SubjectBadge subject={p.subject} /></div>
            <div className="col-span-1 text-right">
              <span className={`text-sm font-black ${p.score>=90?'text-emerald-400':p.score>=75?'text-indigo-400':'text-amber-400'}`}>{p.score}</span>
            </div>
            <div className="col-span-1 text-right text-xs text-white/30 font-mono">{p.time}</div>
            <div className="col-span-1 text-right">
              <button className="text-white/30 hover:text-indigo-400 transition-colors"><Icon name="eye" size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return content;
};

Object.assign(window, { LeaderboardPage });
