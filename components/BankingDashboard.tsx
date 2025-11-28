
import React, { useState, useMemo } from 'react';
import { 
  Wallet, Search, Wand2, CornerDownRight, Percent, Eye, 
  X, CheckSquare, Split, UploadCloud, Edit2, Save, FileText 
} from 'lucide-react';
import { MOCK_PROPERTIES } from '../constants';

const CATEGORIES = {
  "Acquisition Costs": [
    { id: "acq_own", name: "Own Costs (Eig. Kost.)" },
    { id: "acq_notary", name: "Notary" },
    { id: "acq_agent", name: "Agent Provision" }
  ],
  "Operating Costs": [
    { id: "op_water", name: "Water/Sewage" },
    { id: "op_heat", name: "Heating" },
    { id: "op_admin", name: "Property Management Fee" },
    { id: "op_repair", name: "Repairs" }
  ],
  "Income": [
    { id: "inc_rent", name: "Rental Income" },
    { id: "inc_deposit", name: "Security Deposit" }
  ]
};

const BANK_ACCOUNTS = [
  { id: 'all', name: 'All Accounts', balance: 0, type: 'summary' },
  { id: 'acc_1', name: 'Sparkasse Main', balance: 15420.50, iban: 'DE89 3705...' },
  { id: 'acc_2', name: 'Commerzbank Invest', balance: 4500.00, iban: 'DE22 1203...' },
];

const MOCK_TRANSACTIONS = [
  { 
    id: 1, accountId: 'acc_1', date: '2023-10-25', payee: 'Kyiv Energo', bankDescription: 'Electricity Bill Oct 2023 / Meter #4552', amount: -145.50, isBooked: false, objectId: "", unitId: "", categoryId: "", taxRate: 19, hasDoc: false, parentId: null
  },
  { 
    id: 2, accountId: 'acc_1', date: '2023-10-24', payee: 'Tenant John Doe', bankDescription: 'Rent Payment Apt 101 - October', amount: 1200.00, isBooked: true, objectId: "1", unitId: "101", categoryId: "inc_rent", taxRate: 0, hasDoc: true, parentId: null
  },
  { 
    id: 3, accountId: 'acc_2', date: '2023-10-23', payee: 'Notary Müller', bankDescription: 'Inv. 2023/55 Purchase Contract Fee', amount: -650.00, isBooked: false, objectId: "", unitId: "", categoryId: "", taxRate: 19, hasDoc: false, parentId: null
  }
];

// --- DOCUMENT PREVIEW MODAL ---
const DocumentPreviewModal = ({ isOpen, onClose, docName }: { isOpen: boolean; onClose: () => void; docName: string }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1C1F24] border border-gray-700 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in duration-200">
        <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-[#23262b]">
          <h3 className="text-white font-bold flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-500" />
            {docName}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-8 flex flex-col items-center justify-center bg-[#111315] min-h-[400px]">
           <div className="w-24 h-24 bg-gray-800 rounded-lg flex items-center justify-center mb-4">
              <FileText className="w-12 h-12 text-gray-500" />
           </div>
           <p className="text-gray-400 mb-6">Preview for <span className="text-white font-mono">{docName}</span></p>
           <div className="flex gap-4">
              <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold">Download</button>
              <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-bold">Close</button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default function BankingDashboard() {
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [transactions, setTransactions] = useState(MOCK_TRANSACTIONS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Document Preview State
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [viewingDocName, setViewingDocName] = useState('');

  // Filter
  const filteredTransactions = useMemo(() => {
    return selectedAccount === 'all' 
      ? transactions 
      : transactions.filter(t => t.accountId === selectedAccount);
  }, [selectedAccount, transactions]);

  const activeAccount = BANK_ACCOUNTS.find(a => a.id === selectedAccount);
  
  const progress = useMemo(() => {
    const total = filteredTransactions.length;
    if (total === 0) return 0;
    const booked = filteredTransactions.filter(t => t.isBooked).length;
    return Math.round((booked / total) * 100);
  }, [filteredTransactions]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleUpdate = (id: number, field: string, value: any) => {
    setTransactions(prev => prev.map(t => {
      if (t.id !== id) return t;
      if (field === 'objectId') return { ...t, [field]: value, unitId: "" };
      return { ...t, [field]: value };
    }));
  };

  const handleFileUpload = (id: number) => {
    // Simulate upload
    setTransactions(prev => prev.map(t => {
      if (t.id !== id) return t;
      return { ...t, hasDoc: true };
    }));
    showToast("Document attached successfully");
  };

  const handleViewDoc = (id: number) => {
     setViewingDocName(`invoice_tx_${id}.pdf`);
     setIsDocModalOpen(true);
  };

  const toggleBookingStatus = (id: number) => {
    setTransactions(prev => prev.map(t => {
      if (t.id !== id) return t;
      if (!t.isBooked && (!t.objectId || !t.categoryId)) {
        alert("Please select at least an Object and a Category to save.");
        return t;
      }
      return { ...t, isBooked: !t.isBooked };
    }));
  };

  const handleAutoFill = () => {
    let count = 0;
    setTransactions(prev => prev.map(t => {
      if (t.isBooked) return t;
      let updates = {};
      const desc = t.bankDescription.toLowerCase();
      const payee = t.payee.toLowerCase();

      if (desc.includes('rent') || payee.includes('tenant')) {
        updates = { categoryId: 'inc_rent', objectId: '1', unitId: '101' };
        count++;
      } else if (payee.includes('energo') || desc.includes('electricity')) {
        updates = { categoryId: 'op_heat', objectId: '1' };
        count++;
      }
      return Object.keys(updates).length > 0 ? { ...t, ...updates } : t;
    }));
    showToast(`Auto-filled ${count} transactions`);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-[#111315] font-sans text-gray-300 overflow-hidden relative">
      
      <DocumentPreviewModal 
        isOpen={isDocModalOpen} 
        onClose={() => setIsDocModalOpen(false)} 
        docName={viewingDocName} 
      />

      {/* LEFT SIDEBAR */}
      <div className="w-64 bg-[#161B22] border-r border-gray-800 flex flex-col shrink-0 z-10">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Wallet className="w-6 h-6 text-emerald-500" />
            Finances
          </h1>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {BANK_ACCOUNTS.map(acc => (
            <button
              key={acc.id}
              onClick={() => setSelectedAccount(acc.id)}
              className={`w-full text-left p-3 rounded-lg transition-all border ${
                selectedAccount === acc.id 
                  ? 'bg-[#1C1F24] border-emerald-500 shadow-sm' 
                  : 'bg-transparent border-transparent hover:bg-gray-800'
              }`}
            >
              <div className="font-medium text-sm text-white">{acc.name}</div>
              {acc.type !== 'summary' && (
                <div className="text-xs text-gray-500 mt-1">{acc.iban}</div>
              )}
              {acc.type !== 'summary' && (
                <div className="font-mono font-bold text-emerald-500 mt-1">
                  {acc.balance.toLocaleString('uk-UA')} €
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0D1117]">
        
        {/* TOP BAR */}
        <div className="h-20 bg-[#161B22] border-b border-gray-800 px-6 flex flex-col justify-center shrink-0 shadow-sm z-30 relative">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-lg text-white flex items-center gap-2">
              {activeAccount?.name}
              <span className="text-xs font-normal text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">
                {filteredTransactions.length} items
              </span>
            </h2>
            <div className="flex gap-3">
               <button 
                 onClick={handleAutoFill}
                 className="flex items-center gap-2 px-3 py-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg text-sm font-medium hover:bg-indigo-500/20 transition-colors"
               >
                 <Wand2 className="w-4 h-4" /> Auto-Fill
               </button>
               <div className="relative w-64">
                 <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                 <input type="text" placeholder="Search..." className="w-full pl-9 pr-4 py-2 bg-[#0D1117] border border-gray-700 rounded-lg text-sm text-white outline-none focus:border-emerald-500" />
               </div>
            </div>
          </div>
          
          {/* PROGRESS BAR */}
          <div className="flex items-center gap-3 text-xs font-medium text-gray-500">
            <span>Progress: {progress}%</span>
            <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-500" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* TABLE HEADER (Sticky) */}
        <div className="flex-1 overflow-auto px-6 pb-24 pt-6">
          <div className="bg-[#161B22] rounded-xl shadow-sm border border-gray-800 overflow-visible relative">
             <div className="overflow-x-auto min-h-[400px]"> 
              <table className="w-full text-left border-collapse min-w-[1550px]">
                <thead className="bg-[#1C1F24] border-b border-gray-700 text-xs uppercase text-gray-400 font-semibold tracking-wider sticky top-0 z-20 shadow-md">
                  <tr>
                    <th className="px-4 py-3 w-10 text-center">#</th>
                    <th className="px-4 py-3 w-24">Date</th>
                    <th className="px-4 py-3 w-48">Payee</th>
                    <th className="px-4 py-3">Bank Description</th>
                    <th className="px-4 py-3 text-right w-36">Amount</th>
                    <th className="px-4 py-3 w-48">Object</th>
                    <th className="px-4 py-3 w-32">Unit</th>
                    <th className="px-4 py-3 w-48">Category</th>
                    <th className="px-4 py-3 w-20 text-center" title="VAT / MwSt">Tax %</th>
                    <th className="px-4 py-3 w-32 text-center bg-[#23262b]">Docs</th>
                    <th className="px-4 py-3 w-28 text-center bg-[#23262b]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredTransactions.map(tx => (
                    <tr key={tx.id} className={`transition-colors ${tx.isBooked ? 'bg-gray-800/30 opacity-60' : 'hover:bg-[#1C1F24]'}`}>
                      
                      {/* Checkbox */}
                      <td className="px-4 py-3 text-center">
                        <input type="checkbox" className="rounded border-gray-600 bg-transparent text-emerald-500 focus:ring-offset-0" />
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(tx.date).toLocaleDateString('de-DE')}
                      </td>

                      {/* Payee */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm text-white truncate max-w-[180px]" title={tx.payee}>
                          {tx.payee}
                        </div>
                      </td>

                      {/* Description */}
                      <td className="px-4 py-3">
                        <div className="text-xs text-gray-500 leading-snug truncate max-w-[250px]" title={tx.bankDescription}>
                          {tx.bankDescription}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3 text-right">
                        <span className={`font-mono text-sm font-bold ${tx.amount < 0 ? 'text-white' : 'text-emerald-500'}`}>
                          {tx.amount.toFixed(2)}
                        </span>
                      </td>

                      {/* Object */}
                      <td className="px-4 py-3">
                        <select 
                          className="w-full bg-[#0D1117] border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:border-emerald-500 outline-none"
                          value={tx.objectId}
                          onChange={(e) => handleUpdate(tx.id, 'objectId', e.target.value)}
                          disabled={tx.isBooked}
                        >
                          <option value="">Select Object</option>
                          {MOCK_PROPERTIES.map(p => (
                            <option key={p.id} value={p.id}>{p.title}</option>
                          ))}
                        </select>
                      </td>

                      {/* Unit */}
                      <td className="px-4 py-3">
                        <select 
                          className="w-full bg-[#0D1117] border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:border-emerald-500 outline-none"
                          value={tx.unitId}
                          onChange={(e) => handleUpdate(tx.id, 'unitId', e.target.value)}
                          disabled={tx.isBooked || !tx.objectId}
                        >
                          <option value="">-</option>
                          {/* FIX: Use mock unit if properties don't have units in data model yet */}
                          <option value="main">Main Unit</option>
                        </select>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3">
                        <select 
                          className={`w-full bg-[#0D1117] border rounded px-2 py-1.5 text-xs text-white focus:border-emerald-500 outline-none ${!tx.isBooked && !tx.categoryId ? 'border-orange-500/50' : 'border-gray-700'}`}
                          value={tx.categoryId}
                          onChange={(e) => handleUpdate(tx.id, 'categoryId', e.target.value)}
                          disabled={tx.isBooked}
                        >
                          <option value="">Select Category</option>
                          {Object.entries(CATEGORIES).map(([group, items]) => (
                            <optgroup key={group} label={group}>
                              {items.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>

                      {/* Tax */}
                      <td className="px-4 py-3">
                         <select 
                           className="w-full bg-[#0D1117] border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:border-emerald-500 outline-none"
                           value={tx.taxRate}
                           onChange={(e) => handleUpdate(tx.id, 'taxRate', parseInt(e.target.value))}
                           disabled={tx.isBooked}
                         >
                           <option value={0}>0%</option>
                           <option value={7}>7%</option>
                           <option value={19}>19%</option>
                         </select>
                      </td>

                      {/* Docs */}
                      <td className="px-4 py-3 text-center">
                        <button 
                          onClick={() => {
                              if(tx.hasDoc) handleViewDoc(tx.id);
                              else handleFileUpload(tx.id);
                          }}
                          disabled={tx.isBooked && !tx.hasDoc}
                          className={`flex items-center justify-center gap-1.5 w-full py-1.5 rounded text-xs font-medium transition-colors border ${
                            tx.hasDoc 
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20' 
                              : 'bg-transparent text-gray-500 border-gray-700 hover:text-white hover:border-gray-500'
                          }`}
                        >
                          {tx.hasDoc ? (
                            <> <Eye className="w-3.5 h-3.5" /> View </>
                          ) : (
                            <> <UploadCloud className="w-3.5 h-3.5" /> Add </>
                          )}
                        </button>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-center">
                        <button 
                          onClick={() => toggleBookingStatus(tx.id)}
                          className={`flex items-center justify-center gap-1.5 w-full py-1.5 rounded text-xs font-bold transition-all shadow-sm ${
                             tx.isBooked 
                               ? 'bg-transparent text-gray-500 border border-gray-700 hover:text-white hover:border-gray-500' 
                               : 'bg-emerald-600 text-white border border-transparent hover:bg-emerald-500'
                          }`}
                        >
                          {tx.isBooked ? (
                            <> <Edit2 className="w-3.5 h-3.5" /> Edit </>
                          ) : (
                            <> <Save className="w-3.5 h-3.5" /> Save </>
                          )}
                        </button>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* TOAST */}
        {toastMessage && (
            <div className="absolute bottom-6 right-6 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 animate-in slide-in-from-bottom-5 z-[60] border border-gray-700">
            <CheckSquare className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-medium">{toastMessage}</span>
            </div>
        )}

      </div>
    </div>
  );
}
