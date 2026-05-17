import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X, Plus, Trash2, Filter, Settings, FileDown, FileUp, Database, Edit, ChevronDown, Check, AlertCircle, Info, ChevronRight, AlertTriangle } from 'lucide-react';

const STATUS_ORDER = ['alokasi', 'suratJalan', 'integrasi', 'terarsip'];
const STATUS_NAMES = { alokasi: 'Alokasi', suratJalan: 'S. Jalan', integrasi: 'Integrasi', terarsip: 'Terarsip' };
const DEFAULT_FORBIDDEN = ['mitra', 'swalayan'];

export default function App() {
  const [ordersData, setOrdersData] = useState([]);
  const [forbiddenWords, setForbiddenWords] = useState(DEFAULT_FORBIDDEN);
  const [dateFilter, setDateFilter] = useState({ start: null, end: null });
  const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'desc' });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchColumn, setSearchColumn] = useState('message');
  
  // UI States & Toggles
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [rawInputText, setRawInputText] = useState('');
  const [statsExpanded, setStatsExpanded] = useState({ umum: false, sender: false, status: false });
  const [statDetailOpen, setStatDetailOpen] = useState({});
  
  // Selection & Action States
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  const [activeQuickAction, setActiveQuickAction] = useState(null);
  const [qaViewMode, setQaViewMode] = useState('time');
  const [pendingTaps, setPendingTaps] = useState({}); // Tracking double taps
  
  const [modals, setModals] = useState({ filter: false, master: false, edit: false, duplicate: false, quickNote: false, forbidden: false });
  const [confirmDialog, setConfirmDialog] = useState({ visible: false, title: '', message: '', onConfirm: null, type: 'danger' });
  
  // Modal Specific Data
  const [editData, setEditData] = useState({ id: '', datetime: '', sender: '', message: '', notes: '' });
  const [quickNoteData, setQuickNoteData] = useState({ id: null, text: '' });
  const [pendingDuplicates, setPendingDuplicates] = useState([]);
  const [duplicateDecisions, setDuplicateDecisions] = useState({});
  const [newForbiddenWord, setNewForbiddenWord] = useState('');
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success', actionId: null });
  
  // Refs untuk Timer & DOM
  const fileInputRef = useRef(null);
  const tapTimers = useRef({});
  const longPressTimer = useRef(null);
  const isDragging = useRef(false);
  const toastTimeout = useRef(null);

  useEffect(() => {
    try {
      const savedOrders = localStorage.getItem('ordersData_react_v2');
      if (savedOrders) {
        const parsed = JSON.parse(savedOrders);
        const sanitized = parsed.map(o => ({ 
            ...o, notes: o.notes || '', approvedForbidden: o.approvedForbidden || false, 
            status: o.status || { alokasi: false, suratJalan: false, integrasi: false, terarsip: false } 
        }));
        setOrdersData(sanitized);
      }
      const savedForbidden = localStorage.getItem('forbiddenWords_react_v2');
      if (savedForbidden) setForbiddenWords(JSON.parse(savedForbidden));
    } catch (e) {
      console.error("Gagal memuat data lokal:", e);
    }
  }, []);

  useEffect(() => { localStorage.setItem('ordersData_react_v2', JSON.stringify(ordersData)); }, [ordersData]);
  useEffect(() => { localStorage.setItem('forbiddenWords_react_v2', JSON.stringify(forbiddenWords)); }, [forbiddenWords]);

  const showToast = (message, type = 'success', actionId = null) => {
    setToast({ visible: true, message, type, actionId });
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(prev => ({ ...prev, visible: false })), type === 'interactive' ? 3500 : 2000);
  };

  const showConfirm = (title, message, onConfirm, type = 'danger') => setConfirmDialog({ visible: true, title, message, onConfirm, type });
  const closeConfirm = () => setConfirmDialog(prev => ({ ...prev, visible: false }));
  const toggleModal = (modalName, value) => setModals(prev => ({ ...prev, [modalName]: value !== undefined ? value : !prev[modalName] }));

  const parseWhatsAppDateToJSDate = (dtStr) => {
    const match = dtStr.match(/(\d+)\/(\d+),\s*(\d+)\.(\d+)/);
    if (!match) return null;
    const day = parseInt(match[1]), month = parseInt(match[2]) - 1, currentYear = new Date().getFullYear();
    const d = new Date(currentYear, month, day); d.setHours(0,0,0,0); return d;
  };

  const getSortableTime = (timeStr) => {
    const match = timeStr.match(/(\d+)\/(\d+),\s*(\d+)\.(\d+)/);
    return match ? (parseInt(match[2])*1000000)+(parseInt(match[1])*10000)+(parseInt(match[3])*100)+parseInt(match[4]) : 0;
  };

  const filteredOrders = useMemo(() => {
    return ordersData.filter(o => {
      // 1. Date Filter (Global Filter)
      if (dateFilter.start || dateFilter.end) {
        const itemDate = parseWhatsAppDateToJSDate(o.datetime);
        if (!itemDate) return true;
        const itemTime = itemDate.getTime();
        let passStart = true, passEnd = true;
        if (dateFilter.start) passStart = itemTime >= dateFilter.start;
        if (dateFilter.end) passEnd = itemTime <= dateFilter.end;
        if (!(passStart && passEnd)) return false;
      }
      // 2. Search Filter (Tabel)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (searchColumn === 'message' && !o.message.toLowerCase().includes(query)) return false;
        if (searchColumn === 'sender' && !o.sender.toLowerCase().includes(query)) return false;
        if (searchColumn === 'datetime' && !o.datetime.toLowerCase().includes(query)) return false;
        if (searchColumn === 'notes' && !(o.notes || '').toLowerCase().includes(query)) return false;
      }
      return true;
    });
  }, [ordersData, dateFilter, searchQuery, searchColumn]);

  const sortedAndFilteredOrders = useMemo(() => {
    return [...filteredOrders].sort((a, b) => {
      let vA, vB;
      switch(sortConfig.key) {
          case 'waktu': vA = getSortableTime(a.datetime); vB = getSortableTime(b.datetime); break;
          case 'pengirim': vA = a.sender.toLowerCase(); vB = b.sender.toLowerCase(); break;
          case 'pesanan': vA = a.message.toLowerCase(); vB = b.message.toLowerCase(); break;
          case 'status': vA = Object.values(a.status).filter(Boolean).length; vB = Object.values(b.status).filter(Boolean).length; break;
          default: vA = a.timestamp; vB = b.timestamp;
      }
      if (vA < vB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (vA > vB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredOrders, sortConfig]);

  const processText = () => {
    if (!rawInputText.trim()) return showToast("Teks kosong!", "error");
    const regex = /\[(.*?)\]\s*(.*?):\s*([\s\S]*?)(?=\n\[|$)/g;
    let match, newDataCount = 0, now = Date.now();
    const uniqueNewOrders = [], tempDuplicates = [], tempDecisions = {};

    while ((match = regex.exec(rawInputText)) !== null) {
      const newOrder = { 
        id: 'ord_' + now + '_' + Math.random().toString(36).substr(2, 5), 
        datetime: match[1].trim(), sender: match[2].trim(), message: match[3].trim(), 
        notes: '', status: { alokasi: false, suratJalan: false, integrasi: false, terarsip: false }, 
        timestamp: now + newDataCount, approvedForbidden: false 
      };
      
      const existingOrder = ordersData.find(o => o.datetime === newOrder.datetime && o.sender === newOrder.sender && o.message === newOrder.message);
      
      if (existingOrder) {
        tempDuplicates.push({ newOrder, existingOrder });
        tempDecisions[`dup_${tempDuplicates.length - 1}`] = 'keep_old';
      } else { uniqueNewOrders.push(newOrder); newDataCount++; }
    }

    if (uniqueNewOrders.length > 0) {
      setOrdersData(prev => [...prev, ...uniqueNewOrders]); setSortConfig({ key: 'timestamp', direction: 'desc' });
      setRawInputText(''); setIsInputOpen(false); showToast(`${uniqueNewOrders.length} pesanan baru ditambahkan!`);
    } else if (tempDuplicates.length === 0) showToast("Format teks tidak dikenali.", "error");

    if (tempDuplicates.length > 0) {
      setPendingDuplicates(tempDuplicates); setDuplicateDecisions(tempDecisions);
      setRawInputText(''); setIsInputOpen(false); toggleModal('duplicate', true);
    }
  };

  const applyDuplicateResolutions = () => {
    let count = 0, newData = [...ordersData];
    pendingDuplicates.forEach((dup, index) => {
        const dec = duplicateDecisions[`dup_${index}`];
        if (dec === 'keep_new') { newData = newData.filter(o => o.id !== dup.existingOrder.id); newData.push(dup.newOrder); count++; } 
        else if (dec === 'keep_both') { newData.push(dup.newOrder); count++; }
    });
    setOrdersData(newData); toggleModal('duplicate', false); setPendingDuplicates([]);
    if (count > 0) { setSortConfig({ key: 'timestamp', direction: 'desc' }); showToast(`${count} diselesaikan!`); } 
    else showToast(`Data konflik diabaikan.`);
  };

  const containsForbiddenWords = (text) => {
    if (!text || forbiddenWords.length === 0) return { found: false, words: [] };
    const foundWords = forbiddenWords.filter(word => (new RegExp(`\\b${word}\\b`, 'i')).test(text));
    return { found: foundWords.length > 0, words: foundWords };
  };

  const attemptStatusToggle = (orderId, statusKey, isQuickAction = false) => {
    const order = ordersData.find(o => o.id === orderId);
    if (!order) return;

    const idx = STATUS_ORDER.indexOf(statusKey);
    if (!order.status[statusKey] && idx > 0 && !order.status[STATUS_ORDER[idx - 1]]) return showToast(`Selesaikan tahap ${STATUS_NAMES[STATUS_ORDER[idx - 1]]} dulu!`, "error");
    if (order.status[statusKey] && idx < 3 && order.status[STATUS_ORDER[idx + 1]]) return showToast(`Hapus tahap ${STATUS_NAMES[STATUS_ORDER[idx + 1]]} dulu.`, "error");

    if (!order.approvedForbidden) {
        const check = containsForbiddenWords(order.message);
        if (check.found) {
            showConfirm("Peringatan Kata Terlarang", `Pesanan ini mengandung kata terlarang: [ ${check.words.join('; ')} ]\n\nApakah Anda yakin mau melanjutkan aksi dan menyetujui pesanan ini?`, () => {
                setOrdersData(prev => prev.map(o => o.id === orderId ? { ...o, approvedForbidden: true, status: { ...o.status, [statusKey]: true } } : o));
                showToast("Pesanan disetujui, klik untuk menambah catatan", "interactive", orderId); closeConfirm();
            }, "warning");
            return;
        }
    }

    const tKey = `${isQuickAction ? 'qa_' : ''}${orderId}_${statusKey}`;
    if (pendingTaps[tKey]) {
        clearTimeout(tapTimers.current[tKey]);
        setPendingTaps(prev => { const next = {...prev}; delete next[tKey]; return next; });
        setOrdersData(prev => prev.map(o => o.id === orderId ? { ...o, status: { ...o.status, [statusKey]: !o.status[statusKey] } } : o));
        if (!order.status[statusKey]) showToast("Berhasil, klik untuk menambah catatan", "interactive", orderId); 
        else showToast("Status dibatalkan", "warning"); 
    } else {
        showToast(isQuickAction ? "Ketuk 2x untuk konfirmasi" : "Ketuk 2x untuk ubah status", "warning");
        setPendingTaps(prev => ({ ...prev, [tKey]: true }));
        tapTimers.current[tKey] = setTimeout(() => { setPendingTaps(prev => { const next = {...prev}; delete next[tKey]; return next; }); }, 1500); 
    }
  };

  const handleRowPointerDown = (e, orderId) => {
    if (e.target.closest('.stop-long-press')) return; 
    isDragging.current = false;
    longPressTimer.current = setTimeout(() => { 
      if (!isDragging.current) { toggleSelection(orderId); if(navigator.vibrate) navigator.vibrate(50); } 
    }, 500); 
  };
  const handleRowPointerMove = () => { isDragging.current = true; clearTimeout(longPressTimer.current); };
  const handleRowPointerUp = () => clearTimeout(longPressTimer.current);

  const toggleSelection = (orderId) => { setSelectedOrderIds(prev => { const next = new Set(prev); next.has(orderId) ? next.delete(orderId) : next.add(orderId); return next; }); };
  const handleSelectAll = () => { selectedOrderIds.size === sortedAndFilteredOrders.length ? setSelectedOrderIds(new Set()) : setSelectedOrderIds(new Set(sortedAndFilteredOrders.map(o => o.id))); };
  
  const deleteSelected = () => { showConfirm("Hapus Pesanan Terpilih?", `Yakin hapus ${selectedOrderIds.size} pesanan yang dipilih?`, () => { setOrdersData(prev => prev.filter(o => !selectedOrderIds.has(o.id))); setSelectedOrderIds(new Set()); showToast("Terhapus."); closeConfirm(); }); };
  const executeClearData = () => { setOrdersData([]); setSelectedOrderIds(new Set()); showToast("Semua dihapus"); closeConfirm(); };

  const exportData = () => {
    if (ordersData.length === 0) return showToast("Tidak ada data untuk diekspor!", "error");
    try {
        const blob = new Blob([JSON.stringify(ordersData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob), d = new Date(), dateStr = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
        const link = document.createElement('a'); link.href = url; link.download = `OMS_Backup_${dateStr}.json`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
        showToast("Data berhasil diekspor (diunduh)!");
    } catch (e) { showToast("Gagal mengekspor data.", "error"); }
  };

  const handleImportFile = (event) => {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            if (!Array.isArray(importedData)) throw new Error();
            let added = 0, dupes = 0, newData = [...ordersData];
            importedData.forEach(newOrder => {
                const exists = newData.find(o => o.datetime === newOrder.datetime && o.sender === newOrder.sender && o.message === newOrder.message);
                if (!exists) {
                    if (newData.find(o => o.id === newOrder.id)) newOrder.id = 'ord_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                    newOrder.approvedForbidden = newOrder.approvedForbidden || false; newData.push(newOrder); added++;
                } else dupes++;
            });
            if (added > 0) { setOrdersData(newData); setSortConfig({ key: 'timestamp', direction: 'desc' }); showToast(`Impor Sukses: ${added} baru. ${dupes} ganda diabaikan.`); } 
            else showToast(`Tidak ada data baru. ${dupes} data ganda dilewati.`, "warning");
        } catch (err) { showToast("File Backup tidak valid!", "error"); }
        event.target.value = '';
    };
    reader.readAsText(file);
  };

  const renderHeaderDateText = () => {
    let text = ""; 
    const fmt = (ts) => { if(!ts) return ''; const d = new Date(ts); return `${d.getDate()}/${d.getMonth()+1}`; };
    if (dateFilter.start && dateFilter.end) text = (dateFilter.start === dateFilter.end) ? fmt(dateFilter.start) : `${fmt(dateFilter.start)} - ${fmt(dateFilter.end)}`;
    else if (dateFilter.start) text = `${fmt(dateFilter.start)} - Skrg`; 
    else if (dateFilter.end) text = `Awal - ${fmt(dateFilter.end)}`;
    return text;
  };

  const Header = () => (
    <header className="max-w-6xl mx-auto mb-3 relative z-20">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 py-3 px-4 md:px-5 flex items-center justify-between relative z-10">
            <h1 className="text-lg md:text-xl font-bold text-slate-900 flex items-center gap-2">📦 <span className="hidden sm:inline">Order Management System</span><span className="sm:hidden">OMS</span></h1>
            <div className="flex items-center gap-2 md:gap-3">
                <span className="text-[11px] font-medium text-slate-400 hidden md:block">{renderHeaderDateText()}</span>
                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1.5 rounded-full shrink-0">{filteredOrders.length} Pesanan</span>
            </div>
        </div>
        <div className="flex justify-between items-center mt-1.5 px-2 relative z-0">
            <div className="md:hidden text-[10px] font-medium text-slate-400">{renderHeaderDateText()}</div>
            <button onClick={() => toggleModal('filter')} className="ml-auto text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer px-2 py-1 rounded hover:bg-slate-200/50"><Filter size={14} /> Filter</button>
        </div>
    </header>
  );

  const StatsSection = () => {
    if (filteredOrders.length === 0) return <div className="text-sm text-slate-500 p-4 text-center">Memuat statistik... / Tidak ada data</div>;
    const total = filteredOrders.length;
    const countCbd = filteredOrders.filter(o => /cbd/i.test(o.message));
    const countTuging = filteredOrders.filter(o => /t[uo]ging/i.test(o.message));
    const countNotes = filteredOrders.filter(o => o.notes && o.notes.trim() !== '');
    const countTerlarang = filteredOrders.filter(o => containsForbiddenWords(o.message).found);

    const statusStats = STATUS_ORDER.map(k => ({ key: k, name: STATUS_NAMES[k], done: filteredOrders.filter(o => o.status[k]), belum: total - filteredOrders.filter(o => o.status[k]).length }));
    const senderCounts = {}; filteredOrders.forEach(o => { if(!senderCounts[o.sender]) senderCounts[o.sender] = []; senderCounts[o.sender].push(o); });
    const sortedSenders = Object.entries(senderCounts).sort((a, b) => b[1].length - a[1].length);

    const toggleStatDetail = (id) => setStatDetailOpen(p => ({ ...p, [id]: !p[id] }));

    const StatRow = ({ id, label, countHtml, orders, extraBtn = null }) => (
      <div className="py-2.5 border-b border-slate-100 last:border-0">
          <div className="flex justify-between items-center px-2 py-1.5 rounded group">
              <div className="flex items-center gap-2">
                  <span onClick={() => toggleStatDetail(id)} className="text-xs font-bold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer">{label}</span>
                  {extraBtn}
              </div>
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleStatDetail(id)}>
                  {countHtml}
                  <ChevronDown size={14} className={`text-slate-400 transition-transform ${statDetailOpen[id] ? '' : 'rotate-180'}`} />
              </div>
          </div>
          {statDetailOpen[id] && (
            <div className="bg-slate-50 p-2.5 rounded-lg mt-2 mb-2 border border-slate-200 shadow-inner max-h-60 overflow-y-auto flex flex-col gap-2">
                {orders && orders.length > 0 ? orders.map(o => (
                  <div key={o.id} className="text-[11px] bg-white p-2 rounded border shadow-sm">
                      <div className="font-bold text-slate-800 border-b border-slate-100 pb-1 mb-1 flex justify-between items-center"><span>{o.sender}</span><span className="font-mono text-slate-400 text-[9px]">{o.datetime}</span></div>
                      <div className="text-slate-600 font-mono leading-relaxed" dangerouslySetInnerHTML={{__html: o.message.replace(/\n/g, '<br>')}} />
                      {o.notes && <div className="mt-1.5 bg-amber-50 border border-amber-200 p-1.5 rounded text-[10px] text-amber-800 font-medium">📝 Catatan: {o.notes}</div>}
                  </div>
                )) : <div className="text-[11px] text-slate-400 text-center font-medium">Tidak ada data pesanan di kategori ini.</div>}
            </div>
          )}
      </div>
    );

    return (
      <div className="p-3 flex flex-col gap-2">
        {[{ key: 'umum', title: 'Umum & Spesifik', icon: '📦' }, { key: 'sender', title: 'Total Per Pengirim', icon: '👤' }, { key: 'status', title: 'Status Pengerjaan', icon: '✅' }].map(group => (
          <div key={group.key}>
            <button onClick={() => setStatsExpanded(p => ({ ...p, [group.key]: !p[group.key] }))} className="w-full flex justify-between items-center px-3 py-2 bg-slate-100 text-[11px] font-bold text-slate-600 uppercase rounded-lg hover:bg-slate-200 transition-colors">
                <div className="flex items-center gap-2"><span>{group.icon}</span> {group.title}</div>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${statsExpanded[group.key] ? '' : 'rotate-180'}`} />
            </button>
            {statsExpanded[group.key] && (
              <div className="flex flex-col px-2 border border-slate-100 rounded-b-lg -mt-1 mb-2 pt-1 bg-white">
                {group.key === 'umum' && (
                  <>
                    <StatRow id="tot" label="Total Keseluruhan" countHtml={<span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">{total}</span>} orders={filteredOrders} />
                    <StatRow id="cbd" label="Pesanan mengandung CBD" countHtml={<span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-bold">{countCbd.length}</span>} orders={countCbd} />
                    <StatRow id="tug" label="Pesanan mengandung Tuging/Toging" countHtml={<span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs font-bold">{countTuging.length}</span>} orders={countTuging} />
                    <StatRow id="not" label="Pesanan Terdapat Catatan" countHtml={<span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs font-bold">{countNotes.length}</span>} orders={countNotes} />
                    <StatRow id="frb" label="Mengandung Kata Terlarang" extraBtn={<button onClick={(e) => { e.stopPropagation(); toggleModal('forbidden', true); }} className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded text-[9px] font-bold hover:bg-red-100 transition-colors flex items-center gap-1">⚙️ Daftar Kata</button>} countHtml={<span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-bold shadow-sm">{countTerlarang.length}</span>} orders={countTerlarang} />
                  </>
                )}
                {group.key === 'sender' && sortedSenders.map(([s, ords], i) => <StatRow key={i} id={`snd_${i}`} label={s} countHtml={<span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-xs font-bold">{ords.length}</span>} orders={ords} />)}
                {group.key === 'status' && statusStats.map(s => <StatRow key={s.key} id={`sts_${s.key}`} label={`Selesai ${s.name}`} countHtml={<div className="flex items-center gap-1.5"><span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs font-bold">{s.done.length}</span><span className="text-[10px] text-slate-500 font-medium border bg-white px-1.5 py-0.5 rounded shadow-sm">(Belum: {s.belum})</span></div>} orders={s.done} />)}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const QuickActions = () => {
    const getEligible = (key) => filteredOrders.filter(o => {
        if (key === 'alokasi') return !o.status.alokasi;
        if (key === 'suratJalan') return o.status.alokasi && !o.status.suratJalan;
        if (key === 'integrasi') return o.status.suratJalan && !o.status.integrasi;
        if (key === 'terarsip') return o.status.integrasi && !o.status.terarsip;
        return false;
    });

    let pendingOrders = activeQuickAction ? getEligible(activeQuickAction).sort((a,b) => getSortableTime(a.datetime) - getSortableTime(b.datetime)) : [];

    return (
      <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col transition-all">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-semibold flex items-center gap-2"><AlertCircle size={16} className="text-amber-500" /> Aksi Cepat (SOP)</h2>
              {activeQuickAction && (
                <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button onClick={() => setQaViewMode('time')} className={`px-2 py-1 rounded-md text-[10px] transition-all ${qaViewMode === 'time' ? 'font-bold bg-white shadow-sm border text-blue-600' : 'font-medium text-slate-500 hover:text-slate-800'}`}>⌚ Waktu</button>
                    <button onClick={() => setQaViewMode('sender')} className={`px-2 py-1 rounded-md text-[10px] transition-all ${qaViewMode === 'sender' ? 'font-bold bg-white shadow-sm border text-blue-600' : 'font-medium text-slate-500 hover:text-slate-800'}`}>👤 Pengirim</button>
                </div>
              )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {STATUS_ORDER.map(k => {
                  const count = getEligible(k).length, isActive = activeQuickAction === k;
                  return (
                    <button key={k} onClick={() => setActiveQuickAction(isActive ? null : k)} className={`shrink-0 px-3 py-2 rounded-lg border font-semibold text-xs transition-all flex items-center gap-1.5 ${isActive ? 'bg-amber-500 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                        {STATUS_NAMES[k]} <span className={`px-1.5 py-0.5 rounded-full font-bold ${isActive ? 'bg-white/30 text-white' : (count > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500')}`}>{count}</span>
                    </button>
                  )
              })}
          </div>

          {activeQuickAction && pendingOrders.length === 0 && <div className="mt-3 py-6 text-center bg-emerald-50/50 rounded-xl border border-dashed border-emerald-200"><p className="text-slate-600 font-medium text-sm">Tidak ada tugas tertunda di tahap ini.</p></div>}
          
          {activeQuickAction && pendingOrders.length > 0 && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                {qaViewMode === 'time' ? pendingOrders.map(o => <QACard key={o.id} o={o} activeQuickAction={activeQuickAction} />) : 
                    Object.entries(pendingOrders.reduce((acc, o) => { (acc[o.sender] = acc[o.sender] || []).push(o); return acc; }, {})).map(([sender, orders]) => (
                        <React.Fragment key={sender}>
                            <div className="col-span-full mt-2 mb-0.5"><h3 className="text-xs font-bold text-slate-700 border-b pb-1 flex items-center gap-1">👤 {sender} <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{orders.length}</span></h3></div>
                            {orders.map(o => <QACard key={o.id} o={o} activeQuickAction={activeQuickAction} />)}
                        </React.Fragment>
                    ))
                }
            </div>
          )}
      </section>
    );
  };

  const QACard = ({ o, activeQuickAction }) => {
    const isRedFlag = !o.approvedForbidden && containsForbiddenWords(o.message).found;
    const isPending = pendingTaps[`qa_${o.id}_${activeQuickAction}`];
    return (
      <div className={`border shadow-sm rounded-xl p-3 flex flex-col h-full ${isRedFlag ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <div className="mb-3">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-2"><h4 className="font-bold text-slate-800 text-xs">{o.sender}</h4><span className="text-[10px] font-mono text-slate-500">{o.datetime}</span></div>
              <div className={`text-[11px] p-2 rounded border font-mono ${isRedFlag ? 'bg-red-100/50 text-red-900 border-red-100' : 'bg-slate-50 border-slate-100 text-slate-700'}`} dangerouslySetInnerHTML={{__html: o.message.replace(/\n/g, '<br>')}} />
          </div>
          <button onClick={() => attemptStatusToggle(o.id, activeQuickAction, true)} className={`w-full py-2 rounded-lg text-xs font-bold border transition-all mt-auto ${isPending ? 'bg-orange-100 text-orange-700 border-orange-400 scale-[1.02]' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200'}`}>{isPending ? 'Ketuk 1x lagi (Konfirmasi)' : 'Ketuk 2x untuk Selesai'}</button>
      </div>
    )
  };

  const renderTableRows = () => {
    if (sortedAndFilteredOrders.length === 0) return <tr><td colSpan="5" className="py-12 text-center text-slate-500 font-medium text-sm">Tidak ada data.</td></tr>;

    return sortedAndFilteredOrders.map(order => {
        const isSelected = selectedOrderIds.has(order.id);
        const isAllDone = order.status.alokasi && order.status.suratJalan && order.status.integrasi && order.status.terarsip;
        const isRedFlag = !order.approvedForbidden && containsForbiddenWords(order.message).found;

        return (
            <tr key={order.id} className={`transition-colors group cursor-pointer ${isSelected ? 'bg-blue-50 border-blue-200' : (isRedFlag ? 'bg-red-50 border-red-100 hover:bg-red-100/50' : 'hover:bg-slate-50 border-b border-slate-100')}`} onPointerDown={(e) => handleRowPointerDown(e, order.id)} onPointerMove={handleRowPointerMove} onPointerUp={handleRowPointerUp} onPointerLeave={handleRowPointerUp}>
                <td className="px-4 py-3"><div className="inline-flex items-center px-2 py-1 rounded bg-white border border-slate-200 text-slate-600 text-[11px] font-semibold">{order.datetime}</div></td>
                <td className="px-4 py-3 font-semibold text-slate-800 text-xs">{order.sender}</td>
                <td className="px-4 py-3 text-slate-700"><div className={`bg-white border p-2.5 rounded text-xs ${isRedFlag ? 'border-red-200 text-red-900' : 'border-slate-100'} ${isAllDone ? 'opacity-50 line-through' : ''}`} dangerouslySetInnerHTML={{__html: order.message.replace(/\n/g, '<br>')}}/></td>
                <td className={`px-4 py-3 border-l border-slate-100 ${isRedFlag ? 'bg-red-50/50' : 'bg-slate-50/30'}`}>
                    <div className="grid grid-cols-2 gap-2">
                        {STATUS_ORDER.map(statusKey => {
                            const isChecked = order.status[statusKey], currentIndex = STATUS_ORDER.indexOf(statusKey);
                            const isLockedForCheck = !isChecked && currentIndex > 0 && !order.status[STATUS_ORDER[currentIndex - 1]];
                            const isLockedForUncheck = isChecked && currentIndex < 3 && order.status[STATUS_ORDER[currentIndex + 1]];
                            const isPending = pendingTaps[`${order.id}_${statusKey}`];
                            return (
                              <div key={statusKey} className={`flex items-center gap-2 select-none py-1 px-1.5 transition-all stop-long-press ${isLockedForCheck ? 'opacity-30 cursor-not-allowed' : (isLockedForUncheck ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-white/50 rounded')}`} onClick={() => attemptStatusToggle(order.id, statusKey)}>
                                  <div className={`w-5 h-5 shrink-0 border-2 rounded flex items-center justify-center transition-all ${isChecked ? 'bg-blue-500 border-blue-500' : (isRedFlag ? 'bg-white border-red-300' : 'bg-white border-slate-300')} ${isPending ? 'scale-110 shadow-[0_0_0_4px_rgba(251,146,60,0.4)] border-orange-500' : ''}`}>
                                      <Check size={12} className={`text-white transition-opacity ${isChecked ? 'opacity-100' : 'opacity-0'}`} strokeWidth={4}/>
                                  </div>
                                  <span className={`text-[11px] ${isChecked ? 'text-blue-700 font-bold' : (isRedFlag ? 'text-red-700 font-medium' : 'text-slate-600 font-medium')}`}>{STATUS_NAMES[statusKey]}</span>
                              </div>
                            )
                        })}
                    </div>
                </td>
                <td className="px-4 py-3 border-l border-slate-100 stop-long-press cursor-default align-top">
                    <div className="flex flex-col gap-2">
                        {order.notes && <div className="text-[10px] text-amber-700 bg-amber-50 p-1.5 rounded border border-amber-200 leading-tight break-words max-w-[150px]">{order.notes}</div>}
                        <button onClick={(e) => { e.stopPropagation(); setEditData(order); toggleModal('edit', true); }} className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors self-start bg-blue-50 px-2 py-1 rounded"><Edit size={12}/> Edit</button>
                    </div>
                </td>
            </tr>
        )
    });
  };

  const ModalsLayer = () => (
    <>
      {/* 1. Modal Filter Tanggal */}
      {modals.filter && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[85] p-4" onClick={(e) => { if(e.target === e.currentTarget) toggleModal('filter', false); }}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs overflow-hidden transform scale-100 transition-all">
                <div className="p-4 border-b bg-slate-50 flex justify-between items-center"><h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Filter size={16}/> Filter Data</h3><button onClick={() => toggleModal('filter', false)} className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center"><X size={14}/></button></div>
                <div className="p-5 flex flex-col gap-4">
                    <div><label className="block text-[11px] font-bold text-slate-500 mb-1.5">Mulai Tanggal</label><input type="date" value={dateFilter.start ? new Date(dateFilter.start - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0] : ''} onChange={(e) => setDateFilter(p => ({ ...p, start: e.target.value ? new Date(e.target.value).getTime() : null }))} className="w-full bg-transparent outline-none text-sm text-slate-700" /></div>
                    <div className="relative"><label className="block text-[11px] font-bold text-slate-500 mb-1.5">Hingga Tanggal</label><button onClick={() => { const now = new Date(); now.setHours(0,0,0,0); setDateFilter({ start: now.getTime(), end: now.getTime() }); }} className="absolute right-0 top-0 text-[10px] font-bold text-blue-600 bg-transparent border-none">Hari Ini</button><input type="date" value={dateFilter.end ? new Date(dateFilter.end - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0] : ''} onChange={(e) => setDateFilter(p => ({ ...p, end: e.target.value ? new Date(e.target.value).getTime() : null }))} className="w-full bg-transparent outline-none text-sm text-slate-700" /></div>
                </div>
                <div className="p-4 border-t bg-slate-50 flex gap-2"><button onClick={() => { setDateFilter({start:null, end:null}); toggleModal('filter', false); }} className="px-4 py-2 text-slate-600 font-bold bg-slate-200 rounded-lg text-xs flex-1">Reset</button><button onClick={() => toggleModal('filter', false)} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg text-xs flex-1">Terapkan</button></div>
            </div>
        </div>
      )}

      {/* 2. Modal Konfirmasi Global (Confirm Dialog) */}
      {confirmDialog.visible && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
                <div className="flex items-center gap-3 mb-2">
                    {confirmDialog.type === 'warning' ? <AlertTriangle className="text-amber-500" size={24}/> : <AlertCircle className="text-red-500" size={24}/>}
                    <h3 className="text-lg font-bold text-slate-900">{confirmDialog.title}</h3>
                </div>
                <p className="text-slate-500 text-sm mb-6 whitespace-pre-line leading-relaxed">{confirmDialog.message}</p>
                <div className="flex justify-end gap-2">
                    <button onClick={closeConfirm} className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg text-sm">Batal</button>
                    <button onClick={confirmDialog.onConfirm} className={`px-4 py-2 font-semibold rounded-lg text-sm text-white ${confirmDialog.type === 'warning' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-600 hover:bg-red-700'}`}>Ya, Lanjutkan</button>
                </div>
            </div>
        </div>
      )}

      {/* 3. Modal Edit Data */}
      {modals.edit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[85] p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
                <div className="p-4 border-b bg-slate-50 flex justify-between items-center rounded-t-2xl"><h3 className="text-sm font-bold flex items-center gap-2"><Edit size={16} className="text-blue-500"/> Edit Data Pesanan</h3><button onClick={() => toggleModal('edit', false)} className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center"><X size={14}/></button></div>
                <div className="p-5 flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-[11px] font-bold text-slate-500 mb-1.5">Waktu Teks</label><input type="text" value={editData.datetime} onChange={e=>setEditData(p=>({...p, datetime:e.target.value}))} className="w-full bg-slate-50 border rounded-lg text-xs py-2 px-3 outline-none font-mono" /></div>
                        <div><label className="block text-[11px] font-bold text-slate-500 mb-1.5">Nama Pengirim</label><input type="text" value={editData.sender} onChange={e=>setEditData(p=>({...p, sender:e.target.value}))} className="w-full bg-slate-50 border rounded-lg text-xs py-2 px-3 outline-none font-semibold" /></div>
                    </div>
                    <div><label className="block text-[11px] font-bold text-slate-500 mb-1.5">Detail Pesanan (Isi Teks)</label><textarea rows="4" value={editData.message} onChange={e=>setEditData(p=>({...p, message:e.target.value}))} className="w-full bg-slate-50 border rounded-lg text-xs py-2 px-3 outline-none resize-none"></textarea></div>
                    <div><label className="block text-[11px] font-bold text-slate-500 mb-1.5">Catatan Tambahan</label><textarea rows="2" value={editData.notes} onChange={e=>setEditData(p=>({...p, notes:e.target.value}))} className="w-full bg-amber-50 border border-amber-200 rounded-lg text-xs py-2 px-3 outline-none resize-none placeholder-amber-700/40" placeholder="Ketik catatan..."></textarea></div>
                </div>
                <div className="p-4 border-t bg-slate-50 flex justify-end gap-2 rounded-b-2xl"><button onClick={() => toggleModal('edit', false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg text-xs">Batal</button><button onClick={() => { setOrdersData(prev => prev.map(o => o.id === editData.id ? editData : o)); toggleModal('edit', false); showToast("Perubahan disimpan!"); }} className="px-5 py-2 bg-blue-600 text-white font-bold rounded-lg text-xs">Simpan Perubahan</button></div>
            </div>
        </div>
      )}

      {/* 4. Modal Quick Note */}
      {modals.quickNote && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[95] p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
                <div className="p-4 border-b bg-blue-50 flex justify-between items-center rounded-t-2xl"><h3 className="text-sm font-bold text-blue-800 flex items-center gap-2"><Edit size={16}/> Tambah Catatan Status</h3><button onClick={() => toggleModal('quickNote', false)} className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><X size={14}/></button></div>
                <div className="p-4"><p className="text-[10px] text-slate-500 mb-2">Tambahkan informasi penting untuk pesanan ini setelah status diperbarui.</p><textarea autoFocus value={quickNoteData.text} onChange={e => setQuickNoteData(p=>({...p, text: e.target.value}))} rows="3" className="w-full bg-slate-50 border rounded-lg text-xs py-2 px-3 outline-none resize-none" placeholder="Ketik catatan di sini..."></textarea></div>
                <div className="p-4 border-t bg-slate-50 flex justify-end gap-2 rounded-b-2xl"><button onClick={() => toggleModal('quickNote', false)} className="px-4 py-2 text-slate-600 font-bold bg-slate-200 rounded-lg text-xs">Batal</button><button onClick={() => { setOrdersData(prev => prev.map(o => o.id === quickNoteData.id ? {...o, notes: quickNoteData.text} : o)); toggleModal('quickNote', false); showToast("Catatan ditambahkan!"); }} className="px-5 py-2 bg-blue-600 text-white font-bold rounded-lg text-xs">Masukkan</button></div>
            </div>
        </div>
      )}

      {/* 5. Modal Master Database (Lihat Semua) */}
      {modals.master && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-[90] px-2 py-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[95vh] flex flex-col">
                <div className="p-4 border-b bg-slate-50 rounded-t-xl flex justify-between items-center">
                    <div><h3 className="text-base font-bold flex items-center gap-2"><Database size={20} className="text-blue-600"/> Database Utama (Semua Pesanan Tersimpan)</h3><p className="text-[11px] text-slate-500 mt-0.5">Tampilan ini menampilkan seluruh data murni tanpa terpengaruh filter tanggal.</p></div>
                    <button onClick={() => toggleModal('master', false)} className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center"><X size={16}/></button>
                </div>
                <div className="flex-1 overflow-auto bg-slate-50 p-0">
                    <table className="w-full text-sm text-left">
                        <thead className="text-[10px] text-slate-500 bg-slate-100 uppercase sticky top-0 z-10 border-b shadow-sm"><tr><th className="px-4 py-2 w-10">No</th><th className="px-4 py-2 w-24">Waktu</th><th className="px-4 py-2 w-32">Pengirim</th><th className="px-4 py-2 min-w-[200px]">Detail Teks Original</th><th className="px-4 py-2 border-l w-48">Catatan</th><th className="px-4 py-2 border-l w-48 text-center">Status Log</th></tr></thead>
                        <tbody className="bg-white text-xs divide-y divide-slate-100">
                            {ordersData.length === 0 ? <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-500 italic">Database Kosong.</td></tr> : [...ordersData].sort((a,b) => getSortableTime(b.datetime) - getSortableTime(a.datetime)).map((o, i) => (
                                <tr key={o.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-2 font-mono text-slate-400">{i + 1}</td><td className="px-4 py-2 font-mono text-slate-600">{o.datetime}</td><td className="px-4 py-2 font-bold text-slate-700">{o.sender}</td>
                                    <td className="px-4 py-2"><div className="max-h-16 overflow-y-auto bg-slate-50 border p-1.5 rounded" dangerouslySetInnerHTML={{__html: o.message.replace(/\n/g, '<br>')}}/></td>
                                    <td className="px-4 py-2">{o.notes ? <div className="text-[10px] text-amber-700 bg-amber-50 p-1.5 rounded border border-amber-200">{o.notes}</div> : <span className="text-slate-300 italic text-[10px]">Kosong</span>}</td>
                                    <td className="px-4 py-2 text-center text-[10px] whitespace-nowrap">{STATUS_ORDER.map(k => o.status[k] ? <span key={k} className="text-blue-600 font-bold border border-blue-200 bg-blue-50 px-1 rounded shadow-sm mx-0.5">{STATUS_NAMES[k]}</span> : <span key={k} className="text-slate-300 mx-0.5">-</span>)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="p-3 border-t bg-slate-50 rounded-b-xl flex justify-between items-center"><span className="text-xs font-bold text-slate-600">Total: {ordersData.length} Master Data</span><button onClick={() => toggleModal('master', false)} className="px-5 py-2 bg-slate-800 text-white font-semibold rounded-lg text-xs shadow-md">Tutup Jendela</button></div>
            </div>
        </div>
      )}

      {/* 6. Modal Duplicate Data */}
      {modals.duplicate && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex flex-col items-center justify-center z-[70] p-4">
            <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="p-4 md:p-5 border-b bg-white rounded-t-2xl flex justify-between items-center"><h3 className="text-base font-bold text-amber-600 flex items-center gap-2"><AlertTriangle size={20}/> Terdeteksi Data Ganda</h3></div>
                <div className="p-4 overflow-y-auto flex-1">
                    {pendingDuplicates.map((dup, idx) => {
                        const tempId = `dup_${idx}`;
                        return (
                            <div key={idx} className="bg-white rounded-lg shadow-sm border border-slate-200 mb-3">
                                <div className="p-3 border-b flex justify-between items-center bg-slate-50"><span className="text-xs font-bold text-slate-500">Konflik #{idx + 1} | {dup.newOrder.sender}</span><span className="text-[10px] font-mono bg-white px-2 py-0.5 rounded border">{dup.newOrder.datetime}</span></div>
                                <div className="p-3">
                                    <div className="text-[11px] text-slate-700 bg-amber-50 p-2 rounded border border-amber-100 mb-2 font-mono h-16 overflow-y-auto" dangerouslySetInnerHTML={{__html: dup.newOrder.message.replace(/\n/g, '<br>')}}/>
                                    <div className="flex gap-2">
                                        <label className="flex-1 flex items-center gap-1.5 p-1.5 border rounded bg-slate-50 cursor-pointer"><input type="radio" name={tempId} checked={duplicateDecisions[tempId]==='keep_old'} onChange={() => setDuplicateDecisions(p=>({...p, [tempId]:'keep_old'}))} className="w-3 h-3"/><span className="text-[10px] font-semibold">Abaikan</span></label>
                                        <label className="flex-1 flex items-center gap-1.5 p-1.5 border rounded hover:bg-slate-50 cursor-pointer"><input type="radio" name={tempId} checked={duplicateDecisions[tempId]==='keep_new'} onChange={() => setDuplicateDecisions(p=>({...p, [tempId]:'keep_new'}))} className="w-3 h-3"/><span className="text-[10px] font-semibold text-red-600">Timpa Baru</span></label>
                                        <label className="flex-1 flex items-center gap-1.5 p-1.5 border rounded hover:bg-slate-50 cursor-pointer"><input type="radio" name={tempId} checked={duplicateDecisions[tempId]==='keep_both'} onChange={() => setDuplicateDecisions(p=>({...p, [tempId]:'keep_both'}))} className="w-3 h-3"/><span className="text-[10px] font-semibold text-blue-600">Ganda</span></label>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
                <div className="p-4 border-t bg-white rounded-b-2xl flex justify-end"><button onClick={applyDuplicateResolutions} className="w-full md:w-auto px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-lg text-sm shadow-md">Simpan Keputusan</button></div>
            </div>
        </div>
      )}

      {/* 7. Modal Kata Terlarang */}
      {modals.forbidden && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[85] p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
                <div className="p-4 border-b bg-red-50 flex justify-between items-center rounded-t-2xl"><h3 className="text-sm font-bold text-red-800 flex items-center gap-2">⚙️ Kelola Kata Terlarang</h3><button onClick={() => toggleModal('forbidden', false)} className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-red-600"><X size={14}/></button></div>
                <div className="p-5 flex flex-col gap-4">
                    <p className="text-[11px] text-slate-500">Kata-kata di bawah ini akan di-flag merah pada pesanan untuk kebutuhan Quality Control.</p>
                    <div className="flex flex-wrap gap-1.5 min-h-[40px] bg-slate-50 p-2 rounded-lg border border-slate-200">
                        {forbiddenWords.map((word, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-bold border border-red-200">{word} <button onClick={() => setForbiddenWords(prev => prev.filter((_, idx) => idx !== i))} className="w-3.5 h-3.5 rounded-full hover:bg-red-200 flex items-center justify-center"><X size={10}/></button></span>
                        ))}
                        {forbiddenWords.length === 0 && <span className="text-[10px] text-slate-400 italic py-1">Tidak ada kata terlarang terdaftar.</span>}
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); if(newForbiddenWord.trim() && !forbiddenWords.includes(newForbiddenWord.toLowerCase())) { setForbiddenWords(p => [...p, newForbiddenWord.toLowerCase()]); setNewForbiddenWord(''); } }} className="flex gap-2">
                        <input type="text" value={newForbiddenWord} onChange={e=>setNewForbiddenWord(e.target.value)} placeholder="Ketik kata baru..." className="flex-1 bg-slate-50 border border-slate-200 rounded-lg text-xs py-2 px-3 outline-none focus:ring-2 focus:ring-red-500" />
                        <button type="submit" className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg text-xs shadow-sm">Tambah</button>
                    </form>
                </div>
            </div>
        </div>
      )}
    </>
  );

  return (
    <div className="bg-slate-50 text-slate-800 min-h-screen p-3 md:p-8 pb-40 font-sans selection:bg-blue-200">
      <Header />
      
      <main className="max-w-6xl mx-auto flex flex-col gap-4 relative z-0">
        
        {/* Input Akordeon */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <button onClick={() => setIsInputOpen(!isInputOpen)} className="w-full py-3 px-5 flex justify-between items-center bg-slate-50 hover:bg-slate-100 transition-colors">
                <h2 className="text-sm font-semibold flex items-center gap-2 text-slate-700"><Plus size={16} className="text-blue-500"/> Input Data Pesanan Baru</h2>
                <ChevronDown size={20} className={`text-slate-400 transition-transform ${isInputOpen ? '' : 'rotate-180'}`} />
            </button>
            {isInputOpen && (
                <div className="p-5 border-t border-slate-200 bg-white">
                    <textarea value={rawInputText} onChange={(e) => setRawInputText(e.target.value)} rows="5" className="w-full p-3 mb-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none text-sm font-mono" placeholder="[16/5, 14.50] Singgih 244/27: TOKO GUNUNG MULIA&#10;Singles ori 2 box..."></textarea>
                    <button onClick={processText} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm flex justify-center items-center gap-2">Ekstrak & Simpan</button>
                </div>
            )}
        </section>

        {/* Statistik Akordeon */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <button onClick={() => setIsStatsOpen(!isStatsOpen)} className="w-full py-3 px-5 flex justify-between items-center bg-slate-50 hover:bg-slate-100 transition-colors">
                <h2 className="text-sm font-semibold flex items-center gap-2 text-slate-700"><Database size={16} className="text-purple-500" /> Statistik & Laporan Pesanan</h2>
                <ChevronDown size={20} className={`text-slate-400 transition-transform ${isStatsOpen ? '' : 'rotate-180'}`} />
            </button>
            {isStatsOpen && <div className="border-t border-slate-200 bg-white"><StatsSection /></div>}
        </section>

        <QuickActions />

        {/* Tabel Data Utama */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden flex-1 min-h-[400px]">
            <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white">
                <h2 className="text-sm font-semibold text-slate-700 hidden md:flex items-center gap-1.5">Daftar Detail Pesanan <span className="text-[10px] font-normal text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border cursor-help">Tahan baris untuk memilih</span></h2>
                <div className="flex items-center rounded-lg shadow-sm border bg-slate-50 overflow-hidden w-full md:w-auto focus-within:ring-2 focus-within:ring-blue-500 transition-shadow">
                    <select value={searchColumn} onChange={(e) => setSearchColumn(e.target.value)} className="bg-slate-50 border-none text-xs text-slate-600 py-2 pl-3 pr-6 focus:ring-0 outline-none cursor-pointer font-medium appearance-none">
                        <option value="message">Detail Pesanan</option><option value="sender">Pengirim</option><option value="datetime">Waktu</option><option value="notes">Catatan</option>
                    </select>
                    <div className="w-px h-4 bg-slate-300"></div>
                    <div className="flex items-center px-2 bg-white w-full">
                        <Search size={14} className="text-slate-400 shrink-0" />
                        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Cari..." className="border-none text-xs py-2 px-2 w-full sm:w-40 focus:ring-0 outline-none bg-white"/>
                    </div>
                </div>
            </div>
            
            <div className="overflow-x-auto flex-1 relative select-none scrollbar-thin">
                <table className="w-full text-sm text-left whitespace-nowrap md:whitespace-normal">
                    <thead className="text-xs text-slate-600 bg-slate-50 uppercase sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                            {[{ key: 'waktu', label: 'Waktu', w: 'w-24' }, { key: 'pengirim', label: 'Pengirim', w: 'w-40' }, { key: 'pesanan', label: 'Detail Pesanan', w: 'min-w-[200px]' }, { key: 'status', label: 'Status (Urut)', w: 'min-w-[250px]', center: true, border: true }].map(col => (
                                <th key={col.key} scope="col" onClick={() => setSortConfig(p => ({ key: col.key, direction: p.key === col.key && p.direction === 'asc' ? 'desc' : 'asc' }))} className={`px-4 py-3 font-semibold ${col.w} ${col.border ? 'border-l' : ''} cursor-pointer hover:bg-slate-100 transition-colors`}>
                                    <div className={`flex items-center gap-1 ${col.center ? 'justify-center' : ''}`}>{col.label} <span className={sortConfig.key === col.key ? 'text-blue-600 font-bold ml-1 text-[11px]' : 'text-slate-300 text-[10px] ml-1'}>{sortConfig.key === col.key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</span></div>
                                </th>
                            ))}
                            <th scope="col" className="px-4 py-3 font-semibold min-w-[150px] border-l border-slate-200 text-center">Catatan & Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">{renderTableRows()}</tbody>
                </table>
            </div>
            <div className="md:hidden py-1.5 bg-slate-50 border-t border-slate-200 text-[10px] text-center text-slate-400 font-medium">Tahan lama pada baris untuk menyeleksi pesanan</div>
        </section>

      </main>

      {}
      <footer className="max-w-6xl mx-auto mt-8 mb-12 flex flex-col items-center gap-4 px-4 relative z-0">
          <div className="flex flex-wrap justify-center items-center gap-3 w-full">
              <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImportFile} />
              <button onClick={() => fileInputRef.current.click()} className="flex-1 sm:flex-none px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 hover:bg-emerald-100"><FileDown size={14}/> Impor Data</button>
              <button onClick={exportData} className="flex-1 sm:flex-none px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 hover:bg-blue-100"><FileUp size={14}/> Ekspor Backup</button>
              <div className="w-px h-6 bg-slate-300 hidden sm:block mx-1"></div>
              <button onClick={() => toggleModal('master', true)} className="flex-1 sm:flex-none px-5 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold shadow-md flex items-center justify-center gap-2 hover:bg-slate-900"><Database size={14} className="text-slate-300"/> Lihat Semua Data</button>
              <button onClick={() => ordersData.length > 0 && showConfirm("Hapus Semua Data?", "Tindakan ini tidak dapat dibatalkan. Semua data akan hilang.", executeClearData)} className="flex-1 sm:flex-none w-full sm:w-auto px-4 py-2 bg-transparent text-red-500 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 mt-2 sm:mt-0 hover:bg-red-50"><Trash2 size={14}/> Hapus Semua</button>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 text-center">Seluruh data Anda tersimpan aman secara lokal di dalam memori browser (Offline).</p>
      </footer>

      {/* Floating Toolbar (Bulk Select) */}
      <div className={`fixed bottom-6 md:bottom-10 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white shadow-2xl rounded-full px-5 py-3 flex items-center gap-4 transition-all duration-300 z-[55] w-max ${selectedOrderIds.size > 0 ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-24 opacity-0 pointer-events-none'}`}>
          <div className="flex items-center gap-2"><div className="bg-blue-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">{selectedOrderIds.size}</div></div>
          <div className="h-4 w-px bg-slate-700"></div>
          <button onClick={handleSelectAll} className="text-blue-400 hover:text-blue-300 text-xs font-semibold">{selectedOrderIds.size === sortedAndFilteredOrders.length ? 'Batal Pilih Semua' : 'Pilih Semua'}</button>
          <button onClick={deleteSelected} className="text-red-400 hover:text-red-300 text-xs font-semibold flex items-center gap-1.5 ml-1"><Trash2 size={12}/> Hapus Terpilih</button>
          <button onClick={() => setSelectedOrderIds(new Set())} className="text-slate-400 hover:text-white text-xs font-medium ml-1">Batal</button>
      </div>

      {/* Interactive Toast Notification */}
      <div onClick={() => { if(toast.type === 'interactive' && toast.actionId) { setQuickNoteData({ id: toast.actionId, text: ordersData.find(o=>o.id===toast.actionId)?.notes||''}); toggleModal('quickNote', true); setToast(p=>({...p, visible:false})); } }}
           className={`fixed bottom-24 md:bottom-6 left-1/2 transform -translate-x-1/2 md:left-auto md:translate-x-0 md:right-6 px-4 py-2.5 rounded-lg shadow-2xl flex items-center gap-2.5 transition-all duration-300 z-[60] w-11/12 md:w-auto max-w-xs ${toast.visible ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0'} ${toast.type === 'error' ? 'bg-red-600 text-white pointer-events-none' : toast.type === 'warning' ? 'bg-orange-500 text-white pointer-events-none' : toast.type === 'interactive' ? 'bg-blue-600 text-white cursor-pointer hover:scale-105 shadow-blue-500/50 pointer-events-auto' : 'bg-slate-800 text-emerald-400 pointer-events-none'}`}>
          {toast.type === 'interactive' ? <Edit size={16}/> : <Info size={16}/>}
          <span className={`text-xs font-medium leading-tight ${toast.type !== 'interactive' && 'text-white'}`}>{toast.message}</span>
      </div>

      <ModalsLayer />

    </div>
  );
}